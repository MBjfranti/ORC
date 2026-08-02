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

    /**
     * One step of the sequence.
     *
     * Reads `group.cycle` fresh rather than closing over the performance, which
     * is the whole mechanism behind `retune` — the object stored in the map has
     * to be the *same* one this closes over, or edits stop reaching the loop.
     */
    const tick = (time: number) => {
      const cycle = group.cycle
      if (!cycle || cycle.steps.length === 0) return

      const index = group.step % cycle.steps.length
      // A building cycle clears on the wrap so the next pass can build again;
      // otherwise the notes accumulate once and the rhythm stops being audible.
      if (cycle.sustain && index === 0 && group.step > 0) {
        for (const note of group.sustained) this.off(note, time)
        group.sustained.length = 0
      }

      const note = cycle.steps[index]
      group.step++
      if (note === null || note === undefined) return

      /*
       * The note **sustains**.
       *
       * A conventional arpeggiator releases each step after its gate, so only
       * one note ever sounds and the chord — with whatever extensions are held
       * on it — is simply gone. That makes a performance mode replace the
       * instrument's main function rather than colour it.
       *
       * Letting each step ring instead means the pattern *introduces* the
       * chord: you hear the rhythm on the way in, and the whole harmony once it
       * has arrived. Everything is released on the wrap above, or on key-up.
       */
      if (cycle.sustain) {
        if (!group.sustained.includes(note)) {
          this.on(note, 0.8, time)
          group.sustained.push(note)
        }
      } else {
        // Rings and clears: the figure stays legible instead of silting up.
        this.on(note, 0.8, time)
        this.off(note, time + cycle.stepSeconds * cycle.gate)
      }
      group.ringing = note
    }

    /*
     * Play step one *now*.
     *
     * `Tone.Loop` fires its callback at the end of each interval, not the
     * start, so starting it and waiting gave a full step of silence before the
     * arpeggio began — a fifth of a second at eighth-triplets, on every single
     * chord. The key has to make a sound when you press it.
     */
    tick(Tone.immediate())

    /*
     * A `Tone.Loop` rides the transport, and a stopped transport never ticks —
     * so the loop silently never fires and the only thing you hear is the
     * immediate first step above, pulsing on the root once per keypress.
     *
     * The synth starts the transport when the context resumes, but a cycle can
     * outlive a context swap or an interrupted unlock, and the failure is
     * completely silent. Cheap to assert here, where the dependency actually
     * lives.
     */
    const transport = Tone.getTransport()
    if (transport.state !== 'started') transport.start()

    group.loop = new Tone.Loop(tick, performance.stepSeconds)
    // The loop then picks up from the *second* step, one interval out, so the
    // rhythm stays even across the hand-off.
    group.loop.start(Tone.getTransport().seconds + performance.stepSeconds)
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

    // Cycle steps sustain now, so everything a cycle sounded is in `sustained`
    // alongside a one-shot's notes — one release path serves both.
    group.ringing = undefined
    for (const note of group.sustained) this.off(note)
    this.groups.delete(root)
  }

  /**
   * Move a running cycle onto a new root without restarting it.
   *
   * An arpeggio is a rhythm, and a rhythm that resets every time you change
   * chord is not one — you get a stutter back to step zero on every root, and
   * the groove never survives a progression. Re-keying the group and swapping
   * its step data keeps the loop object, its position in the sequence, and its
   * phase against the transport.
   *
   * Returns false when there was nothing to move, so the caller can fall back
   * to a clean start.
   */
  moveCycle(from: PitchClass, to: PitchClass, performance: Performance): boolean {
    const group = this.groups.get(from)
    if (!group?.loop || performance.kind !== 'cycle') return false

    if (from !== to) {
      this.groups.delete(from)
      this.groups.set(to, group)
    }

    // The chord changed, so what the old one built up has to go — those notes
    // belong to a harmony that is no longer playing. The loop object and its
    // phase survive; only the notes under it are replaced.
    for (const note of group.sustained) this.off(note)
    group.sustained.length = 0
    // `step` deliberately survives: the notes belong to the new chord, but the
    // rhythm belongs to the performance, and that is what must not restart.
    group.cycle = performance
    if (performance.stepSeconds !== group.stepSeconds) {
      group.loop.interval = performance.stepSeconds
      group.stepSeconds = performance.stepSeconds
    }
    return true
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
