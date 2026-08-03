/**
 * Loudness trims — measured, not guessed.
 *
 * ## Why these exist
 *
 * `sounds.ts` carries a `volume` per preset derived from the source timbre
 * table, and `scripts/derive-sounds.cjs` is candid about what it is worth:
 *
 * > "The source's `v` is a raw amplitude and tracks loudness only loosely once
 * > FM depth is involved, so it is half-weighted and kept on a short leash."
 *
 * It was never a loudness match, and it could not be. What a preset actually
 * *sounds like* is dominated by things `v` knows nothing about: the sustain
 * level of its envelope, where its filter sits, and how hard the modulator is
 * driven. A patch with `sustain 0.8` through an 8kHz filter and one with
 * `sustain 0.05` through a 500Hz filter can share a `volume` and be twenty
 * decibels apart in the ear.
 *
 * So the derived number stays where it is — it is provenance, and
 * `derive-sounds.cjs --check` still verifies it — and the correction lives here
 * as a separate, measured layer. Two numbers doing two different jobs: one says
 * what the source said, the other says what it measured.
 *
 * ## How they were produced
 *
 * `scripts/measure-levels.mjs` holds the harness. It renders each preset
 * **offline**, through the same `voiceParams` the instrument plays and the same
 * filter at its own cutoff, playing a fixed four-note chord; then it takes the
 * RMS of the held portion and solves for the trim that lands it on a common
 * target. Offline so it is deterministic and fast rather than fifty real-time
 * seconds of drifting measurements.
 *
 * Trims are clamped, and the clamp matters: a preset that needs more than
 * +12dB is not quiet, it is broken, and burying that under a trim would hide a
 * bug rather than fix a level. Anything hitting the rail is listed in the
 * script's output.
 *
 * **Re-run it after changing any preset's envelope, cutoff or FM index.** Those
 * are exactly the fields that move loudness, and a stale trim is worse than
 * none because it looks deliberate.
 */

/**
 * The loudness every preset is trimmed towards, in dBFS RMS.
 *
 * Chosen as the median of the library as measured, so normalising moves the
 * whole thing as little as possible — the point is to stop the jumps, not to
 * relevel the instrument.
 */
export const TARGET_RMS_DB = -30.28

/**
 * Per-preset trim in dB, indexed as the library is.
 *
 * Measured spread before: **16.29 dB** gated. `15 Cold Cathedral` was sixteen
 * decibels louder than `26 Tiptoe Pizz`, which is the jump you hear scrolling
 * the list. After: 0.01 dB. Nothing hit the ±12 rail.
 *
 * These are the *gated* numbers. Measured on a plain windowed RMS the same
 * pizzicato asked for +10.17dB rather than +4.57, because a fixed window is
 * mostly silence for a short sound — and boosted by ten decibels it did not
 * become level, it became a very loud pluck followed by nothing. Real playing
 * still had it 9.4dB down. If these trims are ever regenerated, check the gate
 * is still in the harness.
 */
export const SOUND_TRIM: readonly number[] = [
  -1.65, -1.66, -4.97, 0.76, -6.76, -2.34, 4.41, 4.71, 3.92, 0.72,
  2.65, 3.34, -9.65, -9.3, -10.96, 0.92, 2.28, 2.52, 1.29, 0.97,
  2.53, 5.33, -0.77, -0.69, -4.78, 4.57, -5.68, -9.82, -1.37, 2.87,
  -3.41, 2.76, 0.69, 0.35, 0.05, 1.8, 0.07, 2.13, 1.73, -2.65,
  -3.1, -1.54, -0.72, 0.66, -2.86, -3.75, -7.98, -2.51, -0.06, -5.05,
]

/**
 * The twelve bass presets, flattened against **their own** median rather than
 * the treble's — spread was 9.95 dB. Where the family sits relative to the
 * chords is `BASS_SECTION_DB`, not this.
 */
export const BASS_TRIM: readonly number[] = [
  -0.59, -1.54, 5.45, 1.68, -3.12, 0.6, 1.53, 2.83, -2.45, -3.94,
  -4.63, 3.53,
]

/**
 * Where the bass section sits against the chords, in dB.
 *
 * The bass presets were authored nearly thirteen decibels hotter than the
 * treble library measured, so Bass Volume spent its first third of travel
 * undoing that rather than doing anything musical. One number on the bus, and
 * the player's dial then works either side of it.
 */
export const BASS_SECTION_DB = -12.91

/**
 * The drum bus, in dB, relative to a normalised preset.
 *
 * The kit is already balanced within itself — each voice was played alone and
 * measured — so this is one number for the whole section: where the beat sits
 * against the chords, before Beat Volume touches it.
 *
 * Measured live, gated the same way: a beat ran **19.56dB hotter** than the
 * mean of ten normalised presets. That is the other half of the jumping — not
 * that the drums were wrong against each other, but that the whole kit was
 * built to a different reference from the library. Levelled here so that Beat
 * Volume at its default sits the beat with the chords rather than on top of
 * them.
 */
export const DRUM_TRIM = -19.5

const at = (table: readonly number[], index: number): number => table[index] ?? 0

export const soundTrim = (index: number): number => at(SOUND_TRIM, index)
export const bassTrim = (index: number): number => at(BASS_TRIM, index)

/** dB → linear gain, for the drum bus and anything else scaled rather than set. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20)
