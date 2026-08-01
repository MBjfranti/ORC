/**
 * Tone.js implementation of SynthEngine.
 *
 * This is the ONLY module that imports Tone. Everything upstream deals in
 * MIDI note numbers and times.
 *
 * Guarded by a module-level singleton because React 19 StrictMode runs effects
 * twice in development — without this you get two AudioContexts, two Tone
 * graphs, and doubled notes. See research/12-tech-stack.md §React traps.
 */

import * as Tone from 'tone'

import type { EngineId, FxType, Preset, SynthEngine } from './SynthEngine.js'
import { DEFAULT_PRESET } from './presets.js'
import type { MidiNote } from '../core/types.js'
import type { BassPreset } from './bassPresets.js'

function midiToFreq(note: MidiNote): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * A note event that has been asked for but has not happened yet.
 *
 * Held in an object rather than as a bare id so the callback can remove itself
 * from the queue without closing over a variable it is still initialising.
 */
interface Pending {
  id: number
  /** Request order, so a stale release cannot claim a later attack. */
  seq: number
}

class ToneEngineImpl implements SynthEngine {
  private synths = new Map<EngineId, Tone.PolySynth>()
  private filter!: Tone.Filter
  private chorus!: Tone.Chorus
  private delay!: Tone.FeedbackDelay
  private reverb!: Tone.Reverb
  private flanger!: Tone.FeedbackDelay
  private flangerLfo!: Tone.LFO
  private phaser!: Tone.Phaser
  private drive!: Tone.Distortion
  private tremolo!: Tone.Tremolo
  /** "Expands on Chorus with multiple layers of detuned voices" — §8.1. */
  private ensemble!: Tone.Chorus
  private master!: Tone.Gain

  /** Preset cutoff in Hz, which the filter dial scales around. */
  private baseCutoff = 1800

  private bass!: Tone.MonoSynth
  private bassGain!: Tone.Gain
  private bassNote: MidiNote | undefined

  private active: EngineId = DEFAULT_PRESET.engine
  private started = false
  private built = false

  /**
   * How many voices are actually sounding for each note.
   *
   * A count, not a set. `PolySynth.triggerRelease` releases exactly one voice
   * per call, so two attacks and one release leaves a voice ringing forever.
   * Anything that can strike the same note twice — an arpeggio doubled at the
   * octave, the looper playing over a live hand — needs the releases to be
   * counted rather than assumed unique.
   */
  private live = new Map<MidiNote, number>()

  /** Scheduled attacks and releases that have not fired yet, per note. */
  private pendingOn = new Map<MidiNote, Pending[]>()
  private pendingOff = new Map<MidiNote, Pending[]>()
  private pendingBass: Pending[] = []
  private seq = 0

  get running(): boolean {
    return this.started
  }

  async start(): Promise<void> {
    if (this.started) return

    // Replace Tone's default context with one built for playing, not sequencing.
    //
    // `latencyHint: 'interactive'` asks the browser for the smallest output
    // buffer it will give us. Tone's own default context is created lazily with
    // its stock settings, so this has to happen before any node exists — which
    // is why `build()` runs after this line, not before.
    //
    // `lookAhead` is a separate axis: `Tone.now()` returns
    // `currentTime + lookAhead`, and Tone defaults it to a full 100ms. Live
    // notes bypass it entirely by using `Tone.immediate()`, but the Transport
    // clock driving arpeggios reads it, so we keep a small non-zero value
    // rather than zeroing it and starving the sequenced path.
    Tone.setContext(
      new Tone.Context({
        latencyHint: 'interactive',
        lookAhead: 0.01,
        updateInterval: 0.02,
      }),
    )

    await Tone.start()
    this.build()

    // The arpeggiator, patterns and (later) the looper all ride the transport.
    Tone.getTransport().start()

    this.started = true
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm
  }

  /**
   * Observable latency in milliseconds.
   *
   * `scheduling` is ours to control. `base` + `output` is the browser and the
   * operating system's audio path — not reachable from JavaScript, and usually
   * the larger share. Worth reporting separately so we optimise the part we can
   * actually move.
   */
  latencyReport(): Record<string, number> {
    const ctx = Tone.getContext()
    const raw = ctx.rawContext as unknown as AudioContext
    const base = (raw.baseLatency ?? 0) * 1000
    const output = (raw.outputLatency ?? 0) * 1000
    return {
      scheduling: 0, // live notes use Tone.immediate(), so no lookahead applies
      lookAheadForTransport: ctx.lookAhead * 1000,
      base: round(base),
      output: round(output),
      totalHardware: round(base + output),
      sampleRate: raw.sampleRate,
      bufferSamples: round((raw.baseLatency ?? 0) * raw.sampleRate),
    }
  }

  /** The raw AudioContext, for diagnostics that need to tap the output. */
  get audioContext(): AudioContext {
    return Tone.getContext().rawContext as unknown as AudioContext
  }

  /** The node everything is summed into, for attaching an analyser. */
  get output(): Tone.Gain {
    return this.master
  }

  private build(): void {
    if (this.built) return

    this.master = new Tone.Gain(0.7).toDestination()

    // Signal flow, last to first: filter → drive → tremolo → ensemble →
    // phaser → flanger → chorus → delay → reverb → out. Modulation before the
    // time-based effects, so reverb tails aren't themselves being swept.
    //
    // Tone.Reverb renders its impulse response offline at construction, so a
    // long decay is real work on the main thread before the first note. 1.8s is
    // plenty for these sounds and noticeably cheaper to build.
    this.reverb = new Tone.Reverb({ decay: 1.8, wet: 0.3 }).connect(this.master)
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 0.15 }).connect(this.reverb)
    this.chorus = new Tone.Chorus({ frequency: 0.8, depth: 0.6, wet: 0.3 }).connect(this.delay).start()

    // Tone has no flanger, so build one: a very short delay whose time is swept
    // by an LFO, fed back on itself. The short delay and the feedback are what
    // separate it from the chorus above.
    this.flanger = new Tone.FeedbackDelay({ delayTime: 0.005, feedback: 0.6, wet: 0 }).connect(
      this.chorus,
    )
    this.flangerLfo = new Tone.LFO({ frequency: 0.25, min: 0.0016, max: 0.008 }).start()
    this.flangerLfo.connect(this.flanger.delayTime)

    this.phaser = new Tone.Phaser({ frequency: 0.4, octaves: 3, baseFrequency: 400, wet: 0 }).connect(
      this.flanger,
    )
    // Ensemble is a second chorus, wider and slower than the first, which is
    // exactly how the manual describes it: more layers, more detune.
    this.ensemble = new Tone.Chorus({ frequency: 0.35, delayTime: 6, depth: 0.9, spread: 180, wet: 0 })
      .connect(this.phaser)
      .start()
    this.tremolo = new Tone.Tremolo({ frequency: 5, depth: 0.8, spread: 0, wet: 0 })
      .connect(this.ensemble)
      .start()
    this.drive = new Tone.Distortion({ distortion: 0.45, wet: 0 }).connect(this.tremolo)
    this.filter = new Tone.Filter({ frequency: 1800, type: 'lowpass', rolloff: -24, Q: 1 }).connect(
      this.drive,
    )

    this.synths.set('subtractive', this.buildSubtractive())
    this.synths.set('fm', this.buildFm())
    this.synths.set('ep', this.buildEp())

    // The bass is deliberately a separate voice with its own path to the
    // output — it bypasses the chord FX chain so reverb and chorus don't turn
    // the low end to mush, which is exactly why the hardware keeps it apart.
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
      .set({ volume: -8 })
      .connect(this.bassGain)

    this.built = true
  }

  private buildSubtractive(): Tone.PolySynth {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.006, decay: 0.3, sustain: 0.7, release: 1.4 },
    })
      .set({ volume: -14 })
      .connect(this.filter)
  }

  private buildFm(): Tone.PolySynth {
    return new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.6, sustain: 0.4, release: 1.6 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.004, decay: 0.4, sustain: 0.1, release: 0.8 },
    })
      .set({ volume: -16 })
      .connect(this.filter)
  }

  /**
   * A Rhodes is best synthesised as 2-operator FM — a bell-like attack transient
   * over a sine body — so the "vintage EP" engine is FM with different settings
   * rather than a separate architecture. See research/07.
   */
  private buildEp(): Tone.PolySynth {
    return new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 12,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 1.6, sustain: 0.12, release: 1.8 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.3 },
    })
      .set({ volume: -13 })
      .connect(this.filter)
  }

  private current(): Tone.PolySynth | undefined {
    return this.synths.get(this.active)
  }

  /**
   * Run `fire` at audio time `at`, cancellably.
   *
   * Tone schedules future notes with `context.setTimeout` internally, and that
   * timer is not reachable from the outside — which is the whole bug this
   * replaces. A strummed chord asks for four attacks spread over as much as a
   * quarter of a second; release the key before the last one lands and
   * `triggerRelease` runs against a voice that does not exist yet, does
   * nothing, and the attack arrives afterwards with nothing left to stop it.
   * Those are the notes that hang.
   *
   * Owning the timer means a release can reach *forward* and cancel an attack
   * that has not happened. The lead time matches Tone's own: fire one lookahead
   * early and hand the exact `at` to the synth, so the envelope is still
   * scheduled sample-accurately rather than whenever the timer happened to run.
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

    // Nothing is sounding for this note, so the release has overtaken its own
    // attack — the strum tail described above. Withdraw the attack instead of
    // dropping the release on the floor.
    //
    // Only an attack that was already queued when this release was *asked for*
    // can be the one it was meant to stop. Without that test a long arpeggio
    // gate, still pending from a chord you have already let go of, would fire
    // later and swallow the first note of the chord you played next.
    const queued = this.pendingOn.get(note)
    const i = queued?.findIndex((token) => token.seq < seq) ?? -1
    if (queued && i >= 0) {
      Tone.getContext().clearTimeout(queued[i]!.id)
      queued.splice(i, 1)
      if (queued.length === 0) this.pendingOn.delete(note)
    }
  }

  noteOn(note: MidiNote, velocity = 0.8, at?: number): void {
    if (!this.started) return
    // `immediate()` is currentTime with no lookahead added — the earliest the
    // hardware can actually start the note.
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

  /**
   * Drop everything queued for `note` without touching what is already
   * sounding.
   *
   * The arpeggiator books each step's release a gate-length ahead. Let go of
   * the key and that release is still in the diary — at a quarter-note gate it
   * can be half a second away, long enough to land on the chord you played
   * next and cut one of its notes short. Whoever queued the event is the only
   * one who knows it is no longer wanted, so the scheduler withdraws it here.
   */
  cancelNote(note: MidiNote): void {
    if (!this.started) return
    ToneEngineImpl.cancel(this.pendingOn.get(note))
    ToneEngineImpl.cancel(this.pendingOff.get(note))
    this.pendingOn.delete(note)
    this.pendingOff.delete(note)
  }

  /**
   * Monophonic: a new note steals the old one rather than stacking.
   *
   * `bassNote` is updated when the note actually sounds, not when it is asked
   * for. The looper schedules a whole pass in one go, so setting it at request
   * time left the flag describing the *last* event of the pass while the first
   * was still playing — and a live `bassOff` would then bail out early and
   * leave the bass droning.
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
   * Switch the bass to another sound.
   *
   * The bass is one MonoSynth reconfigured rather than nine synths kept warm
   * — it is monophonic, so there is only ever one voice to retune, and
   * building nine of them would cost memory for nothing. A sounding note is
   * left alone; the new shape lands on the next attack.
   */
  setBassPreset(preset: BassPreset): void {
    if (!this.started) return
    this.bass.set({
      oscillator: { type: preset.wave },
      filter: { Q: preset.resonance },
      envelope: { decay: preset.decay, sustain: preset.sustain },
      filterEnvelope: { baseFrequency: preset.base, octaves: preset.octaves },
      volume: preset.volume,
    })
  }

  setBassVolume(db: number): void {
    if (!this.started) return
    this.bassGain.gain.rampTo(Math.pow(10, db / 20), 0.05)
  }

  /**
   * Panic.
   *
   * Releasing every sounding voice is only half the job — anything already
   * queued has to be withdrawn too, or it attacks *after* the panic and hangs.
   * That is what left a loop still trickling notes out after Pause, and a
   * strum ringing on after alt-tab: both call this, and neither was reaching
   * the scheduled half of the note.
   */
  allNotesOff(): void {
    if (!this.started) return

    for (const list of this.pendingOn.values()) ToneEngineImpl.cancel(list)
    for (const list of this.pendingOff.values()) ToneEngineImpl.cancel(list)
    ToneEngineImpl.cancel(this.pendingBass)
    this.pendingOn.clear()
    this.pendingOff.clear()

    for (const synth of this.synths.values()) synth.releaseAll()
    this.live.clear()

    if (this.bassNote !== undefined) {
      this.bass.triggerRelease(Tone.immediate())
      this.bassNote = undefined
    }
  }

  setPreset(preset: Preset): void {
    if (!this.started) return
    if (preset.engine !== this.active) {
      this.allNotesOff()
      this.active = preset.engine
    }
    const now = Tone.now()
    this.baseCutoff = preset.cutoff
    this.filter.frequency.rampTo(preset.cutoff, 0.05, now)
    this.reverb.wet.rampTo(preset.reverb, 0.1, now)
    this.chorus.wet.rampTo(preset.chorus, 0.1, now)
    this.delay.wet.rampTo(preset.delay, 0.1, now)
  }

  setFx(type: FxType, amount: number): void {
    if (!this.started) return
    const wet = Math.max(0, Math.min(1, amount))
    // The two Drum FX belong to the beat bus, not this chain — they share the
    // FX list on the panel but not the signal path. DrumMachine handles them.
    const rack = {
      reverb: this.reverb,
      chorus: this.chorus,
      delay: this.delay,
      flanger: this.flanger,
      phaser: this.phaser,
      drive: this.drive,
      tremolo: this.tremolo,
      ensemble: this.ensemble,
    }
    const node = rack[type as keyof typeof rack] as
      | { wet: { rampTo(value: number, time: number): void } }
      | undefined
    node?.wet.rampTo(wet, 0.08)
  }

  /**
   * Filter cutoff, 0–1, centred so that 0.5 is the preset's own voice.
   *
   * Sweeping in Hz linearly sounds wrong — pitch is logarithmic, so a linear
   * dial spends most of its travel in the top octave where nothing much
   * happens. Scaling exponentially around the preset's cutoff keeps every part
   * of the dial useful and always leaves a way back to how the sound started.
   */
  setCutoff(normalised: number): void {
    if (!this.started) return
    const n = Math.max(0, Math.min(1, normalised))
    const octaves = (n - 0.5) * 8 // ±4 octaves either side of the preset
    const hz = Math.max(60, Math.min(18000, this.baseCutoff * Math.pow(2, octaves)))
    this.filter.frequency.rampTo(hz, 0.03)
  }

  setMasterVolume(db: number): void {
    if (!this.started) return
    this.master.gain.rampTo(Math.pow(10, db / 20), 0.05)
  }

  dispose(): void {
    if (this.started) this.allNotesOff()
    for (const synth of this.synths.values()) synth.dispose()
    this.bass?.dispose()
    this.synths.clear()
    this.built = false
    this.started = false
  }
}

/**
 * Module-level singleton. Survives StrictMode's double-mount; without it,
 * development builds create two audio graphs and every note plays twice.
 */
let instance: ToneEngineImpl | undefined

export function getEngine(): SynthEngine {
  instance ??= new ToneEngineImpl()
  return instance
}
