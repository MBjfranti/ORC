/**
 * The sound library.
 *
 * Fifty numbered presets across three engines, which is how the instrument
 * itself is built: the engines are few and conventional, and the *library* is
 * where the character lives. A preset is not a synthesis patch you edit — it is
 * a starting point you browse, with the filter, the effects and the performance
 * setting layered on top.
 *
 * The naming is deliberate. Telepathic's own sounds are called things like
 * `Cosmic Day Spa`, `Millionaire` and `Trout` — evocative, slightly absurd,
 * never technical. Nothing here is `FM Bell 2`. That costs nothing and is a
 * large part of why the instrument feels like an instrument rather than a
 * parameter set, so it is worth copying exactly (research/07 §Known presets).
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
  readonly decay: number
  readonly sustain: number
  readonly release: number
  /** FM/EP only: the ratio between carrier and modulator, and how hard it hits. */
  readonly harmonicity?: number
  readonly index?: number
  /** The effects the patch arrives with — a sound carries its own space. */
  readonly reverb: number
  readonly chorus: number
  readonly delay: number
  /** Trim, in dB, so loud patches do not jump out of the browse list. */
  readonly volume: number
}

const sub = (
  name: string,
  wave: NonNullable<Sound['wave']>,
  cutoff: number,
  env: [number, number, number, number],
  fx: [number, number, number],
  volume = -15,
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

const fm = (
  name: string,
  harmonicity: number,
  index: number,
  cutoff: number,
  env: [number, number, number, number],
  fx: [number, number, number],
  volume = -17,
): Sound => ({
  name,
  engine: 'fm',
  harmonicity,
  index,
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

const ep = (
  name: string,
  harmonicity: number,
  index: number,
  cutoff: number,
  env: [number, number, number, number],
  fx: [number, number, number],
  volume = -14,
): Sound => ({
  name,
  engine: 'ep',
  harmonicity,
  index,
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

/**
 * Fifty sounds, in browse order.
 *
 * Roughly grouped so turning the dial travels somewhere rather than shuffling:
 * keys and pianos first, then pads, then plucks and bells, then organs and
 * reeds, then the strange ones at the top of the list where you find them by
 * accident.
 */
export const SOUNDS: readonly Sound[] = [
  // --- keys ---------------------------------------------------------------
  ep('Sunday Rhodes', 3.01, 11, 2600, [0.002, 1.6, 0.12, 1.8], [0.24, 0.2, 0]),
  ep('Wurly Bird', 2.0, 8, 2200, [0.003, 1.2, 0.16, 1.4], [0.18, 0.28, 0.06]),
  ep('Dyno Suitcase', 3.01, 14, 3400, [0.002, 2.0, 0.1, 2.2], [0.3, 0.34, 0]),
  ep('Millionaire', 4.02, 9, 2900, [0.004, 1.4, 0.2, 1.6], [0.26, 0.16, 0.12]),
  ep('Tine Whisper', 3.5, 5, 1800, [0.006, 2.4, 0.06, 2.6], [0.36, 0.22, 0]),
  ep('Hotel Lobby', 2.01, 12, 2400, [0.002, 1.1, 0.22, 1.3], [0.2, 0.4, 0.08]),

  // --- pads ---------------------------------------------------------------
  sub('Meadow', 'triangle', 1100, [0.45, 0.9, 0.9, 2.2], [0.38, 0.42, 0.04], -14),
  sub('Long Drive Home', 'fatsawtooth', 1800, [0.9, 1.6, 0.8, 3.2], [0.5, 0.44, 0.16], -18),
  sub('Wool', 'triangle', 800, [0.7, 1.0, 0.88, 2.8], [0.34, 0.3, 0], -13),
  sub('Glass Elevator', 'square', 2400, [0.5, 1.4, 0.75, 2.4], [0.44, 0.36, 0.2], -19),
  sub('Slow Weather', 'pwm', 1200, [1.2, 1.8, 0.9, 3.6], [0.52, 0.48, 0.08], -17),
  sub('Tape Choir', 'fatsawtooth', 1600, [0.8, 1.2, 0.82, 2.4], [0.46, 0.52, 0.06], -18),
  sub('Underwater Bank', 'sine', 700, [0.55, 1.5, 0.86, 2.6], [0.4, 0.38, 0.14], -12),

  // --- plucks and bells ---------------------------------------------------
  fm('Cold Bell', 5.02, 14, 4200, [0.001, 1.8, 0.04, 2.4], [0.4, 0.08, 0.12]),
  fm('Music Box', 7.01, 10, 5000, [0.001, 1.2, 0.02, 1.6], [0.34, 0.06, 0.1]),
  fm('Toy Piano', 4.0, 7, 3800, [0.002, 0.6, 0.06, 0.8], [0.2, 0.12, 0]),
  fm('Struck Copper', 2.51, 16, 3000, [0.001, 0.9, 0.05, 1.1], [0.3, 0.1, 0.16]),
  fm('Kalimba', 6.0, 8, 4400, [0.001, 0.5, 0.03, 0.7], [0.28, 0.04, 0.08]),
  fm('Wire Harp', 3.51, 11, 3400, [0.002, 1.4, 0.06, 1.8], [0.36, 0.14, 0.22]),

  // --- organs and reeds ---------------------------------------------------
  sub('Fifth Organ', 'square', 2600, [0.01, 0.2, 0.95, 0.3], [0.2, 0.24, 0], -16),
  sub('Church Damp', 'sine', 1600, [0.06, 0.4, 0.92, 0.8], [0.5, 0.14, 0], -12),
  sub('Reed Pump', 'sawtooth', 1900, [0.02, 0.3, 0.9, 0.4], [0.24, 0.3, 0.04], -16),
  sub('Accordion Cafe', 'sawtooth', 2200, [0.03, 0.25, 0.88, 0.35], [0.18, 0.44, 0], -17),
  sub('Cathedral Toy', 'triangle', 1400, [0.04, 0.5, 0.9, 1.2], [0.56, 0.18, 0.1], -13),

  // --- brass and strings --------------------------------------------------
  sub('Paper Brass', 'sawtooth', 2400, [0.06, 0.6, 0.78, 0.6], [0.24, 0.18, 0.06], -16),
  sub('String Section', 'fatsawtooth', 1700, [0.3, 1.0, 0.85, 1.8], [0.44, 0.4, 0], -18),
  sub('Cheap Strings', 'sawtooth', 1500, [0.18, 0.8, 0.8, 1.2], [0.36, 0.5, 0.08], -17),
  sub('Horn Section', 'square', 2000, [0.08, 0.5, 0.75, 0.5], [0.2, 0.16, 0], -17),

  // --- leads --------------------------------------------------------------
  //
  // The five names Telepathic publish under "Lead" (research/07): Lemon, DX
  // Guitar, Trout, Plumerai La Tete and Cosmic Day Spa. They were built here as
  // plucks and a pad, which is the one thing about them that *is* documented
  // and was the one thing got wrong. A lead sustains and sings — high sustain,
  // long release, present midrange — rather than being struck and gone.
  fm('Lemon', 2.0, 5, 3400, [0.01, 0.6, 0.78, 1.1], [0.2, 0.18, 0.22], -16),
  fm('DX Guitar', 3.0, 7, 2900, [0.006, 0.8, 0.7, 1.0], [0.18, 0.24, 0.14], -16),
  fm('Trout', 1.51, 9, 3100, [0.02, 0.7, 0.72, 1.2], [0.26, 0.14, 0.26], -16),
  fm('Plumerai La Tete', 1.01, 4, 2400, [0.03, 0.9, 0.8, 1.5], [0.28, 0.3, 0.2], -15),
  sub('Cosmic Day Spa', 'fatsawtooth', 2000, [0.12, 0.9, 0.82, 2.0], [0.44, 0.46, 0.18], -16),
  sub('Whistle Lead', 'sine', 3200, [0.01, 0.3, 0.8, 0.5], [0.28, 0.12, 0.3], -13),
  sub('Rubber Lead', 'square', 1800, [0.008, 0.4, 0.7, 0.4], [0.16, 0.2, 0.24], -16),
  sub('Fifth Ghost', 'pwm', 2100, [0.02, 0.6, 0.72, 0.9], [0.32, 0.28, 0.34], -17),
  fm('Talk Box', 2.51, 8, 2600, [0.006, 0.5, 0.6, 0.7], [0.2, 0.22, 0.28]),

  // --- basses (playable up top too) ---------------------------------------
  sub('PBass', 'triangle', 900, [0.008, 0.4, 0.7, 0.4], [0.1, 0.06, 0], -12),
  sub('ORC808', 'sine', 600, [0.004, 0.8, 0.2, 0.9], [0.08, 0, 0], -10),
  sub('Rezdist', 'sawtooth', 1200, [0.006, 0.35, 0.6, 0.3], [0.12, 0.1, 0.06], -16),

  // --- the strange end ----------------------------------------------------
  fm('Broken Radio', 8.03, 18, 2400, [0.003, 0.7, 0.1, 0.9], [0.3, 0.12, 0.4]),
  fm('Dial Tone Choir', 1.0, 2, 1800, [0.4, 1.2, 0.8, 2.0], [0.48, 0.34, 0.16]),
  fm('Insect Radio', 11.02, 20, 5200, [0.001, 0.3, 0.02, 0.5], [0.26, 0.06, 0.44]),
  sub('Vinyl Rest', 'pwm', 900, [1.4, 2.0, 0.9, 3.8], [0.6, 0.4, 0.2], -18),
  fm('Detuned Postcard', 2.03, 6, 2000, [0.02, 0.9, 0.5, 1.4], [0.4, 0.56, 0.3]),
  sub('Sleep Mode', 'sine', 500, [1.8, 2.4, 0.92, 4.0], [0.64, 0.3, 0.12], -12),
  fm('Wrong Number', 3.97, 22, 3000, [0.002, 0.4, 0.08, 0.6], [0.22, 0.1, 0.5]),
  sub('Gravity Well', 'fatsawtooth', 700, [1.0, 2.2, 0.88, 3.4], [0.58, 0.46, 0.24], -18),
  ep('Ghost Rhodes', 3.01, 6, 1600, [0.004, 2.8, 0.08, 3.0], [0.62, 0.3, 0.26]),
  sub('Last Train', 'triangle', 1000, [0.9, 1.8, 0.86, 3.0], [0.54, 0.36, 0.42], -15),
]

/** `01`–`50`, the way the panel numbers them. */
export const soundNumber = (index: number) => String(index + 1).padStart(2, '0')

export const soundAt = (index: number): Sound =>
  SOUNDS[Math.max(0, Math.min(SOUNDS.length - 1, index))]!

/** `07 Cosmic Day Spa` — number and name, as the browse list shows it. */
export const soundLabel = (index: number) => `${soundNumber(index)} ${soundAt(index).name}`
