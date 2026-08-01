/**
 * Key Mode — one key press, one diatonic chord.
 *
 * Everything is **derived by rotating the major scale** rather than tabulated
 * per mode. One scale seen from seven starting points: Dorian's major IV,
 * Mixolydian's minor v and Locrian's diminished tonic all fall out on their
 * own, and the modes cannot drift out of step with each other.
 */

import { mod12, MODES } from './types.js'
import type { ChordType, Key, Mode, PitchClass } from './types.js'

/** The major scale, as semitones from its tonic. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** Triad quality on each degree of the major scale. */
const MAJOR_QUALITY: readonly ChordType[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']

/** Roman numerals for the major scale, before case is applied. */
const NUMERAL = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** How far into the major scale a mode starts. Ionian 0, Dorian 1, … */
const modeOffset = (mode: Mode) => MODES.indexOf(mode)

/** The seven pitch classes of a key, ascending from its tonic. */
export function scaleNotes(key: Key): PitchClass[] {
  const offset = modeOffset(key.mode)
  const root = MAJOR[offset]!
  return MAJOR.map((_, i) => mod12(key.tonic + MAJOR[(i + offset) % 7]! - root))
}

export interface Degree {
  readonly root: PitchClass
  readonly type: ChordType
  /** `ii`, `V`, `vii°` — lower case for minor, `°` for diminished. */
  readonly numeral: string
  /** True when this chord is not in the key, i.e. borrowed. */
  readonly borrowed: boolean
}

/** The diatonic chord on degree `i` (0-based) of `key`. */
export function degreeAt(key: Key, i: number): Degree {
  const offset = modeOffset(key.mode)
  const notes = scaleNotes(key)
  const type = MAJOR_QUALITY[(i + offset) % 7]!
  const numeral = NUMERAL[i]!
  return {
    root: notes[i]!,
    type,
    numeral: type === 'maj' ? numeral : numeral.toLowerCase() + (type === 'dim' ? '°' : ''),
    borrowed: false,
  }
}

/**
 * How the five keys outside the scale behave.
 *
 * A twelve-key keyboard against a seven-note scale leaves five keys with no
 * diatonic answer, and the choice of what to do with them is the single most
 * consequential decision in Key Mode.
 */
export type ChromaticPolicy =
  /** Give them borrowed harmony — secondary dominants and modal interchange. */
  | 'colour'
  /** Round to the nearest degree. Safe, but five keys stop being distinct. */
  | 'snap'

/**
 * The chord a root produces in a key.
 *
 * In-scale roots always give the plain diatonic triad. Out-of-scale roots do
 * whatever `policy` says.
 */
export function chordForRoot(root: PitchClass, key: Key, policy: ChromaticPolicy): Degree {
  const notes = scaleNotes(key)
  const exact = notes.indexOf(mod12(root))
  if (exact >= 0) return degreeAt(key, exact)

  if (policy === 'snap') return snapToNearest(root, key, notes)
  return borrow(root, key)
}

/**
 * Round to the closest scale degree.
 *
 * **Closest, not the first one below.** The obvious implementation walks the
 * scale downward and takes the first hit, which sends C♯ to B when C is a
 * semitone the other way. Distance is measured round the circle, so the pick is
 * never more than a semitone away.
 */
function snapToNearest(root: PitchClass, key: Key, notes: PitchClass[]): Degree {
  let best = 0
  let bestDistance = 12
  notes.forEach((pc, i) => {
    const raw = Math.abs(mod12(pc - root))
    const distance = Math.min(raw, 12 - raw)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  })
  return degreeAt(key, best)
}

/** Chromatic degree names, by semitones above the tonic. */
const CHROMATIC_NUMERAL = [
  'I',
  '♭II',
  'II',
  '♭III',
  'III',
  'IV',
  '♯IV',
  'V',
  '♭VI',
  'VI',
  '♭VII',
  'VII',
]

/**
 * Borrowed harmony for the five roots outside the scale.
 *
 * **Every one of them gives a major triad**, named by its chromatic degree.
 * That is modal interchange rather than anything cleverer, and it is a single
 * rule with no table of special cases — but each of the five lands on a chord
 * people genuinely reach for: ♭II is the Neapolitan, ♭III / ♭VI / ♭VII are the
 * borrowings from the parallel minor that every pop song uses, and ♯IV is the
 * Lydian brightener.
 *
 * The first version of this treated each chromatic root as a secondary
 * dominant resolving a fifth below. It read well until the tests ran it on
 * every root: in C major that makes F♯ into "V/vii°", and you cannot tonicise
 * a diminished chord. Major triads throughout are less clever and much more
 * useful — they sit under a melody without demanding a resolution.
 */
function borrow(root: PitchClass, key: Key): Degree {
  return {
    root,
    type: 'maj',
    numeral: CHROMATIC_NUMERAL[mod12(root - key.tonic)]!,
    borrowed: true,
  }
}

/** The tonic-first ordering the Scale keyboard layout walks. */
export function scaleRoots(key: Key): PitchClass[] {
  return scaleNotes(key)
}
