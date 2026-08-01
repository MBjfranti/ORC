/**
 * The sink boundary.
 *
 * Everything above this line (`src/core`) is pure and dependency-free.
 * Everything below it is Tone.js. Keeping the seam explicit means individual
 * engines can be rewritten in raw Web Audio later without touching the
 * chord, voicing or performance logic.
 *
 * See research/12-tech-stack.md.
 */

import type { MidiNote } from '../core/types.js'
import type { PerformMode } from '../core/performance.js'
import type { BassPreset } from './bassPresets.js'

export type EngineId = 'subtractive' | 'fm' | 'ep'

/**
 * The six effects, matching the hardware's rack.
 *
 * One is selected at a time and its amount is what the FX dial moves — the
 * others hold whatever you last left them at, so you can build a chain up
 * rather than being limited to a single active effect.
 */
export type FxType =
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'phaser'
  | 'flanger'
  | 'drive'
  | 'tremolo'
  | 'ensemble'
  | 'drumReverb'
  | 'drumSaturation'

/**
 * The effects rack, in the order the manual lists it (§8.1).
 *
 * Tremolo and Ensemble were missing entirely — the earlier list came from a
 * press review that named only six.
 */
export const FX_TYPES: readonly FxType[] = [
  'reverb',
  'delay',
  'chorus',
  'phaser',
  'flanger',
  'drive',
  'tremolo',
  'ensemble',
  // The two Drum FX sit at the end of the same list, which is where the
  // manual puts them: "scroll to access Drum FX".
  'drumReverb',
  'drumSaturation',
]

export const FX_LABEL: Record<FxType, string> = {
  reverb: 'Reverb',
  delay: 'Delay',
  chorus: 'Chorus',
  phaser: 'Phaser',
  flanger: 'Flanger',
  drive: 'Drive',
  tremolo: 'Tremolo',
  ensemble: 'Ensemble',
  drumReverb: 'Drum Reverb',
  drumSaturation: 'Drum Sat',
}

export type FxAmounts = Record<FxType, number>

export interface Preset {
  readonly id: number
  readonly name: string
  readonly engine: EngineId
  /** Base filter cutoff in Hz. */
  readonly cutoff: number
  /** 0-1 wet amounts for the shared FX rack. */
  readonly reverb: number
  readonly chorus: number
  readonly delay: number
  /**
   * The performance setting this sound arrives with.
   *
   * Sounds on the hardware carry an articulation as well as a timbre, which
   * is the entire reason Perform Lock exists — without something to override,
   * "locks the performance setting while you browse sounds" would protect
   * nothing. Omitted means Off.
   */
  readonly perform?: PerformMode
  readonly performAmount?: number
}

/** A preset's FX values as a full set, with the unlisted effects at zero. */
export function presetFx(preset: Preset): FxAmounts {
  return {
    ...(Object.fromEntries(FX_TYPES.map((t) => [t, 0])) as FxAmounts),
    reverb: preset.reverb,
    chorus: preset.chorus,
    delay: preset.delay,
  }
}

/**
 * The effect the FX dial reaches for by default.
 *
 * "By default, the FX Dial will automatically increase and decrease the most
 * prominent effect of the currently selected sound" (§8.2) — so which effect
 * the dial is holding is a property of the sound, not a global cursor you
 * leave lying wherever you last used it.
 */
export function prominentFx(fx: FxAmounts): FxType {
  let best: FxType = FX_TYPES[0]!
  for (const t of FX_TYPES) if ((fx[t] ?? 0) > (fx[best] ?? 0)) best = t
  return best
}

export interface SynthEngine {
  /** Start the audio context. Must be called from a real user gesture. */
  start(): Promise<void>
  readonly running: boolean

  noteOn(note: MidiNote, velocity: number, at?: number): void
  noteOff(note: MidiNote, at?: number): void

  /** The independent monophonic bass voice. */
  bassOn(note: MidiNote, velocity?: number, at?: number): void
  bassOff(at?: number): void
  setBassPreset(preset: BassPreset): void
  setBassVolume(db: number): void

  /** Panic. Called on Esc, window blur, and mode changes. */
  allNotesOff(): void

  setPreset(preset: Preset): void
  /** Wet amount, 0–1, for one effect. Others are left alone. */
  setFx(type: FxType, amount: number): void
  /** Filter cutoff as 0–1, mapped exponentially across the audible range. */
  setCutoff(normalised: number): void
  setMasterVolume(db: number): void
  /** Master tempo — drives arpeggios, patterns, and later the looper. */
  setBpm(bpm: number): void

  /** Observable latency in milliseconds, for diagnostics. */
  latencyReport?(): Record<string, number>

  dispose(): void
}
