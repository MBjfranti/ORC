import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { splitOrder, splitShift } from './split.js'
import type { PitchClass } from './types.js'

const pcs = Array.from({ length: 12 }, (_, i) => i as PitchClass)

/** Where a key actually sounds, relative to the base octave's C. */
const pitch = (pc: PitchClass, pivot: PitchClass) => pc + 12 * splitShift(pc, 'split', pivot)

describe('octave mode', () => {
  test('shifts nothing, wherever the pivot sits', () => {
    for (const pc of pcs) {
      for (const pivot of pcs) expect(splitShift(pc, 'octave', pivot)).toBe(0)
    }
    expect(splitOrder('octave', 7)).toEqual(pcs)
  })
})

describe('split mode', () => {
  /* The consistency check that the reading is right: a split at C is the
     same instrument as Octave mode. */
  test('a split at C is exactly octave mode', () => {
    for (const pc of pcs) expect(splitShift(pc, 'split', 0)).toBe(0)
    expect(splitOrder('split', 0)).toEqual(pcs)
  })

  test('keys below the split point rise an octave', () => {
    expect(splitShift(6, 'split', 7)).toBe(1) // F#, below the split
    expect(splitShift(7, 'split', 7)).toBe(0) // G, at the split
    expect(splitShift(11, 'split', 7)).toBe(0) // B, above it
  })

  /**
   * The point of the feature: with the split at G, the dominant sits below
   * the tonic rather than a seventh above it, and G A B C D is a continuous
   * ascending line.
   */
  test('keeps low roots low', () => {
    const line = ([7, 9, 11, 0, 2] as PitchClass[]).map((pc) => pitch(pc, 7))
    expect(line).toEqual([7, 9, 11, 12, 14])
    for (let i = 1; i < line.length; i++) expect(line[i]!).toBeGreaterThan(line[i - 1]!)
  })

  test('never shifts a key downward, and never by more than an octave', () => {
    fc.assert(
      fc.property(fc.nat({ max: 11 }), fc.nat({ max: 11 }), (pc, pivot) => {
        const shift = splitShift(pc as PitchClass, 'split', pivot as PitchClass)
        expect(shift === 0 || shift === 1).toBe(true)
      }),
    )
  })

  /* The key at the split point is the one the dial's register refers to, so
     it must never move. This is what makes split-at-C a no-op. */
  test('the key at the split point never moves', () => {
    fc.assert(
      fc.property(fc.nat({ max: 11 }), (pivot) => {
        expect(splitShift(pivot as PitchClass, 'split', pivot as PitchClass)).toBe(0)
      }),
    )
  })

  test('spans no more than one octave of extra range', () => {
    fc.assert(
      fc.property(fc.nat({ max: 11 }), (pivot) => {
        const sounded = pcs.map((pc) => pitch(pc, pivot as PitchClass))
        expect(Math.max(...sounded) - Math.min(...sounded)).toBeLessThan(12)
      }),
    )
  })

  test('the playing order is the twelve keys rotated to start at the pivot', () => {
    fc.assert(
      fc.property(fc.nat({ max: 11 }), (pivot) => {
        const order = splitOrder('split', pivot as PitchClass)
        expect(order).toHaveLength(12)
        expect(new Set(order).size).toBe(12)
        expect(order[0]).toBe(pivot)
        // And that order really is ascending in pitch.
        const sounded = order.map((pc) => pitch(pc, pivot as PitchClass))
        for (let i = 1; i < sounded.length; i++) {
          expect(sounded[i]!).toBeGreaterThan(sounded[i - 1]!)
        }
      }),
    )
  })
})
