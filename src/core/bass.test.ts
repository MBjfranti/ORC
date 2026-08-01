import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { BASS_MODES, bassCycleLength, bassNote, bassSounds, trebleSounds } from './bass.js'
import { buildChord } from './chord.js'
import { CHORD_TYPES, EXTENSIONS } from './types.js'

const CMAJ = [0, 4, 7]
const CMAJ7 = [0, 4, 7, 11]

describe('bass note', () => {
  test('voicing 0 is the root, in the bass register', () => {
    expect(bassNote(CMAJ, 0, 0)).toBe(36) // C2
  })

  test('the dial walks up the chord one tone at a time', () => {
    expect(bassNote(CMAJ, 0, 1)).toBe(40) // E2
    expect(bassNote(CMAJ, 0, 2)).toBe(43) // G2
    expect(bassNote(CMAJ, 0, 3)).toBe(48) // C3 — wrapped an octave
  })

  test('walks downward too', () => {
    expect(bassNote(CMAJ, 0, -1)).toBe(31) // G1
    expect(bassNote(CMAJ, 0, -3)).toBe(24) // C1
  })

  test('a full cycle is one octave, however many notes the chord has', () => {
    expect(bassNote(CMAJ, 0, 3) - bassNote(CMAJ, 0, 0)).toBe(12)
    expect(bassNote(CMAJ7, 0, 4) - bassNote(CMAJ7, 0, 0)).toBe(12)
  })

  test('extensions above an octave fold into the register rather than leaping', () => {
    // Cadd9 is [0,4,7,14]; the 9th belongs in the bass as a 2nd, not a 9th.
    const add9 = [0, 4, 7, 14]
    expect(bassCycleLength(add9)).toBe(4)
    expect([0, 1, 2, 3].map((v) => bassNote(add9, 0, v))).toEqual([36, 38, 40, 43])
  })

  test('follows the chord root', () => {
    expect(bassNote(CMAJ, 5, 0)).toBe(41) // F2
    expect(bassNote(CMAJ, 7, 0)).toBe(43) // G2
  })
})

describe('bass modes', () => {
  test('bass off means treble always sounds and bass never does', () => {
    for (const mode of BASS_MODES) {
      expect(trebleSounds(mode, false, true)).toBe(true)
      expect(bassSounds(mode, false, true)).toBe(false)
    }
  })

  test('"with chords" holds the bass back on single notes', () => {
    expect(bassSounds('chords', true, false)).toBe(false)
    expect(bassSounds('chords', true, true)).toBe(true)
  })

  test('"unison" doubles single notes in the bass', () => {
    expect(bassSounds('unison', true, false)).toBe(true)
    expect(trebleSounds('unison', true, false)).toBe(true)
  })

  test('"single notes" gives a lone key to the bass alone', () => {
    expect(bassSounds('single', true, false)).toBe(true)
    expect(trebleSounds('single', true, false)).toBe(false)
    // ...but chords still bring the treble back in.
    expect(trebleSounds('single', true, true)).toBe(true)
  })

  test('"solo" mutes the treble even for chords', () => {
    expect(trebleSounds('solo', true, true)).toBe(false)
    expect(trebleSounds('solo', true, false)).toBe(false)
    expect(bassSounds('solo', true, true)).toBe(true)
  })

  test('something always sounds', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BASS_MODES),
        fc.boolean(),
        fc.boolean(),
        (mode, on, isChord) => {
          expect(trebleSounds(mode, on, isChord) || bassSounds(mode, on, isChord)).toBe(true)
        },
      ),
    )
  })
})

describe('properties', () => {
  const arbIntervals = fc
    .record({
      type: fc.constantFrom(...CHORD_TYPES),
      extensions: fc.uniqueArray(fc.constantFrom(...EXTENSIONS)),
    })
    .map(({ type, extensions }) => buildChord({ root: 0, type, extensions }))

  test('the bass note is always a tone of the chord', () => {
    fc.assert(
      fc.property(
        arbIntervals,
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: -12, max: 12 }),
        (intervals, root, voicing) => {
          const note = bassNote(intervals, root, voicing)
          const pcs = new Set(intervals.map((i) => (root + i) % 12))
          expect(pcs.has(((note % 12) + 12) % 12)).toBe(true)
        },
      ),
    )
  })

  test('the dial is monotonic — turning up never goes down', () => {
    fc.assert(
      fc.property(arbIntervals, fc.integer({ min: -12, max: 12 }), (intervals, voicing) => {
        expect(bassNote(intervals, 0, voicing + 1)).toBeGreaterThan(bassNote(intervals, 0, voicing))
      }),
    )
  })
})
