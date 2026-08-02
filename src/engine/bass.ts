/**
 * The bass sound list.
 *
 * The bass is a **separate, monophonic synth** with its own sound list, its own
 * voicing and its own volume (research/07 §The bass engine). It is not a preset
 * of the treble engine and it does not share its numbering — the documented
 * hardware names run 04–12 while the treble list runs into the 60s, which is
 * how we know the two lists are numbered independently (research/07).
 *
 * ## Why these are authored rather than derived
 *
 * The treble library's numbers come from a General MIDI timbre table
 * (see `sounds.ts`), and none of that transfers here. A GM bass program is a
 * two-operator FM patch; this engine is a `MonoSynth` — one oscillator through
 * a resonant filter with its own envelope. That filter *is* the sound of a bass
 * synth, and there is no source for it, so these twelve are original and are
 * labelled as such rather than dressed up as sourced.
 *
 * Five of the names are not ours to choose. `PBass`, `ORC808`, `Fifth Organ
 * Bass`, `Meadow Bass` and `Rezdist Bass` are real ORC-1 presets recorded at
 * numbers 04, 06, 09, 10 and 12 (research/07 §Known presets), so they sit at
 * exactly those numbers here.
 */

export interface BassSound {
  readonly name: string
  readonly wave: 'sawtooth' | 'square' | 'triangle' | 'sine'
  /**
   * Amplitude envelope, in **plain seconds**.
   *
   * Note the difference from `Sound` in `sounds.ts`, whose decay and release are
   * time constants copied from its source table. These are authored directly
   * against Tone, so they are ordinary durations and are passed through
   * untouched. The two libraries are tested separately for exactly this reason.
   */
  readonly attack: number
  readonly decay: number
  readonly sustain: number
  readonly release: number
  /** Where the filter sits with the envelope closed, in Hz. */
  readonly base: number
  /** How far the envelope opens it, in octaves above `base`. */
  readonly octaves: number
  /** Resonance. Above about 4 this starts to whistle, which is sometimes right. */
  readonly q: number
  /** Filter envelope. Its decay is the "pluck" you hear before the body. */
  readonly filterAttack: number
  readonly filterDecay: number
  readonly filterSustain: number
  readonly volume: number
}

const bass = (
  name: string,
  wave: BassSound['wave'],
  env: [number, number, number, number],
  filter: [number, number, number],
  fenv: [number, number, number],
  volume: number,
): BassSound => ({
  name,
  wave,
  attack: env[0],
  decay: env[1],
  sustain: env[2],
  release: env[3],
  base: filter[0],
  octaves: filter[1],
  q: filter[2],
  filterAttack: fenv[0],
  filterDecay: fenv[1],
  filterSustain: fenv[2],
  volume,
})

/**
 * Twelve bass sounds, in browse order.
 *
 * Acoustic and electric first, then the synthetic ones, so the list travels
 * from the most familiar to the most artificial rather than shuffling.
 */
export const BASS_SOUNDS: readonly BassSound[] = [
  bass('Upright Room', 'triangle', [0.012, 0.35, 0.55, 0.3], [70, 2.2, 1.2], [0.01, 0.25, 0.3], -9),
  bass('Flatwound', 'triangle', [0.008, 0.4, 0.62, 0.25], [80, 2, 1], [0.006, 0.3, 0.35], -9),
  bass('Picked Steel', 'sawtooth', [0.004, 0.3, 0.5, 0.2], [110, 2.8, 2], [0.002, 0.18, 0.25], -11),
  // 04, documented.
  bass('PBass', 'sawtooth', [0.008, 0.35, 0.7, 0.3], [90, 2.4, 1.6], [0.004, 0.26, 0.32], -10),
  bass('Fretless Sigh', 'triangle', [0.03, 0.5, 0.75, 0.5], [85, 2, 1.4], [0.02, 0.35, 0.4], -9),
  // 06, documented. A sine sub with a long tail and almost no filter movement.
  bass('ORC808', 'sine', [0.004, 1.2, 0.2, 0.9], [60, 1.2, 0.8], [0.004, 0.6, 0.5], -7),
  bass('Ladder Sub', 'sawtooth', [0.006, 0.28, 0.55, 0.25], [75, 3.2, 3.2], [0.004, 0.22, 0.18], -11),
  bass('Thumb Slap', 'square', [0.003, 0.18, 0.35, 0.18], [120, 3.6, 3.8], [0.002, 0.1, 0.12], -12),
  // 09, documented. Hollow and sustained, so it sits under a chord like a pedal.
  bass('Fifth Organ Bass', 'square', [0.01, 0.12, 0.9, 0.18], [100, 1.6, 1], [0.01, 0.15, 0.6], -12),
  // 10, documented.
  bass('Meadow Bass', 'triangle', [0.06, 0.6, 0.85, 0.7], [70, 1.8, 0.9], [0.05, 0.4, 0.5], -9),
  bass('Tape Sub', 'sine', [0.02, 0.8, 0.7, 0.6], [65, 1.4, 0.9], [0.02, 0.5, 0.45], -8),
  // 12, documented. Resonant and dirty — the one that bites.
  bass('Rezdist Bass', 'sawtooth', [0.004, 0.25, 0.5, 0.2], [95, 3.8, 5], [0.002, 0.16, 0.15], -12),
]

/**
 * How the bass responds to what you play (research/07 §Bass modes, research/02
 * §Bass encoder). Reached by holding the Bass encoder.
 */
export const BASS_MODES = ['chords', 'unison', 'single', 'solo'] as const
export type BassMode = (typeof BASS_MODES)[number]

/** As the hardware's menu words them. */
export const BASS_MODE_LABEL: Record<BassMode, string> = {
  chords: 'With chords only',
  unison: 'Unison',
  single: 'Bass single notes',
  solo: 'Solo',
}

/**
 * Which engines a keypress reaches.
 *
 * The four modes look like four behaviours but they are two independent
 * questions — does the treble sound, does the bass sound — each answered partly
 * by whether you played a chord or a single key. Writing it as a table makes
 * that visible and keeps the play path free of nested conditionals
 * (research/07 §Bass modes, research/03).
 *
 * | mode   | single key      | chord           |
 * |--------|-----------------|-----------------|
 * | chords | treble          | treble + bass   |
 * | unison | treble + bass   | treble + bass   |
 * | single | bass            | treble + bass   |
 * | solo   | bass            | bass            |
 */
export function bassRouting(
  mode: BassMode,
  isChord: boolean,
): { readonly treble: boolean; readonly bass: boolean } {
  switch (mode) {
    case 'chords':
      return { treble: true, bass: isChord }
    case 'unison':
      return { treble: true, bass: true }
    case 'single':
      return { treble: isChord, bass: true }
    case 'solo':
      return { treble: false, bass: true }
  }
}

/**
 * What a keypress actually reaches, bass engine included.
 *
 * A switched-off bass does not mean "route to the bass and hear nothing" — the
 * modes stop applying altogether and the treble comes back:
 *
 * > "As of v3.90, when Bass is *off*, single-notes mode plays the treble chord
 * > rather than silence." — research/03
 *
 * Which is the only sensible reading: Solo mutes the treble so you can hear the
 * bass, so with no bass to hear it would mute the instrument down to nothing
 * with no indication why.
 */
export function routeKeypress(
  bassOn: boolean,
  mode: BassMode,
  isChord: boolean,
): { readonly treble: boolean; readonly bass: boolean } {
  return bassOn ? bassRouting(mode, isChord) : { treble: true, bass: false }
}

/** `01`–`12`, numbered independently of the treble list. */
export const bassNumber = (index: number) => String(index + 1).padStart(2, '0')

export const bassAt = (index: number): BassSound =>
  BASS_SOUNDS[Math.max(0, Math.min(BASS_SOUNDS.length - 1, index))]!

export const bassLabel = (index: number) => `${bassNumber(index)} ${bassAt(index).name}`
