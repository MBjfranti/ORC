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
import { METERS } from '../core/beats.js'
import type { Meter } from '../core/beats.js'
import type { Synth } from './synth.js'

export type LoopState =
  | 'empty'
  /** Free mode, waiting for the first note to start the clock (§12.3). */
  | 'armed'
  | 'counting'
  | 'recording'
  | 'playing'
  | 'overdubbing'
  | 'paused'

export interface LoopView {
  readonly state: LoopState
  readonly bars: number | null
  readonly layers: number
  /** 0–1 through the current pass, for the progress ring. */
  readonly position: number
  readonly lengthSeconds: number
  /** Beats left in the count-in, 4 down to 1. Zero when not counting. */
  readonly countBeat: number
}

export interface LoopConfig {
  readonly bpm: number
  readonly grid: Grid
  /**
   * The time signature, which decides both how long a bar is and how many
   * clicks count you into it. Six-eight is six clicks and three quarter notes,
   * and using one number for both is how a 6/8 loop comes out twice the length
   * it should be.
   */
  readonly meter?: Meter
  readonly onChange?: () => void
  /** Asked to click for one bar before a bar-locked recording starts. */
  readonly countIn?: (bars: number) => void
  /**
   * Recording has actually started — the count-in is over.
   *
   * > "Metronome sounds during Loop record count-in, **then plays the Beat if
   * > selected**" — v3.90 (research/08)
   *
   * That handoff is the reason this exists: the click counts you in and the
   * drums take over on the downbeat, which is what makes a bar-locked loop
   * feel like it is being played to something rather than into silence.
   */
  readonly onRecord?: () => void
}

export class Looper {
  private loop: Loop | undefined
  private state: LoopState = 'empty'
  private recorder = new Recorder()

  /** Transport time the current pass began. */
  private passStart = 0
  private scheduleId: number | undefined
  private countInId: number | undefined
  private countBeat = 0

  private bpm = 96
  private grid: Grid = 'off'
  private meter: Meter = METERS[0]!
  private onChange: (() => void) | undefined
  private countIn: ((bars: number) => void) | undefined
  private onRecord: (() => void) | undefined

  constructor(private synth: Synth) {}

  configure(opts: Partial<LoopConfig>): void {
    if (opts.bpm !== undefined) this.bpm = opts.bpm
    if (opts.grid !== undefined) this.grid = opts.grid
    if (opts.meter !== undefined) this.meter = opts.meter
    if (opts.onChange !== undefined) this.onChange = opts.onChange
    if (opts.countIn !== undefined) this.countIn = opts.countIn
    if (opts.onRecord !== undefined) this.onRecord = opts.onRecord
  }

  /** One bar, in seconds, at the current tempo and time signature. */
  private barSeconds(bars = 1): number {
    return barsToSeconds(bars, this.bpm, this.meter.quarters)
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
      countBeat: this.state === 'counting' ? this.countBeat : 0,
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
   * Free loops arm and wait for you to play, which is §12.3's own rule and the
   * only sensible one — there is no grid to line up with, so the first note has
   * to be the downbeat.
   */
  arm(bars: number | null): void {
    this.reset()
    const length = bars === null ? 0 : this.barSeconds(bars)
    this.loop = emptyLoop(length, bars)

    /*
     * > "In Free mode, recording starts **as soon as you play the first
     * > note**." — §12.3
     *
     * So a free loop arms and waits. It used to start its clock on the press,
     * which baked however long you took to reach the keys into the top of the
     * loop — the loop then came round early by exactly that much, every pass,
     * and there was no way to see why.
     */
    if (bars === null) {
      this.state = 'armed'
      this.passStart = this.now()
      this.onChange?.()
      return
    }

    this.state = 'counting'
    this.passStart = this.now()
    // Assigned directly rather than through `begin`, because a count-in has no
    // schedule of its own — so it has to announce itself, or the panel sits on
    // the Waiting Room through the whole bar you are counting.
    this.onChange?.()
    this.countIn?.(1)

    /*
     * Click the bar in. Four beats, the first accented, so you know where one
     * is before you have to play it — "metronome sounds during Loop record
     * count-in" (research/08, v3.90).
     *
     * Scheduled ahead as four separate events rather than driven by a timer:
     * they are audio, so they belong on the audio clock, and a click that
     * arrives when the browser gets round to it is worse than no click.
     */
    const beats = this.meter.beats
    const beat = this.barSeconds() / beats
    const start = this.now()
    for (let i = 0; i < beats; i++) {
      this.synth.click(start + i * beat, i === 0)
      /*
       * Count it down on the screen as well as out loud. **MANUAL SILENT** —
       * the hardware's count-in is audible and the display is not described, so
       * this is ours. A bar of silence with nothing moving reads as a hang, and
       * knowing there are two beats left is the difference between coming in
       * and missing it.
       */
      Tone.getTransport().scheduleOnce(() => {
        this.countBeat = beats - i
        this.onChange?.()
      }, start + i * beat)
    }

    this.countInId = Tone.getTransport().scheduleOnce(
      () => this.begin('recording'),
      start + this.barSeconds(),
    )
  }

  /** Stop a free recording and adopt however long it turned out to be. */
  closeFree(): void {
    // Armed and never played: there is nothing to close, so drop it rather than
    // committing a loop of pure silence.
    if (this.state === 'armed') {
      this.reset()
      return
    }
    if (this.state !== 'recording' || !this.loop || this.loop.bars !== null) return
    this.loop = { ...this.loop, lengthSeconds: Math.max(0.25, this.now() - this.passStart) }
    this.commit()
    this.begin('playing')
  }

  /*
   * Every transport method announces itself.
   *
   * They used not to: the only caller was `App`, which called `view()` by hand
   * afterwards. The Loop encoder now drives them directly, and a transport that
   * changes state without saying so leaves the panel showing the last thing it
   * knew — a ring still sweeping round a loop that has been cleared.
   */
  overdub(): void {
    if (this.loop && this.state === 'playing') this.state = 'overdubbing'
    this.onChange?.()
  }

  stopRecording(): void {
    if (this.state === 'recording' || this.state === 'overdubbing') {
      this.commit()
      this.state = 'playing'
    }
    this.onChange?.()
  }

  /**
   * `Stop`, as the menu row — "press the Loop Dial on **Stop** to stop recording
   * in Free Mode" (§12.4) and "to finish overdubbing" (§12.5).
   *
   * A bar-locked recording is deliberately not stoppable this way: §12.4 says
   * "wait for the fixed loop to finish", and the row is not offered for it.
   */
  stop(): void {
    if (this.state === 'armed' || this.state === 'recording') {
      this.closeFree()
      return
    }
    if (this.state === 'overdubbing') this.stopRecording()
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
      case 'armed':
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
    this.onChange?.()
  }

  resume(): void {
    if (this.state === 'paused') this.begin('playing')
    this.onChange?.()
  }

  undo(): void {
    if (!this.loop) return
    this.loop = undoLayer(this.loop)
    if (isEmpty(this.loop)) this.reset()
    this.onChange?.()
  }

  /** Full stop: drop the loop and release anything it was holding. */
  reset(): void {
    this.unschedule()
    this.synth.allNotesOff()
    this.recorder.finish(0)
    this.loop = undefined
    this.state = 'empty'
    this.onChange?.()
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
    // The first note of a free loop *is* the downbeat — it starts the clock and
    // is then recorded at time zero, not after it.
    if (this.state === 'armed') this.begin('recording')
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
    // The click has done its job; whatever is meant to take over, takes over.
    if (state === 'recording') this.onRecord?.()
    // Covers `arm`, `closeFree` and `resume` in one place — every route into a
    // new transport state passes through here.
    this.onChange?.()
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

/**
 * Module-level singleton, the same bargain `getSynth()` makes.
 *
 * The Loop encoder has to reach the transport from inside `encoders.ts`, which
 * is data rather than a component and has no props to be handed one through.
 * The alternative was threading a context object through every encoder's
 * `turn`, `press` and `list` for the sake of one knob.
 */
let instance: Looper | undefined

export function getLooper(synth: Synth): Looper {
  instance ??= new Looper(synth)
  return instance
}

/** The live looper, once something has built it. */
export const looperOrNull = (): Looper | undefined => instance
