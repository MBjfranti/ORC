/**
 * The voicing engine.
 *
 * The Orchid's Voicing Dial is not a transpose control and not an inversion
 * control — it is a single continuous "position on the keyboard", and inversions
 * fall out of moving through that space one note at a time.
 *
 * The rule, straight from the manual: turning up takes the *lowest* note of the
 * chord and moves it up an octave; turning down takes the *highest* and moves it
 * down an octave. Applied repeatedly, the chord inverts and simultaneously walks
 * the keyboard — and a full cycle back to the same shape takes exactly as many
 * clicks as the chord has notes. That is the quirk the manufacturer describes as
 * intentional: triads cycle every 3, sevenths every 4, ninths every 5.
 *
 * `liftCount` below is the closed form of applying that rule `position` times,
 * so we never have to iterate.
 *
 * Note this is deliberately *not* a "window over an infinite stack" — that model
 * looks equivalent but breaks for chords spanning more than an octave. A `9`
 * sits 14 semitones up, so e.g. `dim + 9` would place the next octave's root
 * below the 9th and produce a descending voicing.
 *
 * See research/05-voicing-engine-and-inversions.md.
 */

import type { MidiNote } from './types.js'

/**
 * How many octaves the `i`-th note of a chord has been lifted after `position`
 * dial clicks. Negative results mean it has been dropped instead.
 *
 * Clicks lift notes in ascending order — click 1 lifts note 0, click 2 lifts
 * note 1, and so on, wrapping — so after `n` clicks every note has been lifted
 * exactly once and the whole chord has risen an octave.
 */
function liftCount(index: number, position: number, n: number): number {
  return Math.floor((position - index + n - 1) / n)
}

/**
 * Voice a chord at a given dial position.
 *
 * @param intervals ascending semitone offsets from the root, starting at 0
 * @param rootMidi  MIDI note of the chord's root in its home register
 * @param position  the dial position; 0 is root position in the home register
 * @returns `intervals.length` MIDI notes, ascending
 */
export function voiceChord(
  intervals: readonly number[],
  rootMidi: MidiNote,
  position: number,
): MidiNote[] {
  const n = intervals.length
  if (n === 0) throw new Error('voiceChord: empty chord')

  return intervals
    .map((interval, i) => rootMidi + interval + 12 * liftCount(i, position, n))
    .sort((a, b) => a - b)
}

/**
 * How many dial clicks return the chord to the same shape an octave away.
 * Equal to the note count — so triads cycle every 3, sevenths every 4, and
 * ninths every 5.
 */
export function cycleLength(intervals: readonly number[]): number {
  return intervals.length
}

/** Which inversion a dial position represents (0 = root position). */
export function inversionAt(intervals: readonly number[], position: number): number {
  const n = intervals.length
  return ((position % n) + n) % n
}

// ---------------------------------------------------------------------------
// Automatic voice leading
// ---------------------------------------------------------------------------

export interface VoiceLeadOptions {
  /** How far either side of the previous position to consider. */
  readonly search?: number
  /**
   * Extra cost per semitone the bass note moves. Values above 0 keep root
   * movement audible instead of letting the bass drift to whatever is nearest.
   */
  readonly bassWeight?: number
}

/**
 * Choose a dial position for a new chord that moves least from the previous
 * voicing — the automatic voice leading the hardware applies between chord
 * changes, which is a large part of why "anything you play sounds good".
 *
 * Returns the position, not the notes, so the caller can keep the dial's own
 * state consistent with what is sounding.
 */
export function nearestVoicing(
  previous: readonly MidiNote[],
  intervals: readonly number[],
  rootMidi: MidiNote,
  opts: VoiceLeadOptions = {},
): number {
  if (previous.length === 0) return 0

  const search = opts.search ?? intervals.length * 2
  const bassWeight = opts.bassWeight ?? 0

  let bestPosition = 0
  let bestCost = Infinity

  for (let position = -search; position <= search; position++) {
    const candidate = voiceChord(intervals, rootMidi, position)
    const cost = voicingDistance(previous, candidate) + bassWeight * bassMovement(previous, candidate)
    // Strict `<` keeps the lowest position among equals, which biases toward
    // staying put rather than drifting upward over a long progression.
    if (cost < bestCost) {
      bestCost = cost
      bestPosition = position
    }
  }

  return bestPosition
}

/**
 * Total movement between two voicings: for each note of the new chord, the
 * distance to the closest note of the old one.
 */
export function voicingDistance(a: readonly MidiNote[], b: readonly MidiNote[]): number {
  let total = 0
  for (const note of b) {
    let nearest = Infinity
    for (const prev of a) {
      const d = Math.abs(note - prev)
      if (d < nearest) nearest = d
    }
    total += nearest
  }
  return total
}

/** How far the lowest note moved between two voicings. */
function bassMovement(a: readonly MidiNote[], b: readonly MidiNote[]): number {
  return Math.abs(Math.min(...b) - Math.min(...a))
}

// ---------------------------------------------------------------------------
// Keyboard range
// ---------------------------------------------------------------------------

/** Lowest and highest MIDI notes the instrument will emit. */
export const MIDI_MIN = 12
export const MIDI_MAX = 108

/** True when every note of a voicing sits inside the playable range. */
export function inRange(notes: readonly MidiNote[]): boolean {
  return notes.every((n) => n >= MIDI_MIN && n <= MIDI_MAX)
}

/**
 * Clamp a dial position so the resulting voicing stays inside the playable
 * range, walking inward until it fits.
 */
export function clampPosition(
  intervals: readonly number[],
  rootMidi: MidiNote,
  position: number,
): number {
  let p = position
  const limit = 128 // generous; the loop below always terminates well before this
  for (let i = 0; i < limit; i++) {
    const notes = voiceChord(intervals, rootMidi, p)
    if (inRange(notes)) return p
    p += Math.max(...notes) > MIDI_MAX ? -1 : 1
  }
  return 0
}
