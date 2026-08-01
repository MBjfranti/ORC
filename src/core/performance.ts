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
}

export type Performance = OneShot | Cycle

export interface PerformOptions {
  /** 0–1. Means something different in every mode; see `amountLabel`. */
  readonly amount?: number
  readonly bpm?: number
  /** Injectable so Slop can be tested. */
  readonly random?: () => number
}

/** True for modes that keep playing while the key is held. */
export function isCycle(mode: PerformMode): boolean {
  return mode === 'arp' || mode === 'arp2' || mode === 'pattern'
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
      // Three octaves, swept fast — the flourish.
      return strum(stack(notes, 3), lerp(0.012, 0.045, amount) / 2)
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
 * A strum with human timing error, **biased late**.
 *
 * Players drag far more often than they rush, and symmetric noise reads as a
 * broken clock rather than as feel. The exponent skews the distribution toward
 * zero so most notes are close and a few are noticeably behind.
 */
function slop(notes: readonly MidiNote[], gap: number, random: () => number): OneShot {
  const jitter = gap * 0.9
  return {
    kind: 'oneshot',
    events: notes.map((note, i) => ({
      note,
      time: Math.max(0, i * gap + random() ** 1.6 * jitter - jitter * 0.15),
      velocity: 0.7 + random() * 0.25,
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
]

export const PATTERN_COUNT = PATTERNS.length

function pattern(notes: readonly MidiNote[], bpm: number, amount: number): Cycle {
  const chosen = PATTERNS[Math.min(PATTERNS.length - 1, Math.floor(amount * PATTERNS.length))]!
  return {
    kind: 'cycle',
    steps: chosen.map((i) => (i === null ? null : notes[i % notes.length]!)),
    stepSeconds: (60 / bpm) * 0.25,
    gate: 0.7,
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
