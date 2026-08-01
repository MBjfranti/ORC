/**
 * The player's job is symmetry: everything it starts, it stops.
 *
 * These exist because the obvious implementation is not symmetric. A strum
 * books its attacks across the next few hundred milliseconds and an arpeggio
 * books each release a gate ahead of itself — both outlive the key that asked
 * for them, so releasing has to reach forward into what has not happened yet
 * rather than only tidying up what has.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type LoopCallback = (time: number) => void

const loops: FakeLoop[] = []

class FakeLoop {
  interval: number
  started = false
  disposed = false

  constructor(
    readonly callback: LoopCallback,
    interval: number,
  ) {
    this.interval = interval
    loops.push(this)
  }

  start(): this {
    this.started = true
    return this
  }

  stop(): this {
    this.started = false
    return this
  }

  dispose(): this {
    this.disposed = true
    return this
  }
}

vi.mock('tone', () => ({
  immediate: () => 0,
  getTransport: () => ({ seconds: 0 }),
  Loop: FakeLoop,
}))

const { Player } = await import('./player.js')
import type { Cycle, OneShot } from '../core/performance.js'
import type { MidiNote } from '../core/types.js'

function fakeSynth() {
  const on: { note: MidiNote; at: number | undefined }[] = []
  const off: MidiNote[] = []
  const cancelled: MidiNote[] = []

  return {
    on,
    off,
    cancelled,
    /** Notes attacked but never released — the stuck ones. */
    hanging(): MidiNote[] {
      const balance = new Map<MidiNote, number>()
      for (const e of on) balance.set(e.note, (balance.get(e.note) ?? 0) + 1)
      for (const n of off) balance.set(n, (balance.get(n) ?? 0) - 1)
      return [...balance].filter(([, n]) => n > 0).map(([note]) => note)
    },
    synth: {
      noteOn: (note: MidiNote, _v: number, at?: number) => void on.push({ note, at }),
      noteOff: (note: MidiNote) => void off.push(note),
      cancelNote: (note: MidiNote) => void cancelled.push(note),
    },
  }
}

const strum: OneShot = {
  kind: 'oneshot',
  events: [
    { note: 60, time: 0, velocity: 0.85 },
    { note: 64, time: 0.06, velocity: 0.8 },
    { note: 67, time: 0.12, velocity: 0.75 },
    { note: 72, time: 0.18, velocity: 0.7 },
  ],
}

const arp: Cycle = { kind: 'cycle', steps: [60, 64, 67], stepSeconds: 0.25, gate: 0.8 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player = (f: ReturnType<typeof fakeSynth>) => new Player(f.synth as any)

beforeEach(() => {
  loops.length = 0
})

describe('one-shot chords', () => {
  it('releases every note a strum attacked, including the ones still to come', () => {
    const f = fakeSynth()
    const p = player(f)

    p.start(0, strum)
    expect(f.on).toHaveLength(4)

    // Let go while the strum is still unrolling. The releases for the notes
    // scheduled 60/120/180ms out must be issued anyway, or nothing will stop
    // them once they sound.
    p.stop(0)
    expect(f.hanging()).toEqual([])
  })

  it('spreads the attacks across time rather than stacking them', () => {
    const f = fakeSynth()
    player(f).start(0, strum)
    expect(f.on.map((e) => e.at)).toEqual([0, 0.06, 0.12, 0.18])
  })

  it('plays only the difference when a sounding chord is edited', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, strum)
    f.on.length = 0
    f.off.length = 0

    p.update(0, [60, 64, 67, 72, 74])

    // The four already sounding must not re-articulate.
    expect(f.on.map((e) => e.note)).toEqual([74])
    expect(f.off).toEqual([])
  })
})

describe('arpeggios', () => {
  it('stops the ringing step and withdraws its booked release', () => {
    const f = fakeSynth()
    const p = player(f)

    p.start(0, arp)
    loops[0]!.callback(0)
    expect(f.on.map((e) => e.note)).toEqual([60])

    p.stop(0)

    // That release would otherwise land 200ms later, on top of whatever chord
    // is playing by then.
    expect(f.cancelled).toEqual([60])
    expect(f.hanging()).toEqual([])
    expect(loops[0]!.disposed).toBe(true)
  })

  it('leaves nothing hanging across a run of steps', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    for (let i = 0; i < 7; i++) loops[0]!.callback(i * 0.25)
    p.stop(0)
    expect(f.hanging()).toEqual([])
  })

  it('retunes in place, keeping its position and phase', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    loops[0]!.callback(0)

    p.retune(0, { ...arp, steps: [60, 64, 67, 71] })

    // Same loop object — a new one would stutter back to step one.
    expect(loops).toHaveLength(1)
    expect(loops[0]!.disposed).toBe(false)

    loops[0]!.callback(0.25)
    expect(f.on.map((e) => e.note)).toEqual([60, 64])
  })

  it('starts fresh when retuning across mode families', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    loops[0]!.callback(0)

    p.retune(0, strum)

    expect(loops[0]!.disposed).toBe(true)
    p.stop(0)
    expect(f.hanging()).toEqual([])
  })
})

describe('stopAll', () => {
  it('clears every root, whichever family each was playing', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, strum)
    p.start(7, arp)
    loops[0]!.callback(0)

    p.stopAll()

    expect(p.size).toBe(0)
    expect(f.hanging()).toEqual([])
  })
})
