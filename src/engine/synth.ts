/**
 * The audio graph, and the seam Tone.js lives behind.
 *
 * Everything upstream deals in MIDI note numbers and seconds. Keeping the seam
 * here means the chord and voicing engines never learn what an AudioContext is.
 * Two siblings share the seam — `engine/looper.ts` drives the transport and
 * `engine/drums.ts` owns the kit — but nothing above `engine/` imports Tone.
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

import type { Beat, Meter } from '../core/beats.js'
import type { MidiNote } from '../core/types.js'
import { bassAt } from './bass.js'
import { beatTicks, ticksAt } from './clock.js'
import { Drums } from './drums.js'
import { BASS_SECTION_DB, bassTrim, dbToGain, DRUM_TRIM, soundTrim } from './levels.js'
import { soundAt, voiceParams } from './sounds.js'
import type { Sound } from './sounds.js'

const midiToFreq = (note: MidiNote) => 440 * Math.pow(2, (note - 69) / 12)

/** A queued attack or release that has not fired yet. */
interface Pending {
  id: number
  /** Request order, so a stale release cannot claim a later attack. */
  seq: number
}

/**
 * The three engines the library is built on.
 *
 * Deliberately few and conventional — the character lives in the fifty presets,
 * not in exotic synthesis. This is how the instrument itself is arranged.
 */
export type Voice = 'sub' | 'fm' | 'ep'

export const VOICES: readonly Voice[] = ['sub', 'fm', 'ep']

class Synth {
  private voices = new Map<Voice, Tone.PolySynth>()
  private active: Voice = 'sub'
  /** Base cutoff of the loaded preset; the Colour dial scales around it. */
  private baseCutoff = 2200

  private filter!: Tone.Filter
  private chorus!: Tone.Chorus
  private delay!: Tone.FeedbackDelay
  private reverb!: Tone.Reverb
  private master!: Tone.Gain

  private bass!: Tone.MonoSynth
  private bassGain!: Tone.Gain
  private bassNote: MidiNote | undefined
  private metronome!: Tone.Synth
  private metronomeId: number | undefined
  private clickLevel = 0.6
  private clickSound: 'beep' | 'hihat' = 'beep'
  private drums!: Drums
  /** Loop playback, one synth per preset a layer actually uses. */
  private pool = new Map<number, Tone.PolySynth>()
  private bassPool = new Map<number, Tone.MonoSynth>()

  private started = false
  private prepared = false
  private preparing: Promise<void> | undefined

  /** How many voices are sounding per note. A count, not a set — see above. */
  private live = new Map<MidiNote, number>()
  private pendingOn = new Map<MidiNote, Pending[]>()
  private pendingOff = new Map<MidiNote, Pending[]>()
  private pendingBass: Pending[] = []
  private seq = 0
  private cutoff = 0.5

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
          // How often Tone advances its own clock, and so the resolution of
          // every timer built on it. The default is 50ms, which is *coarser
          // than a strum*: a 24ms gap and a 48ms gap between notes both land
          // on the same tick, so Strum, Slop and Block come out identical.
          // The entire difference between those modes lives below the default.
          updateInterval: 0.005,
        }),
      )
      this.build()

      // Start the clock *before* awaiting anything. A transport on a suspended
      // context simply waits, and putting it after the reverb meant a slow or
      // stalled impulse render left the clock stopped — which is silent, and
      // shows up only as arpeggios that never advance past their first note.
      Tone.getTransport().start()

      // The impulse responses are generated asynchronously; waiting here means
      // the cost is paid during load rather than under the first chord — and
      // the drums render one of their own, so both have to be waited on.
      await Promise.all([this.reverb.ready, this.drums.ready])
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
      'sub',
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.008, decay: 0.3, sustain: 0.7, release: 1.3 },
      })
        .set({ volume: -15 })
        .connect(this.filter),
    )

    this.voices.set(
      'fm',
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
      'ep',
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

    /*
     * The click goes straight to the output — no filter, no reverb, no chorus.
     * A metronome that swims in the same space as the instrument is a metronome
     * you cannot hear over it, and it is not part of the performance: it is not
     * recorded and it is not shaped by the sound you happen to have loaded.
     */
    this.metronome = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
    })
      .set({ volume: -20 })
      .connect(this.master)

    // The kit takes the same route out as the click, and for the same reason:
    // the beat is not part of the performance. It is never captured by the
    // looper and never shaped by whichever sound happens to be loaded.
    this.drums = new Drums(this.master)

    // The bass takes its own path to the output, bypassing the chord FX chain
    // so reverb and chorus do not turn the low end to mush.
    // The section offset lives on the bus, so the player's Bass Volume works
    // either side of a sensible balance rather than spending its travel
    // correcting one. See `BASS_SECTION_DB`.
    this.bassGain = new Tone.Gain(0.9 * dbToGain(BASS_SECTION_DB)).connect(this.master)
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

    // The pool is a separate set of voices, so panic has to reach it by name.
    this.stopPlayback()
  }

  /**
   * Load a preset.
   *
   * A sound is a *starting point*, not a patch you edit: it sets the engine and
   * its envelope, and the Colour dial and the effects then move around it. That
   * is why the cutoff is remembered as a base rather than written straight to
   * the filter — turning Colour has to mean the same thing on every preset.
   */
  setSound(index: number): void {
    if (!this.started) return
    const sound = soundAt(index)

    if (sound.engine !== this.active) {
      // Switching engines would strand every note attacked on the old one.
      this.allNotesOff()
      this.active = sound.engine
    }

    this.apply(sound, index)
    this.baseCutoff = sound.cutoff
    this.setCutoff(this.cutoff)
  }

  private apply(sound: Sound, index: number): void {
    const synth = this.voices.get(sound.engine)
    if (synth) this.applyTo(synth, sound, soundTrim(index))
  }

  /**
   * Write a preset onto a synth.
   *
   * Split out from `apply` so the playback pool can be configured with exactly
   * the same numbers as the live voice — a layer that sounded different on
   * playback than it did while you recorded it would be worse than no per-layer
   * sound at all.
   */
  private applyTo(synth: Tone.PolySynth, sound: Sound, trim: number): void {
    // The options map is typed to the subtractive voice, so the FM fields need
    // a cast — both engines are PolySynths, but of different voices.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    synth.set(voiceParams(sound, trim) as any)
  }

  /**
   * Load a bass preset.
   *
   * The bass has its own list because it is its own instrument — a separate
   * monophonic synth with its own voicing and volume (research/07). Its
   * envelopes are plain seconds rather than the treble library's time
   * constants, so they pass through untouched; see `bass.ts`.
   */
  setBassSound(index: number): void {
    if (this.started) this.applyBassTo(this.bass, index)
  }

  private applyBassTo(bass: Tone.MonoSynth, index: number): void {
    const sound = bassAt(index)
    bass.set({
      oscillator: { type: sound.wave },
      envelope: {
        attack: sound.attack,
        decay: sound.decay,
        sustain: sound.sustain,
        release: sound.release,
      },
      filter: { Q: sound.q },
      filterEnvelope: {
        attack: sound.filterAttack,
        decay: sound.filterDecay,
        sustain: sound.filterSustain,
        release: sound.release,
        baseFrequency: sound.base,
        octaves: sound.octaves,
      },
      volume: sound.volume + bassTrim(index),
    })
  }

  /**
   * The metronome click.
   *
   * Documented, and documented as sounding exactly here: `Options → Audio and
   * MIDI → Metronome Click` offers **Beep** or **Hi Hat**, and v3.90's note
   * reads "metronome sounds during Loop record count-in, then plays the Beat if
   * selected" (research/08). This is the Beep.
   *
   * The downbeat is a fifth higher and a touch louder, because a count-in whose
   * four clicks are identical does not tell you when bar one starts — which is
   * the only thing it is for.
   */
  click(at: number, accent = false): void {
    if (!this.started) return
    const velocity = (accent ? 0.9 : 0.55) * this.clickLevel
    /*
     * `Options → Metronome Click` offers `Beep` or `Hi Hat` (§14.10, values
     * from research/02 — the section itself names no sounds, and research/13
     * §A.10 says not to invent more).
     *
     * The hi-hat is the drum kit's own closed hat rather than a second
     * oscillator pretending to be one, so the two settings really are two
     * sounds. It bypasses the drum bus, because the click is not the beat: it
     * is never captured and Beat Volume must not silence it.
     */
    if (this.clickSound === 'hihat') {
      this.drums.hit('hat', at, velocity)
      return
    }
    this.metronome.triggerAttackRelease(accent ? 1600 : 1067, 0.03, at, velocity)
  }

  /** `Beep` or `Hi Hat` — §14.10. */
  setClickSound(sound: 'beep' | 'hihat'): void {
    this.clickSound = sound
  }

  /**
   * Metronome volume, the other half of the BPM dial's press-and-turn.
   *
   * > "Press and turn the BPM Dial to independently adjust the volume of Beats
   * > **or** the Metronome." — §4.2
   *
   * Independent, so two numbers: which one the gesture moves depends on which
   * the dial is pointed at. Applied to the click's velocity rather than to a
   * gain node, because there is nothing else on this path to turn down.
   */
  setClickLevel(level: number): void {
    this.clickLevel = clamp01(level)
  }

  /**
   * The metronome, running on its own.
   *
   * Pressing the BPM encoder switches it on and off (research/13 §B.2, §11.2).
   * It is the thing that makes a count-in usable: you can hear the tempo before
   * you commit to recording, rather than pressing record and hoping.
   *
   * Scheduled as a quarter-note repeat on the transport, so it follows the BPM
   * without being re-armed — and it is never captured, because it does not go
   * anywhere near the looper.
   */
  setMetronome(on: boolean, meter: Meter): void {
    if (!this.started) return
    if (this.metronomeId !== undefined) {
      Tone.getTransport().clear(this.metronomeId)
      this.metronomeId = undefined
    }
    if (!on) return
    /*
     * The accent is the bar line, so the repeat has to know the meter — a click
     * that accents every fourth beat in seven-eight is worse than one that never
     * accents at all, because it confidently tells you the wrong thing.
     *
     * And *which* beat is read off the clock rather than counted from whenever
     * you switched it on. Counted, the downbeat landed wherever you happened to
     * press, so the click, the beat and the loop each insisted on a different
     * bar line. All three now anchor to transport zero, which is the only way
     * "one BPM drives everything" (research/08 §Master clock) is true rather
     * than merely tempo-matched.
     */
    this.metronomeId = Tone.getTransport().scheduleRepeat((time) => {
      const beat = Math.round(ticksAt(time) / beatTicks(meter)) % meter.beats
      this.click(time, beat === 0)
    }, meter.unit)
  }

  // --- the beat machine ------------------------------------------------------
  //
  // Delegated rather than exposed, so `App` talks to one object about audio and
  // the kit stays behind the same seam as everything else.

  setBeat(beat: Beat | undefined): void {
    if (this.started) this.drums.setBeat(beat)
  }

  setBeatLevel(level: number): void {
    if (this.started) this.drums.setLevel(level * dbToGain(DRUM_TRIM))
  }

  setDrumReverb(wet: number): void {
    if (this.started) this.drums.setReverb(wet)
  }

  setDrumSaturation(wet: number): void {
    if (this.started) this.drums.setSaturation(wet)
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
    this.cutoff = Math.max(0, Math.min(1, normalised))
    // Centred on the preset's own voice, so 0.5 is always "as designed" and
    // there is always a way back to how the sound started.
    const hz = Math.max(80, Math.min(16000, this.baseCutoff * Math.pow(2, (this.cutoff - 0.5) * 7)))
    this.filter.frequency.rampTo(hz, 0.03)
  }

  setChorus(wet: number): void {
    if (this.started) this.chorus.wet.rampTo(clamp01(wet), 0.08)
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
    if (this.started) this.bassGain.gain.rampTo(clamp01(level) * dbToGain(BASS_SECTION_DB), 0.05)
  }

  // --- loop playback, per layer ----------------------------------------------
  //
  // A pool of synths keyed by preset, so a loop's layers can each speak with
  // the sound they were played with. The live path above is untouched and keeps
  // its own voices: it has to solve the strum problem, where a release can
  // overtake an attack that has not happened yet, and that machinery is only
  // correct for one synth at a time.
  //
  // Playback needs none of it. Every recorded note has a known duration at the
  // moment it is scheduled, so `triggerAttackRelease` is exact and there is
  // nothing to withdraw. That is why this is a second path rather than the
  // ledger made generic.

  /**
   * The synth for a preset, built on first use.
   *
   * Lazily, because the library is fifty deep and a loop touches a handful.
   * Each is wired into the same filter and effects chain as the live voices —
   * there is one rack on this instrument, and a loop that bypassed it would
   * drift away from what you are playing over the top the moment you moved a
   * dial.
   */
  private poolFor(index: number): Tone.PolySynth | undefined {
    if (!this.started) return undefined
    const existing = this.pool.get(index)
    if (existing) return existing

    const sound = soundAt(index)
    const synth =
      sound.engine === 'sub'
        ? new Tone.PolySynth(Tone.Synth)
        : new Tone.PolySynth(Tone.FMSynth)
    synth.connect(this.filter)
    this.pool.set(index, synth)
    this.applyTo(synth, sound, soundTrim(index))
    return synth
  }

  private bassPoolFor(index: number): Tone.MonoSynth | undefined {
    if (!this.started) return undefined
    const existing = this.bassPool.get(index)
    if (existing) return existing
    const synth = new Tone.MonoSynth().connect(this.bassGain)
    this.bassPool.set(index, synth)
    this.applyBassTo(synth, index)
    return synth
  }

  /**
   * Build a layer's synth **now**, off the audio path.
   *
   * Measured: constructing and configuring one `PolySynth` costs 8–12ms on the
   * main thread. The context's `lookAhead` is 10ms. So building one lazily
   * inside a scheduled playback callback would spend the entire scheduling
   * window on construction and hand the notes to the audio clock late — a
   * hitch, and precisely on the first pass of a new layer, which is the pass
   * you are listening hardest to.
   *
   * Called when a pass *starts capturing*, so the cost lands on a keypress —
   * where 10ms is invisible — and there is a full pass of headroom before
   * anything needs to play. Allocating the first voice is a further 0.1ms, and
   * not worth pre-empting.
   */
  warm(sound: number, bassSound: number): void {
    this.poolFor(sound)
    this.bassPoolFor(bassSound)
  }

  /** One recorded note, on the preset its layer was played with. */
  playNote(index: number, note: MidiNote, velocity: number, at: number, duration: number): void {
    // A zero-length note is silent on some voices and a click on others, so the
    // floor is a short note rather than whatever was recorded.
    this.poolFor(index)?.triggerAttackRelease(
      midiToFreq(note),
      Math.max(0.02, duration),
      at,
      velocity,
    )
  }

  playBassNote(
    index: number,
    note: MidiNote,
    velocity: number,
    at: number,
    duration: number,
  ): void {
    this.bassPoolFor(index)?.triggerAttackRelease(
      midiToFreq(note),
      Math.max(0.02, duration),
      at,
      velocity,
    )
  }

  /** Silence the loop without touching what the hands are holding. */
  stopPlayback(): void {
    if (!this.started) return
    for (const synth of this.pool.values()) synth.releaseAll()
    for (const synth of this.bassPool.values()) synth.triggerRelease(Tone.immediate())
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
