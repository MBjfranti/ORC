/**
 * The chord engine.
 *
 * Implements the Orchid's additive model: a base triad chosen by one of four
 * Chord Type buttons, plus any combination of four Chord Extension buttons that
 * each add a note. See research/03-chord-engine.md for the full derivation.
 */

import type { ChordSpec, ChordType, Extension, SusFlavour } from './types.js'
import { CHORD_TYPES, EXTENSIONS } from './types.js'

/** Semitone offsets from the root for each base triad. */
const TRIAD: Record<ChordType, readonly number[]> = {
  dim: [0, 3, 6],
  min: [0, 3, 7],
  maj: [0, 4, 7],
  sus: [0, 5, 7], // sus4 by default; see susFlavour option
}

/**
 * Semitone offset each extension adds.
 *
 * Note these are the *literal* intervals printed on the panel, not
 * context-sensitive jazz spellings. `6` really is a major 6th (9 semitones)
 * even on a diminished triad — which is what makes `dim + 6` land on a
 * correct fully-diminished 7th chord for free.
 */
const EXTENSION_INTERVAL: Record<Extension, number> = {
  '6': 9,
  m7: 10,
  M7: 11,
  '9': 14,
}

// ---------------------------------------------------------------------------
// Secret chords
// ---------------------------------------------------------------------------

/**
 * Chords reached by holding **two or more Chord Type buttons at once**.
 *
 * The hardware has this feature and deliberately never documents the
 * combinations — which means in practice almost nobody finds them. Ours are our
 * own, and they are written down: discoverable by accident, but also listed in
 * the help panel, because a secret nobody can find is just a dead feature.
 *
 * They exist to reach the qualities the four buttons genuinely cannot —
 * augmented, quartal, power chords, altered dominants. See
 * research/11-webapp-implications.md §8.
 */
export interface SecretChord {
  readonly intervals: readonly number[]
  /** Suffix appended after the root, e.g. `Caug`. */
  readonly suffix: string
  readonly name: string
}

/** Keyed by the held types in canonical order, joined with `+`. */
const SECRET: Record<string, SecretChord> = {
  'dim+maj': { intervals: [0, 4, 8], suffix: 'aug', name: 'Augmented' },
  'min+maj': { intervals: [0, 7], suffix: '5', name: 'Power chord' },
  'min+sus': { intervals: [0, 5, 10], suffix: 'quartal', name: 'Quartal' },
  'maj+sus': { intervals: [0, 4, 5, 7], suffix: 'add4', name: 'Add 4' },
  'dim+sus': { intervals: [0, 6], suffix: '♭5', name: 'Tritone' },
  'dim+min': { intervals: [0, 3, 8], suffix: 'm♭6', name: 'Minor ♭6' },
  'dim+min+maj': { intervals: [0, 4, 7, 10, 15], suffix: '7♯9', name: 'Hendrix' },
  'dim+min+maj+sus': { intervals: [0, 1, 2, 3], suffix: 'cluster', name: 'Cluster' },
  'dim+maj+sus': { intervals: [0, 4, 6, 7], suffix: '♯11', name: 'Lydian' },
  'min+maj+sus': { intervals: [0, 2, 3, 7], suffix: 'm(add9)', name: 'Minor add 9' },
}

/** The secret chord for a set of held types, if there is one. */
export function secretChordFor(types: readonly ChordType[]): SecretChord | undefined {
  const held = CHORD_TYPES.filter((t) => types.includes(t))
  if (held.length < 2) return undefined
  return SECRET[held.join('+')]
}

/** Every secret combination, for the help panel. */
export function allSecretChords(): Array<{ types: ChordType[]; chord: SecretChord }> {
  return Object.entries(SECRET).map(([key, chord]) => ({
    types: key.split('+') as ChordType[],
    chord,
  }))
}

export interface BuildOptions {
  /** Whether the Sus button builds sus4 (default) or sus2. */
  readonly susFlavour?: SusFlavour
}

/**
 * Build a chord's semitone offsets from its root.
 *
 * Returns a sorted, de-duplicated ascending list starting at 0.
 * The root is always present.
 */
export function buildChord(spec: ChordSpec, opts: BuildOptions = {}): number[] {
  const base = spec.secret
    ? spec.secret.intervals
    : spec.type === 'sus' && opts.susFlavour === 'sus2'
      ? [0, 2, 7]
      : TRIAD[spec.type]

  const notes = new Set<number>(base)
  for (const ext of dedupeExtensions(spec.extensions)) {
    notes.add(EXTENSION_INTERVAL[ext])
  }
  return [...notes].sort((a, b) => a - b)
}

/** Pitch classes of a chord, as absolute values 0–11. */
export function chordPitchClasses(spec: ChordSpec, opts: BuildOptions = {}): number[] {
  const set = new Set(buildChord(spec, opts).map((i) => (spec.root + i) % 12))
  return [...set].sort((a, b) => a - b)
}

/** Extensions in canonical panel order, with duplicates removed. */
export function dedupeExtensions(exts: readonly Extension[]): Extension[] {
  const present = new Set(exts)
  return EXTENSIONS.filter((e) => present.has(e))
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * Placeholders for chords too busy to notate.
 *
 * The manual (v4.1 §6.4) is precise about the counts, and there are only two:
 * three extensions print `JAZZ`, four print `WTF`. Earlier notes here listed a
 * third label, `???`, and picked among all three at random — no version of the
 * manual mentions it, and randomising meant the same chord could be named two
 * different things.
 */
export const OVERLOAD_LABELS = ['JAZZ', 'WTF'] as const
export type OverloadLabel = (typeof OVERLOAD_LABELS)[number]

/** Extensions from this count up print a placeholder instead of a name. */
export const OVERLOAD_THRESHOLD = 3

/** The triad, as printed at full size next to the root: `C`, `Cm`, `Cdim`. */
const BASE_SUFFIX: Record<ChordType, string> = {
  dim: 'dim',
  min: 'm',
  maj: '',
  sus: 'sus',
}

/**
 * How each extension prints in the superscript.
 *
 * `m7` is bare `7` because a major triad with a minor seventh is a dominant,
 * and "very typically just written as C⁷" — the manual's one stated anomaly.
 * It falls out of concatenation rather than needing a special case: `` + `7`
 * gives `C⁷`, and `m` + `7` gives `Cm⁷`.
 */
const EXT_SUFFIX: Record<Extension, string> = {
  m7: '7',
  M7: 'M7',
  '6': '6',
  '9': '9',
}

/**
 * The order extensions print in, which is not the order the buttons sit in.
 *
 * The manual shows `Cᴹ⁷⁶` and `Cᴹ⁷⁹` — the seventh leads, then the sixth,
 * then the ninth. Reading them off the pad row instead would give `C⁶ᴹ⁷`.
 */
const EXT_ORDER: readonly Extension[] = ['m7', 'M7', '6', '9']

/**
 * The quality suffix for a chord, without its root — e.g. `m7`, `maj9`, `13`.
 *
 * Returns an overload label for chords with three or more extensions, matching
 * the hardware's behaviour. Which label is returned is deterministic per chord
 * so the display does not flicker between them on repeated presses.
 */
export function chordSuffix(spec: ChordSpec): string {
  const { base, ext } = chordParts(spec)
  return base + ext
}

/**
 * The chord name split where the display splits it.
 *
 * `base` prints at full size beside the root; `ext` prints as a superscript at
 * the top right. Keeping them apart is the only way the screen can render
 * `Cᴹ⁷` rather than the flat `CM7` — see the notation plates in §6.5.
 */
export function chordParts(spec: ChordSpec): { base: string; ext: string } {
  const exts = dedupeExtensions(spec.extensions)

  // A secret chord names itself, then carries any extensions in brackets —
  // `Caug` alone, `Caug(m7)` with a seventh stacked on.
  if (spec.secret) {
    return {
      base: spec.secret.suffix + (exts.length === 0 ? '' : `(${exts.join(' ')})`),
      ext: '',
    }
  }

  const base = BASE_SUFFIX[spec.type]

  if (exts.length >= OVERLOAD_THRESHOLD) {
    // Three is JAZZ, four (or more) is WTF. Not random, not a third label.
    return { base, ext: exts.length === OVERLOAD_THRESHOLD ? 'JAZZ' : 'WTF' }
  }

  /*
   * Straight concatenation, in print order. The manual is explicit that this
   * is *not* translated into jazz shorthand — "we don't do fancy stuff like
   * turn a '6' into a '13'. What you play is what you get." A lookup table
   * here used to name 6+m7 as `13`, 6+9 as `6/9` and m7+9 as `9`, none of
   * which the instrument prints.
   */
  const ext = EXT_ORDER.filter((e) => exts.includes(e))
    .map((e) => EXT_SUFFIX[e])
    .join('')

  return { base, ext }
}

/** True when this chord is displayed as JAZZ / ??? / WTF? rather than named. */
export function isOverloaded(spec: ChordSpec): boolean {
  return dedupeExtensions(spec.extensions).length >= OVERLOAD_THRESHOLD
}

