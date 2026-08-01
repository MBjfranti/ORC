/**
 * The looper.
 *
 * A *note* looper, not an audio one — it records what you played and replays it
 * through whatever sound is currently selected, so browsing presets after the
 * fact changes the playback. That is how the hardware behaves, and it is the
 * more useful behaviour: the loop is a performance you can re-voice, not a
 * bounce you're stuck with.
 *
 * Pure and dependency-free. Emits and stores timing data; something else plays it.
 *
 * See research/08-looper-and-beats.md.
 */

import type { MidiNote } from './types.js'
import { barSeconds, DEFAULT_TIME_SIGNATURE } from './timeSignature.js'
import type { TimeSignature } from './timeSignature.js'

/** Which output a recorded note belongs to, so playback can route it back. */
export type LoopStream = 'performance' | 'bass'

export interface LoopEvent {
  /** Seconds from the start of the loop. */
  readonly time: number
  readonly note: MidiNote
  readonly velocity: number
  /** Seconds. Notes still held when recording ends are clamped to the loop. */
  readonly duration: number
  readonly stream: LoopStream
}

/** One overdub pass. Kept separate so undo can peel them off one at a time. */
export interface LoopLayer {
  readonly events: readonly LoopEvent[]
}

export interface Loop {
  readonly lengthSeconds: number
  /** Bar count, or `null` for a free-length loop. */
  readonly bars: number | null
  readonly layers: readonly LoopLayer[]
}

/** Bar counts the Loop dial offers, plus free-running. */
export const LOOP_BARS: readonly (number | null)[] = [1, 2, 4, 8, 16, null]

export function barsLabel(bars: number | null): string {
  return bars === null ? 'Free' : `${bars} bar${bars === 1 ? '' : 's'}`
}

/**
 * How long a bar-locked loop runs.
 *
 * Takes the meter, which this used to assume was always 4/4 — the manual
 * documents a time-signature menu on the BPM encoder (§11.2), so a 3/4 loop
 * has to be three quarters long, not four.
 */
export function barsToSeconds(
  bars: number,
  bpm: number,
  ts: TimeSignature = DEFAULT_TIME_SIGNATURE,
): number {
  return barSeconds(ts, bpm) * bars
}

export function emptyLoop(lengthSeconds: number, bars: number | null): Loop {
  return { lengthSeconds, bars, layers: [] }
}

export function isEmpty(loop: Loop | undefined): boolean {
  return !loop || loop.layers.every((l) => l.events.length === 0)
}

export function layerCount(loop: Loop | undefined): number {
  return loop?.layers.length ?? 0
}

/** Add an overdub pass. Empty passes are dropped so undo never has to no-op. */
export function withLayer(loop: Loop, events: readonly LoopEvent[]): Loop {
  if (events.length === 0) return loop
  return { ...loop, layers: [...loop.layers, { events: [...events] }] }
}

/**
 * Remove the most recent pass.
 *
 * Undoing past the last layer leaves an empty loop rather than `undefined` —
 * the hardware's Undo turns into Clear at exactly that point, and keeping the
 * length lets you record into it again without re-choosing bars.
 */
export function undoLayer(loop: Loop): Loop {
  return { ...loop, layers: loop.layers.slice(0, -1) }
}

export function clearLayers(loop: Loop): Loop {
  return { ...loop, layers: [] }
}

/** Every event across every layer, in time order. */
export function allEvents(loop: Loop): LoopEvent[] {
  return loop.layers.flatMap((l) => l.events).sort((a, b) => a.time - b.time)
}

// ---------------------------------------------------------------------------
// Quantization
// ---------------------------------------------------------------------------

/** Note values the Quantize setting offers, as fractions of a beat. */
export const QUANTIZE_GRIDS = {
  off: 0,
  '1/4': 1,
  '1/8': 0.5,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16T': 1 / 6,
  '1/32': 0.125,
} as const

export type QuantizeGrid = keyof typeof QUANTIZE_GRIDS

export const QUANTIZE_ORDER: readonly QuantizeGrid[] = [
  'off',
  '1/4',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
]

/**
 * Snap event start times to a grid, wrapping the last gridline round to zero.
 *
 * A note played a hair before the downbeat should land *on* it, not at the very
 * end of the loop — so anything that rounds up to the loop length wraps to 0.
 * Durations are left alone: quantizing note lengths turns a legato pad into a
 * stutter, and the ear notices starts far more than ends.
 */
export function quantizeEvents(
  events: readonly LoopEvent[],
  grid: QuantizeGrid,
  bpm: number,
  lengthSeconds: number,
): LoopEvent[] {
  const beats = QUANTIZE_GRIDS[grid]
  if (!beats) return [...events]

  const step = (60 / bpm) * beats
  return events.map((e) => {
    const snapped = Math.round(e.time / step) * step
    return { ...e, time: snapped >= lengthSeconds ? 0 : snapped }
  })
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Accumulates a single pass.
 *
 * Notes are opened on attack and closed on release; anything still held when
 * the pass ends is clamped to the loop boundary rather than dropped, so a pad
 * you were still leaning on survives.
 */
export class LoopRecorder {
  private events: LoopEvent[] = []
  private open = new Map<string, { time: number; note: MidiNote; velocity: number; stream: LoopStream }>()

  noteOn(time: number, note: MidiNote, velocity: number, stream: LoopStream): void {
    this.open.set(`${stream}:${note}`, { time, note, velocity, stream })
  }

  noteOff(time: number, note: MidiNote, stream: LoopStream): void {
    const key = `${stream}:${note}`
    const started = this.open.get(key)
    if (!started) return
    this.open.delete(key)
    this.events.push({
      time: started.time,
      note,
      velocity: started.velocity,
      duration: Math.max(0.02, time - started.time),
      stream,
    })
  }

  /** Close the pass, clamping anything still sounding to `lengthSeconds`. */
  finish(lengthSeconds: number): LoopEvent[] {
    for (const started of this.open.values()) {
      this.events.push({
        time: started.time,
        note: started.note,
        velocity: started.velocity,
        duration: Math.max(0.02, lengthSeconds - started.time),
        stream: started.stream,
      })
    }
    this.open.clear()

    const out = this.events.filter((e) => e.time < lengthSeconds).sort((a, b) => a.time - b.time)
    this.events = []
    return out
  }

  get isEmpty(): boolean {
    return this.events.length === 0 && this.open.size === 0
  }
}
