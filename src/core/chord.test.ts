import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  allSecretChords,
  buildChord,
  chordPitchClasses,
  chordSuffix,
  dedupeExtensions,
  isOverloaded,
  secretChordFor,
} from './chord.js'
import { CHORD_TYPES, EXTENSIONS } from './types.js'
import type { Extension as Ext } from './types.js'
import type { ChordSpec, ChordType, Extension } from './types.js'

const spec = (type: ChordType, extensions: Extension[] = [], root = 0): ChordSpec => ({
  root,
  type,
  extensions,
})

describe('base triads', () => {
  test('match the four Chord Type buttons', () => {
    expect(buildChord(spec('dim'))).toEqual([0, 3, 6])
    expect(buildChord(spec('min'))).toEqual([0, 3, 7])
    expect(buildChord(spec('maj'))).toEqual([0, 4, 7])
    expect(buildChord(spec('sus'))).toEqual([0, 5, 7])
  })

  test('sus2 flavour is available as an option', () => {
    expect(buildChord(spec('sus'), { susFlavour: 'sus2' })).toEqual([0, 2, 7])
  })
})

describe('extensions are additive', () => {
  /*
   * The Orchid Standard Framework, transcribed from the notation plates in
   * the Operation Manual v4.1 (§6.3-6.5) and the screen mock-ups beside them.
   *
   * Mechanical concatenation, deliberately *not* jazz shorthand: the manual
   * says "we don't do fancy stuff like turn a '6' into a '13'. What you play
   * is what you get." These expectations used to encode exactly that fancy
   * stuff — `13`, `6/9`, `ø7` — none of which the instrument prints.
   */
  const cases: Array<[ChordType, Extension[], number[], string]> = [
    // No extensions — plate §6.3.
    ['maj', [], [0, 4, 7], ''],
    ['min', [], [0, 3, 7], 'm'],
    ['dim', [], [0, 3, 6], 'dim'],
    ['sus', [], [0, 5, 7], 'sus'],

    // One extension — plate §6.4. Note `C7`: a major triad with a minor
    // seventh is a dominant, "very typically just written as C⁷".
    ['maj', ['6'], [0, 4, 7, 9], '6'],
    ['maj', ['m7'], [0, 4, 7, 10], '7'],
    ['maj', ['M7'], [0, 4, 7, 11], 'M7'],
    ['maj', ['9'], [0, 4, 7, 14], '9'],
    ['min', ['6'], [0, 3, 7, 9], 'm6'],
    ['min', ['m7'], [0, 3, 7, 10], 'm7'],
    ['min', ['M7'], [0, 3, 7, 11], 'mM7'],
    ['dim', ['m7'], [0, 3, 6, 10], 'dim7'],
    ['dim', ['6'], [0, 3, 6, 9], 'dim6'],
    ['sus', ['m7'], [0, 5, 7, 10], 'sus7'],

    // Two extensions — both in the superscript, seventh first.
    ['maj', ['M7', '9'], [0, 4, 7, 11, 14], 'M79'],
    ['maj', ['6', 'M7'], [0, 4, 7, 9, 11], 'M76'],
    ['maj', ['6', '9'], [0, 4, 7, 9, 14], '69'],
    ['maj', ['m7', '9'], [0, 4, 7, 10, 14], '79'],
    ['min', ['m7', '9'], [0, 3, 7, 10, 14], 'm79'],
    ['sus', ['m7', '9'], [0, 5, 7, 10, 14], 'sus79'],
  ]

  test.each(cases)('%s + [%s] builds %j and is named "%s"', (type, exts, notes, name) => {
    expect(buildChord(spec(type, exts))).toEqual(notes)
    expect(chordSuffix(spec(type, exts))).toBe(name)
  })

  test('dim + 6 is a genuine fully-diminished 7th', () => {
    // The 6th (9 semitones) is enharmonically the double-flat 7th, so the
    // additive model gets dim7 for free. Symmetric: all minor 3rds.
    const notes = buildChord(spec('dim', ['6']))
    const gaps = notes.slice(1).map((n, i) => n - notes[i]!)
    expect(gaps).toEqual([3, 3, 3])
  })
})

describe('overload labels', () => {
  test('three or more extensions overload the display', () => {
    expect(isOverloaded(spec('maj', ['6', 'm7', '9']))).toBe(true)
    expect(isOverloaded(spec('maj', ['6', 'm7', 'M7', '9']))).toBe(true)
    expect(isOverloaded(spec('maj', ['6', 'm7']))).toBe(false)
  })

  test('overloaded chords show a joke placeholder', () => {
    expect(['JAZZ', '???', 'WTF?']).toContain(chordSuffix(spec('maj', ['6', 'm7', '9'])))
  })

  test('the same chord always shows the same placeholder', () => {
    const s = spec('min', ['6', 'm7', 'M7'], 5)
    expect(chordSuffix(s)).toBe(chordSuffix(s))
  })

  test('all four extensions still builds every note', () => {
    expect(buildChord(spec('maj', ['6', 'm7', 'M7', '9']))).toEqual([0, 4, 7, 9, 10, 11, 14])
  })
})

describe('secret chords', () => {
  const secret = (types: ChordType[]) => secretChordFor(types)

  test('one button held is never a secret chord', () => {
    for (const t of CHORD_TYPES) expect(secret([t])).toBeUndefined()
    expect(secret([])).toBeUndefined()
  })

  test('reaches the qualities the four buttons cannot', () => {
    expect(secret(['maj', 'dim'])!.intervals).toEqual([0, 4, 8]) // augmented
    expect(secret(['maj', 'min'])!.intervals).toEqual([0, 7]) // power chord
    expect(secret(['min', 'sus'])!.intervals).toEqual([0, 5, 10]) // quartal
    expect(secret(['dim', 'sus'])!.intervals).toEqual([0, 6]) // tritone
  })

  test('holding all four gives a cluster', () => {
    expect(secret(['dim', 'min', 'maj', 'sus'])!.intervals).toEqual([0, 1, 2, 3])
  })

  test('button order never matters', () => {
    expect(secret(['maj', 'dim'])).toBe(secret(['dim', 'maj']))
    expect(secret(['sus', 'min', 'maj'])).toBe(secret(['maj', 'min', 'sus']))
  })

  test('a secret chord replaces the triad entirely', () => {
    const aug = secret(['maj', 'dim'])!
    const built = buildChord({ root: 0, type: 'maj', extensions: [], secret: aug })
    expect(built).toEqual([0, 4, 8])
  })

  test('extensions still stack on top', () => {
    const aug = secret(['maj', 'dim'])!
    const spec = { root: 0, type: 'maj' as ChordType, extensions: ['m7' as Extension], secret: aug }
    expect(buildChord(spec)).toEqual([0, 4, 8, 10]) // 7♯5
    expect(chordSuffix(spec)).toBe('aug(m7)')
  })

  test('names itself rather than borrowing the triad name', () => {
    expect(chordSuffix({ root: 0, type: 'maj', extensions: [], secret: secret(['maj', 'min'])! })).toBe('5')
  })

  test('a secret chord never overloads the display', () => {
    // Three extensions on a normal chord prints JAZZ/???; a secret chord keeps
    // its own name, which is more useful than a joke.
    const aug = secret(['maj', 'dim'])!
    const spec = { root: 0, type: 'maj' as ChordType, extensions: EXTENSIONS.slice(0, 3), secret: aug }
    expect(chordSuffix(spec)).toContain('aug')
  })

  test('every published combination resolves and is playable', () => {
    for (const { types, chord } of allSecretChords()) {
      expect(secret(types)).toBe(chord)
      expect(chord.intervals[0]).toBe(0)
      expect(chord.intervals.length).toBeGreaterThan(1)
      // Strictly ascending, so voicing and bass logic behave.
      for (let i = 1; i < chord.intervals.length; i++) {
        expect(chord.intervals[i]!).toBeGreaterThan(chord.intervals[i - 1]!)
      }
    }
  })

  test('unmapped combinations fall through rather than throwing', () => {
    // Every 2+ combination either maps or returns undefined; none may throw.
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom(...CHORD_TYPES)), (types) => {
        expect(() => secretChordFor(types)).not.toThrow()
      }),
    )
  })
})

describe('properties', () => {
  const arbType = fc.constantFrom(...CHORD_TYPES)
  const arbExts = fc.uniqueArray(fc.constantFrom(...EXTENSIONS))
  const arbRoot = fc.integer({ min: 0, max: 11 })
  const arbSpec = fc.record({ root: arbRoot, type: arbType, extensions: arbExts })

  test('the root is always present and lowest', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        const notes = buildChord(s)
        expect(notes[0]).toBe(0)
      }),
    )
  })

  test('intervals are strictly ascending and unique', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        const notes = buildChord(s)
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i]!).toBeGreaterThan(notes[i - 1]!)
        }
      }),
    )
  })

  test('extension order never affects the result', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        const reversed = { ...s, extensions: [...s.extensions].reverse() }
        expect(buildChord(reversed)).toEqual(buildChord(s))
        expect(chordSuffix(reversed)).toBe(chordSuffix(s))
      }),
    )
  })

  test('duplicate extension presses are idempotent', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        const doubled = { ...s, extensions: [...s.extensions, ...s.extensions] }
        expect(buildChord(doubled)).toEqual(buildChord(s))
      }),
    )
  })

  test('note count equals triad size plus distinct extensions', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        // No extension collides with a triad tone for any of the four triads,
        // so every extension adds exactly one note.
        expect(buildChord(s).length).toBe(3 + dedupeExtensions(s.extensions).length)
      }),
    )
  })

  test('pitch classes stay within 0-11', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        for (const pc of chordPitchClasses(s)) {
          expect(pc).toBeGreaterThanOrEqual(0)
          expect(pc).toBeLessThan(12)
        }
      }),
    )
  })

  test('every non-overloaded combination has a real name', () => {
    fc.assert(
      fc.property(arbSpec, (s) => {
        fc.pre(!isOverloaded(s))
        expect(chordSuffix(s)).not.toContain('add ')
      }),
    )
  })
})
