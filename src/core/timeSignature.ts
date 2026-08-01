/**
 * Time signatures.
 *
 * Reached by holding the BPM encoder: "Hold the BPM Dial for one second then
 * scroll to select a time signature" (§11.2), and Beats sit further down the
 * same list — "scroll past the time signatures to access Beats" (§11.4). One
 * menu, meters first.
 *
 * The meter sets how long a bar is, which is what the looper's bar-locked
 * lengths and the metronome's accent both hang off. `barsToSeconds` used to
 * carry a comment saying 4/4 was "the only meter the instrument offers"; the
 * Operation Manual says otherwise.
 */

export interface TimeSignature {
  readonly beats: number
  /** The note that gets the beat. Only 4 and 8 are worth offering. */
  readonly unit: 4 | 8
}

export const TIME_SIGNATURES: readonly TimeSignature[] = [
  { beats: 4, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 2, unit: 4 },
  { beats: 5, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 7, unit: 8 },
]

export const DEFAULT_TIME_SIGNATURE = TIME_SIGNATURES[0]!

export function timeSignatureLabel(ts: TimeSignature): string {
  return `${ts.beats}/${ts.unit}`
}

/**
 * Quarter notes in one bar.
 *
 * The tempo is always in quarter notes per minute regardless of the meter —
 * 6/8 at 120 has three quarters to the bar, not six — so everything timed
 * converts through here rather than multiplying by the numerator.
 */
export function quartersPerBar(ts: TimeSignature): number {
  return (ts.beats * 4) / ts.unit
}

/** Sixteenth-note steps in one bar, which is the grid everything runs on. */
export function stepsPerBar(ts: TimeSignature): number {
  return quartersPerBar(ts) * 4
}

/** Seconds in one bar at a tempo. */
export function barSeconds(ts: TimeSignature, bpm: number): number {
  return (60 / bpm) * quartersPerBar(ts)
}

export function sameTimeSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.beats === b.beats && a.unit === b.unit
}

export function timeSignatureAt(index: number): TimeSignature {
  const n = TIME_SIGNATURES.length
  return TIME_SIGNATURES[((index % n) + n) % n]!
}
