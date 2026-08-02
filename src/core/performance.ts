/**
 * Performance modes — how a chord is articulated once it has been voiced.
 *
 * Pure: this emits *when* to play each note, and something else plays it. The
 * split matters because it keeps the timing logic testable without an audio
 * context, and because the raw chord and the performed chord are genuinely
 * different things — the instrument sends them on separate MIDI channels.
 */

import type { MidiNote } from './types.js'

export type PerformMode = 'off' | 'strum' | 'strum2' | 'slop' | 'arp' | 'arp2' | 'pattern' | 'harp'

export const PERFORM_MODES: readonly PerformMode[] = [
  'off',
  'strum',
  'strum2',
  'slop',
  'arp',
  'arp2',
  'pattern',
  'harp',
]

export const PERFORM_LABEL: Record<PerformMode, string> = {
  /*
   * `Block`, not `Off`.
   *
   * They are the same mode and the manual uses both words for it — "turn fully
   * left → off" for the dial position, "the static block chord produced by the
   * chord engine" for what you hear (research/06). The list wants the second
   * one: every other row here names a sound, and this section is never really
   * off — it always emits the chord, it just does not articulate it. Calling
   * the row `Off` invited the reading that the whole section had been bypassed.
   *
   * The id stays `off`, because that is what the dial's leftmost stop is.
   */
  off: 'Block',
  strum: 'Strum',
  strum2: 'Strum 2 Octaves',
  slop: 'Slop',
  arp: 'Arpeggiate',
  arp2: 'Arp 2 Octaves',
  pattern: 'Pattern',
  harp: 'Harp',
}

/** A note struck at an offset from the trigger, sustaining until released. */
export interface Struck {
  readonly note: MidiNote
  /** Seconds after the key went down. */
  readonly time: number
  readonly velocity: number
}

/** Strum-family: every note fires once, then holds. */
export interface OneShot {
  readonly kind: 'oneshot'
  readonly events: readonly Struck[]
}

/** Arp-family: a step sequence that repeats until the key is released. */
export interface Cycle {
  readonly kind: 'cycle'
  /** One entry per step; `null` is a rest. */
  readonly steps: readonly (MidiNote | null)[]
  readonly stepSeconds: number
  /** Note length as a fraction of a step. */
  readonly gate: number
  /**
   * Whether steps accumulate into the chord, or ring and let go.
   *
   * The arpeggiator builds: each step stays, so the harmony — extensions and
   * all — assembles under the rhythm, which is what stops a performance mode
   * from replacing the chord instead of colouring it.
   *
   * Pattern and Harp do not. A repeating figure whose notes all pile up stops
   * being a figure after one pass, and a four-octave harp sweep that sustains
   * is sixteen notes of mud. Those two want each note to sound and clear.
   */
  readonly sustain: boolean
}

export type Performance = OneShot | Cycle

export interface PerformOptions {
  /** 0–1. Means something different in every mode; see `amountLabel`. */
  readonly amount?: number
  readonly bpm?: number
  /** Injectable so Slop can be tested. */
  readonly random?: () => number
}

/**
 * True for modes that keep playing while the key is held.
 *
 * Harp belongs here now that it flows rather than sweeping once. Leaving it out
 * was a real fault, not a label: the instrument uses this to decide between
 * retuning a running loop and diffing a sustained chord, so a Harp edit was
 * being sent down the wrong path and quietly doing nothing.
 */
export function isCycle(mode: PerformMode): boolean {
  return mode === 'arp' || mode === 'arp2' || mode === 'pattern' || mode === 'harp'
}

export function performChord(
  notes: readonly MidiNote[],
  mode: PerformMode,
  opts: PerformOptions = {},
): Performance {
  const amount = clamp01(opts.amount ?? 0.5)
  const bpm = opts.bpm ?? 96
  const random = opts.random ?? Math.random

  if (notes.length === 0 || mode === 'off') {
    return { kind: 'oneshot', events: notes.map((note) => ({ note, time: 0, velocity: 0.8 })) }
  }

  switch (mode) {
    case 'strum':
      return strum(notes, spread(amount))
    case 'strum2':
      return strum(stack(notes, 2), spread(amount))
    case 'slop':
      return slop(notes, spread(amount), random)
    case 'harp':
      return harp(notes, amount)
    case 'arp':
      return arp(notes, bpm, amount)
    case 'arp2':
      return arp(stack(notes, 2), bpm, amount)
    case 'pattern':
      return pattern(notes, bpm, amount)
  }
}

// --- strum family ----------------------------------------------------------

/** Gap between notes, 5ms (tight) to 60ms (loose). */
const spread = (amount: number) => lerp(0.005, 0.06, amount)

function strum(notes: readonly MidiNote[], gap: number): OneShot {
  return {
    kind: 'oneshot',
    events: notes.map((note, i) => ({
      note,
      time: i * gap,
      // A real strum loses energy toward the top of the sweep.
      velocity: 0.85 - (i / Math.max(1, notes.length - 1)) * 0.15,
    })),
  }
}

/**
 * A strum played by a human rather than a machine.
 *
 * Three things separate it from Strum, and it needs all three — any one alone
 * is too subtle to hear as a different mode:
 *
 *  1. **Timing**, biased late. Players drag far more often than they rush, and
 *     symmetric noise reads as a broken clock rather than as feel. The exponent
 *     skews the distribution toward zero so most notes land close and a few are
 *     noticeably behind. The spread is wider than Strum's own gap, so the notes
 *     genuinely reorder rather than merely wobbling in place.
 *  2. **Velocity**, unevenly. A loose hand does not hit every note equally.
 *  3. **Pitch**, very slightly. A few cents either way per note — the thing
 *     that makes a real instrument sound like several strings rather than one
 *     oscillator bank. This is what most "humanize" implementations leave out,
 *     and it is the most audible of the three.
 *
 * The detune rides on the note number itself: a MIDI note is only an index into
 * a frequency, and nothing downstream requires it to be a whole one.
 */
function slop(notes: readonly MidiNote[], gap: number, random: () => number): OneShot {
  // Wider than the strum gap, so notes can genuinely swap order.
  const jitter = Math.max(gap, 0.02) * 1.6
  /** A little over an eighth of a semitone, either way. */
  const cents = 14

  return {
    kind: 'oneshot',
    events: notes.map((note, i) => ({
      note: note + ((random() - 0.5) * 2 * cents) / 100,
      time: Math.max(0, i * gap + random() ** 1.6 * jitter - jitter * 0.15),
      velocity: 0.62 + random() * 0.33,
    })),
  }
}

// --- arpeggiator -----------------------------------------------------------

/** Quarter, eighth, eighth-triplet, sixteenth, sixteenth-triplet. */
const DIVISIONS = [1, 0.5, 1 / 3, 0.25, 1 / 6] as const
const DIVISION_LABEL = ['1/4', '1/8', '1/8t', '1/16', '1/16t'] as const

/**
 * The sequence length is the chord's note count.
 *
 * Triads cycle in 3, sevenths in 4, ninths in 5 — so adding an extension makes
 * the arpeggio *longer*, and the rhythm becomes a consequence of the harmony
 * rather than something set independently of it. This is the single most
 * characteristic behaviour in the whole performance section.
 */
function arp(notes: readonly MidiNote[], bpm: number, amount: number): Cycle {
  return {
    kind: 'cycle',
    steps: [...notes],
    stepSeconds: (60 / bpm) * pick(DIVISIONS, amount),
    gate: 0.8,
    // Builds the chord up as it goes.
    sustain: true,
  }
}

/**
 * A harp glissando: up the chord across four octaves and back down, forever.
 *
 * A single ascending sweep is just a wide strum, and one that sustains is a
 * sixteen-note cluster. What makes it read as a harp is that it *keeps going*
 * and comes back down, with each note ringing briefly and clearing — the sound
 * is the motion, not the pile.
 *
 * The turn is exclusive at both ends so the top and bottom notes are not struck
 * twice in a row, which is what makes a bounce sound like a stumble.
 */
function harp(notes: readonly MidiNote[], amount: number): Cycle {
  const up = stack(notes, 4)
  const down = up.slice(1, -1).reverse()
  return {
    kind: 'cycle',
    steps: [...up, ...down],
    // Fixed, not tempo-synced — the research puts Harp in the fixed-delay
    // family with the strums. The dial sets how fast it sweeps.
    stepSeconds: lerp(0.055, 0.018, amount),
    gate: 0.9,
    sustain: false,
  }
}

/**
 * Fixed rhythms that keep their shape whatever the chord contains.
 *
 * The opposite of the arpeggiator: entries index into the chord and wrap, so
 * the pattern stays recognisable across a triad and a ninth. `null` is a rest.
 */
const PATTERNS: readonly (readonly (number | null)[])[] = [
  [0, null, 1, null, 2, null, 1, null],
  [0, 1, 2, 3, 2, 1, 0, null],
  [0, null, null, 1, null, 2, null, null],
  [0, 2, 1, 3, 0, 2, 1, 3],
  [0, null, 2, 1, null, 2, null, 1],
  [0, 0, 1, 2, 0, 0, 2, 1],
  [2, null, 1, null, 0, null, 1, null],
  [0, 1, null, 2, 3, null, 2, 1],
  // Eleven, which is the count the reviews give. The last three fill the gaps
  // the first eight left: a straight run, a syncopated push, and a rest-heavy
  // one for when the chord should breathe.
  [0, 1, 2, 3, 0, 1, 2, 3],
  [null, 0, null, 1, null, 2, null, 3],
  [0, null, null, null, 2, null, null, 1],
]

export const PATTERN_COUNT = PATTERNS.length

function pattern(notes: readonly MidiNote[], bpm: number, amount: number): Cycle {
  const chosen = PATTERNS[Math.min(PATTERNS.length - 1, Math.floor(amount * PATTERNS.length))]!
  return {
    kind: 'cycle',
    steps: chosen.map((i) => (i === null ? null : notes[i % notes.length]!)),
    stepSeconds: (60 / bpm) * 0.25,
    gate: 0.7,
    // A rhythmic figure has to stay legible, so the notes clear rather than
    // accumulate — otherwise the pattern is inaudible after one pass.
    sustain: false,
  }
}

/**
 * What the amount dial reads, in the units it actually has.
 *
 * Showing a percentage would be dishonest: the parameter is not continuous and
 * does not mean the same thing twice. For the arpeggiators it selects one of
 * five note divisions, for Pattern one of eight rhythms, and only for the strum
 * family is it a continuous spread. "63%" tells you none of that.
 */
export function amountLabel(mode: PerformMode, amount: number): string {
  const a = clamp01(amount)
  switch (mode) {
    case 'off':
      return ''
    case 'arp':
    case 'arp2':
      return pick(DIVISION_LABEL, a)
    case 'pattern':
      return `no. ${Math.min(PATTERN_COUNT, Math.floor(a * PATTERN_COUNT) + 1)}`
    case 'harp':
      return `${Math.round((lerp(0.012, 0.045, a) / 2) * 1000)} ms`
    default:
      return `${Math.round(spread(a) * 1000)} ms`
  }
}

// --- helpers ---------------------------------------------------------------

/** The chord plus copies an octave up, ascending. */
function stack(notes: readonly MidiNote[], octaves: number): MidiNote[] {
  const out: MidiNote[] = []
  for (let o = 0; o < octaves; o++) for (const n of notes) out.push(n + 12 * o)
  return out.sort((a, b) => a - b)
}

function pick<T>(items: readonly T[], amount: number): T {
  return items[Math.min(items.length - 1, Math.floor(clamp01(amount) * items.length))]!
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t)
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
