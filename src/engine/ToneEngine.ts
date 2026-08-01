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
  private sounding = new Set<MidiNote>()
  private started = false
  private built = false

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

  noteOn(note: MidiNote, velocity = 0.8, at?: number): void {
    if (!this.started) return
    // `immediate()` is currentTime with no lookahead added — the earliest the
    // hardware can actually start the note.
    this.current()?.triggerAttack(midiToFreq(note), at ?? Tone.immediate(), velocity)
    this.sounding.add(note)
  }

  noteOff(note: MidiNote, at?: number): void {
    if (!this.started) return
    this.current()?.triggerRelease(midiToFreq(note), at ?? Tone.immediate())
    this.sounding.delete(note)
  }

  /** Monophonic: a new note steals the old one rather than stacking. */
  bassOn(note: MidiNote, velocity = 0.85, at?: number): void {
    if (!this.started) return
    const time = at ?? Tone.immediate()
    this.bass.triggerAttack(midiToFreq(note), time, velocity)
    this.bassNote = note
  }

  bassOff(at?: number): void {
    if (!this.started || this.bassNote === undefined) return
    this.bass.triggerRelease(at ?? Tone.immediate())
    this.bassNote = undefined
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

  allNotesOff(): void {
    if (!this.started) return
    for (const synth of this.synths.values()) synth.releaseAll()
    this.bassOff()
    this.sounding.clear()
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
    this.allNotesOff()
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
