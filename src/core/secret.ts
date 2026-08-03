/**
 * Secret Chords — §14.8.
 *
 * > "Turning on Secret Chords gives you access to a range of extra spicy
 * > chords… Select **Simple PlayStyle** in the Secret Chords menu to access
 * > these chords in Simple Play Style mode only, or **All PlayStyle** to access
 * > these chords in all Play Style modes."
 *
 * Six combinations, and the manual prints them as a table of *Top Keys* (the
 * chord-type pads) against *Bottom Keys* (the extension pads). They are not
 * extra pads: they are what two pads held **together** mean, which is why the
 * normal rule cannot reach them — `resolve` takes the most recent pad and
 * ignores the rest, so `Maj + Min` is otherwise just `Min`.
 *
 * Every one of them is a chord the additive model genuinely cannot build:
 *
 * | Pads | Chord | Why the normal path misses it |
 * |---|---|---|
 * | `Dim + Sus` | `C5` | a bare fifth — the model always has a third |
 * | `Maj + Sus` | `C+` | needs a ♯5, and no pad raises the fifth |
 * | `Min + Sus` | `Cmadd4` | a fourth *and* a third; sus replaces the third |
 * | `Min + Dim` + `6` | `Cm♭6` | ♭6 against a natural fifth; the `6` pad is a major sixth |
 * | `Maj + Dim` + `6` | `C♭6` | same ♭6, over a major third |
 * | `Maj + Min` + `m7` | `C7♯9` | the Hendrix chord |
 *
 * That last one is the joke worth noticing: a ♯9 is enharmonically a minor
 * third, so a chord that wants a major *and* a minor third at once is exactly
 * what `Maj + Min` should mean. The pads spell it out.
 */

import type { ChordType, Extension } from './types.js'

export type SecretId = 'fifth' | 'aug' | 'madd4' | 'mFlat6' | 'flat6' | 'sevenSharpNine'

export interface SecretChord {
  readonly id: SecretId
  /** The two chord-type pads, held together. Order does not matter. */
  readonly types: readonly [ChordType, ChordType]
  /** The extension pad the table pairs with them, if any. */
  readonly extension?: Extension
  /** Intervals above the root, ascending. */
  readonly intervals: readonly number[]
  /** As the display writes it — baseline text, then superscript. */
  readonly base: string
  readonly sup: string
}

export const SECRET_CHORDS: readonly SecretChord[] = [
  { id: 'fifth', types: ['dim', 'sus'], intervals: [0, 7], base: '', sup: '5' },
  { id: 'aug', types: ['maj', 'sus'], intervals: [0, 4, 8], base: '+', sup: '' },
  { id: 'madd4', types: ['min', 'sus'], intervals: [0, 3, 5, 7], base: 'm', sup: 'add4' },
  {
    id: 'mFlat6',
    types: ['min', 'dim'],
    extension: '6',
    intervals: [0, 3, 7, 8],
    base: 'm',
    sup: '♭6',
  },
  {
    id: 'flat6',
    types: ['maj', 'dim'],
    extension: '6',
    intervals: [0, 4, 7, 8],
    base: '',
    sup: '♭6',
  },
  {
    id: 'sevenSharpNine',
    types: ['maj', 'min'],
    extension: 'm7',
    // The ♯9 sits an octave and a minor third up, above the ♭7 — voiced as a
    // cluster against the major third it would be unplayable, and nobody
    // writes it that way.
    intervals: [0, 4, 7, 10, 15],
    base: '',
    sup: '7♯9',
  },
]

/**
 * Which secret chord these pads spell, if any.
 *
 * Exact matches only. `Dim + Sus` is a fifth, but `Dim + Sus + 9` is not — the
 * table's `None` column is a condition, not a blank. Being strict is also what
 * keeps the feature from swallowing ordinary chords by accident: hold three
 * pads while rolling between them and you should get what you asked for.
 */
export function secretFor(
  types: readonly ChordType[],
  extensions: readonly Extension[],
): SecretChord | undefined {
  const held = new Set(types)
  if (held.size !== 2) return undefined
  const ext = new Set(extensions)

  return SECRET_CHORDS.find((s) => {
    if (!s.types.every((t) => held.has(t))) return false
    return s.extension === undefined ? ext.size === 0 : ext.size === 1 && ext.has(s.extension)
  })
}

/** `Off` / `Simple PlayStyle` / `All PlayStyle` — §14.8's own three values. */
export type SecretMode = 'off' | 'simple' | 'all'

export const SECRET_MODES: readonly SecretMode[] = ['off', 'simple', 'all']

/** Whether secret chords are reachable in the play style currently selected. */
export const secretsEnabled = (mode: SecretMode, simple: boolean): boolean =>
  mode === 'all' || (mode === 'simple' && simple)
