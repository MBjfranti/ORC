/**
 * The voicing engine.
 *
 * This is the feature the instrument is known for, and the whole thing is one
 * idea: **an infinite ascending stack of the chord's notes, and a window that
 * slides along it.**
 *
 *     … C3 E3 G3 | C4 E4 G4 | C5 E5 G5 …
 *                 └─ window ─┘
 *
 * Slide the window one step and the bottom note leaves while a new note joins
 * the top — which is exactly the described behaviour, "taking the lowest note
 * and moving it up an octave". Inversion and range are not two controls; they
 * are the same control, and the dial is a position rather than a mode.
 *
 * It also explains the instrument's most-remarked quirk for free: a triad
 * returns to root position every 3 clicks, a seventh every 4, a ninth every 5.
 * The cycle length *is* the note count, so adding an extension mid-turn moves
 * the goalposts. The manufacturer calls that intentional, and it falls out of
 * the model rather than needing to be written.
 */

import type { MidiNote } from './types.js'

/**
 * The pitch range the voicing window may travel through.
 *
 * The dial "expands the range of the keyboard well beyond a single octave —
 * turn it to move up and down **the full range of the keyboard**"
 * (research/05, [OFFICIAL]). So it is bounded by the instrument, not infinite:
 * a keyboard has ends, and running past them would only pile notes up outside
 * hearing while the readout kept counting.
 *
 * A piano's span. Chords much below C1 are mud and much above C8 are whistles,
 * and the bass has its own engine for the bottom.
 */
export const VOICING_LOW = 24 // C1
export const VOICING_HIGH = 108 // C8

/**
 * How far the window may slide, in positions, for this chord.
 *
 * Expressed as whole octave shifts and then converted, which is what keeps the
 * instrument's documented quirk intact: the travel is a fixed number of
 * *octaves*, so the number of clicks it takes scales with the chord's note
 * count — three for a triad, four for a seventh, five for a ninth. Bounding the
 * position directly would have made a ninth travel further than a triad.
 */
export function voicingRange(
  intervals: readonly number[],
  rootMidi: MidiNote,
): { min: number; max: number } {
  const n = intervals.length
  if (n === 0) return { min: 0, max: 0 }
  const top = intervals[n - 1]!

  // The window spans one full cycle, so it occupies the octave at `shift` and
  // reaches into the one above it.
  const lowestShift = Math.ceil((VOICING_LOW - rootMidi) / 12)
  const highestShift = Math.floor((VOICING_HIGH - rootMidi - top) / 12) - 1

  // A root already outside the range leaves nowhere to go; stay put rather
  // than invert the bounds.
  if (highestShift < lowestShift) return { min: 0, max: 0 }
  return { min: lowestShift * n, max: highestShift * n + (n - 1) }
}

/** Hold a position inside what this chord can actually reach. */
export function clampVoicing(
  intervals: readonly number[],
  rootMidi: MidiNote,
  position: number,
): number {
  const { min, max } = voicingRange(intervals, rootMidi)
  return Math.max(min, Math.min(max, position))
}

/**
 * Voice `intervals` (ascending, from a root) as `count` sounding notes.
 *
 * `position` is signed and has no "home" — it is a place on the keyboard rather
 * than an inversion number. It *is* bounded, though: see `voicingRange`.
 */
export function voiceChord(
  intervals: readonly number[],
  rootMidi: MidiNote,
  position: number,
): MidiNote[] {
  if (intervals.length === 0) return []
  const n = intervals.length

  return Array.from({ length: n }, (_, i) => {
    const k = position + i
    // Floor division, so negative positions walk downward correctly rather
    // than folding back on themselves at zero.
    const octave = Math.floor(k / n)
    return rootMidi + intervals[((k % n) + n) % n]! + 12 * octave
  })
}

/**
 * Pick the position whose voicing moves least from `previous`.
 *
 * Automatic voice leading: when the chord changes, the notes that can stay put
 * should stay put. Without it, every chord change restarts at the same absolute
 * position and the progression lurches around the keyboard instead of walking.
 *
 * Searching a window of positions either side of the current one keeps the
 * result near where the player has the dial set — the point is to smooth the
 * transition, not to overrule them.
 */
export function nearestPosition(
  intervals: readonly number[],
  rootMidi: MidiNote,
  previous: readonly MidiNote[],
  around: number,
  span = 4,
): number {
  if (previous.length === 0 || intervals.length === 0) return around

  let best = around
  let bestCost = Infinity

  for (let p = around - span; p <= around + span; p++) {
    const candidate = voiceChord(intervals, rootMidi, p)
    const cost = voiceLeadingCost(previous, candidate)
    // Strictly less, so ties keep the position closest to where the dial is.
    if (cost < bestCost) {
      bestCost = cost
      best = p
    }
  }

  return best
}

/**
 * Total distance every voice has to travel.
 *
 * Each note in the new chord is matched to its nearest note in the old one.
 * Not a true optimal assignment — that would be overkill for four notes, and
 * the greedy answer is what the ear hears anyway.
 */
function voiceLeadingCost(from: readonly MidiNote[], to: readonly MidiNote[]): number {
  let cost = 0
  for (const note of to) {
    let nearest = Infinity
    for (const other of from) nearest = Math.min(nearest, Math.abs(note - other))
    cost += nearest
  }
  return cost / to.length
}

/** The bass note for a chord, `octaves` below the voiced chord's root. */
export function bassNote(root: number, octave: number): MidiNote {
  return 12 * (octave + 1) + root
}

/**
 * Where the bass is allowed to go.
 *
 * Above C4 it has stopped being a bass. The floor is **E0**, around 20Hz and the
 * bottom of hearing, rather than the C1 the bass already sits on by default —
 * set there, the dial could not move down at all, which is the one direction
 * §10.3 names first ("moving the voicing **down** results in lower, deeper bass
 * notes"). A control that does nothing in the direction its documentation leads
 * with is the same bug as not having built it.
 */
export const BASS_LOW = 16 // E0
export const BASS_HIGH = 60 // C4

/**
 * The bass note at a given voicing position — §10.3.
 *
 * > "Similar to Chord Voicing, the Bass Voicing Dial allows you to modify the
 * > way bass notes are played: moving the voicing **down** results in lower,
 * > deeper bass notes; moving the voicing **up** shifts the bass notes higher
 * > in pitch."
 *
 * It walks the chord's own notes rather than moving in semitones or plain
 * octaves, which is the same thing `voiceChord` does for the chord — and it is
 * the reading that makes both sources true at once. §10.3 asks only for higher
 * and lower, and this delivers that; the press quote asks for "walk through
 * inversions **one note at a time**", and a bass sitting on the third *is* the
 * first inversion. A dial that only moved octaves would satisfy the first and
 * miss the second entirely.
 *
 * Position 0 is the root, so the default is exactly where the bass sat before
 * this dial existed. Moving off it is the player asking for a slash chord.
 */
export function bassVoice(
  intervals: readonly number[],
  rootMidi: MidiNote,
  position: number,
): MidiNote {
  if (intervals.length === 0) return rootMidi
  const n = intervals.length
  // The same floor division `voiceChord` uses, so the two cannot disagree about
  // what a negative position means.
  const octave = Math.floor(position / n)
  return rootMidi + intervals[((position % n) + n) % n]! + 12 * octave
}

/** Keep the dial from walking the bass off either end of its register. */
export function clampBassVoicing(
  intervals: readonly number[],
  rootMidi: MidiNote,
  position: number,
): number {
  let at = position
  while (at > 0 && bassVoice(intervals, rootMidi, at) > BASS_HIGH) at--
  while (at < 0 && bassVoice(intervals, rootMidi, at) < BASS_LOW) at++
  return at
}
