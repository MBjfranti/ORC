/**
 * Walks a progression against the transport.
 *
 * Owns only *when* — which bar we're on and when the chord changes. It never
 * touches the synth: it hands each step to a callback and lets the app resolve
 * it through the same path a keypress takes, so a progression is performed with
 * whatever key, voicing, sound and arpeggiator are currently set rather than
 * being frozen at the moment you wrote it.
 */

import * as Tone from 'tone'

import { isEmpty, stepAtBar, totalBars } from '../core/progression.js'
import type { Progression, ProgressionStep } from '../core/progression.js'

export interface ProgressionSnapshot {
  readonly playing: boolean
  /** Index of the sounding step, or -1. */
  readonly current: number
  /** Bars elapsed within the current step. */
  readonly bar: number
  readonly totalBars: number
}

export class ProgressionPlayer {
  private progression: Progression = { steps: [] }
  private playing = false
  private bar = 0
  private current = -1
  private loopId: number | undefined

  constructor(
    /** Called when a new step begins. `undefined` means stop sounding. */
    private onStep: (step: ProgressionStep | undefined, index: number) => void,
  ) {}

  setProgression(progression: Progression): void {
    this.progression = progression
    // A progression edited down to nothing should stop rather than keep
    // hammering the last chord it happened to be on.
    if (isEmpty(progression) && this.playing) this.stop()
  }

  snapshot(): ProgressionSnapshot {
    return {
      playing: this.playing,
      current: this.current,
      bar: this.bar,
      totalBars: totalBars(this.progression),
    }
  }

  start(): void {
    if (this.playing || isEmpty(this.progression)) return
    this.playing = true
    this.bar = 0
    this.current = -1

    // Fire the first chord immediately rather than waiting a whole bar —
    // pressing play should make a sound now.
    this.advance(Tone.immediate(), true)

    this.loopId = Tone.getTransport().scheduleRepeat(
      (time) => {
        this.bar++
        this.advance(time, false)
      },
      '1m',
      `+1m`,
    )
  }

  stop(): void {
    if (this.loopId !== undefined) Tone.getTransport().clear(this.loopId)
    this.loopId = undefined
    this.playing = false
    this.current = -1
    this.bar = 0
    this.onStep(undefined, -1)
  }

  toggle(): void {
    if (this.playing) this.stop()
    else this.start()
  }

  get isPlaying(): boolean {
    return this.playing
  }

  /**
   * Sound whatever step this bar belongs to.
   *
   * Only fires when the step actually changes, so a chord held for four bars is
   * struck once rather than re-articulated every bar.
   */
  private advance(time: number, force: boolean): void {
    const index = stepAtBar(this.progression, this.bar)
    if (index < 0) return
    if (!force && index === this.current) return

    this.current = index
    this.onStep(this.progression.steps[index], index)
    void time
  }

  dispose(): void {
    this.stop()
  }
}
