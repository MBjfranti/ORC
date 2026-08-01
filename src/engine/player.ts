/**
 * Plays what the performance layer produced.
 *
 * One voice group per sounding root, so releasing a key stops exactly that
 * chord and nothing else. One-shots go straight to the audio clock; cycles run
 * on `Tone.Transport` via a `Tone.Loop`, which does its own lookahead in
 * musical time — a different mechanism from the context lookahead the synth
 * shrank for live playing, and the reason the two are kept apart.
 */

import * as Tone from 'tone'

import type { Cycle, Performance } from '../core/performance.js'
import type { MidiNote, PitchClass } from '../core/types.js'
import type { Synth } from './synth.js'

interface Group {
  /** Notes left sustaining, released on key-up. Empty for cycles. */
  sustained: MidiNote[]
  loop?: Tone.Loop
  /**
   * Live step data. The loop callback reads this every tick rather than
   * closing over it, which is what lets a chord be edited mid-arpeggio.
   */
  cycle?: Cycle
  step: number
  stepSeconds: number
  /**
   * The step currently sounding, whose release is already booked a gate ahead.
   * Needed so letting go can stop it now and withdraw that booking.
   */
  ringing?: MidiNote | undefined
}

/**
 * Told about every note as it is played, so the looper can record the
 * *performed* notes rather than the block chord.
 *
 * That distinction matters: record a strum and you want the strum back, not
 * four simultaneous notes.
 */
export type Capture = (note: MidiNote, velocity: number, on: boolean) => void

export class Player {
  private groups = new Map<PitchClass, Group>()

  constructor(
    private synth: Synth,
    private capture?: Capture,
  ) {}

  private on(note: MidiNote, velocity: number, at?: number): void {
    this.synth.noteOn(note, velocity, at)
    this.capture?.(note, velocity, true)
  }

  private off(note: MidiNote, at?: number): void {
    this.synth.noteOff(note, at)
    this.capture?.(note, 0, false)
  }

  /**
   * Begin `performance` for the chord at `root`, from the top.
   *
   * For a chord already playing, prefer `retune` — this resets the sequence and
   * re-phases the grid.
   */
  start(root: PitchClass, performance: Performance): void {
    this.stop(root)

    if (performance.kind === 'oneshot') {
      const now = Tone.immediate()
      for (const e of performance.events) this.on(e.note, e.velocity, now + e.time)
      this.groups.set(root, {
        sustained: performance.events.map((e) => e.note),
        step: 0,
        stepSeconds: 0,
      })
      return
    }

    const group: Group = {
      sustained: [],
      cycle: performance,
      step: 0,
      stepSeconds: performance.stepSeconds,
    }

    // The callback closes over `group` and reads `group.cycle` fresh each tick.
    // That is the whole mechanism behind `retune`, so this must be the *same*
    // object stored in the map — copying it here severs the link silently.
    group.loop = new Tone.Loop((time) => {
      const cycle = group.cycle
      if (!cycle || cycle.steps.length === 0) return

      const note = cycle.steps[group.step % cycle.steps.length]
      group.step++
      if (note === null || note === undefined) return

      this.on(note, 0.8, time)
      this.off(note, time + cycle.stepSeconds * cycle.gate)
      group.ringing = note
    }, performance.stepSeconds)

    // Start at the transport's current position so the arpeggio begins under
    // the finger rather than waiting for the next bar.
    group.loop.start(Tone.getTransport().seconds)
    this.groups.set(root, group)
  }

  /**
   * Swap the step data underneath a running arpeggio, keeping its place and
   * its rhythmic phase.
   *
   * Recreating the loop on every edit made the arpeggio stutter back to its
   * first note whenever you touched the voicing — which defeats the point of
   * being able to edit a chord while it sounds.
   */
  retune(root: PitchClass, performance: Performance): void {
    const group = this.groups.get(root)
    if (!group?.loop || performance.kind !== 'cycle') {
      this.start(root, performance)
      return
    }

    group.cycle = performance
    // Only disturb the loop if the *timing* changed. New notes cost nothing.
    if (performance.stepSeconds !== group.stepSeconds) {
      group.loop.interval = performance.stepSeconds
      group.stepSeconds = performance.stepSeconds
    }
  }

  /**
   * Move a sustaining chord to a new set of notes, playing only the difference.
   *
   * Notes common to both are left completely alone, so adding an extension
   * makes the chord swell rather than re-articulate.
   */
  update(root: PitchClass, notes: readonly MidiNote[], velocity = 0.7): void {
    const group = this.groups.get(root)
    if (!group || group.loop) return

    const before = new Set(group.sustained)
    const after = new Set(notes)
    for (const n of before) if (!after.has(n)) this.off(n)
    for (const n of after) if (!before.has(n)) this.on(n, velocity)
    group.sustained = [...notes]
  }

  stop(root: PitchClass): void {
    const group = this.groups.get(root)
    if (!group) return

    group.loop?.stop().dispose()

    // A cycle keeps nothing in `sustained` — its note is whichever step last
    // fired, with a release already booked a gate ahead. Cancel that booking
    // and release now, so the arpeggio stops with the key instead of reaching
    // into the next chord.
    if (group.ringing !== undefined) {
      this.synth.cancelNote(group.ringing)
      this.off(group.ringing)
      group.ringing = undefined
    }

    for (const note of group.sustained) this.off(note)
    this.groups.delete(root)
  }

  sustained(root: PitchClass): readonly MidiNote[] {
    return this.groups.get(root)?.sustained ?? []
  }

  get size(): number {
    return this.groups.size
  }

  stopAll(): void {
    for (const root of [...this.groups.keys()]) this.stop(root)
  }
}
