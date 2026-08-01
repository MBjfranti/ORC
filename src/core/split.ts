/**
 * Split mode — the twelve keys, laid out across two octaves.
 *
 * Pressing the Chord Voicing dial toggles between:
 *
 *   Octave   "the entire keyboard will stay within the octave that you
 *            choose" — all twelve keys in one register.
 *   Split    "places the octave jump at the point displayed on the screen."
 *
 * ## What the split point does
 *
 * The manual's own wording — "notes above that point play an octave higher,
 * and notes below play an octave lower" — describes screen positions rather
 * than pitches, and read literally as pitch it would leave a two-octave hole
 * in the middle of the keyboard. What the feature is *for* is stated in the
 * same breath and is unambiguous: a wrap point that "keeps low roots low and
 * high melodies high", solving the single-octave problem without an octave
 * button that shifts everything.
 *
 * So: **keys below the split point rise an octave.** With the split at G,
 * playing G A B C D walks 55 57 59 60 62 — a continuous ascending line with
 * the dominant sitting *below* the tonic instead of a seventh above it. That
 * is the voice leading the feature exists to give you.
 *
 * Anchoring it this way round (rather than dropping everything from the split
 * upward, which produces the same shape) is what makes a split at C behave
 * exactly like Octave mode, and keeps the register you chose on the dial as
 * the register you hear at the split point. A property test holds both.
 *
 * See research/05-voicing-engine-and-inversions.md §Split mode vs Octave mode.
 */

import type { PitchClass } from './types.js'

export type SingleNotes = 'octave' | 'split'

export const SINGLE_NOTES_LABEL: Record<SingleNotes, string> = {
  octave: 'One octave',
  split: 'Split across two',
}

/**
 * How many octaves to shift a key, given the split point.
 *
 * Returns 0 in Octave mode, and 0 or +1 in Split mode. Never negative: the
 * split raises the keys below it rather than dropping the ones above, so the
 * register picked on the dial is the register heard at the split point, and a
 * split at C is a no-op.
 */
export function splitShift(pc: PitchClass, mode: SingleNotes, pivot: PitchClass): number {
  if (mode !== 'split') return 0
  return pc < pivot ? 1 : 0
}

/**
 * The twelve keys in the order they sound, low to high.
 *
 * Useful for drawing the keybed, and the clearest statement of what the mode
 * does: in Split mode the sequence starts at the pivot and wraps.
 */
export function splitOrder(mode: SingleNotes, pivot: PitchClass): PitchClass[] {
  const all = Array.from({ length: 12 }, (_, i) => i as PitchClass)
  if (mode !== 'split') return all
  return [...all.slice(pivot), ...all.slice(0, pivot)]
}
