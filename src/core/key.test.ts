import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { chordForRoot, diatonicChords, modeDegrees, modeNumerals, modeQualities, scaleRoots } from './key.js'
import { makeKey, noteName } from './spelling.js'
import { MODES } from './types.js'
import type { Key, Mode, PitchClass } from './types.js'

const names = (tonic: number, mode: Mode) =>
  diatonicChords(makeKey(tonic, mode)).map(
    (c) => noteName(c.root, makeKey(tonic, mode)) + (c.type === 'min' ? 'm' : c.type === 'dim' ? '°' : ''),
  )

describe('mode degrees', () => {
  test('every mode starts on its own tonic', () => {
    for (const mode of MODES) expect(modeDegrees(mode)[0]).toBe(0)
  })

  test('the seven modes are rotations of one scale', () => {
    expect(modeDegrees('major')).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(modeDegrees('dorian')).toEqual([0, 2, 3, 5, 7, 9, 10])
    expect(modeDegrees('phrygian')).toEqual([0, 1, 3, 5, 7, 8, 10])
    expect(modeDegrees('lydian')).toEqual([0, 2, 4, 6, 7, 9, 11])
    expect(modeDegrees('mixolydian')).toEqual([0, 2, 4, 5, 7, 9, 10])
    expect(modeDegrees('minor')).toEqual([0, 2, 3, 5, 7, 8, 10])
    expect(modeDegrees('locrian')).toEqual([0, 1, 3, 5, 6, 8, 10])
  })
})

describe('mode qualities', () => {
  test('major and minor keep the qualities we already relied on', () => {
    expect(modeQualities('major')).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'])
    expect(modeQualities('minor')).toEqual(['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'])
  })

  test("Dorian's defining chord is a major IV", () => {
    expect(modeQualities('dorian')[3]).toBe('maj')
  })

  test('Locrian has a diminished tonic', () => {
    expect(modeQualities('locrian')[0]).toBe('dim')
  })

  test('Mixolydian has a minor v', () => {
    expect(modeQualities('mixolydian')[4]).toBe('min')
  })
})

describe('numerals', () => {
  test('major is the plain series', () => {
    expect(modeNumerals('major')).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
  })

  test('minor flags its flattened degrees', () => {
    expect(modeNumerals('minor')).toEqual(['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII'])
  })

  test('Lydian flags its raised fourth', () => {
    expect(modeNumerals('lydian')[3]).toBe('♯iv°')
  })
})

describe('diatonic chords', () => {
  test('C major', () => {
    expect(names(0, 'major')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°'])
  })

  test('D dorian shares C major’s notes but starts on D', () => {
    expect(names(2, 'dorian')).toEqual(['Dm', 'Em', 'F', 'G', 'Am', 'B°', 'C'])
  })

  test('G mixolydian has the flat seventh', () => {
    expect(names(7, 'mixolydian')).toEqual(['G', 'Am', 'B°', 'C', 'Dm', 'Em', 'F'])
  })
})

describe('scale roots', () => {
  test('seven roots, ascending from the tonic', () => {
    expect(scaleRoots(makeKey(0, 'major'))).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(scaleRoots(makeKey(2, 'dorian'))).toEqual([2, 4, 5, 7, 9, 11, 0])
  })

  test('every root is diatonic and distinct', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.constantFrom(...MODES), (tonic, mode) => {
        const roots = scaleRoots(makeKey(tonic, mode))
        expect(new Set(roots).size).toBe(7)
        for (const r of roots) {
          expect(chordForRoot(r, makeKey(tonic, mode)).borrowed).toBe(false)
        }
      }),
    )
  })
})

describe('chromatic policy', () => {
  test('"snap" never produces a borrowed chord', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 0, max: 11 }),
        fc.constantFrom(...MODES),
        (root, tonic, mode) => {
          const chord = chordForRoot(root, makeKey(tonic, mode), { chromatic: 'snap' })
          expect(chord.borrowed).toBe(false)
          expect(scaleRoots(makeKey(tonic, mode))).toContain(chord.root)
        },
      ),
    )
  })

  test('"snap" picks the nearest degree, not merely one below', () => {
    // C♯ is one semitone from C and two from B — it must land on C.
    expect(chordForRoot(1, makeKey(0, 'major'), { chromatic: 'snap' }).root).toBe(0)
    // F♯ sits between F and G; ties resolve downward.
    expect(chordForRoot(6, makeKey(0, 'major'), { chromatic: 'snap' }).root).toBe(5)
    // A♯ is one from A, one from B — again the lower.
    expect(chordForRoot(10, makeKey(0, 'major'), { chromatic: 'snap' }).root).toBe(9)
  })

  test('"snap" never moves a root more than a semitone in a 7-note scale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 0, max: 11 }),
        fc.constantFrom(...MODES),
        (root, tonic, mode) => {
          const snapped = chordForRoot(root, makeKey(tonic, mode), { chromatic: 'snap' }).root
          const up = (((snapped - root) % 12) + 12) % 12
          expect(Math.min(up, 12 - up)).toBeLessThanOrEqual(1)
        },
      ),
    )
  })

  test('"borrow" marks out-of-key roots', () => {
    // C# is not in C major.
    expect(chordForRoot(1, makeKey(0, 'major'), { chromatic: 'borrow' }).borrowed).toBe(true)
    expect(chordForRoot(2, makeKey(0, 'major'), { chromatic: 'borrow' }).borrowed).toBe(false)
  })
})

describe('properties', () => {
  test('every mode yields seven distinct diatonic roots', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.constantFrom(...MODES), (tonic, mode) => {
        const chords = diatonicChords(makeKey(tonic, mode))
        expect(chords).toHaveLength(7)
        expect(new Set(chords.map((c) => c.root)).size).toBe(7)
      }),
    )
  })

  test('a mode and its relative major contain the same pitch classes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.constantFrom(...MODES), (tonic, mode) => {
        const offset = modeDegrees('major')[MODES.indexOf(mode)]!
        const relativeMajorTonic = ((tonic - offset) % 12 + 12) % 12
        expect(new Set(scaleRoots(makeKey(tonic, mode)))).toEqual(
          new Set(scaleRoots(makeKey(relativeMajorTonic, 'major'))),
        )
      }),
    )
  })
})

/**
 * The documented out-of-scale rule.
 *
 * Operation Manual §9.3: "Orchid will intelligently shift the note to the
 * nearest note within the scale, depending on the context. For example, if you
 * press C♯ while in the key of C, Orchid will play a Csus."
 */
describe('chromatic roots — the hardware rule', () => {
  const C: Key = { tonic: 0, tonality: 'major' }
  const harmonic = { chromatic: 'harmonic' as const }

  test('C♯ in the key of C plays Csus — the manual\'s own example', () => {
    const chord = chordForRoot(1, C, harmonic)
    expect(chord.root).toBe(0)
    expect(chord.type).toBe('sus')
  })

  test('every chromatic root lands on a scale note, suspended', () => {
    const scale = new Set(scaleRoots(C))
    for (const pc of [1, 3, 6, 8, 10] as PitchClass[]) {
      const chord = chordForRoot(pc, C, harmonic)
      expect(scale.has(chord.root)).toBe(true)
      expect(chord.type).toBe('sus')
      expect(chord.borrowed).toBe(true)
    }
  })

  test('diatonic roots are untouched by the rule', () => {
    for (const pc of scaleRoots(C)) {
      const chord = chordForRoot(pc, C, harmonic)
      expect(chord.root).toBe(pc)
      expect(chord.borrowed).toBe(false)
    }
  })

  /* It is the default because it is what the instrument does; `borrow` is our
     own extension and has to be asked for. */
  test('it is the default policy', () => {
    expect(chordForRoot(1, C)).toEqual(chordForRoot(1, C, harmonic))
  })
})
