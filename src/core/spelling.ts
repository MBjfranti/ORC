/**
 * Spelling notes.
 *
 * A pitch class is a number; a *note name* is an opinion. Pitch class 3 is E♭
 * in C minor and D♯ in E major, and getting that right is the difference
 * between a chord readout that looks engraved and one that looks computed.
 *
 * The rule: spell from the key signature when there is a key, and from a
 * sensible default when there is not.
 */

import { mod12 } from './types.js'
import type { Key, PitchClass } from './types.js'

const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

/**
 * Which keys are written with flats.
 *
 * Keyed by the tonic of the relative major, so every mode inherits the key
 * signature it actually shares. F major, and everything round the flat side of
 * the circle of fifths.
 */
const FLAT_MAJORS = new Set<PitchClass>([5, 10, 3, 8, 1, 6])

/** Semitones from the tonic to the relative major, per mode. */
const RELATIVE_MAJOR: Record<string, number> = {
  ionian: 0,
  dorian: -2,
  phrygian: -4,
  lydian: -5,
  mixolydian: -7,
  aeolian: -9,
  locrian: -11,
}

/**
 * Does this key write flats?
 *
 * Aeolian is special-cased rather than deferred to its relative major: E♭ minor
 * and D♯ minor are the same pitches, but one of them is how people write it.
 * Deriving purely from the relative major would spell pitch class 3 as D♯m.
 */
function usesFlats(key: Key): boolean {
  if (key.mode === 'aeolian') return FLAT_MAJORS.has(mod12(key.tonic + 3))
  return FLAT_MAJORS.has(mod12(key.tonic + (RELATIVE_MAJOR[key.mode] ?? 0)))
}

/** The name of a pitch class, spelled for `key` when one is given. */
export function noteName(pc: PitchClass, key?: Key): string {
  const table = key && usesFlats(key) ? FLAT : SHARP
  return table[mod12(pc)]!
}

/** `C4`, `F♯5` — a note name with its octave, for the note readout. */
export function noteWithOctave(note: number, key?: Key): string {
  return noteName(mod12(note), key) + (Math.floor(note / 12) - 1)
}
