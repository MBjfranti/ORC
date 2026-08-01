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
 * Voice `intervals` (ascending, from a root) as `count` sounding notes.
 *
 * `position` is unbounded and signed — it is a place on the keyboard, not an
 * inversion number, and there is deliberately no "home".
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
