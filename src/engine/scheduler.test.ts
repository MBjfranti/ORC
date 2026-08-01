/**
 * The scheduler's job is symmetry: everything it starts, it stops.
 *
 * These tests exist because it was not. A strum books its attacks across the
 * next few hundred milliseconds and an arpeggio books each release a gate ahead
 * of itself — both of which outlive the key that asked for them, so releasing
 * has to reach forward into what has not happened yet rather than only tidying
 * up what has.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type LoopCallback = (time: number) => void

/** Every `Tone.Loop` this test made, so a tick can be driven by hand. */
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

const { PerformanceScheduler } = await import('./scheduler.js')
import type { Cycle, OneShot } from '../core/performance.js'
import type { MidiNote } from '../core/types.js'

/** Records the engine calls so attacks and releases can be paired up. */
function fakeEngine() {
  const on: { note: MidiNote; at: number | undefined }[] = []
  const off: { note: MidiNote; at: number | undefined }[] = []
  const cancelled: MidiNote[] = []

  return {
    on,
    off,
    cancelled,
    /** Notes attacked but never released — the stuck ones. */
    hanging(): MidiNote[] {
      const balance = new Map<MidiNote, number>()
      for (const e of on) balance.set(e.note, (balance.get(e.note) ?? 0) + 1)
      for (const e of off) balance.set(e.note, (balance.get(e.note) ?? 0) - 1)
      return [...balance].filter(([, n]) => n > 0).map(([note]) => note)
    },
    engine: {
      noteOn: (note: MidiNote, _velocity: number, at?: number) => void on.push({ note, at }),
      noteOff: (note: MidiNote, at?: number) => void off.push({ note, at }),
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

beforeEach(() => {
  loops.length = 0
})

describe('one-shot voices', () => {
  it('releases every note a strum attacked, including the ones still to come', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, strum)
    expect(f.on).toHaveLength(4)

    // Let go while the strum is still unrolling — the release for the notes
    // scheduled 60/120/180ms out has to be issued anyway, or nothing will ever
    // stop them once they sound.
    s.stop(0)

    expect(f.hanging()).toEqual([])
  })

  it('spreads the attacks across time rather than stacking them', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, strum)

    expect(f.on.map((e) => e.at)).toEqual([0, 0.06, 0.12, 0.18])
  })

  it('plays only the difference when a sounding chord is edited', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, strum)
    f.on.length = 0
    f.off.length = 0

    // Add a ninth: the four notes already sounding must not re-articulate.
    s.update(0, [60, 64, 67, 72, 74])

    expect(f.on.map((e) => e.note)).toEqual([74])
    expect(f.off).toEqual([])
  })
})

describe('cycle voices', () => {
  it('stops the step that is ringing and withdraws its booked release', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, arp)
    const loop = loops[0]!
    loop.callback(0) // first step sounds

    expect(f.on.map((e) => e.note)).toEqual([60])

    s.stop(0)

    // The release booked a gate ahead would otherwise land 200ms later, on top
    // of whatever chord is playing by then.
    expect(f.cancelled).toEqual([60])
    expect(f.hanging()).toEqual([])
    expect(loop.disposed).toBe(true)
  })

  it('leaves nothing hanging across a run of steps', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, arp)
    const loop = loops[0]!
    for (let i = 0; i < 7; i++) loop.callback(i * 0.25)
    s.stop(0)

    expect(f.hanging()).toEqual([])
  })

  it('retunes in place, keeping the arpeggio on the beat', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, arp)
    loops[0]!.callback(0)

    s.retune(0, { ...arp, steps: [60, 64, 67, 71] })

    // Same loop object, no restart — a new one would stutter back to step one.
    expect(loops).toHaveLength(1)
    expect(loops[0]!.disposed).toBe(false)

    // And it picks up where it left off: step 1, not step 0.
    loops[0]!.callback(0.25)
    expect(f.on.map((e) => e.note)).toEqual([60, 64])
  })

  it('starts a fresh voice when retuning across mode families', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, arp)
    loops[0]!.callback(0)

    // Arp to Strum has no loop to swap step data into.
    s.retune(0, strum)

    expect(loops[0]!.disposed).toBe(true)
    expect(f.cancelled).toEqual([60])

    s.stop(0)
    expect(f.hanging()).toEqual([])
  })
})

describe('stopAll', () => {
  it('clears every root, whichever family each was playing', () => {
    const f = fakeEngine()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new PerformanceScheduler(f.engine as any)

    s.start(0, strum)
    s.start(7, arp)
    loops[0]!.callback(0)

    s.stopAll()

    expect(s.size).toBe(0)
    expect(f.hanging()).toEqual([])
  })
})
