import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { buildChord } from './chord.js'
import {
  clampPosition,
  cycleLength,
  inRange,
  inversionAt,
  nearestVoicing,
  voiceChord,
  voicingDistance,
} from './voicing.js'
import { CHORD_TYPES, EXTENSIONS } from './types.js'

const C4 = 60
const CMAJ = [0, 4, 7] // C E G
const CMAJ7 = [0, 4, 7, 11]

describe('inversions', () => {
  test('position 0 is root position', () => {
    expect(voiceChord(CMAJ, C4, 0)).toEqual([60, 64, 67]) // C4 E4 G4
  })

  test('each click lifts the lowest note an octave to the top', () => {
    expect(voiceChord(CMAJ, C4, 1)).toEqual([64, 67, 72]) // E4 G4 C5
    expect(voiceChord(CMAJ, C4, 2)).toEqual([67, 72, 76]) // G4 C5 E5
  })

  test('turning down drops the highest note an octave to the bottom', () => {
    expect(voiceChord(CMAJ, C4, -1)).toEqual([55, 60, 64]) // G3 C4 E4
    expect(voiceChord(CMAJ, C4, -2)).toEqual([52, 55, 60]) // E3 G3 C4
  })

  test('a full cycle is the same chord an octave up', () => {
    expect(voiceChord(CMAJ, C4, 3)).toEqual([72, 76, 79]) // C5 E5 G5
  })

  test('inversion index wraps with the note count', () => {
    expect(inversionAt(CMAJ, 0)).toBe(0)
    expect(inversionAt(CMAJ, 1)).toBe(1)
    expect(inversionAt(CMAJ, 3)).toBe(0)
    expect(inversionAt(CMAJ, -1)).toBe(2)
  })
})

describe('cycle length follows the chord, not the dial', () => {
  // This is the behaviour the manufacturer calls intentional: the number of
  // clicks between inversions changes with how many notes are in the chord.
  test('triads cycle every 3 clicks, sevenths every 4', () => {
    expect(cycleLength(CMAJ)).toBe(3)
    expect(cycleLength(CMAJ7)).toBe(4)
  })

  test('a seventh chord needs four clicks to reach the octave', () => {
    expect(voiceChord(CMAJ7, C4, 4)).toEqual([72, 76, 79, 83])
  })
})

describe('voice leading', () => {
  test('picks a nearby inversion rather than jumping to root position', () => {
    const cmaj = voiceChord(buildChord({ root: 0, type: 'maj', extensions: [] }), C4, 0)
    const fIntervals = buildChord({ root: 5, type: 'maj', extensions: [] })
    const position = nearestVoicing(cmaj, fIntervals, C4 + 5)
    const voiced = voiceChord(fIntervals, C4 + 5, position)

    // C major -> F major should move less than a blind root-position jump.
    expect(voicingDistance(cmaj, voiced)).toBeLessThanOrEqual(
      voicingDistance(cmaj, voiceChord(fIntervals, C4 + 5, 0)),
    )
  })

  test('repeating the same chord does not move it', () => {
    const notes = voiceChord(CMAJ, C4, 0)
    expect(nearestVoicing(notes, CMAJ, C4)).toBe(0)
  })

  test('no previous chord means root position', () => {
    expect(nearestVoicing([], CMAJ, C4)).toBe(0)
  })
})

describe('range', () => {
  test('clamping pulls an out-of-range voicing back inside', () => {
    const position = clampPosition(CMAJ, C4, 40)
    expect(inRange(voiceChord(CMAJ, C4, position))).toBe(true)
  })
})

describe('properties', () => {
  const arbIntervals = fc
    .record({
      type: fc.constantFrom(...CHORD_TYPES),
      extensions: fc.uniqueArray(fc.constantFrom(...EXTENSIONS)),
    })
    .map(({ type, extensions }) => buildChord({ root: 0, type, extensions }))

  const arbPosition = fc.integer({ min: -24, max: 24 })
  const arbRoot = fc.integer({ min: 36, max: 72 })

  test('voicing preserves the chord exactly — same pitch classes, same count', () => {
    fc.assert(
      fc.property(arbIntervals, arbRoot, arbPosition, (intervals, root, position) => {
        const voiced = voiceChord(intervals, root, position)
        expect(voiced.length).toBe(intervals.length)
        expect(new Set(voiced.map((n) => ((n % 12) + 12) % 12))).toEqual(
          new Set(intervals.map((i) => ((root + i) % 12 + 12) % 12)),
        )
      }),
    )
  })

  test('voicings are always ascending', () => {
    fc.assert(
      fc.property(arbIntervals, arbRoot, arbPosition, (intervals, root, position) => {
        const voiced = voiceChord(intervals, root, position)
        for (let i = 1; i < voiced.length; i++) {
          expect(voiced[i]!).toBeGreaterThan(voiced[i - 1]!)
        }
      }),
    )
  })

  test('advancing by the note count transposes up exactly one octave', () => {
    fc.assert(
      fc.property(arbIntervals, arbRoot, arbPosition, (intervals, root, position) => {
        const here = voiceChord(intervals, root, position)
        const octaveUp = voiceChord(intervals, root, position + intervals.length)
        expect(octaveUp).toEqual(here.map((n) => n + 12))
      }),
    )
  })

  test('the dial is reversible — up then down returns the original', () => {
    fc.assert(
      fc.property(arbIntervals, arbRoot, arbPosition, fc.integer({ min: -12, max: 12 }), (intervals, root, position, delta) => {
        const there = voiceChord(intervals, root, position + delta)
        const back = voiceChord(intervals, root, position + delta - delta)
        expect(back).toEqual(voiceChord(intervals, root, position))
        expect(there.length).toBe(intervals.length)
      }),
    )
  })

  test('every step moves exactly one note', () => {
    fc.assert(
      fc.property(arbIntervals, arbRoot, arbPosition, (intervals, root, position) => {
        const a = voiceChord(intervals, root, position)
        const b = voiceChord(intervals, root, position + 1)
        // All but one note is shared between adjacent positions.
        const shared = a.filter((n) => b.includes(n))
        expect(shared.length).toBe(intervals.length - 1)
      }),
    )
  })
})
