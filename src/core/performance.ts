/**
 * Performance modes.
 *
 * Takes the block chord the voicing engine produced and articulates it —
 * strummed, slopped, arpeggiated, patterned or swept. This is a *transformation*
 * sitting between the chord engine and the synth, which is exactly how the
 * hardware treats it: the raw chord and the performed notes go out on separate
 * MIDI channels.
 *
 * Pure and dependency-free. Emits timing data; something else plays it.
 *
 * See research/06-performance-modes.md.
 */

import type { MidiNote } from './types.js'

export type PerformMode =
  | 'off'
  | 'strum'
  | 'strum2'
  | 'slop'
  | 'arp'
  | 'arp2'
  | 'pattern'
  | 'harp'

export const PERFORM_MODES: readonly PerformMode[] = [
  'off',
  'strum',
  'strum2',
  'slop',
  'arp',
  'arp2',
  'pattern',
  'harp',
] as const

export const PERFORM_LABEL: Record<PerformMode, string> = {
  off: 'Off',
  strum: 'Strum',
  strum2: 'Strum 2oct',
  slop: 'Slop',
  arp: 'Arp',
  arp2: 'Arp 2oct',
  pattern: 'Pattern',
  harp: 'Harp',
}

/** A note struck at an offset from the trigger, sustaining until released. */
export interface StruckNote {
  readonly note: MidiNote
  /** Seconds after the trigger. */
  readonly time: number
  readonly velocity: number
}

/** Strum-family modes: every note fires once, then sustains. */
export interface OneShot {
  readonly kind: 'oneshot'
  readonly events: readonly StruckNote[]
}

/** Arp-family modes: a repeating step sequence, running until released. */
export interface Cycle {
  readonly kind: 'cycle'
  /** One entry per step; `null` is a rest. */
  readonly steps: readonly (MidiNote | null)[]
  /** Seconds per step. */
  readonly stepSeconds: number
  /** Note length as a fraction of a step, 0-1. */
  readonly gate: number
}

export type Performance = OneShot | Cycle

export interface PerformOptions {
  /** 0-1, the Perform dial's secondary parameter. Meaning varies by mode. */
  readonly amount?: number
  readonly bpm?: number
  /** Injectable for deterministic tests. */
  readonly random?: () => number
  /**
   * Options → Instrument → Velocity Sense.
   *
   * A computer keyboard has no velocity to sense, but the performance modes
   * generate plenty of their own — a strum loses energy toward the top of the
   * sweep and Slop varies every note. "Off for all notes to play at the same
   * volume" applies to those just as it does to a hand, so switching it off
   * flattens them.
   */
  readonly velocitySense?: boolean
}

/**
 * Articulate a voiced chord.
 *
 * `notes` must be ascending — the order the voicing engine produced.
 */
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

  const performance = articulate(notes, mode, bpm, amount, random)
  return opts.velocitySense === false ? flatten(performance) : performance
}

/** Every note at the same level, for Velocity Sense off. */
function flatten(p: Performance): Performance {
  if (p.kind !== 'oneshot') return p
  return { kind: 'oneshot', events: p.events.map((e) => ({ ...e, velocity: 0.8 })) }
}

function articulate(
  notes: readonly MidiNote[],
  mode: Exclude<PerformMode, 'off'>,
  bpm: number,
  amount: number,
  random: () => number,
): Performance {
  switch (mode) {
    case 'strum':
      return strum(notes, strumSpread(amount))

    case 'strum2':
      return strum(stackOctave(notes), strumSpread(amount))

    case 'slop':
      return slop(notes, strumSpread(amount), random)

    case 'harp':
      // A fast sweep across three octaves — the dramatic flourish.
      return strum(stackOctaves(notes, 3), lerp(0.012, 0.045, amount) / 2)

    case 'arp':
      return arp(notes, bpm, amount)

    case 'arp2':
      return arp(stackOctave(notes), bpm, amount)

    case 'pattern':
      return pattern(notes, bpm, amount)
  }
}

// ---------------------------------------------------------------------------
// Strum family
// ---------------------------------------------------------------------------

/** Inter-note delay in seconds, 5ms (tight) to 60ms (loose). */
function strumSpread(amount: number): number {
  return lerp(0.005, 0.06, amount)
}

function strum(notes: readonly MidiNote[], spread: number): OneShot {
  return {
    kind: 'oneshot',
    events: notes.map((note, i) => ({
      note,
      time: i * spread,
      // A real strum loses a little energy toward the top of the sweep.
      velocity: 0.85 - (i / Math.max(1, notes.length - 1)) * 0.15,
    })),
  }
}

/**
 * Strum with human timing error.
 *
 * The jitter is deliberately *biased late* — players drag far more often than
 * they rush, and symmetric noise reads as machine error rather than feel.
 */
function slop(notes: readonly MidiNote[], spread: number, random: () => number): OneShot {
  const jitter = spread * 0.9
  return {
    kind: 'oneshot',
    events: notes.map((note, i) => ({
      note,
      time: Math.max(0, i * spread + (random() ** 1.6) * jitter - jitter * 0.15),
      velocity: 0.7 + random() * 0.25,
    })),
  }
}

// ---------------------------------------------------------------------------
// Arpeggiator
// ---------------------------------------------------------------------------

/**
 * Step durations the Perform dial selects between, as fractions of a beat.
 * Quarter, eighth, eighth-triplet, sixteenth, sixteenth-triplet.
 */
const ARP_DIVISIONS = [1, 0.5, 1 / 3, 0.25, 1 / 6] as const

/**
 * The distinctive rule: **the sequence length is the chord's note count.**
 *
 * Add a 9th and the arpeggio gets longer — the rhythm is a consequence of the
 * harmony rather than independent of it. Triads cycle in 3, sevenths in 4,
 * ninths in 5. This is the behaviour worth having above all others here.
 */
function arp(notes: readonly MidiNote[], bpm: number, amount: number): Cycle {
  return {
    kind: 'cycle',
    steps: [...notes],
    stepSeconds: (60 / bpm) * pick(ARP_DIVISIONS, amount),
    gate: 0.8,
  }
}

// ---------------------------------------------------------------------------
// Pattern
// ---------------------------------------------------------------------------

/**
 * Fixed rhythmic sequences. Unlike the arpeggiator, the rhythm stays constant
 * however many notes the chord has — entries index into the chord and wrap, and
 * `null` is a rest.
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
  [0, null, null, null, 2, null, 1, null],
  [0, 3, 1, 2, 0, 3, 1, 2],
  [0, 1, 2, 3, 0, 1, 2, 3],
]

export const PATTERN_COUNT = PATTERNS.length

function pattern(notes: readonly MidiNote[], bpm: number, amount: number): Cycle {
  const chosen = PATTERNS[Math.min(PATTERNS.length - 1, Math.floor(amount * PATTERNS.length))]!
  return {
    kind: 'cycle',
    steps: chosen.map((i) => (i === null ? null : notes[i % notes.length]!)),
    stepSeconds: (60 / bpm) * 0.25, // sixteenths
    gate: 0.7,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The chord, plus a copy an octave up, ascending. */
function stackOctave(notes: readonly MidiNote[]): MidiNote[] {
  return stackOctaves(notes, 2)
}

function stackOctaves(notes: readonly MidiNote[], octaves: number): MidiNote[] {
  const out: MidiNote[] = []
  for (let o = 0; o < octaves; o++) {
    for (const n of notes) out.push(n + 12 * o)
  }
  return out.sort((a, b) => a - b)
}

function pick<T>(items: readonly T[], amount: number): T {
  return items[Math.min(items.length - 1, Math.floor(clamp01(amount) * items.length))]!
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** True for modes that keep playing while the key is held. */
export function isContinuous(mode: PerformMode): boolean {
  return mode === 'arp' || mode === 'arp2' || mode === 'pattern'
}

const DIVISION_LABEL = ['1/4', '1/8', '1/8T', '1/16', '1/16T'] as const

/**
 * What the Perform amount actually is, in the units it actually has.
 *
 * Showing this as a percentage was dishonest: the parameter is not continuous
 * and does not mean the same thing twice. For the arpeggiators it picks one of
 * five note divisions; for Pattern it picks one of eleven rhythms; only for the
 * strum family is it a continuous spread. "63%" told you none of that.
 */
export function performAmountLabel(mode: PerformMode, amount: number): string {
  const a = Math.max(0, Math.min(1, amount))

  switch (mode) {
    case 'off':
      return ''

    case 'arp':
    case 'arp2':
      return DIVISION_LABEL[Math.min(DIVISION_LABEL.length - 1, Math.floor(a * DIVISION_LABEL.length))]!

    case 'pattern':
      return `no. ${Math.min(PATTERN_COUNT, Math.floor(a * PATTERN_COUNT) + 1)}`

    case 'strum':
    case 'strum2':
    case 'slop':
      return `${Math.round(strumSpread(a) * 1000)} ms`

    case 'harp':
      return `${Math.round((lerp(0.012, 0.045, a) / 2) * 1000)} ms`
  }
}
