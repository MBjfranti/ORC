/**
 * The sound library.
 *
 * Fifty numbered presets across three engines, which is how the instrument
 * itself is built: the engines are few and conventional, and the *library* is
 * where the character lives. A preset is not a synthesis patch you edit — it is
 * a starting point you browse, with the filter, the effects and the performance
 * setting layered on top.
 *
 * ## Where the numbers come from
 *
 * The waveform, envelope, harmonicity, modulation index and modulation envelope
 * of every preset are derived from the General MIDI timbre table in
 * **webaudio-tinysynth** by Tatsuya Shinyagaito (g200kg), used under the Apache
 * License 2.0. Each entry names the GM program it came from, so any value here
 * can be read back against the source table.
 *
 * The **cutoff, the effects and the trim are ours** — tinysynth has no filter
 * and no effects at all. The cutoff is derived rather than picked (see below);
 * the effects and trim are voiced by hand so every preset arrives playable
 * without touching a knob.
 *
 * The conversion, worked out by reading both synths rather than by ear:
 *
 *  - `harmonicity` is the modulator's frequency ratio `t`. Both synths define
 *    it the same way, so it copies straight across.
 *  - `index` is the modulator's level `v`. In tinysynth the modulator's gain is
 *    scaled by the carrier frequency, so peak deviation is `v × fc`; Tone
 *    multiplies `frequency × modulationIndex` for the same node. They are the
 *    same quantity under different names.
 *  - `decay` and `release` are **time constants**, exactly as the source table
 *    writes them — see the note on `Sound` below.
 *
 * ## Naming
 *
 * Telepathic's own sounds are called things like `Cosmic Day Spa`,
 * `Millionaire` and `Trout` — evocative, slightly absurd, never technical.
 * Nothing here is `FM Bell 2`; the names come from history, from the instrument
 * itself, or from where it gets played. That costs nothing and is a large part
 * of why the instrument feels like an instrument rather than a parameter set
 * (research/07 §Known presets, research/14).
 */

/** The three engines. Conventional on purpose; the library does the work. */
export type Engine = 'sub' | 'fm' | 'ep'

export interface Sound {
  readonly name: string
  readonly engine: Engine
  /** Oscillator shape for the subtractive engine. */
  readonly wave?: 'sawtooth' | 'square' | 'triangle' | 'sine' | 'fatsawtooth' | 'pwm'
  /** Base filter cutoff in Hz, before the Colour dial moves it. */
  readonly cutoff: number
  readonly attack: number
  /**
   * Decay **time constant** in seconds, not a duration.
   *
   * The source table decays by exponential approach, so `decay` here is the
   * `setTargetAtTime` time constant it uses, copied verbatim. Tone wants a
   * duration instead and derives its own constant from it, so `synth.ts`
   * converts once, in one place. Keeping the source's units means every number
   * in this file can be checked against the GM table it came from — expressed
   * in Tone's units, a Rhodes' 0.7 would read as 39.8.
   */
  readonly decay: number
  readonly sustain: number
  /** Release time constant, same convention as `decay`. */
  readonly release: number
  /** FM/EP only: the ratio between carrier and modulator, and how hard it hits. */
  readonly harmonicity?: number
  readonly index?: number
  /**
   * FM/EP only: the modulator's own envelope — where the *timbre* moves.
   *
   * This is what separates a struck sound from a held one. A vibraphone's
   * modulator collapses in a few milliseconds, leaving a sine body; a brass
   * section's holds up and keeps the tone buzzing for as long as the note does.
   * Without it every FM preset has one fixed brightness and they all blur
   * together, which is what the previous, invented library did.
   */
  readonly modAttack?: number
  readonly modDecay?: number
  readonly modSustain?: number
  readonly modRelease?: number
  /** The effects the patch arrives with — a sound carries its own space. */
  readonly reverb: number
  readonly chorus: number
  readonly delay: number
  /** Trim, in dB, so loud patches do not jump out of the browse list. */
  readonly volume: number
}

/** `[attack, decay, sustain, release]`, decay and release as time constants. */
type Env = [number, number, number, number]
/** `[reverb, chorus, delay]`, each a wet level. */
type Fx = [number, number, number]

const sub = (
  name: string,
  wave: NonNullable<Sound['wave']>,
  cutoff: number,
  env: Env,
  fx: Fx,
  volume: number,
): Sound => ({
  name,
  engine: 'sub',
  wave,
  cutoff,
  attack: env[0],
  decay: env[1],
  sustain: env[2],
  release: env[3],
  reverb: fx[0],
  chorus: fx[1],
  delay: fx[2],
  volume,
})

const modulated =
  (engine: 'fm' | 'ep') =>
  (
    name: string,
    harmonicity: number,
    index: number,
    cutoff: number,
    env: Env,
    mod: Env,
    fx: Fx,
    volume: number,
  ): Sound => ({
    name,
    engine,
    harmonicity,
    index,
    cutoff,
    attack: env[0],
    decay: env[1],
    sustain: env[2],
    release: env[3],
    modAttack: mod[0],
    modDecay: mod[1],
    modSustain: mod[2],
    modRelease: mod[3],
    reverb: fx[0],
    chorus: fx[1],
    delay: fx[2],
    volume,
  })

const fm = modulated('fm')

/**
 * A Rhodes is best synthesised as 2-operator FM, so `ep` is the same
 * architecture as `fm` with a struck envelope. It stays a separate engine
 * because the browse list groups by it and because switching engines has to cut
 * sounding notes; the split is curatorial, not architectural.
 */
const ep = modulated('ep')

/**
 * Fifty sounds, in browse order.
 *
 * Ordered so that turning the dial travels somewhere rather than shuffling:
 * keys, then tuned percussion, organs, plucked things, strings, winds, brass,
 * voices, leads, and pads at the far end. The comment on each line is the GM
 * program its numbers were derived from.
 */
export const SOUNDS: readonly Sound[] = [
  // --- keys ---------------------------------------------------------------
  ep("Suitcase '73", 7, 3, 8000, [0.002, 0.7, 0, 0.05], [0.001, 0.8, 1, 0.05], [0.26, 0.22, 0], -14.58), // GM 5 Electric Piano 1
  ep('Millionaire', 7, 8, 8000, [0.002, 0.7, 0, 0.05], [0.001, 0.5, 1, 0.05], [0.22, 0.16, 0.1], -14.58), // GM 6 Electric Piano 2
  ep('Parlour Upright', 1, 3, 1550, [0.002, 0.7, 0, 0.1], [0.01, 0.7, 0.1, 0.05], [0.2, 0.06, 0], -14), // GM 1 Acoustic Grand Piano
  ep('Saloon Tuesday', 3, 4, 5900, [0.002, 0.7, 0, 0.05], [0.01, 0.3, 0.5, 0.05], [0.16, 0.3, 0], -17.01), // GM 4 Honky-tonk Piano
  ep('Powdered Wig', 1, 8, 6300, [0.002, 0.8, 0.28, 0.05], [0.001, 0.8, 1, 0.3], [0.24, 0.04, 0], -14.71), // GM 7 Harpsichord
  ep('Funk Cabinet', 1, 6, 2750, [0.002, 0.8, 0.17, 0.05], [0.001, 0.8, 0.59, 0.3], [0.12, 0.2, 0.08], -14.71), // GM 8 Clavi

  // --- tuned percussion ---------------------------------------------------
  fm('Hotel Lobby', 5, 11, 8000, [0.002, 0.6, 0, 0.3], [0.001, 0.01, 0.5, 0.05], [0.3, 0.34, 0.06], -20.01), // GM 12 Vibraphone
  fm('Wind-Up Lullaby', 5, 11, 8000, [0.002, 0.3, 0, 0.3], [0.001, 0.1, 0.4, 0.05], [0.34, 0.06, 0.12], -20.01), // GM 11 Music Box
  fm('Rosewood Rain', 5, 6, 8000, [0.002, 0.2, 0, 0.2], [0.001, 0.02, 0, 0.05], [0.24, 0.08, 0.1], -18.25), // GM 13 Marimba
  fm('Sugarplum', 11, 7, 8000, [0.002, 0.3, 0, 0.3], [0.001, 0.03, 0, 0.05], [0.32, 0.1, 0.14], -16.03), // GM 9 Celesta
  fm('Porch Kalimba', 12, 22, 8000, [0.002, 0.2, 0, 0.2], [0.001, 0.1, 0, 0.1], [0.28, 0.05, 0.1], -17), // GM 109 Kalimba
  fm('Bell Tower', 3.5, 11, 8000, [0.002, 0.8, 0.05, 0.3], [0.001, 0.8, 0.05, 0.3], [0.42, 0.08, 0.16], -20.01), // GM 15 Tubular Bells

  // --- organs and reeds ---------------------------------------------------
  sub('Drawbars Out', 'sawtooth', 1550, [0.002, 0.01, 0.9, 0.05], [0.18, 0.26, 0], -17.6), // GM 17 Drawbar Organ
  sub('Roadhouse Organ', 'sawtooth', 1550, [0.002, 0.1, 0.9, 0.05], [0.2, 0.4, 0], -18.01), // GM 19 Rock Organ
  sub('Cold Cathedral', 'sawtooth', 1550, [0.04, 0.01, 0.9, 0.05], [0.56, 0.12, 0], -16.25), // GM 20 Church Organ
  fm('Accordion Cafe', 3, 10.5, 8000, [0.02, 0.05, 0.8, 0.05], [0.001, 0.05, 1, 0.05], [0.18, 0.42, 0], -20.01), // GM 22 Accordion
  fm('Boxcar Harp', 1, 2, 4700, [0.02, 0.2, 0.5, 0.05], [0.001, 0.03, 1, 0.05], [0.24, 0.3, 0.12], -20.01), // GM 23 Harmonica

  // --- plucked ------------------------------------------------------------
  fm('Nylon Courtyard', 3, 5, 7050, [0.002, 0.5, 0, 0.05], [0.001, 0.8, 0.14, 0.05], [0.26, 0.08, 0], -18.25), // GM 25 Acoustic Guitar (nylon)
  fm('Surf Motel', 3, 11, 8000, [0.002, 0.8, 0.05, 0.05], [0.001, 0.4, 0.5, 0.05], [0.3, 0.24, 0.22], -18.25), // GM 28 Electric Guitar (clean)
  fm('Garage Door', 1, 4, 2350, [0.002, 0.8, 0.05, 0.05], [0.001, 0.8, 0.72, 0.05], [0.16, 0.12, 0.08], -17), // GM 30 Overdriven Guitar
  fm('Raga Hour', 5, 11, 8000, [0.002, 0.5, 0, 0.3], [0.001, 0.05, 0, 0.05], [0.34, 0.1, 0.14], -18.25), // GM 105 Sitar
  fm('Gilded Harp', 2, 7, 6300, [0.002, 0.5, 0, 0.3], [0.001, 0.8, 0.05, 0.3], [0.4, 0.14, 0.1], -18.25), // GM 47 Orchestral Harp

  // --- strings ------------------------------------------------------------
  fm('First Chair', 1, 5, 6300, [0.1, 0.8, 0.79, 0.05], [0.001, 0.8, 0.83, 0.05], [0.34, 0.16, 0], -17), // GM 41 Violin
  fm('Bow and Rosin', 0.5, 5, 6300, [0.1, 0.8, 0.79, 0.05], [0.001, 0.8, 0.83, 0.05], [0.36, 0.12, 0], -17), // GM 43 Cello
  fm('Tremolo Fog', 1, 6.6, 3000, [0.1, 0.8, 0.79, 0.05], [0.001, 0.05, 1, 0.05], [0.44, 0.2, 0], -17), // GM 45 Tremolo Strings
  fm('Tiptoe Pizz', 3, 4, 5900, [0.002, 0.1, 0, 0.1], [0.001, 0.8, 0.24, 0.05], [0.28, 0.06, 0.12], -18.25), // GM 46 Pizzicato Strings
  sub('Rented Tuxedo', 'sawtooth', 6300, [0.03, 0.01, 0.5, 0.05], [0.44, 0.38, 0], -16.25), // GM 49 String Ensemble 1
  sub('Cheap Strings', 'sawtooth', 6300, [0.02, 0.01, 1, 0.05], [0.36, 0.5, 0.06], -18.01), // GM 51 SynthStrings 1

  // --- winds --------------------------------------------------------------
  fm('Silver Breath', 2, 4, 3900, [0.03, 0.4, 0.4, 0.05], [0.001, 0.4, 0, 0.05], [0.34, 0.14, 0.08], -14.57), // GM 74 Flute
  fm('Fangorn Forest', 2, 7, 6300, [0.06, 0.3, 0.3, 0.05], [0.001, 0.2, 0.2, 0.05], [0.46, 0.18, 0.2], -17), // GM 76 Pan Flute
  fm("Shepherd's Hour", 2, 1, 1550, [0.02, 0.8, 0.28, 0.05], [0.001, 0.02, 0, 0.05], [0.4, 0.1, 0.16], -14.57), // GM 80 Ocarina
  fm('Licorice Stick', 1, 4.4, 4700, [0.05, 0.1, 0.8, 0.05], [0.001, 0.1, 1, 0.05], [0.26, 0.12, 0], -20.01), // GM 72 Clarinet
  fm('Fagotto', 1, 7, 3150, [0.03, 0.2, 0.4, 0.05], [0.001, 0.8, 0.14, 0.05], [0.28, 0.08, 0], -18.25), // GM 71 Bassoon
  fm('Tuning Note', 2, 5, 4700, [0.02, 0.7, 0.5, 0.05], [0.001, 0.2, 0.5, 0.05], [0.24, 0.06, 0], -17), // GM 69 Oboe
  fm('Wandering Monk', 2, 8, 7050, [0.02, 0.8, 0.35, 0.05], [0.001, 0.5, 0, 0.05], [0.48, 0.1, 0.24], -17), // GM 78 Shakuhachi

  // --- brass --------------------------------------------------------------
  fm('Reveille', 1, 4, 4700, [0.01, 0.8, 0.62, 0.04], [0.001, 0.1, 1, 0.05], [0.22, 0.08, 0.06], -20.01), // GM 57 Trumpet
  fm('Harmon Mute', 1, 2, 4700, [0.04, 0.01, 1, 0.05], [0.001, 0.1, 0, 0.05], [0.3, 0.1, 0.14], -21), // GM 60 Muted Trumpet
  fm('Hunting Horn', 1, 4, 4700, [0.02, 0.8, 0.53, 0.08], [0.001, 0.1, 1, 0.05], [0.38, 0.12, 0], -20.01), // GM 61 French Horn
  fm('Miami Exterior', 1, 4, 4700, [0.02, 0.8, 0.62, 0.08], [0.001, 0.1, 1, 0.05], [0.2, 0.24, 0.1], -20.01), // GM 62 Brass Section

  // --- voices -------------------------------------------------------------
  fm('Vaulted Choir', 5, 3, 7850, [0.03, 0.01, 1, 0.05], [0.001, 0.8, 1, 0.05], [0.5, 0.3, 0], -18.25), // GM 53 Choir Aahs
  fm('Streetlight Ooh', 2, 1, 1550, [0.03, 0.01, 0.9, 0.05], [0.001, 0.03, 0.2, 0.05], [0.42, 0.26, 0.08], -17), // GM 54 Voice Oohs

  // --- leads --------------------------------------------------------------
  //
  // The five names Telepathic publish under "Lead" (research/07): Lemon, DX
  // Guitar, Trout, Plumerai La Tete and Cosmic Day Spa. Category is the one
  // documented fact about them, and it is the thing an earlier pass got wrong
  // by building all five as plucks and pads. They are drawn from the GM lead
  // programs here, so they sustain and sing by construction.
  fm('Lemon', 1, 2, 6300, [0.002, 0.8, 0.64, 0.05], [0.001, 0.01, 0.5, 0.05], [0.2, 0.18, 0.22], -18.25), // GM 82 Lead 2 (sawtooth)
  fm('DX Guitar', 11, 11, 8000, [0.002, 0.8, 0.53, 0.05], [0.2, 0.05, 0.3, 0.05], [0.18, 0.24, 0.16], -18.25), // GM 85 Lead 5 (charang)
  fm('Trout', 2, 22, 8000, [0.01, 0.8, 0.49, 0.05], [0.001, 0.03, 0.2, 0.05], [0.26, 0.14, 0.26], -18.25), // GM 84 Lead 4 (chiff)
  fm('Plumerai La Tete', 1, 7, 3150, [0.06, 0.8, 0.53, 0.05], [0.001, 0.8, 0.24, 0.05], [0.28, 0.3, 0.2], -18.25), // GM 86 Lead 6 (voice)
  fm('Cosmic Day Spa', 2, 4, 3900, [0.05, 0.8, 0.71, 0.05], [0.001, 0.01, 0, 0.05], [0.44, 0.46, 0.18], -16.03), // GM 83 Lead 3 (calliope)
  sub('Fifth Ghost', 'sawtooth', 6300, [0.03, 0.7, 0.3, 0.2], [0.32, 0.28, 0.34], -16.25), // GM 87 Lead 7 (fifths)

  // --- pads ---------------------------------------------------------------
  fm('Wool', 1, 2, 1200, [0.05, 0.8, 0.72, 0.3], [0.001, 0.3, 1, 0.05], [0.4, 0.3, 0.06], -18.25), // GM 90 Pad 2 (warm)
  fm('Tape Choir', 4, 2, 4700, [0.08, 0.8, 0.34, 0.1], [0.08, 0.3, 0.3, 0.05], [0.46, 0.5, 0.1], -18.25), // GM 92 Pad 4 (choir)
  fm('Slow Weather', 1, 8, 3550, [0.05, 0.8, 0.79, 0.3], [0.001, 0.8, 1, 0.05], [0.52, 0.44, 0.12], -18.25), // GM 96 Pad 8 (sweep)
]

/**
 * A decay or release time constant, converted into Tone's units.
 *
 * The library stores time constants because that is what its source table
 * stores, and keeping them makes every preset checkable against it. Tone's
 * exponential envelope segments take a *duration* instead and derive their own
 * constant as `ln(D+1) / ln(200)`, so inverting that is the whole conversion.
 *
 * The results look alarming and are not: a Rhodes' 0.7s constant becomes a
 * decay of 39.8, which does not mean a forty-second note. It means the level
 * falls by 1/e every 0.7s, and the note is long gone before the segment would
 * nominally end. Capped so a very slow tail cannot schedule automation absurdly
 * far into the future.
 */
export const decayFor = (tau: number) => Math.min(Math.pow(200, tau) - 1, 120)

/** `01`–`50`, the way the panel numbers them. */
export const soundNumber = (index: number) => String(index + 1).padStart(2, '0')

export const soundAt = (index: number): Sound =>
  SOUNDS[Math.max(0, Math.min(SOUNDS.length - 1, index))]!

/** `07 Cosmic Day Spa` — number and name, as the browse list shows it. */
export const soundLabel = (index: number) => `${soundNumber(index)} ${soundAt(index).name}`
