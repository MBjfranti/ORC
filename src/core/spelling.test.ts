import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  keySignature,
  makeKey,
  noteName,
  renderNote,
  scaleNotes,
  spellInKey,
  spelledToPitchClass,
  spellWithLetter,
} from './spelling.js'
import type { Letter, Tonality } from './types.js'

const names = (tonic: number, tonality: Tonality) =>
  scaleNotes(makeKey(tonic, tonality)).map(renderNote)

describe('key signatures', () => {
  test.each([
    [0, 'major', 0], // C
    [7, 'major', 1], // G
    [2, 'major', 2], // D
    [11, 'major', 5], // B
    [6, 'major', 6], // F#
    [5, 'major', -1], // F
    [10, 'major', -2], // Bb
    [1, 'major', -5], // Db
  ] as const)('%i %s has %i sharps/flats', (tonic, tonality, expected) => {
    expect(keySignature(makeKey(tonic, tonality))).toBe(expected)
  })

  test('a minor key normally shares the signature of its relative major', () => {
    expect(keySignature(makeKey(9, 'minor'))).toBe(keySignature(makeKey(0, 'major'))) // Am / C
    expect(keySignature(makeKey(4, 'minor'))).toBe(keySignature(makeKey(7, 'major'))) // Em / G
  })

  test('pitch class 3 minor is spelled E♭m, not D♯m', () => {
    // Deliberate break from relative-key consistency: F♯ major's relative minor
    // is D♯m, but players write E♭m. Each tonic gets its common spelling.
    expect(keySignature(makeKey(3, 'minor'))).toBe(-6)
    expect(keySignature(makeKey(6, 'major'))).toBe(6)
  })
})

describe('scale spelling', () => {
  test('C major is all naturals', () => {
    expect(names(0, 'major')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  })

  test('G major sharpens only F', () => {
    expect(names(7, 'major')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F♯'])
  })

  test('F major flattens only B', () => {
    expect(names(5, 'major')).toEqual(['F', 'G', 'A', 'B♭', 'C', 'D', 'E'])
  })

  test('A♭ major uses flats throughout', () => {
    expect(names(8, 'major')).toEqual(['A♭', 'B♭', 'C', 'D♭', 'E♭', 'F', 'G'])
  })

  test('F♯ major spells the 7th as E♯, not F', () => {
    // The case research/04 called out: one letter per scale degree forces E♯.
    expect(names(6, 'major')).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯'])
  })

  test('A natural minor is all naturals', () => {
    expect(names(9, 'minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  test('E♭ minor keeps six flats', () => {
    expect(names(3, 'minor')).toEqual(['E♭', 'F', 'G♭', 'A♭', 'B♭', 'C♭', 'D♭'])
  })
})

describe('spelling a pitch class in context', () => {
  test('the same key reads differently depending on the key signature', () => {
    // This is the whole point: physical key 1 is C♯ in D major, D♭ in A♭ major.
    expect(noteName(1, makeKey(2, 'major'))).toBe('C♯')
    expect(noteName(1, makeKey(8, 'major'))).toBe('D♭')
  })

  test('chromatic notes follow the key’s direction of travel', () => {
    expect(noteName(6, makeKey(7, 'major'))).toBe('F♯') // sharp key
    expect(noteName(6, makeKey(5, 'major'))).toBe('G♭') // flat key
  })

  test('naturals are never given an accidental', () => {
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) {
      expect(noteName(pc, makeKey(0, 'major'))).toMatch(/^[A-G]$/)
    }
  })
})

describe('spellWithLetter', () => {
  test('finds the accidental that lands a letter on a pitch class', () => {
    expect(renderNote(spellWithLetter('F', 6))).toBe('F♯')
    expect(renderNote(spellWithLetter('G', 6))).toBe('G♭')
    expect(renderNote(spellWithLetter('F', 7))).toBe('Fx') // double sharp
    expect(renderNote(spellWithLetter('B', 10))).toBe('B♭')
  })
})

describe('properties', () => {
  const arbPc = fc.integer({ min: 0, max: 11 })
  const arbKey = fc.record({
    tonic: arbPc,
    tonality: fc.constantFrom<Tonality>('major', 'minor'),
  })

  test('spelling always round-trips back to the same pitch class', () => {
    fc.assert(
      fc.property(arbPc, arbKey, (pc, key) => {
        expect(spelledToPitchClass(spellInKey(pc, key))).toBe(pc)
      }),
    )
  })

  test('every scale has seven distinct letters', () => {
    fc.assert(
      fc.property(arbKey, (key) => {
        const letters = scaleNotes(key).map((n) => n.letter)
        expect(new Set(letters).size).toBe(7)
      }),
    )
  })

  test('scale degrees ascend by the right intervals', () => {
    const MAJOR = [0, 2, 4, 5, 7, 9, 11]
    const MINOR = [0, 2, 3, 5, 7, 8, 10]
    fc.assert(
      fc.property(arbKey, (key) => {
        const expected = key.tonality === 'major' ? MAJOR : MINOR
        const actual = scaleNotes(key).map(
          (n) => (spelledToPitchClass(n) - key.tonic + 12) % 12,
        )
        expect(actual).toEqual(expected)
      }),
    )
  })

  test('scales never need more than a single accidental', () => {
    fc.assert(
      fc.property(arbKey, (key) => {
        for (const note of scaleNotes(key)) {
          expect(Math.abs(note.accidental)).toBeLessThanOrEqual(1)
        }
      }),
    )
  })

  test('spellWithLetter round-trips for every letter and pitch class', () => {
    const arbLetter = fc.constantFrom<Letter>('C', 'D', 'E', 'F', 'G', 'A', 'B')
    fc.assert(
      fc.property(arbLetter, arbPc, (letter, pc) => {
        expect(spelledToPitchClass(spellWithLetter(letter, pc))).toBe(pc)
      }),
    )
  })
})
