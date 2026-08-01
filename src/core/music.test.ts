/**
 * The music theory, checked against things that are true regardless of how the
 * code is written — named chords, published key signatures, and the properties
 * the voicing engine claims about itself.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { buildChord, chordName, pitchClasses } from './chord.js'
import { chordForRoot, degreeAt, scaleNotes } from './key.js'
import { noteName } from './spelling.js'
import { nearestPosition, voiceChord } from './voicing.js'
import { mod12 } from './types.js'
import type { ChordSpec, Extension, Key } from './types.js'

const C: Key = { tonic: 0, mode: 'ionian' }
const Am: Key = { tonic: 9, mode: 'aeolian' }

const spec = (over: Partial<ChordSpec> = {}): ChordSpec => ({
  root: 0,
  type: 'maj',
  extensions: [],
  ...over,
})

describe('chords', () => {
  it('builds the four triads', () => {
    expect(buildChord(spec({ type: 'maj' }))).toEqual([0, 4, 7])
    expect(buildChord(spec({ type: 'min' }))).toEqual([0, 3, 7])
    expect(buildChord(spec({ type: 'dim' }))).toEqual([0, 3, 6])
    expect(buildChord(spec({ type: 'sus' }))).toEqual([0, 5, 7])
  })

  it('names the chords a musician would recognise', () => {
    const name = (s: ChordSpec) => {
      const n = chordName(s)
      return n.base + n.sup
    }
    expect(name(spec())).toBe('')
    expect(name(spec({ type: 'min' }))).toBe('m')
    expect(name(spec({ extensions: ['m7'] }))).toBe('7')
    expect(name(spec({ extensions: ['M7'] }))).toBe('maj7')
    expect(name(spec({ type: 'min', extensions: ['m7'] }))).toBe('m7')
    expect(name(spec({ type: 'min', extensions: ['M7'] }))).toBe('mmaj7')
    expect(name(spec({ extensions: ['6'] }))).toBe('6')
    expect(name(spec({ extensions: ['9'] }))).toBe('add9')
    expect(name(spec({ extensions: ['m7', '9'] }))).toBe('9')
  })

  it('reads dim + 6 as a diminished seventh', () => {
    // The 6th is enharmonically the double-flat 7th, so the additive model
    // lands on a real dim7 by accident. Worth locking in.
    expect(pitchClasses(spec({ type: 'dim', extensions: ['6'] }))).toEqual([0, 3, 6, 9])
    expect(chordName(spec({ type: 'dim', extensions: ['6'] })).sup).toBe('°7')
  })

  it('reads dim + m7 as half-diminished', () => {
    expect(chordName(spec({ type: 'dim', extensions: ['m7'] }))).toEqual({ base: 'm', sup: '7♭5' })
  })

  it('gives up honestly past three extensions', () => {
    const all: Extension[] = ['6', 'm7', 'M7', '9']
    expect(chordName(spec({ extensions: all })).sup).toBe('JAZZ')
  })
})

describe('keys', () => {
  it('harmonises C major the way the table says', () => {
    const expected = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => degreeAt(C, i).type)).toEqual(expected)
  })

  it('plays D minor for D in C major', () => {
    // The one worked example the manual gives.
    const d = chordForRoot(2, C, 'colour')
    expect(d.type).toBe('min')
    expect(d.numeral).toBe('ii')
  })

  it('derives every mode by rotating one scale', () => {
    // D Dorian and C major contain the same pitches.
    expect(scaleNotes({ tonic: 2, mode: 'dorian' }).sort((a, b) => a - b)).toEqual(
      scaleNotes(C).sort((a, b) => a - b),
    )
  })

  it('gives Dorian its major IV and Mixolydian its minor v', () => {
    expect(degreeAt({ tonic: 2, mode: 'dorian' }, 3).type).toBe('maj')
    expect(degreeAt({ tonic: 7, mode: 'mixolydian' }, 4).type).toBe('min')
  })

  it('spells from the key signature', () => {
    expect(noteName(10, C)).toBe('A♯')
    expect(noteName(10, { tonic: 5, mode: 'ionian' })).toBe('B♭')
    // E♭ minor, not D♯ minor — the aeolian special case.
    expect(noteName(3, { tonic: 3, mode: 'aeolian' })).toBe('E♭')
  })

  it('snaps out-of-key roots at most a semitone', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.integer({ min: 0, max: 11 }), (root, tonic) => {
        const key: Key = { tonic, mode: 'ionian' }
        const chord = chordForRoot(root, key, 'snap')
        const raw = Math.abs(mod12(chord.root - root))
        expect(Math.min(raw, 12 - raw)).toBeLessThanOrEqual(1)
      }),
    )
  })

  it('borrows a major triad on every chromatic root', () => {
    // Modal interchange, named by chromatic degree. All five are chords people
    // actually use: the Neapolitan, the three parallel-minor borrowings, and
    // the Lydian brightener.
    expect(chordForRoot(1, C, 'colour')).toMatchObject({ numeral: '♭II', type: 'maj' })
    expect(chordForRoot(3, C, 'colour')).toMatchObject({ numeral: '♭III', type: 'maj' })
    expect(chordForRoot(6, C, 'colour')).toMatchObject({ numeral: '♯IV', type: 'maj' })
    expect(chordForRoot(8, C, 'colour')).toMatchObject({ numeral: '♭VI', type: 'maj' })
    expect(chordForRoot(10, C, 'colour')).toMatchObject({ numeral: '♭VII', type: 'maj' })
  })

  it('never marks an in-scale root as borrowed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.constantFrom(C, Am), (root, key) => {
        const inScale = scaleNotes(key).includes(root)
        expect(chordForRoot(root, key, 'colour').borrowed).toBe(!inScale)
      }),
    )
  })
})

describe('voicing', () => {
  const major = [0, 4, 7]

  it('walks the inversions one note at a time', () => {
    expect(voiceChord(major, 60, 0)).toEqual([60, 64, 67])
    expect(voiceChord(major, 60, 1)).toEqual([64, 67, 72])
    expect(voiceChord(major, 60, 2)).toEqual([67, 72, 76])
  })

  it('returns to root position after one cycle, an octave up', () => {
    expect(voiceChord(major, 60, 3)).toEqual([72, 76, 79])
  })

  it('descends symmetrically below zero', () => {
    expect(voiceChord(major, 60, -1)).toEqual([55, 60, 64])
    expect(voiceChord(major, 60, -3)).toEqual([48, 52, 55])
  })

  it('cycles in as many clicks as the chord has notes', () => {
    // The quirk the manufacturer calls intentional: a seventh takes 4 clicks
    // to come home, a ninth 5. It falls out of the model rather than being
    // written anywhere.
    for (const intervals of [[0, 4, 7], [0, 4, 7, 10], [0, 4, 7, 10, 14]]) {
      const n = intervals.length
      const base = voiceChord(intervals, 60, 0)
      const cycled = voiceChord(intervals, 60, n)
      expect(cycled).toEqual(base.map((note) => note + 12))
    }
  })

  it('always sounds as many notes as the chord has', () => {
    fc.assert(
      fc.property(fc.integer({ min: -40, max: 40 }), (position) => {
        expect(voiceChord([0, 4, 7, 11], 60, position)).toHaveLength(4)
      }),
    )
  })

  it('always ascends', () => {
    fc.assert(
      fc.property(fc.integer({ min: -40, max: 40 }), (position) => {
        const notes = voiceChord([0, 3, 7, 10], 60, position)
        for (let i = 1; i < notes.length; i++) expect(notes[i]!).toBeGreaterThan(notes[i - 1]!)
      }),
    )
  })

  it('picks the nearest voicing when the chord changes', () => {
    // C major at position 0 is C4-E4-G4. A minor should land somewhere close
    // rather than restarting low.
    const from = voiceChord([0, 4, 7], 60, 0)
    const position = nearestPosition([0, 3, 7], 69, from, 0)
    const to = voiceChord([0, 3, 7], 69, position)
    const drift = Math.abs(average(to) - average(from))
    expect(drift).toBeLessThan(6)
  })
})

const average = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
