import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { buildChord } from './chord.js'
import { isContinuous, PATTERN_COUNT, PERFORM_MODES, performChord } from './performance.js'
import type { Cycle, OneShot, PerformMode } from './performance.js'
import { voiceChord } from './voicing.js'
import { CHORD_TYPES, EXTENSIONS } from './types.js'

const C4 = 60
const TRIAD = voiceChord([0, 4, 7], C4, 0) // C4 E4 G4
const SEVENTH = voiceChord([0, 4, 7, 10], C4, 0)
const NINTH = voiceChord([0, 4, 7, 10, 14], C4, 0)

/** Deterministic RNG so Slop is testable. */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

describe('strum', () => {
  test('fires every note once, low to high, staggered', () => {
    const p = performChord(TRIAD, 'strum', { amount: 0.5 }) as OneShot
    expect(p.kind).toBe('oneshot')
    expect(p.events.map((e) => e.note)).toEqual([60, 64, 67])
    expect(p.events[0]!.time).toBe(0)
    expect(p.events[1]!.time).toBeGreaterThan(p.events[0]!.time)
    expect(p.events[2]!.time).toBeGreaterThan(p.events[1]!.time)
  })

  test('the dial tightens and loosens the spread', () => {
    const tight = performChord(TRIAD, 'strum', { amount: 0 }) as OneShot
    const loose = performChord(TRIAD, 'strum', { amount: 1 }) as OneShot
    expect(loose.events[2]!.time).toBeGreaterThan(tight.events[2]!.time)
  })

  test('strum 2 octaves doubles the note count and spans two octaves', () => {
    const p = performChord(TRIAD, 'strum2', {}) as OneShot
    expect(p.events).toHaveLength(6)
    const notes = p.events.map((e) => e.note)
    expect(Math.max(...notes) - Math.min(...notes)).toBeGreaterThanOrEqual(12)
  })

  test('harp sweeps three octaves', () => {
    const p = performChord(TRIAD, 'harp', {}) as OneShot
    expect(p.events).toHaveLength(9)
    const notes = p.events.map((e) => e.note)
    expect(Math.max(...notes) - Math.min(...notes)).toBeGreaterThanOrEqual(24)
  })
})

describe('slop', () => {
  test('plays the same notes as a strum, with different timing', () => {
    const straight = performChord(TRIAD, 'strum', { amount: 0.5 }) as OneShot
    const loose = performChord(TRIAD, 'slop', { amount: 0.5, random: seeded(7) }) as OneShot

    expect(loose.events.map((e) => e.note).sort()).toEqual(
      straight.events.map((e) => e.note).sort(),
    )
    expect(loose.events.map((e) => e.time)).not.toEqual(straight.events.map((e) => e.time))
  })

  test('is different every time it is triggered', () => {
    const rng = seeded(3)
    const a = performChord(TRIAD, 'slop', { random: rng }) as OneShot
    const b = performChord(TRIAD, 'slop', { random: rng }) as OneShot
    expect(a.events.map((e) => e.time)).not.toEqual(b.events.map((e) => e.time))
  })

  test('never schedules a note before the trigger', () => {
    for (let seed = 1; seed < 40; seed++) {
      const p = performChord(NINTH, 'slop', { random: seeded(seed) }) as OneShot
      for (const e of p.events) expect(e.time).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('arpeggiator', () => {
  // The distinctive rule from research/06: sequence length follows the harmony.
  test('sequence length equals the chord’s note count', () => {
    expect((performChord(TRIAD, 'arp', {}) as Cycle).steps).toHaveLength(3)
    expect((performChord(SEVENTH, 'arp', {}) as Cycle).steps).toHaveLength(4)
    expect((performChord(NINTH, 'arp', {}) as Cycle).steps).toHaveLength(5)
  })

  test('adding an extension lengthens the arpeggio', () => {
    const short = (performChord(TRIAD, 'arp', {}) as Cycle).steps.length
    const long = (performChord(NINTH, 'arp', {}) as Cycle).steps.length
    expect(long).toBeGreaterThan(short)
  })

  test('is BPM-synced', () => {
    const slow = performChord(TRIAD, 'arp', { bpm: 60, amount: 0.5 }) as Cycle
    const fast = performChord(TRIAD, 'arp', { bpm: 120, amount: 0.5 }) as Cycle
    expect(slow.stepSeconds).toBeCloseTo(fast.stepSeconds * 2, 6)
  })

  test('the dial selects the division', () => {
    const slowest = performChord(TRIAD, 'arp', { bpm: 120, amount: 0 }) as Cycle
    const fastest = performChord(TRIAD, 'arp', { bpm: 120, amount: 1 }) as Cycle
    expect(fastest.stepSeconds).toBeLessThan(slowest.stepSeconds)
  })

  test('arp 2 octaves doubles the sequence', () => {
    expect((performChord(TRIAD, 'arp2', {}) as Cycle).steps).toHaveLength(6)
  })
})

describe('pattern', () => {
  // The complement of the arpeggiator: fixed rhythm, variable note content.
  test('rhythm stays constant however many notes the chord has', () => {
    const a = performChord(TRIAD, 'pattern', { amount: 0 }) as Cycle
    const b = performChord(NINTH, 'pattern', { amount: 0 }) as Cycle
    expect(a.steps).toHaveLength(b.steps.length)
    expect(a.stepSeconds).toBe(b.stepSeconds)
  })

  test('rests survive into the output', () => {
    const p = performChord(TRIAD, 'pattern', { amount: 0 }) as Cycle
    expect(p.steps.some((s) => s === null)).toBe(true)
  })

  test('the dial selects between patterns', () => {
    const shapes = new Set<string>()
    for (let i = 0; i < PATTERN_COUNT; i++) {
      const p = performChord(TRIAD, 'pattern', { amount: i / PATTERN_COUNT }) as Cycle
      shapes.add(p.steps.map((s) => s ?? '.').join(','))
    }
    expect(shapes.size).toBeGreaterThan(4)
  })

  test('every sounded step is a note from the chord', () => {
    for (let i = 0; i < PATTERN_COUNT; i++) {
      const p = performChord(TRIAD, 'pattern', { amount: i / PATTERN_COUNT }) as Cycle
      for (const s of p.steps) if (s !== null) expect(TRIAD).toContain(s)
    }
  })
})

describe('off', () => {
  test('plays the chord as a block, all at once', () => {
    const p = performChord(TRIAD, 'off', {}) as OneShot
    expect(p.events.map((e) => e.time)).toEqual([0, 0, 0])
  })
})

describe('properties', () => {
  const arbNotes = fc
    .record({
      type: fc.constantFrom(...CHORD_TYPES),
      extensions: fc.uniqueArray(fc.constantFrom(...EXTENSIONS)),
      position: fc.integer({ min: -6, max: 6 }),
    })
    .map(({ type, extensions, position }) =>
      voiceChord(buildChord({ root: 0, type, extensions }), C4, position),
    )

  const arbMode = fc.constantFrom(...PERFORM_MODES)
  const arbAmount = fc.float({ min: 0, max: 1, noNaN: true })

  test('never invents a note outside the chord', () => {
    fc.assert(
      fc.property(arbNotes, arbMode, arbAmount, (notes, mode, amount) => {
        const p = performChord(notes, mode, { amount, random: seeded(11) })
        const pcs = new Set(notes.map((n) => ((n % 12) + 12) % 12))
        const played = p.kind === 'oneshot' ? p.events.map((e) => e.note) : p.steps
        for (const n of played) {
          if (n === null) continue
          expect(pcs.has(((n % 12) + 12) % 12)).toBe(true)
        }
      }),
    )
  })

  test('never schedules anything before the trigger', () => {
    fc.assert(
      fc.property(arbNotes, arbMode, arbAmount, (notes, mode, amount) => {
        const p = performChord(notes, mode, { amount, random: seeded(5) })
        if (p.kind === 'oneshot') {
          for (const e of p.events) expect(e.time).toBeGreaterThanOrEqual(0)
        } else {
          expect(p.stepSeconds).toBeGreaterThan(0)
        }
      }),
    )
  })

  test('velocities stay in range', () => {
    fc.assert(
      fc.property(arbNotes, arbMode, arbAmount, (notes, mode, amount) => {
        const p = performChord(notes, mode, { amount, random: seeded(13) })
        if (p.kind !== 'oneshot') return
        for (const e of p.events) {
          expect(e.velocity).toBeGreaterThan(0)
          expect(e.velocity).toBeLessThanOrEqual(1)
        }
      }),
    )
  })

  test('one-shot modes sound every note exactly once', () => {
    const oneshots: PerformMode[] = ['off', 'strum', 'strum2', 'slop', 'harp']
    fc.assert(
      fc.property(arbNotes, fc.constantFrom(...oneshots), arbAmount, (notes, mode, amount) => {
        const p = performChord(notes, mode, { amount, random: seeded(17) }) as OneShot
        const expected = mode === 'strum2' ? notes.length * 2 : mode === 'harp' ? notes.length * 3 : notes.length
        expect(p.events).toHaveLength(expected)
      }),
    )
  })

  test('continuous modes are exactly the arp family and pattern', () => {
    fc.assert(
      fc.property(arbNotes, arbMode, (notes, mode) => {
        const p = performChord(notes, mode, { random: seeded(19) })
        expect(p.kind === 'cycle').toBe(isContinuous(mode))
      }),
    )
  })
})

/**
 * Velocity Sense.
 *
 * A computer keyboard has none to sense, but the performance modes generate
 * their own — a strum sheds energy toward the top of the sweep and Slop
 * varies every note. "Off for all notes to play at the same volume" applies
 * to those too. See research/07 §Velocity.
 */
describe('velocity sense', () => {
  const notes = [60, 64, 67, 71]

  test('a strum varies velocity when it is on', () => {
    const p = performChord(notes, 'strum', { velocitySense: true })
    const vs = (p as OneShot).events.map((e) => e.velocity)
    expect(new Set(vs).size).toBeGreaterThan(1)
  })

  test('off flattens every note to the same level', () => {
    for (const mode of ['strum', 'strum2', 'slop', 'harp'] as const) {
      const p = performChord(notes, mode, { velocitySense: false, random: () => 0.5 })
      const vs = (p as OneShot).events.map((e) => e.velocity)
      expect(new Set(vs).size).toBe(1)
    }
  })

  test('off leaves the timing alone — it is a volume setting, not a feel one', () => {
    const on = performChord(notes, 'strum', { velocitySense: true })
    const off = performChord(notes, 'strum', { velocitySense: false })
    const times = (p: OneShot | Cycle) => (p as OneShot).events.map((e) => e.time)
    expect(times(off)).toEqual(times(on))
  })

  test('defaults to on, so nothing changes unless you ask', () => {
    const dflt = performChord(notes, 'strum', {})
    const on = performChord(notes, 'strum', { velocitySense: true })
    expect(dflt).toEqual(on)
  })
})
