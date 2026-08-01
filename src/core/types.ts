/**
 * The vocabulary.
 *
 * `src/core` is pure: music theory, no audio, no React, no browser. Everything
 * here is a number or a string, so it can be tested without a sound card.
 */

/** 0 = C, 1 = C♯ … 11 = B. */
export type PitchClass = number

/** A MIDI note number. 60 = middle C. */
export type MidiNote = number

/** The four base triads — the top row of pads. */
export type ChordType = 'dim' | 'min' | 'maj' | 'sus'

export const CHORD_TYPES: readonly ChordType[] = ['dim', 'min', 'maj', 'sus']

/**
 * The four added notes — the bottom row.
 *
 * Additive and stackable, and deliberately literal: `9` adds a ninth, it does
 * not imply the seventh underneath it the way jazz notation would. Stacking
 * `m7` and `9` is how you get a real ninth chord, which is what makes the pads
 * teach intervals rather than chord symbols.
 */
export type Extension = '6' | 'm7' | 'M7' | '9'

export const EXTENSIONS: readonly Extension[] = ['6', 'm7', 'M7', '9']

/** The seven diatonic modes, in brightness order (Lydian brightest). */
export type Mode =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian'

export const MODES: readonly Mode[] = [
  'ionian',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'aeolian',
  'locrian',
]

/**
 * Ionian and Aeolian go by the names people actually use.
 *
 * Nobody says "I wrote it in C Ionian". The other five keep their modal names
 * because there is no everyday alternative.
 */
export const MODE_LABEL: Record<Mode, string> = {
  ionian: 'Major',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  aeolian: 'Minor',
  locrian: 'Locrian',
}

/** Suffix for a key name: `C`, `Am`, `D Dorian`. */
export const MODE_SUFFIX: Record<Mode, string> = {
  ionian: '',
  dorian: ' Dorian',
  phrygian: ' Phrygian',
  lydian: ' Lydian',
  mixolydian: ' Mixolydian',
  aeolian: 'm',
  locrian: ' Locrian',
}

export interface Key {
  readonly tonic: PitchClass
  readonly mode: Mode
}

/** What the pads and Key Mode resolve to before voicing. */
export interface ChordSpec {
  readonly root: PitchClass
  readonly type: ChordType
  readonly extensions: readonly Extension[]
}

export const mod12 = (n: number): PitchClass => ((n % 12) + 12) % 12
