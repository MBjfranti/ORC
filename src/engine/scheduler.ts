/**
 * Plays what the performance layer produced.
 *
 * One-shots are scheduled directly against the audio clock. Cycles run on
 * `Tone.Transport` via a `Tone.Loop`, which does its own lookahead in musical
 * time — a different mechanism from the context `lookAhead` we shrank for live
 * playing, and the reason the two were kept separate.
 *
 * Each sounding root owns one voice group, keyed by pitch class, so releasing a
 * key stops exactly that chord's arpeggio and nothing else.
 *
 * Every note played here also mirrors to MIDI channel 1 — these are the
 * "performance" notes, the ones you actually hear, as distinct from the raw
 * block chord on channel 3. See research/09-midi-implementation.md.
 */

import * as Tone from 'tone'

import type { LoopStream } from '../core/looper.js'
import type { Cycle, Performance } from '../core/performance.js'

type CaptureOn = (note: MidiNote, velocity: number, stream: LoopStream) => void
type CaptureOff = (note: MidiNote, stream: LoopStream) => void
import type { MidiNote, PitchClass } from '../core/types.js'
import type { MidiOut } from './midi.js'
import type { SynthEngine } from './SynthEngine.js'

interface Voice {
  /** Notes left sustaining, to be released on key-up. Mutated by `update`. */
  sustained: MidiNote[]
  /** Running arp/pattern loop, if this is a cycle mode. */
  loop?: Tone.Loop
  /**
   * Live step data. The loop callback reads this on every tick rather than
   * closing over it, so swapping the contents changes what plays without
   * touching the loop itself.
   */
  cycle?: Cycle
  /** Position in the sequence. Survives retuning; only a fresh note resets it. */
  step: number
  /** Last interval we set, so we only disturb the loop when timing changes. */
  stepSeconds: number
  /**
   * The step this cycle is currently sounding, and whose release is already
   * booked. Needed so letting go of the key can stop it now and withdraw that
   * booking, rather than leaving both to land after the next chord starts.
   */
  ringing?: MidiNote | undefined
}

export class PerformanceScheduler {
  private voices = new Map<PitchClass, Voice>()

  constructor(
    private engine: SynthEngine,
    private midi?: MidiOut,
    /** Captures live notes when the looper is recording. */
    private looper?: { captureOn: CaptureOn; captureOff: CaptureOff },
  ) {}

  private on(note: MidiNote, velocity: number, at?: number): void {
    this.engine.noteOn(note, velocity, at)
    this.midi?.noteOn('performance', note, velocity, at, Tone.immediate())
    this.looper?.captureOn(note, velocity, 'performance')
  }

  private off(note: MidiNote, at?: number): void {
    this.engine.noteOff(note, at)
    this.midi?.noteOff('performance', note, at, Tone.immediate())
    this.looper?.captureOff(note, 'performance')
  }

  /**
   * Begin playing `performance` for the chord rooted at `pc`, from the top.
   *
   * Use this when a key is newly struck. For edits to something already
   * playing, prefer `retune` — this resets the sequence and re-phases the grid.
   */
  start(pc: PitchClass, performance: Performance): void {
    this.stop(pc)

    if (performance.kind === 'oneshot') {
      const now = Tone.immediate()
      for (const e of performance.events) {
        this.on(e.note, e.velocity, now + e.time)
      }
      this.voices.set(pc, {
        sustained: performance.events.map((e) => e.note),
        step: 0,
        stepSeconds: 0,
      })
      return
    }

    const voice: Voice = {
      sustained: [],
      cycle: performance,
      step: 0,
      stepSeconds: performance.stepSeconds,
    }

    // The callback closes over `voice` and reads `voice.cycle` fresh on every
    // tick. That is the whole mechanism behind `retune`, so this object must be
    // the *same* one stored in the map — copying it here (`{...voice, loop}`)
    // silently severs the link and edits stop reaching the running loop.
    voice.loop = new Tone.Loop((time) => {
      const cycle = voice.cycle
      if (!cycle || cycle.steps.length === 0) return

      const note = cycle.steps[voice.step % cycle.steps.length]
      voice.step++
      if (note === null || note === undefined) return

      this.on(note, 0.8, time)
      this.off(note, time + cycle.stepSeconds * cycle.gate)
      voice.ringing = note
    }, performance.stepSeconds)

    // Start at the transport's current position so the arp begins under the
    // finger rather than waiting for the next bar.
    voice.loop.start(Tone.getTransport().seconds)

    this.voices.set(pc, voice)
  }

  /**
   * Apply a new performance to a voice that is already playing, keeping the
   * arpeggiator's place and its rhythmic phase.
   *
   * Recreating the loop on every edit made the arp stutter back to its first
   * note and drift off the beat whenever you touched the voicing, added an
   * extension, or changed sound. Swapping the step data in place keeps the
   * groove running underneath you, which is the entire point of being able to
   * edit a chord while it sounds.
   *
   * Falls back to a clean `start` when there is nothing to retune into — a
   * different mode family, or no voice yet.
   */
  retune(pc: PitchClass, performance: Performance): void {
    const voice = this.voices.get(pc)

    if (!voice?.loop || performance.kind !== 'cycle') {
      this.start(pc, performance)
      return
    }

    voice.cycle = performance

    // Only disturb the loop if the *timing* changed — a new tempo or a new
    // division. Note content and pattern shape cost nothing.
    if (performance.stepSeconds !== voice.stepSeconds) {
      voice.loop.interval = performance.stepSeconds
      voice.stepSeconds = performance.stepSeconds
    }
  }

  /**
   * Move a sustaining voice to a new set of notes, playing only the difference.
   *
   * Notes common to both sets are left completely untouched, so adding an
   * extension makes the chord swell rather than re-articulate. Only meaningful
   * for one-shot modes — cycles go through `retune`.
   */
  update(pc: PitchClass, notes: readonly MidiNote[], velocity = 0.7): void {
    const voice = this.voices.get(pc)
    if (!voice || voice.loop) return

    const before = new Set(voice.sustained)
    const after = new Set(notes)

    for (const n of before) if (!after.has(n)) this.off(n)
    for (const n of after) if (!before.has(n)) this.on(n, velocity)

    voice.sustained = [...notes]
  }

  /** Stop the chord rooted at `pc`. */
  stop(pc: PitchClass): void {
    const voice = this.voices.get(pc)
    if (!voice) return

    voice.loop?.stop().dispose()

    // A cycle keeps nothing in `sustained` — its note is whichever step last
    // fired, with a release already booked a gate-length ahead. Cancel that
    // booking and release now, so the arpeggio stops with the key instead of
    // hanging on and then reaching into the next chord.
    if (voice.ringing !== undefined) {
      this.engine.cancelNote(voice.ringing)
      this.off(voice.ringing)
      voice.ringing = undefined
    }

    for (const note of voice.sustained) this.off(note)
    this.voices.delete(pc)
  }

  /** Notes currently sustaining for a root, for diffing on live chord edits. */
  sustainedNotes(pc: PitchClass): readonly MidiNote[] {
    return this.voices.get(pc)?.sustained ?? []
  }

  has(pc: PitchClass): boolean {
    return this.voices.has(pc)
  }

  get size(): number {
    return this.voices.size
  }

  stopAll(): void {
    for (const pc of [...this.voices.keys()]) this.stop(pc)
  }
}
