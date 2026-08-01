/**
 * The chord progression.
 *
 * This is the piece the hardware has no answer to. The Orchid captures a moment
 * — you play, it sounds, it's gone unless the looper caught it. A progression is
 * the *idea* rather than the performance: four chords you can look at, reorder,
 * re-voice and export, long after you've forgotten what your hands were doing.
 *
 * Steps store what you pressed, not what was played: root, the held chord-type
 * buttons, the extensions. Everything downstream — key, voicing, octave, sounds,
 * performance mode — is applied at playback, so changing the key transposes the
 * whole progression and changing the arpeggiator re-performs it.
 *
 * Pure and dependency-free.
 */

import type { ChordType, Extension, PitchClass } from './types.js'

export interface ProgressionStep {
  readonly root: PitchClass
  /** Chord-type buttons held; two or more is a Secret Chord. */
  readonly types: readonly ChordType[]
  readonly extensions: readonly Extension[]
  /** How long this chord lasts. Whole bars only — this is a sketchpad. */
  readonly bars: number
}

export interface Progression {
  readonly steps: readonly ProgressionStep[]
}

export const MAX_STEPS = 32
export const MAX_BARS_PER_STEP = 8

export function emptyProgression(): Progression {
  return { steps: [] }
}

export function isEmpty(p: Progression): boolean {
  return p.steps.length === 0
}

export function totalBars(p: Progression): number {
  return p.steps.reduce((n, s) => n + s.bars, 0)
}

export function addStep(p: Progression, step: ProgressionStep): Progression {
  if (p.steps.length >= MAX_STEPS) return p
  return { steps: [...p.steps, clampStep(step)] }
}

export function replaceStep(p: Progression, index: number, step: ProgressionStep): Progression {
  if (index < 0 || index >= p.steps.length) return p
  return { steps: p.steps.map((s, i) => (i === index ? clampStep(step) : s)) }
}

export function removeStep(p: Progression, index: number): Progression {
  if (index < 0 || index >= p.steps.length) return p
  return { steps: p.steps.filter((_, i) => i !== index) }
}

export function setStepBars(p: Progression, index: number, bars: number): Progression {
  const step = p.steps[index]
  if (!step) return p
  return replaceStep(p, index, { ...step, bars })
}

/** Move a step to a new position, for drag-to-reorder. */
export function moveStep(p: Progression, from: number, to: number): Progression {
  if (from === to || from < 0 || from >= p.steps.length) return p
  const target = Math.max(0, Math.min(p.steps.length - 1, to))
  const steps = [...p.steps]
  const [moved] = steps.splice(from, 1)
  steps.splice(target, 0, moved!)
  return { steps }
}

function clampStep(step: ProgressionStep): ProgressionStep {
  return { ...step, bars: Math.max(1, Math.min(MAX_BARS_PER_STEP, Math.round(step.bars))) }
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** The bar each step begins on, measured from the start of the progression. */
export function stepStarts(p: Progression): number[] {
  const starts: number[] = []
  let bar = 0
  for (const step of p.steps) {
    starts.push(bar)
    bar += step.bars
  }
  return starts
}

/**
 * Which step is sounding on a given bar, wrapping round forever.
 *
 * Returns `-1` for an empty progression rather than throwing — playback polls
 * this every bar and an empty progression is a perfectly ordinary state.
 */
export function stepAtBar(p: Progression, bar: number): number {
  const total = totalBars(p)
  if (total <= 0) return -1

  let position = ((bar % total) + total) % total
  for (let i = 0; i < p.steps.length; i++) {
    const bars = p.steps[i]!.bars
    if (position < bars) return i
    position -= bars
  }
  return p.steps.length - 1
}

/** True when `bar` is the first bar of its step — where a chord re-triggers. */
export function isStepBoundary(p: Progression, bar: number): boolean {
  const total = totalBars(p)
  if (total <= 0) return false
  const position = ((bar % total) + total) % total
  return stepStarts(p).includes(position)
}
