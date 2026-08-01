/**
 * The looper, as data.
 *
 * A **note** looper, not an audio one: it records what you played, not what it
 * sounded like. That is what lets you change the voice, the articulation or the
 * key *after* recording and have the loop follow — which is the whole reason
 * the instrument's looper is interesting rather than a tape delay.
 *
 * Pure: this owns *what* was played. `engine/looper.ts` owns *when*.
 */

export type Stream = 'chord' | 'bass'

export interface LoopEvent {
  /** Seconds from the top of the loop. */
  readonly time: number
  readonly note: number
  readonly velocity: number
  readonly duration: number
  readonly stream: Stream
}

/** One recording pass. Layers stack; undo removes the last. */
export interface Layer {
  readonly events: readonly LoopEvent[]
}

export interface Loop {
  /** Bars, or `null` for a free-length loop. */
  readonly bars: number | null
  readonly lengthSeconds: number
  readonly layers: readonly Layer[]
}

export const LOOP_BARS: readonly (number | null)[] = [null, 1, 2, 4, 8, 16]

export function barsLabel(bars: number | null): string {
  if (bars === null) return 'Free'
  return bars === 1 ? '1 bar' : `${bars} bars`
}

export function emptyLoop(lengthSeconds: number, bars: number | null): Loop {
  return { bars, lengthSeconds, layers: [] }
}

export function barsToSeconds(bars: number, bpm: number, beatsPerBar = 4): number {
  return (60 / bpm) * beatsPerBar * bars
}

export const withLayer = (loop: Loop, events: readonly LoopEvent[]): Loop => ({
  ...loop,
  layers: [...loop.layers, { events }],
})

export const undoLayer = (loop: Loop): Loop => ({ ...loop, layers: loop.layers.slice(0, -1) })

export const isEmpty = (loop: Loop | undefined): boolean =>
  !loop || loop.layers.every((l) => l.events.length === 0)

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Collects note-ons and pairs them with their note-offs.
 *
 * Notes still held when the pass ends are closed at the boundary rather than
 * discarded — you should be able to hold a chord across the loop point and have
 * it recorded, which is exactly how people actually play a pad into a looper.
 */
export class Recorder {
  private open = new Map<string, { time: number; velocity: number }>()
  private done: LoopEvent[] = []

  private static id(note: number, stream: Stream) {
    return `${stream}:${note}`
  }

  noteOn(time: number, note: number, velocity: number, stream: Stream): void {
    this.open.set(Recorder.id(note, stream), { time, velocity })
  }

  noteOff(time: number, note: number, stream: Stream): void {
    const id = Recorder.id(note, stream)
    const started = this.open.get(id)
    if (!started) return
    this.open.delete(id)
    // A release that wraps past the loop point lands before its own attack.
    // Treat it as running to the boundary; `finish` will clamp it.
    const duration = Math.max(0.02, time - started.time)
    this.done.push({ time: started.time, note, velocity: started.velocity, duration, stream })
  }

  /** Close the pass, ending any note still held at `length`. */
  finish(length: number): LoopEvent[] {
    for (const [id, started] of this.open) {
      const [stream, note] = id.split(':') as [Stream, string]
      this.done.push({
        time: started.time,
        note: Number(note),
        velocity: started.velocity,
        duration: Math.max(0.02, length - started.time),
        stream,
      })
    }
    this.open.clear()

    const events = this.done
      .map((e) => ({ ...e, duration: length > 0 ? Math.min(e.duration, length) : e.duration }))
      .sort((a, b) => a.time - b.time)
    this.done = []
    return events
  }

  get recording(): boolean {
    return this.open.size > 0 || this.done.length > 0
  }
}

// ---------------------------------------------------------------------------
// Quantization
// ---------------------------------------------------------------------------

export type Grid = 'off' | '1/4' | '1/8' | '1/8t' | '1/16' | '1/16t' | '1/32'

export const GRIDS: readonly Grid[] = ['off', '1/4', '1/8', '1/8t', '1/16', '1/16t', '1/32']

/** Grid size as a fraction of a beat. */
const GRID_BEATS: Record<Exclude<Grid, 'off'>, number> = {
  '1/4': 1,
  '1/8': 0.5,
  '1/8t': 1 / 3,
  '1/16': 0.25,
  '1/16t': 1 / 6,
  '1/32': 0.125,
}

/**
 * Snap note starts to a grid.
 *
 * **Starts only.** Quantizing durations turns a legato pad into a stutter, and
 * the ear notices where a note begins far more than where it ends.
 *
 * A note played a hair before the downbeat should land *on* it rather than at
 * the very end of the loop, so anything that rounds up to the full length wraps
 * back to zero.
 */
export function quantize(
  events: readonly LoopEvent[],
  grid: Grid,
  bpm: number,
  length: number,
): LoopEvent[] {
  if (grid === 'off') return [...events]
  const step = (60 / bpm) * GRID_BEATS[grid]
  if (step <= 0) return [...events]

  return events
    .map((e) => {
      const snapped = Math.round(e.time / step) * step
      return { ...e, time: length > 0 && snapped >= length ? 0 : snapped }
    })
    .sort((a, b) => a.time - b.time)
}
