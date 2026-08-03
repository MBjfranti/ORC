/**
 * Secret Chords (§14.8) and Single Note Mode (§14.7).
 *
 * The six combinations are a transcribed table, so these tests are mostly
 * guarding a transcription — which is exactly the kind of thing that rots
 * silently. Each case names the chord the manual prints and checks the
 * intervals actually spell it.
 */

import { describe, expect, it } from 'vitest'

import { buildChord, chordName } from './chord.js'
import { resolveChord, resolveSingleNote } from './resolve.js'
import { SECRET_CHORDS, secretFor, secretsEnabled } from './secret.js'
import type { ChordType, Extension, PitchClass } from './types.js'

const spell = (types: ChordType[], extensions: Extension[] = []) => {
  const secret = secretFor(types, extensions)
  return secret ? buildChord({ root: 0, type: 'maj', extensions, secret: secret.id }) : undefined
}

describe('the six secret chords', () => {
  it('spells each one as §14.8 prints it', () => {
    // Root, third, fifth… as semitones above C.
    expect(spell(['dim', 'sus'])).toEqual([0, 7]) // C5 — a bare fifth
    expect(spell(['maj', 'sus'])).toEqual([0, 4, 8]) // C+ — augmented
    expect(spell(['min', 'sus'])).toEqual([0, 3, 5, 7]) // Cmadd4
    expect(spell(['min', 'dim'], ['6'])).toEqual([0, 3, 7, 8]) // Cm♭6
    expect(spell(['maj', 'dim'], ['6'])).toEqual([0, 4, 7, 8]) // C♭6
    expect(spell(['maj', 'min'], ['m7'])).toEqual([0, 4, 7, 10, 15]) // C7♯9
  })

  it('names them the way the manual does', () => {
    const name = (id: (typeof SECRET_CHORDS)[number]['id']) =>
      chordName({ root: 0, type: 'maj', extensions: [], secret: id })
    expect(name('fifth')).toEqual({ base: '', sup: '5' })
    expect(name('aug')).toEqual({ base: '+', sup: '' })
    expect(name('madd4')).toEqual({ base: 'm', sup: 'add4' })
    expect(name('mFlat6')).toEqual({ base: 'm', sup: '♭6' })
    expect(name('flat6')).toEqual({ base: '', sup: '♭6' })
    expect(name('sevenSharpNine')).toEqual({ base: '', sup: '7♯9' })
  })

  it('carries a major and a minor third at once on the Hendrix chord', () => {
    // The joke in the table: a ♯9 is enharmonically a minor third, which is why
    // `Maj + Min` is the combination that produces it.
    const notes = spell(['maj', 'min'], ['m7'])!
    expect(notes).toContain(4) // major third
    expect(notes.map((n) => n % 12)).toContain(3) // ♯9, a minor third up an octave
  })

  it('does not care which order the pads were pressed', () => {
    expect(secretFor(['sus', 'dim'], [])?.id).toBe('fifth')
    expect(secretFor(['dim', 'sus'], [])?.id).toBe('fifth')
  })

  it('matches exactly — the table’s `None` is a condition, not a blank', () => {
    // `Dim + Sus` is a fifth. `Dim + Sus + 9` is a player holding three pads,
    // and should get what they asked for rather than a secret chord.
    expect(secretFor(['dim', 'sus'], [])?.id).toBe('fifth')
    expect(secretFor(['dim', 'sus'], ['9'])).toBeUndefined()
    // And the ones that *want* an extension need that one, not any one.
    expect(secretFor(['min', 'dim'], ['6'])?.id).toBe('mFlat6')
    expect(secretFor(['min', 'dim'], ['m7'])).toBeUndefined()
    expect(secretFor(['min', 'dim'], [])).toBeUndefined()
  })

  it('needs exactly two pads', () => {
    expect(secretFor(['maj'], [])).toBeUndefined()
    expect(secretFor(['maj', 'min', 'sus'], ['m7'])).toBeUndefined()
  })

  it('is gated by the play style, as §14.8 describes', () => {
    expect(secretsEnabled('off', true)).toBe(false)
    expect(secretsEnabled('off', false)).toBe(false)
    // "Simple PlayStyle … to access these chords in Simple Play Style mode only"
    expect(secretsEnabled('simple', true)).toBe(true)
    expect(secretsEnabled('simple', false)).toBe(false)
    expect(secretsEnabled('all', true)).toBe(true)
    expect(secretsEnabled('all', false)).toBe(true)
  })

  it('leaves the normal chord alone when they are switched off', () => {
    const input = {
      root: 0 as PitchClass,
      types: ['maj', 'sus'] as ChordType[],
      extensions: [] as Extension[],
      keyMode: false,
      key: { tonic: 0 as PitchClass, mode: 'ionian' as const },
      chromatic: 'colour' as const,
      octave: 3,
      voicing: 0,
    }
    // Off: the most recent pad wins, so this is a plain sus.
    expect(resolveChord({ ...input, secrets: false })?.spec.secret).toBeUndefined()
    // On: the pair spells an augmented triad instead.
    expect(resolveChord({ ...input, secrets: true })?.spec.secret).toBe('aug')
  })
})

describe('single note mode', () => {
  it('keeps every key in one octave when Full Octave', () => {
    // Twelve keys, one register — "the entire keyboard will stay within the
    // octave that you choose" (§5.5).
    const notes = Array.from({ length: 12 }, (_, pc) => resolveSingleNote(pc as PitchClass, 3))
    expect(Math.max(...notes) - Math.min(...notes)).toBe(11)
    expect(notes[0]).toBe(48)
  })

  it('gives exactly two octaves of range when Split', () => {
    /*
     * research/05: "effectively gives you two octaves of range from one octave
     * of keys". Two octaves is 23 semitones - which is the assertion that
     * caught the first implementation, where reading section 5.5 as an
     * *absolute* instruction (above goes up an octave, below goes down)
     * spanned 35 with a two-octave cliff at the seam.
     */
    const split = 7 as PitchClass
    const notes = Array.from({ length: 12 }, (_, pc) =>
      resolveSingleNote(pc as PitchClass, 3, split),
    )
    expect(Math.max(...notes) - Math.min(...notes)).toBe(23)
    // One octave of jump at the seam, per 5.5's own singular "an octave".
    expect(resolveSingleNote(6, 3, split)).toBe(54)
    expect(resolveSingleNote(7, 3, split)).toBe(67)
    expect(resolveSingleNote(7, 3, split) - resolveSingleNote(6, 3, split)).toBe(13)
  })

  it('puts the jump exactly at the point it is given', () => {
    // Skipping 0, where there is nothing below the split and so no seam.
    for (const split of [3, 7, 11] as PitchClass[]) {
      const below = resolveSingleNote((split - 1) as PitchClass, 3, split)
      const at = resolveSingleNote(split, 3, split)
      expect(at - below).toBe(13)
    }
  })
})
