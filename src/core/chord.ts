/**
 * Building and naming chords.
 *
 * The model is deliberately **additive**: a base triad, plus whichever
 * extensions are held, as a set of intervals above the root. That is what the
 * pads do, and it has a pleasant side effect — `Dim + 6` lands on a proper
 * diminished seventh, because the sixth is enharmonically the double-flat
 * seventh. The naming layer below has to recognise accidents like that and
 * print the chord musicians would actually write.
 */

import { EXTENSIONS, mod12 } from './types.js'
import type { ChordSpec, ChordType, Extension, PitchClass } from './types.js'

const TRIAD: Record<ChordType, readonly number[]> = {
  dim: [0, 3, 6],
  min: [0, 3, 7],
  maj: [0, 4, 7],
  // Sus4 rather than sus2. Both are defensible and the hardware does not say
  // which; sus4 is the conventional reading of an unqualified "sus".
  sus: [0, 5, 7],
}

const EXTENSION_INTERVAL: Record<Extension, number> = {
  '6': 9,
  m7: 10,
  M7: 11,
  // A ninth, not a second — an octave above the 2nd degree, so it sits on top
  // of the chord rather than clustering against the root.
  '9': 14,
}

/** Intervals above the root, ascending, duplicates removed. */
export function buildChord(spec: ChordSpec): number[] {
  const notes = new Set<number>(TRIAD[spec.type])
  for (const ext of dedupe(spec.extensions)) notes.add(EXTENSION_INTERVAL[ext])
  return [...notes].sort((a, b) => a - b)
}

/** Extensions in pad order, without repeats. */
export function dedupe(extensions: readonly Extension[]): Extension[] {
  const present = new Set(extensions)
  return EXTENSIONS.filter((e) => present.has(e))
}

/** Absolute pitch classes of a chord. */
export function pitchClasses(spec: ChordSpec): PitchClass[] {
  return [...new Set(buildChord(spec).map((i) => mod12(spec.root + i)))].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * The suffix after the root, e.g. `m7`, `maj9`, `°7`, `7sus4`.
 *
 * Split into the part that sits on the baseline and the part that is set as a
 * superscript, because that is how chord symbols are actually engraved and it
 * makes a long name like `Cm7♭5` readable at a glance.
 */
export interface ChordName {
  /** Baseline text after the root letter. */
  readonly base: string
  /** Superscript text. */
  readonly sup: string
}

/**
 * Three or more extensions stop being nameable in any honest way.
 *
 * The hardware prints a joke instead of a chord symbol, and it is right to:
 * `C6/9maj7` is not a chord anybody asked for. Keeping the gag also keeps the
 * note readout honest — the notes are still there to read.
 */
export const OVERLOAD = 'JAZZ'

export function chordName(spec: ChordSpec): ChordName {
  const ext = new Set(dedupe(spec.extensions))
  const has = (e: Extension) => ext.has(e)
  const { type } = spec

  if (ext.size >= 3) return { base: '', sup: OVERLOAD }

  const ninth = has('9')
  // A ninth on top of a seventh is what turns a 7 chord into a 9 chord; a ninth
  // on its own is an `add9`, which is a different animal.
  const seventh = has('m7') ? 'm7' : has('M7') ? 'M7' : undefined
  const sixth = has('6')

  // Diminished is the one place the additive model produces a genuinely
  // different chord: dim + 6 is a fully diminished seventh, because the 6th
  // *is* the double-flat 7th. dim + m7 is half-diminished.
  if (type === 'dim') {
    if (sixth && !seventh) return { base: '', sup: ninth ? '°7add9' : '°7' }
    if (seventh === 'm7') return { base: 'm', sup: ninth ? '7♭5add9' : '7♭5' }
    if (seventh === 'M7') return { base: '', sup: ninth ? '°maj7add9' : '°maj7' }
    return { base: '', sup: ninth ? '°add9' : '°' }
  }

  const quality = type === 'min' ? 'm' : ''
  const suffix = type === 'sus' ? 'sus4' : ''

  if (seventh === 'm7') {
    const n = ninth ? '9' : '7'
    return { base: quality, sup: sixth ? `${n}add6${suffix}` : `${n}${suffix}` }
  }

  if (seventh === 'M7') {
    const n = ninth ? 'maj9' : 'maj7'
    return { base: quality, sup: sixth ? `${n}add6${suffix}` : `${n}${suffix}` }
  }

  if (sixth) return { base: quality, sup: ninth ? `6/9${suffix}` : `6${suffix}` }
  if (ninth) return { base: quality, sup: `add9${suffix}` }

  return type === 'sus' ? { base: '', sup: 'sus4' } : { base: quality, sup: '' }
}
