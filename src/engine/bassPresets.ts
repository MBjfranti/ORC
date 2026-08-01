/**
 * Bass sounds.
 *
 * The bass is a separate instrument on the hardware: its own monophonic
 * engine, its own voicing dial, its own volume, its own MIDI channel — and
 * **its own sound list**, with its own numbering. Telepathic's product page
 * shows bass sounds numbered 04–12 while lead sounds run into the 60s and
 * 70s, which is only possible if the two lists are numbered separately.
 *
 * Turning the orange Bass encoder browses *this* list. That is what the
 * encoder does on the device; before this file existed the dial turned
 * through bass *behaviours* instead, because there was nothing to browse.
 *
 * The four names taken from the product page are marked; the rest are in the
 * same spirit. See research/07-sound-engines-fx-and-presets.md.
 */

export interface BassPreset {
  readonly id: number
  readonly name: string
  readonly wave: 'sawtooth' | 'square' | 'triangle' | 'sine' | 'fatsawtooth'
  /** Where the filter sits before the envelope opens it, in Hz. */
  readonly base: number
  /** How far the filter envelope sweeps, in octaves. */
  readonly octaves: number
  readonly resonance: number
  readonly decay: number
  readonly sustain: number
  /** Trim, in dB, so one sound is not twice the size of the next. */
  readonly volume: number
}

export const BASS_PRESETS: readonly BassPreset[] = [
  // "PBass" — 04 on the product page.
  { id: 1, name: 'PBass', wave: 'triangle', base: 80, octaves: 2.2, resonance: 1.2, decay: 0.3, sustain: 0.7, volume: -6 },
  { id: 2, name: 'Round Tape', wave: 'sine', base: 70, octaves: 1.4, resonance: 0.8, decay: 0.45, sustain: 0.8, volume: -4 },
  // "ORC808" — 06.
  { id: 3, name: 'ORC808', wave: 'sine', base: 55, octaves: 1.1, resonance: 0.6, decay: 1.2, sustain: 0.15, volume: -3 },
  { id: 4, name: 'Fifth Organ Bass', wave: 'square', base: 120, octaves: 1.8, resonance: 1.6, decay: 0.2, sustain: 0.9, volume: -9 },
  // "Meadow Bass" — 10, named to sit under the Meadow lead.
  { id: 5, name: 'Meadow Bass', wave: 'sawtooth', base: 90, octaves: 2.6, resonance: 2, decay: 0.25, sustain: 0.85, volume: -8 },
  // "Rezdist Bass" — 12. Resonant and dirty, as the name promises.
  { id: 6, name: 'Rezdist Bass', wave: 'sawtooth', base: 110, octaves: 3.4, resonance: 8, decay: 0.18, sustain: 0.5, volume: -11 },
  { id: 7, name: 'Late Bus Sub', wave: 'sine', base: 45, octaves: 0.8, resonance: 0.5, decay: 0.6, sustain: 0.95, volume: -2 },
  { id: 8, name: 'Cardboard Upright', wave: 'triangle', base: 95, octaves: 2, resonance: 3, decay: 0.14, sustain: 0.25, volume: -5 },
  { id: 9, name: 'Wide Wurli Bass', wave: 'fatsawtooth', base: 85, octaves: 2.1, resonance: 1.4, decay: 0.35, sustain: 0.75, volume: -10 },
]

export const DEFAULT_BASS_PRESET = BASS_PRESETS[4]! // Meadow Bass — the old fixed voice.

export function bassPresetAt(index: number): BassPreset {
  return BASS_PRESETS[Math.max(0, Math.min(BASS_PRESETS.length - 1, index))]!
}
