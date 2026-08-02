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

/** The transport a cycle rides. Starts stopped, so the guard is exercised. */
const transport = { seconds: 0, state: 'stopped', start() { this.state = 'started'; return this } }

vi.mock('tone', () => ({
  immediate: () => 0,
  getTransport: () => transport,
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

const arp: Cycle = {
  kind: 'cycle',
  steps: [60, 64, 67],
  stepSeconds: 0.25,
  gate: 0.8,
  sustain: true,
}

/** A figure that rings and clears, the way Pattern and Harp do. */
const figure: Cycle = { ...arp, sustain: false }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player = (f: ReturnType<typeof fakeSynth>) => new Player(f.synth as any)

beforeEach(() => {
  loops.length = 0
  transport.state = 'stopped'
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
  it('sounds its first step immediately, not after one interval', () => {
    // `Tone.Loop` fires at the *end* of an interval, so waiting for it gave a
    // full step of silence on every chord. The key has to make a sound when
    // you press it.
    const f = fakeSynth()
    player(f).start(0, arp)
    expect(f.on.map((e) => e.note)).toEqual([60])
  })

  it('hands off to the loop at the second step, keeping the rhythm even', () => {
    const f = fakeSynth()
    player(f).start(0, arp)
    // The loop is armed one interval out, so it does not double-strike step one.
    loops[0]!.callback(0.25)
    expect(f.on.map((e) => e.note)).toEqual([60, 64])
  })

  it('builds the chord up rather than replacing it', () => {
    // The point of a performance mode is to colour the chord, not to stand in
    // for it. Releasing each step left one note sounding at a time, so the
    // harmony — and any extensions on it — simply vanished.
    const f = fakeSynth()
    const p = player(f)

    p.start(0, arp)
    loops[0]!.callback(0.25)
    loops[0]!.callback(0.5)
    expect(f.on.map((e) => e.note)).toEqual([60, 64, 67])
    // Nothing released on the way: all three are still sounding.
    expect(f.off).toEqual([])
  })

  it('clears the chord when the sequence wraps, so the pattern stays audible', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    loops[0]!.callback(0.25)
    loops[0]!.callback(0.5)
    f.off.length = 0
    // Wrapping back to step one starts the build again.
    loops[0]!.callback(0.75)
    expect(f.off.sort((a, b) => a - b)).toEqual([60, 64, 67])
  })

  it('releases everything it built when the key goes up', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    loops[0]!.callback(0.25)
    p.stop(0)
    expect(f.hanging()).toEqual([])
    expect(loops[0]!.disposed).toBe(true)
  })

  it('leaves nothing hanging across a run of steps', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    for (let i = 1; i < 8; i++) loops[0]!.callback(i * 0.25)
    p.stop(0)
    expect(f.hanging()).toEqual([])
  })

  it('retunes in place, keeping its position and phase', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp) // step 0 sounds here

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

    p.retune(0, strum)

    expect(loops[0]!.disposed).toBe(true)
    p.stop(0)
    expect(f.hanging()).toEqual([])
  })
})

describe('cycles that ring and clear', () => {
  it('releases each step instead of piling notes up', () => {
    // Pattern and Harp are figures, not chords being assembled. Sixteen
    // sustaining notes is mud, and after one pass the rhythm is inaudible.
    const f = fakeSynth()
    const p = player(f)
    p.start(0, figure)
    loops[0]!.callback(0.25)
    loops[0]!.callback(0.5)
    expect(f.on.map((e) => e.note)).toEqual([60, 64, 67])
    expect(f.off.sort((a, b) => a - b)).toEqual([60, 64, 67])
  })

  it('leaves nothing hanging when the key goes up mid-figure', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, figure)
    loops[0]!.callback(0.25)
    p.stop(0)
    expect(f.hanging()).toEqual([])
  })
})

describe('moving a cycle between roots', () => {
  it('keeps the loop, its position and its phase', () => {
    const f = fakeSynth()
    const p = player(f)

    p.start(0, arp) // step 0
    loops[0]!.callback(0.25) // step 1
    expect(f.on.map((e) => e.note)).toEqual([60, 64])

    // Change chord. The arpeggio must not restart — a rhythm that resets on
    // every root is not a rhythm.
    const moved = p.moveCycle(0, 5, { ...arp, steps: [65, 69, 72] })
    expect(moved).toBe(true)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.disposed).toBe(false)

    // Picks up at step 2 of the new chord, not step 0.
    loops[0]!.callback(0.5)
    expect(f.on.map((e) => e.note)).toEqual([60, 64, 72])
  })

  it('re-keys the group, so the new root is what stops it', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    p.moveCycle(0, 5, arp)

    p.stop(0)
    expect(p.size).toBe(1)
    p.stop(5)
    expect(p.size).toBe(0)
    expect(f.hanging()).toEqual([])
  })

  it('adopts a new tempo without rebuilding the loop', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    p.moveCycle(0, 0, { ...arp, stepSeconds: 0.125 })
    expect(loops[0]!.interval).toBe(0.125)
    expect(loops).toHaveLength(1)
  })

  it('refuses when there is no cycle to move', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, strum)
    // A one-shot has no loop, so there is no groove to preserve.
    expect(p.moveCycle(0, 5, arp)).toBe(false)
  })

  it('refuses to move a cycle into a one-shot', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, arp)
    expect(p.moveCycle(0, 5, strum)).toBe(false)
  })
})

describe('the transport', () => {
  it('is started before a cycle is armed', () => {
    // A Tone.Loop on a stopped transport never ticks, so the only thing that
    // sounds is the immediate first step — a root pulsing once per keypress,
    // with no error anywhere to say why.
    const f = fakeSynth()
    expect(transport.state).toBe('stopped')
    player(f).start(0, arp)
    expect(transport.state).toBe('started')
  })
})

describe('stopAll', () => {
  it('clears every root, whichever family each was playing', () => {
    const f = fakeSynth()
    const p = player(f)
    p.start(0, strum)
    p.start(7, arp)

    p.stopAll()

    expect(p.size).toBe(0)
    expect(f.hanging()).toEqual([])
  })
})
