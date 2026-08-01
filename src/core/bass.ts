/**
 * The bass voice.
 *
 * A separate monophonic line with its own register, its own voicing dial, and
 * its own output — on the hardware it even gets its own MIDI channel. By default
 * it plays the root of whatever chord is sounding.
 *
 * See research/07-sound-engines-fx-and-presets.md §bass engine.
 */

import type { MidiNote } from './types.js'

/**
 * How the bass responds to what you play.
 *
 * Mirrors the hardware's four settings (Options → Bass).
 */
export type BassMode =
  /** Bass sounds only when a chord is played. */
  | 'chords'
  /** Single notes double in the bass; chords behave as 'chords'. */
  | 'unison'
  /** A lone key plays *only* bass; the treble engine waits for a chord. */
  | 'single'
  /** Treble muted entirely — take the bassline for a walk. */
  | 'solo'

export const BASS_MODES: readonly BassMode[] = ['chords', 'unison', 'single', 'solo'] as const

export const BASS_MODE_LABEL: Record<BassMode, string> = {
  chords: 'With chords',
  unison: 'Unison',
  single: 'Single notes',
  solo: 'Solo',
}

/** The register the bass sits in, as a MIDI octave. */
export const BASS_OCTAVE = 2

/**
 * The chord's tones collapsed into one octave, ascending.
 *
 * Extensions can sit above an octave — a `9` is 14 semitones up — and a bass
 * line has no business leaping there. Folding to pitch classes keeps the walk
 * inside one register, which is both musically right and what makes the dial
 * monotonic: without this, stepping past a 9th wraps to root+12 and the bass
 * jumps *down* as you turn the dial up.
 */
function bassTones(intervals: readonly number[]): number[] {
  return [...new Set(intervals.map((i) => ((i % 12) + 12) % 12))].sort((a, b) => a - b)
}

/**
 * Which note the bass plays.
 *
 * The Bass Voicing dial walks the chord one tone at a time — 0 is the root, 1
 * the third, 2 the fifth, and so on, wrapping up an octave at the top. Same
 * gesture as the chord voicing dial, narrowed to a single voice, so the two
 * dials feel like the same idea applied to different parts.
 */
export function bassNote(
  intervals: readonly number[],
  rootPitchClass: number,
  voicing: number,
  octave: number = BASS_OCTAVE,
): MidiNote {
  const tones = bassTones(intervals)
  const n = tones.length
  if (n === 0) throw new Error('bassNote: empty chord')

  const step = ((voicing % n) + n) % n
  const shift = Math.floor(voicing / n)
  const root = 12 * (octave + 1) + rootPitchClass

  return root + tones[step]! + 12 * shift
}

/** How many dial clicks return the bass to the same tone an octave up. */
export function bassCycleLength(intervals: readonly number[]): number {
  return bassTones(intervals).length
}

/** Whether the treble engine should sound, given the bass mode and what's played. */
export function trebleSounds(mode: BassMode, bassOn: boolean, isChord: boolean): boolean {
  if (!bassOn) return true
  switch (mode) {
    case 'solo':
      return false
    case 'single':
      return isChord
    case 'chords':
    case 'unison':
      return true
  }
}

/** Whether the bass should sound, given the bass mode and what's played. */
export function bassSounds(mode: BassMode, bassOn: boolean, isChord: boolean): boolean {
  if (!bassOn) return false
  switch (mode) {
    case 'chords':
      return isChord
    case 'unison':
    case 'single':
    case 'solo':
      return true
  }
}
