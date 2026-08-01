/**
 * The beat machine and metronome.
 *
 * Drums are synthesised rather than sampled — zero asset weight, and it suits
 * an instrument with a preset called `ORC808`. Each voice is a few oscillators
 * and an envelope; the 808 lineage is all short pitch sweeps and filtered noise.
 *
 * Runs on `Tone.Transport` so it shares one clock with the arpeggiator and the
 * looper. See research/08-looper-and-beats.md.
 */

import * as Tone from 'tone'

import { BEATS, stepSeconds, swingOffset, voicesAt } from '../core/beats.js'
import type { Beat, DrumVoice } from '../core/beats.js'
import { DEFAULT_TIME_SIGNATURE, stepsPerBar } from '../core/timeSignature.js'
import type { TimeSignature } from '../core/timeSignature.js'

export type MetronomeSound = 'beep' | 'hat'

export class DrumMachine {
  private out!: Tone.Gain
  /**
   * Drum FX — "Press the FX Dial and scroll to access Drum FX, where you can
   * customize reverb and saturation on your drum sound" (§11.4).
   *
   * They sit on the beat bus alone, which is the point: the chord rack's
   * reverb would smear the kick, and these are the two the manual names.
   */
  private drumReverb!: Tone.Reverb
  private drumSaturation!: Tone.Distortion
  private kick!: Tone.MembraneSynth
  private tom!: Tone.MembraneSynth
  private snare!: Tone.NoiseSynth
  private clap!: Tone.NoiseSynth
  private hat!: Tone.MetalSynth
  private openhat!: Tone.MetalSynth
  private rim!: Tone.MetalSynth
  private click!: Tone.Synth

  private loop: Tone.Loop | undefined
  private step = 0
  private beat: Beat = BEATS[0]!
  private built = false
  private running = false

  /** Count-in clicks left to play, driven by the looper rather than a pattern. */
  private countInSteps = 0
  /** A free-running click, independent of any Beat (§11.2). */
  private metronome = false
  private timeSignature: TimeSignature = DEFAULT_TIME_SIGNATURE
  private metronomeSound: MetronomeSound = 'beep'

  build(): void {
    if (this.built) return

    this.drumReverb = new Tone.Reverb({ decay: 1.4, wet: 0 }).toDestination()
    this.drumSaturation = new Tone.Distortion({ distortion: 0.6, wet: 0 }).connect(this.drumReverb)
    this.out = new Tone.Gain(0.8).connect(this.drumSaturation)

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.02 },
    }).connect(this.out)

    this.tom = new Tone.MembraneSynth({
      pitchDecay: 0.09,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.02 },
    })
      .set({ volume: -6 })
      .connect(this.out)

    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    })
      .set({ volume: -10 })
      .connect(this.out)

    // A clap is a snare with a longer, softer tail — no transient snap.
    this.clap = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.004, decay: 0.24, sustain: 0 },
    })
      .set({ volume: -9 })
      .connect(this.out)

    this.hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.045, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 6000,
      octaves: 1.5,
    })
      .set({ volume: -24 })
      .connect(this.out)

    this.openhat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.34, release: 0.08 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 5000,
      octaves: 1.5,
    })
      .set({ volume: -26 })
      .connect(this.out)

    this.rim = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.03, release: 0.01 },
      harmonicity: 12,
      modulationIndex: 16,
      resonance: 9000,
      octaves: 0.8,
    })
      .set({ volume: -22 })
      .connect(this.out)

    this.click = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    })
      .set({ volume: -12 })
      .connect(this.out)

    this.built = true
    this.schedule()
  }

  get isRunning(): boolean {
    return this.running
  }

  /**
   * Position in the bar, 0–15, for the grid's playhead.
   *
   * Reads the transport rather than the loop's own counter: the counter runs
   * ahead by the scheduler's lookahead, so using it would show the playhead
   * sitting a step or two to the right of what you can hear.
   */
  get currentStep(): number {
    if (!this.built) return -1
    const bpm = Tone.getTransport().bpm.value
    const step = Math.floor(Tone.getTransport().seconds / stepSeconds(bpm))
    return ((step % 16) + 16) % 16
  }

  get current(): Beat {
    return this.beat
  }

  setBeat(beat: Beat): void {
    this.beat = beat
  }

  /** Wet amount, 0-1, for one of the two drum effects. */
  setDrumFx(type: 'drumReverb' | 'drumSaturation', amount: number): void {
    if (!this.built) return
    const node = type === 'drumReverb' ? this.drumReverb : this.drumSaturation
    node.wet.rampTo(Math.max(0, Math.min(1, amount)), 0.08)
  }

  setTimeSignature(ts: TimeSignature): void {
    this.timeSignature = ts
  }

  setMetronome(on: boolean): void {
    this.metronome = on
  }

  setMetronomeSound(sound: MetronomeSound): void {
    this.metronomeSound = sound
  }

  start(): void {
    this.running = true
    this.step = 0
  }

  stop(): void {
    this.running = false
  }

  setVolume(db: number): void {
    if (this.built) this.out.gain.rampTo(Math.pow(10, db / 20), 0.05)
  }

  /**
   * Click for `bars` bars, whether or not a beat is playing.
   *
   * The looper's count-in was silent before this existed — you were expected to
   * come in on time against nothing at all.
   */
  countIn(bars: number): void {
    this.countInSteps = bars * stepsPerBar(this.timeSignature)
    this.step = 0
  }

  /**
   * One loop at the sixteenth-note grid, re-reading the tempo each tick.
   *
   * Scheduling per-step rather than per-bar means changing beat or tempo takes
   * effect immediately, and swing can push individual steps late without the
   * grid itself drifting.
   */
  private schedule(): void {
    this.loop = new Tone.Loop((time) => {
      const bpm = Tone.getTransport().bpm.value
      const spacing = stepSeconds(bpm)

      if (this.countInSteps > 0) {
        // Accent the downbeat so you can hear where the bar starts.
        if (this.step % 4 === 0) {
          this.playClick(time, this.step % stepsPerBar(this.timeSignature) === 0)
        }
        this.countInSteps--
        this.step++
        return
      }

      // The metronome is its own thing, not a Beat: it keeps time whether or
      // not a pattern is playing, which is what makes it useful for looping.
      if (this.metronome) {
        // Accent the downbeat — which is a property of the meter, not a
        // hard-coded sixteen steps.
        const perBar = stepsPerBar(this.timeSignature)
        if (this.step % 4 === 0) this.playClick(time, this.step % perBar === 0)
      }

      if (this.running) {
        const at = time + swingOffset(this.beat, this.step) * spacing
        for (const voice of voicesAt(this.beat, this.step)) this.hit(voice, at)
      }

      this.step++
    }, '16n').start(0)
  }

  private playClick(time: number, accent: boolean): void {
    if (this.metronomeSound === 'hat') {
      this.hat.triggerAttackRelease('32n', time, accent ? 0.9 : 0.5)
      return
    }
    this.click.triggerAttackRelease(accent ? 1760 : 880, 0.03, time, accent ? 0.9 : 0.55)
  }

  private hit(voice: DrumVoice, time: number): void {
    switch (voice) {
      case 'kick':
        this.kick.triggerAttackRelease('C1', '8n', time)
        break
      case 'tom':
        this.tom.triggerAttackRelease('G2', '8n', time)
        break
      case 'snare':
        this.snare.triggerAttackRelease('16n', time)
        break
      case 'clap':
        this.clap.triggerAttackRelease('16n', time)
        break
      case 'hat':
        this.hat.triggerAttackRelease('32n', time, 0.6)
        break
      case 'openhat':
        this.openhat.triggerAttackRelease('8n', time, 0.5)
        break
      case 'rim':
        this.rim.triggerAttackRelease('32n', time, 0.7)
        break
    }
  }

  dispose(): void {
    this.loop?.stop().dispose()
    this.loop = undefined
    this.built = false
    this.running = false
  }
}
