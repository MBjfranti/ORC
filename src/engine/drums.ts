/**
 * The kit, and the machine that drives it.
 *
 * Synthesised rather than sampled, which is not a shortcut: every other voice on
 * this instrument is synthesised, a browser app that ships a sample library pays
 * for it on every load, and a synthesised kit follows the Drum FX saturation in
 * a way a rendered sample never quite does. Nine voices is enough for twenty
 * patterns — `core/beats.ts` owns the patterns, this owns the noise.
 *
 * ## The signal path
 *
 *     voices ─► bus ─► saturation ─► reverb ─► destination
 *
 * Both of those are documented as effects in their own right, sitting in the FX
 * dial's own list rather than anywhere near the BPM dial:
 *
 * > "Drum FX Reverb: Adds depth and spatial character to Beats. Drum FX
 * > Saturation: A subtle form of harmonic distortion that adds richness, warmth,
 * > and character to Beats by creating new overtones and performing a gentle
 * > form of compression." — §8.1
 *
 * > "Press the FX Dial and scroll to access Drum FX, where you can customize
 * > reverb and saturation on your drum sound." — §11.4
 *
 * The bus gain is the Beat Volume, which is the BPM dial's press-and-turn axis
 * (§11.4) and also `Options → Volumes → Drums`.
 */

import * as Tone from 'tone'

import { beatSteps, hitsAt, swingOf } from '../core/beats.js'
import type { Beat, DrumVoice } from '../core/beats.js'
import { stepTicks, ticksAt } from './clock.js'

/** One drum: something that can be struck at a time, with a velocity. */
interface Piece {
  trigger(time: number, velocity: number): void
}

export class Drums {
  private bus!: Tone.Gain
  private sat!: Tone.Distortion
  private verb!: Tone.Reverb
  private pieces = new Map<DrumVoice, Piece>()

  private beat: Beat | undefined
  private scheduleId: number | undefined

  constructor(destination: Tone.ToneAudioNode) {
    this.build(destination)
  }

  /** The reverb renders its impulse response offline; this is that wait. */
  get ready(): Promise<unknown> {
    return this.verb.ready
  }

  private build(destination: Tone.ToneAudioNode): void {
    // Short and small. Drums want a room, not a hall — a long tail on a kick
    // turns the low end to mud, which is exactly what §8.1 means by "depth and
    // spatial character" rather than "reverb".
    this.verb = new Tone.Reverb({ decay: 1.1, preDelay: 0.008, wet: 0 }).connect(destination)

    // "A gentle form of compression" is the giveaway: the point is glue, not
    // fuzz, so the drive stays modest and the wet is what the dial moves.
    this.sat = new Tone.Distortion({ distortion: 0.45, oversample: '2x', wet: 0 }).connect(this.verb)

    this.bus = new Tone.Gain(0.8).connect(this.sat)

    /*
     * Per-voice trim into the bus.
     *
     * These numbers are not guesses. Each voice was played alone on the
     * quarters at full velocity and measured at the master output, then trimmed
     * towards a kit balance: the kick loudest, the snare just under it, hats and
     * shaker well below so sixteenths sit under the groove rather than on top
     * of it. Written by ear-shaped intent and checked by measurement, because
     * the synthesis parameters make some of these wildly louder than others for
     * reasons that have nothing to do with how loud a drum should be.
     */
    const into = (node: Tone.ToneAudioNode, gain: number) =>
      node.connect(new Tone.Gain(gain).connect(this.bus))

    // --- kick ---------------------------------------------------------------
    // A pitch envelope collapsing from a click into a body is the whole trick,
    // and `pitchDecay` is how fast it falls. Slower reads as an 808, faster as
    // an acoustic kick; this sits between so it works under twenty styles.
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.048,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.12 },
    })
    into(kick, 0.9)
    this.pieces.set('kick', {
      trigger: (t, v) => kick.triggerAttackRelease('C1', 0.32, t, v),
    })

    // --- snare --------------------------------------------------------------
    // Two parts, because a snare is two things: a band of noise for the wires
    // and a short tuned body for the drum. Noise alone is a hiss and body alone
    // is a tom.
    const snareNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.02 },
    })
    into(snareNoise.connect(new Tone.Filter(1700, 'bandpass')), 1.3)
    const snareBody = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.02 },
    })
    into(snareBody, 0.95)
    this.pieces.set('snare', {
      trigger: (t, v) => {
        snareNoise.triggerAttackRelease(0.14, t, v)
        snareBody.triggerAttackRelease(190, 0.08, t, v * 0.8)
      },
    })

    // --- rim ----------------------------------------------------------------
    // A cross-stick: woody, almost pitched, and over before you notice it.
    const rim = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.0005, decay: 0.028, sustain: 0, release: 0.01 },
    })
    into(rim.connect(new Tone.Filter(1900, 'bandpass')), 0.86)
    this.pieces.set('rim', { trigger: (t, v) => rim.triggerAttackRelease(880, 0.02, t, v) })

    // --- clap ---------------------------------------------------------------
    // The three-slap attack is what separates a clap from a burst of noise: real
    // hands never land together, and drum machines have imitated that since the
    // CR-78. Three short bursts a few milliseconds apart, then the tail.
    const clapNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.02 },
    })
    into(clapNoise.connect(new Tone.Filter(1150, 'bandpass')), 0.6)
    this.pieces.set('clap', {
      trigger: (t, v) => {
        clapNoise.triggerAttackRelease(0.012, t, v * 0.6)
        clapNoise.triggerAttackRelease(0.012, t + 0.011, v * 0.75)
        clapNoise.triggerAttackRelease(0.16, t + 0.022, v)
      },
    })

    // --- hats ---------------------------------------------------------------
    // One high-passed noise source per hat rather than one shared between them:
    // an open hat is meant to ring through the closed hat that follows it, and a
    // single monophonic voice would choke its own tail every sixteenth.
    const closed = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.036, sustain: 0, release: 0.01 },
    })
    into(closed.connect(new Tone.Filter(7800, 'highpass')), 0.72)
    this.pieces.set('hat', { trigger: (t, v) => closed.triggerAttackRelease(0.03, t, v) })

    const open = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.06 },
    })
    into(open.connect(new Tone.Filter(6200, 'highpass')), 0.45)
    this.pieces.set('open', { trigger: (t, v) => open.triggerAttackRelease(0.28, t, v) })

    // --- ride ---------------------------------------------------------------
    // The one voice worth a MetalSynth: six detuned square waves through a
    // bandpass is what a cymbal actually is, and filtered noise cannot fake the
    // inharmonic ping that a jazz ride is played for.
    const ride = new Tone.MetalSynth({
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4200,
      octaves: 1.4,
      envelope: { attack: 0.001, decay: 0.5, release: 0.2 },
    })
    // Loud for a cymbal, because on `20 Brush Jazz` the ride *is* the pattern —
    // there is no backbeat to carry it.
    into(ride, 0.34)
    /*
     * **Four arguments, not three.** `MetalSynth extends Monophonic`, so it
     * inherits `triggerAttackRelease(note, duration, time, velocity)` — unlike
     * `NoiseSynth`, which takes `(duration, time, velocity)` because it has no
     * pitch to set. Written with three the ride was silent for a week's worth
     * of work: the duration landed in `note` and tuned the cymbal to 0.4 Hz.
     *
     * TypeScript cannot catch it. `Frequency` and `Time` both accept a plain
     * number, so every argument slid one place along and still typechecked.
     */
    this.pieces.set('ride', { trigger: (t, v) => ride.triggerAttackRelease(320, 0.4, t, v) })

    // --- tom ----------------------------------------------------------------
    const tom = new Tone.MembraneSynth({
      pitchDecay: 0.09,
      octaves: 3,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    })
    into(tom, 0.52)
    this.pieces.set('tom', { trigger: (t, v) => tom.triggerAttackRelease('A2', 0.25, t, v) })

    // --- shaker -------------------------------------------------------------
    // Pink noise, because a shaker has a body a hi-hat does not — white noise up
    // here just sounds like a hat played quietly.
    const shaker = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.02 },
    })
    into(shaker.connect(new Tone.Filter(4800, 'highpass')), 1.0)
    this.pieces.set('shaker', { trigger: (t, v) => shaker.triggerAttackRelease(0.05, t, v) })
  }

  // --- transport -------------------------------------------------------------

  /**
   * Play a beat, or none.
   *
   * Scheduled as a repeat at the pattern's own subdivision, so it follows the
   * master clock without being re-armed — "turn the BPM Dial to change the tempo
   * of Beats" costs nothing here, which is the point of one clock driving
   * everything (research/08 §Master clock).
   *
   * **Which step plays is read off the clock, not counted.** A counter starting
   * at zero whenever you pressed the dial put the pattern's downbeat at an
   * arbitrary sixteenth of the bar, so the beat, the metronome and the loop each
   * ran on their own private grid — and a loop recorded against the beat came
   * back half a bar out from it, with nothing on screen to explain why.
   *
   * Deriving the step from transport time anchors every pattern to the one grid
   * at transport zero. Starting a beat mid-bar drops you into the middle of it,
   * which is what any drum machine slaved to a clock does, and swapping beats
   * keeps phase for free rather than by remembering to.
   */
  setBeat(beat: Beat | undefined): void {
    if (beat === this.beat) return
    this.beat = beat

    if (!beat) {
      this.unschedule()
      return
    }
    this.unschedule()

    this.scheduleId = Tone.getTransport().scheduleRepeat((time) => {
      const current = this.beat
      if (!current) return
      /*
       * The step comes from the transport's own tick position, which is the
       * only clock that means anything musically. `time` is audio time — close
       * to transport seconds and equal to neither once the tempo has moved —
       * so it is converted rather than divided.
       */
      const total = beatSteps(current)
      const at = ((Math.round(ticksAt(time) / stepTicks(current)) % total) + total) % total
      // A step's length in *seconds* is what swing needs, and it is read every
      // time rather than cached, because the tempo moves underneath a running
      // beat — "turn the BPM Dial to change the tempo of Beats" (§11.4).
      const lag = swingOf(current, at) * Tone.Time(current.step).toSeconds()
      for (const hit of hitsAt(current, at)) {
        this.pieces.get(hit.voice)?.trigger(time + lag, hit.velocity)
      }
    }, beat.step)
  }

  private unschedule(): void {
    if (this.scheduleId !== undefined) Tone.getTransport().clear(this.scheduleId)
    this.scheduleId = undefined
  }

  /**
   * Strike one voice directly, outside any pattern.
   *
   * The metronome borrows the closed hat for its `Hi Hat` setting, which is why
   * this exists — and it deliberately reaches past the drum bus, because the
   * click is not part of the beat and Beat Volume must not be able to silence
   * it.
   */
  hit(voice: DrumVoice, time: number, velocity: number): void {
    this.pieces.get(voice)?.trigger(time, velocity)
  }

  /** Beat Volume — the BPM dial's press-and-turn (§11.4). */
  setLevel(level: number): void {
    this.bus.gain.rampTo(clamp01(level), 0.05)
  }

  /** Drum FX Reverb (§8.1). */
  setReverb(wet: number): void {
    this.verb.wet.rampTo(clamp01(wet), 0.08)
  }

  /** Drum FX Saturation (§8.1). */
  setSaturation(wet: number): void {
    this.sat.wet.rampTo(clamp01(wet), 0.08)
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
