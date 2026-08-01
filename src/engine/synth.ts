/**
 * The only module that touches Tone.js.
 *
 * Everything upstream deals in MIDI note numbers and seconds. Keeping the seam
 * here means the chord and voicing engines never learn what an AudioContext is.
 *
 * ## Why this owns its own scheduling
 *
 * Tone's `PolySynth` schedules future notes with an internal wall-clock timeout
 * that callers cannot reach, and it releases exactly one voice per
 * `triggerRelease`. Both facts bite:
 *
 *  - A strum spreads its notes over as much as half a second. Release the key
 *    partway through and the release runs against voices that do not exist
 *    yet — it finds nothing, does nothing, and the remaining attacks land with
 *    nothing left to stop them. Those notes hang forever.
 *  - Two attacks on one note against one release always leaves a voice ringing.
 *
 * So this keeps its own ledger: a refcount of what is actually sounding, and a
 * cancellable timer per queued event. A release can then reach *forward* and
 * withdraw an attack that has not happened yet.
 */

import * as Tone from 'tone'

import type { MidiNote } from '../core/types.js'

const midiToFreq = (note: MidiNote) => 440 * Math.pow(2, (note - 69) / 12)

/** A queued attack or release that has not fired yet. */
interface Pending {
  id: number
  /** Request order, so a stale release cannot claim a later attack. */
  seq: number
}

export type Voice = 'warm' | 'glass' | 'reed'

export const VOICES: readonly Voice[] = ['warm', 'glass', 'reed']

export const VOICE_LABEL: Record<Voice, string> = {
  warm: 'Warm',
  glass: 'Glass',
  reed: 'Reed',
}

class Synth {
  private voices = new Map<Voice, Tone.PolySynth>()
  private active: Voice = 'warm'

  private filter!: Tone.Filter
  private chorus!: Tone.Chorus
  private delay!: Tone.FeedbackDelay
  private reverb!: Tone.Reverb
  private master!: Tone.Gain

  private bass!: Tone.MonoSynth
  private bassGain!: Tone.Gain
  private bassNote: MidiNote | undefined

  private started = false
  private prepared = false
  private preparing: Promise<void> | undefined

  /** How many voices are sounding per note. A count, not a set — see above. */
  private live = new Map<MidiNote, number>()
  private pendingOn = new Map<MidiNote, Pending[]>()
  private pendingOff = new Map<MidiNote, Pending[]>()
  private pendingBass: Pending[] = []
  private seq = 0

  get running(): boolean {
    return this.started
  }

  /**
   * Build the audio graph *before* anyone plays a note.
   *
   * This is why the first note used to arrive late. A browser will not let an
   * AudioContext produce sound without a gesture, so the obvious thing is to
   * build everything on that gesture — but building is expensive:
   * `Tone.Reverb` renders its impulse response through an OfflineAudioContext
   * at construction, and three PolySynths and a MonoSynth have to be wired up
   * behind it. All of that was landing inside the keypress.
   *
   * A context *can* be created without a gesture; it simply starts suspended,
   * and nodes can be built on it while it is. So the work moves to page load
   * and the gesture is left with nothing to do but `resume()`.
   */
  async prepare(): Promise<void> {
    if (this.prepared) return
    this.preparing ??= (async () => {
      Tone.setContext(
        new Tone.Context({
          latencyHint: 0.003 as unknown as AudioContextLatencyCategory,
          lookAhead: 0.01,
        }),
      )
      this.build()
      // The impulse response is generated asynchronously; waiting here means the
      // cost is paid during load rather than under the first chord.
      await this.reverb.ready
      this.prepared = true
    })()
    return this.preparing
  }

  async start(): Promise<void> {
    if (this.started) return
    await this.prepare()

    // A context built for playing, not sequencing, and it has to be created
    // before any node exists — Tone makes its default context lazily with stock
    // settings otherwise.
    //
    // `latencyHint` takes a number of seconds as well as a keyword, and a small
    // number asks for a smaller output buffer than 'interactive' would pick on
    // its own. Browsers treat it as a hint and clamp to what the device can
    // actually sustain — here it lands on 480 samples at 48kHz, about 10ms —
    // but asking costs nothing and some platforms grant less. Tone's types only
    // admit the keyword form, hence the cast.
    //
    // `lookAhead` is a separate axis: `Tone.now()` adds it, and Tone defaults it
    // to a full 100ms. Live notes bypass it with `Tone.immediate()`, but the
    // transport clock driving arpeggios reads it, so it stays small rather than
    // zero.
    // Everything is already built, so this only lifts the suspension.
    await Tone.start()
    this.watchSuspension()
    Tone.getTransport().start()
    this.started = true
  }

  /**
   * Keep the context awake.
   *
   * Browsers suspend an AudioContext when a tab is backgrounded, and on some
   * platforms it does not come back on its own. A suspended context is not a
   * subtle problem — notes either never sound or arrive late in a burst when it
   * resumes — and it is invisible unless you go looking, which is exactly the
   * sort of thing that gets diagnosed as "the latency is bad".
   */
  private watchSuspension(): void {
    const resume = () => {
      const ctx = Tone.getContext().rawContext as unknown as AudioContext
      if (ctx.state === 'suspended') void ctx.resume()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  }

  /** What the audio path costs before a sample reaches the speakers, in ms. */
  latency(): Record<string, number> {
    const ctx = Tone.getContext().rawContext as unknown as AudioContext
    const base = (ctx.baseLatency ?? 0) * 1000
    const output = (ctx.outputLatency ?? 0) * 1000
    return {
      buffer: round(base),
      output: round(output),
      total: round(base + output),
      sampleRate: ctx.sampleRate,
    }
  }

  private build(): void {
    if (this.master) return
    this.master = new Tone.Gain(0.7).toDestination()

    // Reverb renders its impulse response offline at construction, so a long
    // decay is real work before the first note. 1.8s is plenty here.
    this.reverb = new Tone.Reverb({ decay: 1.8, wet: 0.22 }).connect(this.master)
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.28, wet: 0 }).connect(
      this.reverb,
    )
    this.chorus = new Tone.Chorus({ frequency: 0.7, depth: 0.5, wet: 0.2 })
      .connect(this.delay)
      .start()
    this.filter = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -24, Q: 0.8 }).connect(
      this.chorus,
    )

    this.voices.set(
      'warm',
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.008, decay: 0.3, sustain: 0.7, release: 1.3 },
      })
        .set({ volume: -15 })
        .connect(this.filter),
    )

    this.voices.set(
      'glass',
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.005, decay: 0.6, sustain: 0.4, release: 1.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.004, decay: 0.4, sustain: 0.1, release: 0.8 },
      })
        .set({ volume: -17 })
        .connect(this.filter),
    )

    // A Rhodes is best synthesised as 2-operator FM — a bell-like transient
    // over a sine body — so this is the same architecture with different
    // numbers rather than a third engine.
    this.voices.set(
      'reed',
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 11,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.002, decay: 1.6, sustain: 0.12, release: 1.8 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.3 },
      })
        .set({ volume: -14 })
        .connect(this.filter),
    )

    // The bass takes its own path to the output, bypassing the chord FX chain
    // so reverb and chorus do not turn the low end to mush.
    this.bassGain = new Tone.Gain(0.9).connect(this.master)
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.008, decay: 0.25, sustain: 0.85, release: 0.4 },
      filterEnvelope: {
        attack: 0.004,
        decay: 0.3,
        sustain: 0.4,
        release: 0.4,
        baseFrequency: 90,
        octaves: 2.6,
      },
    })
      .set({ volume: -10 })
      .connect(this.bassGain)
  }

  private current(): Tone.PolySynth | undefined {
    return this.voices.get(this.active)
  }

  // --- scheduling ----------------------------------------------------------

  /**
   * Run `fire` at audio time `at`, cancellably.
   *
   * The lead time matches Tone's own: fire one lookahead early and hand the
   * exact `at` to the synth, so the envelope is still scheduled sample-
   * accurately rather than whenever the timer happened to run.
   */
  private schedule(
    queue: Map<MidiNote, Pending[]> | Pending[],
    note: MidiNote,
    at: number,
    seq: number,
    fire: (time: number) => void,
  ): void {
    const delay = at - Tone.now()
    if (delay <= 0) {
      fire(at)
      return
    }

    const list = Array.isArray(queue) ? queue : (queue.get(note) ?? [])
    if (!Array.isArray(queue) && !queue.has(note)) queue.set(note, list)

    const token: Pending = { id: 0, seq }
    token.id = Tone.getContext().setTimeout(() => {
      const i = list.indexOf(token)
      if (i >= 0) list.splice(i, 1)
      fire(at)
    }, delay)
    list.push(token)
  }

  private static cancel(list: Pending[] | undefined): void {
    if (!list) return
    for (const token of list) Tone.getContext().clearTimeout(token.id)
    list.length = 0
  }

  private attack(note: MidiNote, velocity: number, time: number): void {
    this.current()?.triggerAttack(midiToFreq(note), time, velocity)
    this.live.set(note, (this.live.get(note) ?? 0) + 1)
  }

  private release(note: MidiNote, time: number, seq: number): void {
    const count = this.live.get(note) ?? 0
    if (count > 0) {
      this.current()?.triggerRelease(midiToFreq(note), time)
      if (count === 1) this.live.delete(note)
      else this.live.set(note, count - 1)
      return
    }

    // Nothing sounding, so this release has overtaken its own attack — the
    // strum tail. Withdraw the attack rather than dropping the release.
    //
    // Only an attack queued *before* this release was asked for can be the one
    // it meant to stop. Without that test, a long arpeggio gate still pending
    // from a chord you have already let go of would fire later and swallow the
    // first note of the chord you played next.
    const queued = this.pendingOn.get(note)
    const i = queued?.findIndex((t) => t.seq < seq) ?? -1
    if (queued && i >= 0) {
      Tone.getContext().clearTimeout(queued[i]!.id)
      queued.splice(i, 1)
      if (queued.length === 0) this.pendingOn.delete(note)
    }
  }

  // --- public --------------------------------------------------------------

  noteOn(note: MidiNote, velocity = 0.8, at?: number): void {
    if (!this.started) return
    this.schedule(this.pendingOn, note, at ?? Tone.immediate(), ++this.seq, (t) =>
      this.attack(note, velocity, t),
    )
  }

  noteOff(note: MidiNote, at?: number): void {
    if (!this.started) return
    const seq = ++this.seq
    this.schedule(this.pendingOff, note, at ?? Tone.immediate(), seq, (t) =>
      this.release(note, t, seq),
    )
  }

  /** Drop queued events for a note without touching what is already sounding. */
  cancelNote(note: MidiNote): void {
    if (!this.started) return
    Synth.cancel(this.pendingOn.get(note))
    Synth.cancel(this.pendingOff.get(note))
    this.pendingOn.delete(note)
    this.pendingOff.delete(note)
  }

  /**
   * Monophonic, and `bassNote` is set when the note *sounds* rather than when
   * it is asked for — otherwise scheduling several bass events at once leaves
   * the flag describing the last of them while the first is still playing.
   */
  bassOn(note: MidiNote, velocity = 0.85, at?: number): void {
    if (!this.started) return
    this.schedule(this.pendingBass, note, at ?? Tone.immediate(), ++this.seq, (t) => {
      this.bass.triggerAttack(midiToFreq(note), t, velocity)
      this.bassNote = note
    })
  }

  bassOff(at?: number): void {
    if (!this.started) return
    this.schedule(this.pendingBass, -1, at ?? Tone.immediate(), ++this.seq, (t) => {
      if (this.bassNote === undefined) return
      this.bass.triggerRelease(t)
      this.bassNote = undefined
    })
  }

  /**
   * Panic.
   *
   * Releasing every sounding voice is only half the job — anything queued has
   * to be withdrawn too, or it attacks *after* the panic and hangs.
   */
  allNotesOff(): void {
    if (!this.started) return

    for (const list of this.pendingOn.values()) Synth.cancel(list)
    for (const list of this.pendingOff.values()) Synth.cancel(list)
    Synth.cancel(this.pendingBass)
    this.pendingOn.clear()
    this.pendingOff.clear()

    for (const voice of this.voices.values()) voice.releaseAll()
    this.live.clear()

    if (this.bassNote !== undefined) {
      this.bass.triggerRelease(Tone.immediate())
      this.bassNote = undefined
    }
  }

  setVoice(voice: Voice): void {
    if (!this.started || voice === this.active) return
    // Switching synths would strand every note attacked on the old one.
    this.allNotesOff()
    this.active = voice
  }

  setBpm(bpm: number): void {
    if (this.started) Tone.getTransport().bpm.value = bpm
  }

  /**
   * Filter cutoff, 0–1, centred so 0.5 is the patch's own voice.
   *
   * Sweeping linearly in Hz sounds wrong — pitch is logarithmic, so a linear
   * dial spends most of its travel in the top octave where nothing happens.
   */
  setCutoff(normalised: number): void {
    if (!this.started) return
    const n = Math.max(0, Math.min(1, normalised))
    const hz = Math.max(80, Math.min(16000, 2200 * Math.pow(2, (n - 0.5) * 7)))
    this.filter.frequency.rampTo(hz, 0.03)
  }

  setReverb(wet: number): void {
    if (this.started) this.reverb.wet.rampTo(clamp01(wet), 0.08)
  }

  setDelay(wet: number): void {
    if (this.started) this.delay.wet.rampTo(clamp01(wet), 0.08)
  }

  setVolume(level: number): void {
    if (this.started) this.master.gain.rampTo(clamp01(level) * 0.9, 0.05)
  }

  setBassLevel(level: number): void {
    if (this.started) this.bassGain.gain.rampTo(clamp01(level), 0.05)
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const round = (n: number) => Math.round(n * 100) / 100

/**
 * Module-level singleton.
 *
 * React 19's StrictMode runs effects twice in development. Without this you get
 * two AudioContexts, two graphs, and every note playing twice.
 */
let instance: Synth | undefined

export function getSynth(): Synth {
  instance ??= new Synth()
  return instance
}

export type { Synth }
