/**
 * Drives the looper against the audio clock.
 *
 * The pure half (`core/looper.ts`) owns what was played. This owns *when* —
 * count-in, the recording window, and re-scheduling every event on each pass.
 *
 * Playback goes through the same engine and MIDI outputs as live playing, so a
 * loop follows whatever sound is currently selected. That is the whole point of
 * recording notes rather than audio.
 */

import * as Tone from 'tone'

import type { TimeSignature } from '../core/timeSignature.js'
import { DEFAULT_TIME_SIGNATURE } from '../core/timeSignature.js'
import {
  barsToSeconds,
  emptyLoop,
  LoopRecorder,
  quantizeEvents,
  withLayer,
} from '../core/looper.js'
import type { Loop, LoopEvent, LoopStream, QuantizeGrid } from '../core/looper.js'
import type { MidiNote } from '../core/types.js'
import type { MidiOut } from './midi.js'
import type { SynthEngine } from './SynthEngine.js'

export type LoopState = 'empty' | 'counting' | 'recording' | 'playing' | 'paused' | 'overdubbing'

export interface LoopSnapshot {
  readonly state: LoopState
  readonly bars: number | null
  readonly layers: number
  /** 0–1 through the current pass, for the progress ring. */
  readonly position: number
  readonly lengthSeconds: number
}

export interface LoopPlayerOptions {
  readonly bpm: number
  readonly quantize: QuantizeGrid
  readonly timeSignature: TimeSignature
  /** Fired when the state machine advances on its own, e.g. count-in ending. */
  readonly onChange?: () => void
  /** Asked to click for one bar when a bar-locked recording is armed. */
  readonly countIn?: (bars: number) => void
}

export class LoopPlayer {
  private loop: Loop | undefined
  private state: LoopState = 'empty'
  private recorder = new LoopRecorder()

  /** Transport time the current pass began, for relative event timing. */
  private passStart = 0
  private scheduleId: number | undefined
  private countInId: number | undefined

  private bpm = 96
  private quantize: QuantizeGrid = 'off'
  private timeSignature: TimeSignature = DEFAULT_TIME_SIGNATURE
  private onChange: (() => void) | undefined
  private countIn: ((bars: number) => void) | undefined

  constructor(
    private engine: SynthEngine,
    private midi?: MidiOut,
  ) {}

  configure(opts: Partial<LoopPlayerOptions>): void {
    if (opts.bpm !== undefined) this.bpm = opts.bpm
    if (opts.quantize !== undefined) this.quantize = opts.quantize
    if (opts.timeSignature !== undefined) this.timeSignature = opts.timeSignature
    if (opts.onChange !== undefined) this.onChange = opts.onChange
    if (opts.countIn !== undefined) this.countIn = opts.countIn
  }

  snapshot(): LoopSnapshot {
    const length = this.loop?.lengthSeconds ?? 0
    const elapsed = length > 0 ? (this.transportNow() - this.passStart) / length : 0
    return {
      state: this.state,
      bars: this.loop?.bars ?? null,
      layers: this.loop?.layers.length ?? 0,
      position: this.state === 'empty' ? 0 : Math.max(0, Math.min(1, elapsed)),
      lengthSeconds: length,
    }
  }

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  /**
   * Arm a new loop.
   *
   * Bar-locked loops get a one-bar count-in so you have somewhere to breathe;
   * free loops start the instant you ask, because there is no grid to line up
   * with and waiting would just be latency.
   */
  arm(bars: number | null): void {
    this.reset()
    const length = bars === null ? 0 : barsToSeconds(bars, this.bpm, this.timeSignature)
    this.loop = emptyLoop(length, bars)

    if (bars === null) {
      this.beginPass('recording')
      return
    }

    this.state = 'counting'
    const oneBar = barsToSeconds(1, this.bpm, this.timeSignature)
    this.passStart = this.transportNow()
    this.countIn?.(1)

    this.countInId = Tone.getTransport().scheduleOnce(() => {
      this.beginPass('recording')
      this.onChange?.()
    }, this.transportNow() + oneBar)
  }

  /** Stop a free-length recording and adopt however long it turned out to be. */
  closeFreeLoop(): void {
    if (this.state !== 'recording' || !this.loop || this.loop.bars !== null) return
    const length = Math.max(0.25, this.transportNow() - this.passStart)
    this.loop = { ...this.loop, lengthSeconds: length }
    this.commitPass()
    this.beginPass('playing')
  }

  overdub(): void {
    if (!this.loop || this.state !== 'playing') return
    this.state = 'overdubbing'
  }

  /** Finish the current recording or overdub and fall back to playback. */
  stopRecording(): void {
    if (this.state === 'recording' || this.state === 'overdubbing') {
      this.commitPass()
      this.state = 'playing'
    }
  }

  // -------------------------------------------------------------------------
  // Capture — called by the app for every note it plays live
  // -------------------------------------------------------------------------

  get isCapturing(): boolean {
    return this.state === 'recording' || this.state === 'overdubbing'
  }

  captureOn(note: MidiNote, velocity: number, stream: LoopStream): void {
    if (!this.isCapturing) return
    this.recorder.noteOn(this.passTime(), note, velocity, stream)
  }

  captureOff(note: MidiNote, stream: LoopStream): void {
    if (!this.isCapturing) return
    this.recorder.noteOff(this.passTime(), note, stream)
  }

  // -------------------------------------------------------------------------
  // Editing
  // -------------------------------------------------------------------------

  /**
   * Pause and resume playback — "Select Pause or Play to pause or resume
   * playback" (§12.4).
   *
   * Pausing unschedules rather than muting, so nothing is silently accruing in
   * the background, and resuming restarts the pass from the top. Resuming mid
   * pass would need the transport offset preserved across an arbitrary gap,
   * which is a lot of bookkeeping for a boundary you cannot hear anyway.
   */
  pause(): void {
    if (this.state !== 'playing') return
    this.unschedule()
    this.engine.allNotesOff()
    this.state = 'paused'
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.beginPass('playing')
  }

  undo(): void {
    if (!this.loop) return
    this.loop = { ...this.loop, layers: this.loop.layers.slice(0, -1) }
  }

  clear(): void {
    if (!this.loop) return
    this.loop = { ...this.loop, layers: [] }
  }

  /** Full stop: drop the loop and release anything it was holding. */
  reset(): void {
    this.unschedule()
    this.engine.allNotesOff()
    this.midi?.allNotesOff()
    this.recorder.finish(0)
    this.loop = undefined
    this.state = 'empty'
  }

  get current(): Loop | undefined {
    return this.loop
  }

  load(loop: Loop): void {
    this.reset()
    this.loop = loop
    this.beginPass('playing')
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private transportNow(): number {
    return Tone.getTransport().seconds
  }

  private passTime(): number {
    const elapsed = this.transportNow() - this.passStart
    const length = this.loop?.lengthSeconds ?? 0
    // Overdubbing wraps: a note played past the boundary belongs at the top.
    return length > 0 ? ((elapsed % length) + length) % length : elapsed
  }

  private beginPass(state: LoopState): void {
    this.state = state
    this.passStart = this.transportNow()
    if (this.loop && this.loop.lengthSeconds > 0) this.schedule()
  }

  /**
   * Re-arm playback every pass.
   *
   * Scheduling one repeat at the loop length and fanning every event out from
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
          // The first pass just ended: keep what was played and start looping.
          this.commitPass()
          this.state = 'playing'
          this.onChange?.()
        } else if (this.state === 'overdubbing') {
          this.commitPass()
          this.onChange?.()
        }
        this.playPass(time)
      },
      length,
      this.transportNow() + length,
    )
  }

  private unschedule(): void {
    const transport = Tone.getTransport()
    if (this.scheduleId !== undefined) transport.clear(this.scheduleId)
    if (this.countInId !== undefined) transport.clear(this.countInId)
    this.scheduleId = undefined
    this.countInId = undefined
  }

  private playPass(at: number): void {
    if (!this.loop) return
    for (const layer of this.loop.layers) {
      for (const e of layer.events) this.playEvent(e, at + e.time)
    }
  }

  private playEvent(e: LoopEvent, at: number): void {
    if (e.stream === 'bass') {
      this.engine.bassOn(e.note, e.velocity, at)
      this.engine.bassOff(at + e.duration)
      this.midi?.noteOn('bass', e.note, e.velocity, at, Tone.immediate())
      this.midi?.noteOff('bass', e.note, at + e.duration, Tone.immediate())
      return
    }
    this.engine.noteOn(e.note, e.velocity, at)
    this.engine.noteOff(e.note, at + e.duration)
    this.midi?.noteOn('performance', e.note, e.velocity, at, Tone.immediate())
    this.midi?.noteOff('performance', e.note, at + e.duration, Tone.immediate())
  }

  private commitPass(): void {
    if (!this.loop) return
    const events = this.recorder.finish(this.loop.lengthSeconds)
    if (events.length === 0) return
    this.loop = withLayer(
      this.loop,
      quantizeEvents(events, this.quantize, this.bpm, this.loop.lengthSeconds),
    )
  }
}
