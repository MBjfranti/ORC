/**
 * Driving the looper against the audio clock.
 *
 * `core/looper.ts` owns what was played; this owns when. Playback goes through
 * the same synth as live playing, so a loop follows whatever voice is currently
 * selected — that is the point of recording notes rather than audio.
 */

import * as Tone from 'tone'

import {
  barsToSeconds,
  emptyLoop,
  isEmpty,
  quantize,
  Recorder,
  undoLayer,
  withLayer,
} from '../core/looper.js'
import type { Grid, Loop, LoopEvent, Stream } from '../core/looper.js'
import type { Synth } from './synth.js'

export type LoopState = 'empty' | 'counting' | 'recording' | 'playing' | 'overdubbing' | 'paused'

export interface LoopView {
  readonly state: LoopState
  readonly bars: number | null
  readonly layers: number
  /** 0–1 through the current pass, for the progress ring. */
  readonly position: number
  readonly lengthSeconds: number
}

export interface LoopConfig {
  readonly bpm: number
  readonly grid: Grid
  readonly onChange?: () => void
  /** Asked to click for one bar before a bar-locked recording starts. */
  readonly countIn?: (bars: number) => void
}

export class Looper {
  private loop: Loop | undefined
  private state: LoopState = 'empty'
  private recorder = new Recorder()

  /** Transport time the current pass began. */
  private passStart = 0
  private scheduleId: number | undefined
  private countInId: number | undefined

  private bpm = 96
  private grid: Grid = 'off'
  private onChange: (() => void) | undefined
  private countIn: ((bars: number) => void) | undefined

  constructor(private synth: Synth) {}

  configure(opts: Partial<LoopConfig>): void {
    if (opts.bpm !== undefined) this.bpm = opts.bpm
    if (opts.grid !== undefined) this.grid = opts.grid
    if (opts.onChange !== undefined) this.onChange = opts.onChange
    if (opts.countIn !== undefined) this.countIn = opts.countIn
  }

  view(): LoopView {
    const length = this.loop?.lengthSeconds ?? 0
    const elapsed = length > 0 ? (this.now() - this.passStart) / length : 0
    return {
      state: this.state,
      bars: this.loop?.bars ?? null,
      layers: this.loop?.layers.length ?? 0,
      position: this.state === 'empty' ? 0 : Math.max(0, Math.min(1, elapsed)),
      lengthSeconds: length,
    }
  }

  get current(): Loop | undefined {
    return this.loop
  }

  // --- transport -----------------------------------------------------------

  /**
   * Arm a recording.
   *
   * Bar-locked loops get a one-bar count-in so you have somewhere to breathe.
   * Free loops start the instant you ask, because there is no grid to line up
   * with and waiting would just be latency.
   */
  arm(bars: number | null): void {
    this.reset()
    const length = bars === null ? 0 : barsToSeconds(bars, this.bpm)
    this.loop = emptyLoop(length, bars)

    if (bars === null) {
      this.begin('recording')
      return
    }

    this.state = 'counting'
    this.passStart = this.now()
    this.countIn?.(1)
    this.countInId = Tone.getTransport().scheduleOnce(
      () => {
        this.begin('recording')
        this.onChange?.()
      },
      this.now() + barsToSeconds(1, this.bpm),
    )
  }

  /** Stop a free recording and adopt however long it turned out to be. */
  closeFree(): void {
    if (this.state !== 'recording' || !this.loop || this.loop.bars !== null) return
    this.loop = { ...this.loop, lengthSeconds: Math.max(0.25, this.now() - this.passStart) }
    this.commit()
    this.begin('playing')
  }

  overdub(): void {
    if (this.loop && this.state === 'playing') this.state = 'overdubbing'
  }

  stopRecording(): void {
    if (this.state === 'recording' || this.state === 'overdubbing') {
      this.commit()
      this.state = 'playing'
    }
  }

  /**
   * The one button that means the next sensible thing.
   *
   * empty → arm · recording(free) → close · playing → overdub ·
   * overdubbing → stop. A free-length loop is the exception: it has no boundary
   * to close itself on, so the second press is what ends the first pass.
   */
  advance(bars: number | null): void {
    switch (this.state) {
      case 'empty':
        this.arm(bars)
        break
      case 'recording':
        if (this.loop?.bars === null) this.closeFree()
        break
      case 'playing':
        this.overdub()
        break
      case 'overdubbing':
        this.stopRecording()
        break
      case 'paused':
        this.resume()
        break
    }
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.unschedule()
    this.synth.allNotesOff()
    this.state = 'paused'
  }

  resume(): void {
    if (this.state === 'paused') this.begin('playing')
  }

  undo(): void {
    if (!this.loop) return
    this.loop = undoLayer(this.loop)
    if (isEmpty(this.loop)) this.reset()
  }

  /** Full stop: drop the loop and release anything it was holding. */
  reset(): void {
    this.unschedule()
    this.synth.allNotesOff()
    this.recorder.finish(0)
    this.loop = undefined
    this.state = 'empty'
  }

  load(loop: Loop): void {
    this.reset()
    this.loop = loop
    this.begin('playing')
  }

  // --- capture -------------------------------------------------------------

  get capturing(): boolean {
    return this.state === 'recording' || this.state === 'overdubbing'
  }

  captureOn(note: number, velocity: number, stream: Stream): void {
    if (this.capturing) this.recorder.noteOn(this.passTime(), note, velocity, stream)
  }

  captureOff(note: number, stream: Stream): void {
    if (this.capturing) this.recorder.noteOff(this.passTime(), note, stream)
  }

  // --- internals -----------------------------------------------------------

  private now(): number {
    return Tone.getTransport().seconds
  }

  private passTime(): number {
    const elapsed = this.now() - this.passStart
    const length = this.loop?.lengthSeconds ?? 0
    // Overdubbing wraps: a note played past the boundary belongs at the top.
    return length > 0 ? ((elapsed % length) + length) % length : elapsed
  }

  private begin(state: LoopState): void {
    this.state = state
    this.passStart = this.now()
    if (this.loop && this.loop.lengthSeconds > 0) this.schedule()
  }

  /**
   * Re-arm every pass.
   *
   * Scheduling one repeat at the loop length and fanning the events out from
   * that boundary means an overdub committed mid-pass is picked up on the next
   * turn without disturbing what is already sounding.
   */
  private schedule(): void {
    this.unschedule()
    const length = this.loop?.lengthSeconds ?? 0
    if (length <= 0) return

    this.scheduleId = Tone.getTransport().scheduleRepeat(
      (time) => {
        this.passStart = time
        if (this.state === 'recording') {
          // The first pass just ended: keep it and start looping.
          this.commit()
          this.state = 'playing'
          this.onChange?.()
        } else if (this.state === 'overdubbing') {
          this.commit()
          this.onChange?.()
        }
        this.play(time)
      },
      length,
      this.now() + length,
    )
  }

  private unschedule(): void {
    const transport = Tone.getTransport()
    if (this.scheduleId !== undefined) transport.clear(this.scheduleId)
    if (this.countInId !== undefined) transport.clear(this.countInId)
    this.scheduleId = undefined
    this.countInId = undefined
  }

  private play(at: number): void {
    if (!this.loop) return
    for (const layer of this.loop.layers) {
      for (const e of layer.events) this.playEvent(e, at + e.time)
    }
  }

  private playEvent(e: LoopEvent, at: number): void {
    if (e.stream === 'bass') {
      this.synth.bassOn(e.note, e.velocity, at)
      this.synth.bassOff(at + e.duration)
      return
    }
    this.synth.noteOn(e.note, e.velocity, at)
    this.synth.noteOff(e.note, at + e.duration)
  }

  private commit(): void {
    if (!this.loop) return
    const events = this.recorder.finish(this.loop.lengthSeconds)
    if (events.length === 0) return
    this.loop = withLayer(this.loop, quantize(events, this.grid, this.bpm, this.loop.lengthSeconds))
  }
}
