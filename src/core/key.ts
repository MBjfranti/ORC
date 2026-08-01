/**
 * Key Mode.
 *
 * With Key Mode on you don't touch the Chord Type buttons at all: press any key
 * and get the harmonically correct chord for that scale degree. Extensions still
 * apply on top — hold `9` in C major and you get diatonic 9th chords across the
 * whole scale.
 *
 * See research/04-key-mode-and-harmony.md.
 */

import { mod12 } from './spelling.js'
import { MODES } from './types.js'
import type { ChordType, Extension, Key, Mode, PitchClass } from './types.js'

/** The major scale, from which every mode is a rotation. */
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11] as const

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const

/**
 * The seven scale degrees of a mode, in semitones from its own tonic.
 *
 * Derived by rotating the major scale rather than tabulated per mode — there is
 * only one scale here, viewed from seven starting points, and writing it once
 * means Lydian and Locrian cannot drift out of step with Ionian.
 */
export function modeDegrees(mode: Mode): number[] {
  const start = MODES.indexOf(mode)
  return Array.from({ length: 7 }, (_, i) => {
    const from = MAJOR_DEGREES[start]!
    const to = MAJOR_DEGREES[(start + i) % 7]!
    return ((to - from) % 12 + 12) % 12
  })
}

/**
 * Triad quality on each degree, built by stacking scale thirds.
 *
 * Also derived rather than tabulated: take every other note of the mode and
 * read the intervals. Locrian's diminished tonic and Lydian's ♯IV fall out on
 * their own.
 */
export function modeQualities(mode: Mode): ChordType[] {
  const degrees = modeDegrees(mode)
  return degrees.map((_, i) => {
    const root = degrees[i]!
    const third = (degrees[(i + 2) % 7]! - root + 12) % 12
    const fifth = (degrees[(i + 4) % 7]! - root + 12) % 12

    if (third === 4 && fifth === 7) return 'maj'
    if (third === 3 && fifth === 7) return 'min'
    if (third === 3 && fifth === 6) return 'dim'
    if (third === 4 && fifth === 8) return 'maj' // augmented — no button for it yet
    return 'maj'
  })
}

/**
 * Roman numerals, cased by quality and marked ♭/♯ where the degree differs from
 * the major scale — so Dorian reads `i ii ♭III IV v vi ♭VII`.
 */
export function modeNumerals(mode: Mode): string[] {
  const degrees = modeDegrees(mode)
  const qualities = modeQualities(mode)

  return degrees.map((semitones, i) => {
    const natural = MAJOR_DEGREES[i]!
    const accidental = semitones === natural ? '' : semitones < natural ? '♭' : '♯'
    const quality = qualities[i]!
    const numeral = quality === 'maj' ? ROMAN[i]! : ROMAN[i]!.toLowerCase()
    return accidental + numeral + (quality === 'dim' ? '°' : '')
  })
}

export interface DegreeChord {
  readonly root: PitchClass
  readonly type: ChordType
  /** 0-based scale degree, or -1 for a chromatic (non-diatonic) root. */
  readonly degree: number
  readonly numeral: string
  /** True when this root is outside the key. */
  readonly borrowed: boolean
  /** An extension the chord requires regardless of what the player holds. */
  readonly forcedExtension?: Extension
}

/**
 * How chromatic (non-diatonic) keys behave in Key Mode.
 *
 * `harmonic` is the hardware's own, documented in the Operation Manual §9.3:
 * "Orchid will intelligently shift the note to the nearest note within the
 * scale — for example, if you press C♯ while in the key of C, Orchid will
 * play a Csus." Nearest scale note, played *suspended* — sus is neither major
 * nor minor, so a note that was outside the key resolves to something that
 * cannot clash with it.
 *
 * `borrow` is ours and reaches further, giving all twelve keys a secondary
 * dominant or a borrowed chord. It lives behind Extended.
 * See research/04-key-mode-and-harmony.md §12-keys problem.
 */
export type ChromaticPolicy = 'harmonic' | 'borrow' | 'major' | 'snap'

export interface KeyModeOptions {
  readonly chromatic?: ChromaticPolicy
}

/** The seven diatonic triads of a key, in scale order. */
export function diatonicChords(key: Key): DegreeChord[] {
  const degrees = modeDegrees(key.tonality)
  const qualities = modeQualities(key.tonality)
  const numerals = modeNumerals(key.tonality)

  return degrees.map((semitones, i) => ({
    root: mod12(key.tonic + semitones),
    type: qualities[i]!,
    degree: i,
    numeral: numerals[i]!,
    borrowed: false,
  }))
}

/**
 * The seven scale roots, ascending from the tonic.
 *
 * Used by the Scale keyboard layout, where the seven white keys become the
 * seven notes of the mode instead of a chromatic octave.
 */
export function scaleRoots(key: Key): PitchClass[] {
  return modeDegrees(key.tonality).map((d) => mod12(key.tonic + d))
}

/**
 * The chord a given root produces in Key Mode.
 *
 * Diatonic roots return their scale-degree triad. Chromatic roots follow the
 * configured policy.
 */
export function chordForRoot(
  root: PitchClass,
  key: Key,
  opts: KeyModeOptions = {},
): DegreeChord {
  const target = mod12(root)
  const diatonic = diatonicChords(key)

  const exact = diatonic.find((c) => c.root === target)
  if (exact) return exact

  switch (opts.chromatic ?? 'harmonic') {
    case 'harmonic': {
      // Nearest scale note, then suspended — §9.3's C♯-in-C gives Csus.
      const near = nearestDegree(diatonic, target)
      return { ...near, type: 'sus', borrowed: true }
    }

    case 'major':
      return { root: target, type: 'maj', degree: -1, numeral: '', borrowed: true }

    case 'snap':
      return nearestDegree(diatonic, target)

    case 'borrow':
    default:
      return borrowedChord(target, key)
  }
}

/**
 * The scale degree nearest a chromatic root.
 *
 * Shortest distance around the circle, ties resolving downward — the note you
 * probably meant, not merely the first one found below it.
 */
function nearestDegree(diatonic: readonly DegreeChord[], target: PitchClass): DegreeChord {
  let best = diatonic[0]!
  let bestDistance = Infinity
  for (const candidate of diatonic) {
    const up = mod12(candidate.root - target)
    const distance = Math.min(up, 12 - up)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

/**
 * Give a chromatic root a useful chord: a secondary dominant where one exists,
 * otherwise the borrowed major triad from the parallel mode.
 *
 * In C major this yields:
 *   C♯ -> A7   (V/ii)      D♯ -> E♭  (♭III)
 *   F♯ -> D7   (V/V)       G♯ -> A♭  (♭VI)
 *   A♯ -> B♭   (♭VII)
 */
function borrowedChord(root: PitchClass, key: Key): DegreeChord {
  const fromTonic = mod12(root - key.tonic)

  // Secondary dominants: the chromatic note is the leading tone into a
  // diatonic degree, so build the dominant 7th a semitone below that degree.
  const SECONDARY: Record<number, { target: number; numeral: string }> = {
    1: { target: 2, numeral: 'V/ii' }, // C# -> A7 resolving to Dm
    6: { target: 7, numeral: 'V/V' }, // F# -> D7 resolving to G
  }

  const secondary = SECONDARY[fromTonic]
  if (secondary && (key.tonality === 'major' || key.tonality === 'lydian')) {
    return {
      root: mod12(key.tonic + secondary.target - 5),
      type: 'maj',
      // A secondary dominant wants its ♭7 — a plain triad functions, but the
      // 7th is what makes it pull toward its target.
      forcedExtension: 'm7',
      degree: -1,
      numeral: secondary.numeral,
      borrowed: true,
    }
  }

  const BORROWED_NUMERAL: Record<number, string> = {
    1: '♭II',
    3: '♭III',
    6: '♯IV',
    8: '♭VI',
    10: '♭VII',
  }

  return {
    root,
    type: 'maj',
    degree: -1,
    numeral: BORROWED_NUMERAL[fromTonic] ?? '',
    borrowed: true,
  }
}

/** Extensions pass through Key Mode unchanged — they stack on the diatonic triad. */
export function applyExtensions(
  chord: DegreeChord,
  extensions: readonly Extension[],
): { root: PitchClass; type: ChordType; extensions: readonly Extension[] } {
  return { root: chord.root, type: chord.type, extensions }
}
