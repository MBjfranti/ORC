/**
 * Core domain types.
 *
 * This module — and everything else in `src/core` — has ZERO dependencies.
 * No React, no Tone.js, no DOM. Pure data in, pure data out.
 * See research/12-tech-stack.md.
 */

/** A pitch class, 0 = C … 11 = B. */
export type PitchClass = number

/** A MIDI note number, 0–127. Middle C (C4) = 60. */
export type MidiNote = number

/**
 * The four Chord Type buttons — the top row of the panel.
 * Selects the base triad. See research/03-chord-engine.md.
 */
export type ChordType = 'dim' | 'min' | 'maj' | 'sus'

/**
 * The four Chord Extension buttons — the bottom row of the panel.
 * Additive and stackable; they add notes to whatever triad is selected.
 * Named for what is printed on the hardware, not for interval size.
 */
export type Extension = '6' | 'm7' | 'M7' | '9'

/** All chord types, in panel order (left to right). */
export const CHORD_TYPES: readonly ChordType[] = ['dim', 'min', 'maj', 'sus'] as const

/** All extensions, in panel order (left to right). */
export const EXTENSIONS: readonly Extension[] = ['6', 'm7', 'M7', '9'] as const

/**
 * A chord as the player specifies it: a root, a triad quality, and any
 * number of stacked extensions. This is the literal state of the panel.
 */
export interface ChordSpec {
  readonly root: PitchClass
  readonly type: ChordType
  /** Order-insensitive. Duplicates are ignored. */
  readonly extensions: readonly Extension[]
  /**
   * Set when two or more Chord Type buttons are held, replacing the base triad.
   * Typed loosely here so `types.ts` stays free of chord-building logic.
   */
  readonly secret?: { readonly intervals: readonly number[]; readonly suffix: string }
}

/** Whether `sus` builds a sus4 (0,5,7) or a sus2 (0,2,7). */
export type SusFlavour = 'sus4' | 'sus2'

/** Letter names, used for enharmonically-correct spelling. */
export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'

/**
 * A note spelled with a letter and an accidental, so that C# and Db are
 * distinguishable. Accidental is in semitones: -2 = double flat, +2 = double sharp.
 */
export interface SpelledNote {
  readonly letter: Letter
  readonly accidental: number
}

/**
 * The seven diatonic modes.
 *
 * `major` and `minor` are Ionian and Aeolian under the names people actually
 * use — which also means every key that was major or minor still is.
 */
export type Mode =
  | 'major' // Ionian
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'minor' // Aeolian
  | 'locrian'

/** Modes in scale order, each a rotation of the one before. */
export const MODES: readonly Mode[] = [
  'major',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'minor',
  'locrian',
] as const

export const MODE_LABEL: Record<Mode, string> = {
  major: 'Major',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  minor: 'Minor',
  locrian: 'Locrian',
}

/**
 * How a key is written on the display: `C`, `Bm`, `D Dorian`.
 *
 * The manual quotes the encoder's readout as "Bm" and "C" — major is bare and
 * minor takes a lower-case m, the way keys are actually written. Showing the
 * tonic alone (which is what this used to do) loses half the information: `C`
 * and `Cm` are different keys and the display said `C` for both.
 */
export const MODE_SUFFIX: Record<Mode, string> = {
  major: '',
  minor: 'm',
  dorian: ' Dorian',
  phrygian: ' Phrygian',
  lydian: ' Lydian',
  mixolydian: ' Mixolydian',
  locrian: ' Locrian',
}

/** Retained name for the two modes that carry a conventional key signature. */
export type Tonality = Mode

/** A musical key: a tonic plus a mode. */
export interface Key {
  readonly tonic: PitchClass
  readonly tonality: Mode
}
