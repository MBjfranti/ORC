/**
 * Factory sounds.
 *
 * Named in the spirit of the hardware — evocative and slightly absurd, never
 * technical. "Cosmic Day Spa" tells you what it feels like; "Pad 07" doesn't.
 * See research/10-sound-palette-and-chord-vocabulary.md.
 *
 * A deliberately small set. Fifteen good sounds beat sixty mediocre ones, and
 * every preset is maintenance.
 */

import type { Preset } from './SynthEngine.js'

export const PRESETS: readonly Preset[] = [
  { id: 1, name: 'Meadow', engine: 'subtractive', cutoff: 1800, reverb: 0.35, chorus: 0.3, delay: 0.1 },
  { id: 2, name: 'Cosmic Day Spa', engine: 'subtractive', cutoff: 900, reverb: 0.7, chorus: 0.5, delay: 0.25 , perform: 'arp', performAmount: 0.35 },
  { id: 3, name: 'Cardboard Organ', engine: 'subtractive', cutoff: 3200, reverb: 0.15, chorus: 0.1, delay: 0 },
  { id: 4, name: 'Lemon', engine: 'subtractive', cutoff: 5000, reverb: 0.2, chorus: 0.4, delay: 0.15 },
  { id: 5, name: 'Slow Tide', engine: 'subtractive', cutoff: 700, reverb: 0.8, chorus: 0.6, delay: 0.3 , perform: 'harp', performAmount: 0.5 },
  { id: 6, name: 'Trout', engine: 'fm', cutoff: 4000, reverb: 0.25, chorus: 0.2, delay: 0.2 },
  { id: 7, name: 'DX Guitar', engine: 'fm', cutoff: 3500, reverb: 0.2, chorus: 0.3, delay: 0.1 , perform: 'strum2', performAmount: 0.55 },
  { id: 8, name: 'Glass Bell', engine: 'fm', cutoff: 6000, reverb: 0.5, chorus: 0.1, delay: 0.35 , perform: 'arp', performAmount: 0.62 },
  { id: 9, name: 'Millionaire', engine: 'fm', cutoff: 2200, reverb: 0.3, chorus: 0.25, delay: 0.15 },
  { id: 10, name: 'Saint Germain', engine: 'ep', cutoff: 2600, reverb: 0.3, chorus: 0.45, delay: 0.12 },
  { id: 11, name: 'Rhodes Ghost', engine: 'ep', cutoff: 1600, reverb: 0.55, chorus: 0.5, delay: 0.2 , perform: 'slop', performAmount: 0.3 },
  { id: 12, name: 'Wurli Sunday', engine: 'ep', cutoff: 2000, reverb: 0.25, chorus: 0.35, delay: 0.05 },
  { id: 13, name: 'Plumerai', engine: 'ep', cutoff: 3000, reverb: 0.65, chorus: 0.55, delay: 0.4 },
  { id: 14, name: 'Late Bus', engine: 'subtractive', cutoff: 1200, reverb: 0.45, chorus: 0.7, delay: 0.5 , perform: 'pattern', performAmount: 0.2 },
  { id: 15, name: 'Orchid Bossanova', engine: 'ep', cutoff: 3800, reverb: 0.2, chorus: 0.2, delay: 0.1 , perform: 'strum', performAmount: 0.4 },
]

export const DEFAULT_PRESET: Preset = PRESETS[0]!
