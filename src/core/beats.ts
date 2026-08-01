/**
 * The beat machine.
 *
 * Pattern data only — which voice fires on which step. Nothing here knows what
 * a drum sounds like or when the transport is.
 *
 * The styles follow the hardware's spread: songwriter grooves rather than club
 * tools, broad enough to sketch against. See research/08-looper-and-beats.md.
 */

export type DrumVoice = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'rim' | 'tom'

export const DRUM_VOICES: readonly DrumVoice[] = [
  'kick',
  'snare',
  'clap',
  'hat',
  'openhat',
  'rim',
  'tom',
]

export interface Beat {
  readonly id: number
  readonly name: string
  /** Steps per bar. Everything here is 16 (sixteenth notes in 4/4). */
  readonly steps: number
  /**
   * How far to push even-numbered steps toward the next one, 0–1 of a step.
   * Straight patterns leave this at 0; shuffles sit around 0.3.
   */
  readonly swing: number
  /** Step indices each voice fires on. */
  readonly hits: Partial<Record<DrumVoice, readonly number[]>>
}

/**
 * Named in the same spirit as the sounds — evocative rather than technical.
 * A beat called `Late Ferry` tells you how it feels; `Rock 3` doesn't.
 */
export const BEATS: readonly Beat[] = [
  {
    id: 1,
    name: 'Saint Germain',
    steps: 16,
    swing: 0.18,
    hits: {
      kick: [0, 10],
      snare: [4, 12],
      hat: [2, 6, 8, 14],
      openhat: [7],
    },
  },
  {
    id: 2,
    name: 'Orchid Bossa',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 6, 8, 14],
      rim: [3, 7, 10, 13],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    id: 3,
    name: 'Trap',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 7, 10],
      clap: [8],
      hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15],
    },
  },
  {
    id: 4,
    name: 'Millionaire',
    steps: 16,
    swing: 0.3,
    hits: {
      kick: [0, 9],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
      rim: [15],
    },
  },
  {
    id: 5,
    name: 'Late Ferry',
    steps: 16,
    swing: 0.24,
    hits: {
      kick: [0, 11],
      rim: [4, 12],
      hat: [0, 3, 6, 8, 11, 14],
    },
  },
  {
    id: 6,
    name: 'Disco Biscuit',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 4, 8, 12],
      clap: [4, 12],
      hat: [2, 6, 10, 14],
      openhat: [2, 6, 10, 14],
    },
  },
  {
    id: 7,
    name: 'Paper Boat',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 8],
      snare: [8],
      hat: [0, 4, 8, 12],
    },
  },
  {
    id: 8,
    name: 'Cumbia Lite',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 3, 8, 11],
      rim: [2, 6, 10, 14],
      tom: [7, 15],
      hat: [4, 12],
    },
  },
  {
    id: 9,
    name: 'Motorway',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 4, 8, 12],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      clap: [12],
    },
  },
  {
    id: 10,
    name: 'Slow Sunday',
    steps: 16,
    swing: 0.33,
    hits: {
      kick: [0],
      snare: [8],
      hat: [3, 6, 11, 14],
    },
  },
  {
    id: 11,
    name: 'Half Nelson',
    steps: 16,
    swing: 0.2,
    hits: {
      kick: [0, 6],
      snare: [12],
      rim: [4],
      hat: [2, 8, 10, 14],
    },
  },
  {
    id: 12,
    name: 'Thicket',
    steps: 16,
    swing: 0,
    hits: {
      kick: [0, 5, 10],
      clap: [4, 12],
      hat: [1, 3, 5, 7, 9, 11, 13, 15],
      tom: [14],
    },
  },
]

/**
 * Turn a hit on or off.
 *
 * Returns a new beat — patterns are edited by replacement so the factory ones
 * stay pristine and a user's changes are always their own copy.
 */
export function toggleHit(beat: Beat, voice: DrumVoice, step: number): Beat {
  const index = ((step % beat.steps) + beat.steps) % beat.steps
  const existing = beat.hits[voice] ?? []
  const next = existing.includes(index)
    ? existing.filter((s) => s !== index)
    : [...existing, index].sort((a, b) => a - b)

  return { ...beat, hits: { ...beat.hits, [voice]: next }, name: markEdited(beat.name) }
}

/** Clear every hit, keeping the grid and swing. */
export function clearHits(beat: Beat): Beat {
  return { ...beat, hits: {}, name: markEdited(beat.name) }
}

export function setSwing(beat: Beat, swing: number): Beat {
  return { ...beat, swing: Math.max(0, Math.min(0.6, swing)) }
}

/** True once a pattern has diverged from the factory one it started as. */
export function isEdited(beat: Beat): boolean {
  return beat.name.endsWith('*')
}

/**
 * Flag an edited pattern so it is obvious you are no longer hearing the preset
 * — otherwise "Trap" quietly stops being Trap and there is no way to tell.
 */
function markEdited(name: string): string {
  return name.endsWith('*') ? name : `${name}*`
}

/** Voices firing on a given step, wrapping past the end of the bar. */
export function voicesAt(beat: Beat, step: number): DrumVoice[] {
  const index = ((step % beat.steps) + beat.steps) % beat.steps
  return DRUM_VOICES.filter((voice) => beat.hits[voice]?.includes(index))
}

/**
 * How far this step is pushed late, in fractions of a step.
 *
 * Swing delays the off-beats only — the odd-numbered sixteenths — which is what
 * gives a shuffle its lilt without dragging the pulse.
 */
export function swingOffset(beat: Beat, step: number): number {
  const index = ((step % beat.steps) + beat.steps) % beat.steps
  return index % 2 === 1 ? beat.swing : 0
}

/** Seconds per sixteenth at a given tempo, in 4/4. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4
}
