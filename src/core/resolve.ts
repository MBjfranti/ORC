/**
 * Turning panel state into an actual chord.
 *
 * The join between the pads, Key Mode, the chord engine and the voicing
 * engine — still pure, still testable, no audio anywhere near it.
 */

import { buildChord, chordName } from './chord.js'
import { chordForRoot } from './key.js'
import { noteName } from './spelling.js'
import { mod12 } from './types.js'
import { clampVoicing, voiceChord } from './voicing.js'
import type { ChromaticPolicy } from './key.js'
import type { ChordSpec, ChordType, Extension, Key, MidiNote, PitchClass } from './types.js'

export interface ResolveInput {
  readonly root: PitchClass
  /** Chord-type pads currently down. */
  readonly types: readonly ChordType[]
  readonly extensions: readonly Extension[]
  readonly keyMode: boolean
  readonly key: Key
  readonly chromatic: ChromaticPolicy
  /** Which octave the voicing window starts in. */
  readonly octave: number
  /** Position along the infinite note stack. */
  readonly voicing: number
  /** Semitones to shift the played root by, from Key's press-and-turn axis. */
  readonly transpose?: number
}

export interface Resolved {
  readonly spec: ChordSpec
  readonly notes: MidiNote[]
  /** `C`, `F♯`, `B♭` — the root, spelled for the key. */
  readonly root: string
  /** Baseline suffix, e.g. the `m` of `Cm7`. */
  readonly base: string
  /** Superscript suffix, e.g. the `7` of `Cm7`. */
  readonly sup: string
  /** Roman numeral, in Key Mode only. */
  readonly numeral: string
  /** True when Key Mode reached outside the scale for this chord. */
  readonly borrowed: boolean
}

/**
 * What a given root key would play right now.
 *
 * Returns `undefined` when nothing would sound as a chord — no pad held and
 * Key Mode off, which is a single note rather than a chord.
 *
 * Cheap and side-effect free on purpose: it also populates the label on every
 * key of the keybed, so it runs twelve times per render.
 */
export function resolveChord(input: ResolveInput): Resolved | undefined {
  const { types, extensions, keyMode, key, voicing } = input

  /*
   * Transpose shifts the *root you played*, not the notes that come out.
   *
   * Doing it to the finished pitches would be simpler and would lie: the
   * display would still say C while a D chord sounded. Shifting the root keeps
   * the name, the roman numeral and the audio all describing the same chord —
   * and any semitones that carry past an octave move the register with them.
   */
  const shifted = input.root + (input.transpose ?? 0)
  const root = mod12(shifted) as PitchClass
  const octave = input.octave + Math.floor(shifted / 12)

  let type: ChordType
  let actualRoot = root
  let numeral = ''
  let borrowed = false

  if (types.length > 0) {
    /*
     * A held pad overrides Key Mode, and the root is the key you actually
     * pressed — an override is a statement about *this* chord, so nothing
     * about it gets quantised. The numeral stays blank because the chord is no
     * longer a degree of the key.
     *
     * The most recent pad wins, so rolling a finger from Maj onto Min lands on
     * Min rather than on some combination of the two.
     */
    type = types[types.length - 1]!
  } else if (keyMode) {
    const degree = chordForRoot(root, key, input.chromatic)
    type = degree.type
    actualRoot = degree.root
    numeral = degree.numeral
    borrowed = degree.borrowed
  } else {
    return undefined
  }

  const spec: ChordSpec = { root: actualRoot, type, extensions }
  const intervals = buildChord(spec)
  const rootMidi = 12 * (octave + 1) + actualRoot
  // Clamped here as well as at the dial, because dropping an extension shrinks
  // the cycle and so *raises* the same position by an octave or more. The
  // manual calls that shifting-goalposts behaviour intentional; flying off the
  // end of the keyboard because of it is not.
  const notes = voiceChord(intervals, rootMidi, clampVoicing(intervals, rootMidi, voicing))
  const name = chordName(spec)

  return {
    spec,
    notes,
    root: noteName(actualRoot, keyMode ? key : undefined),
    base: name.base,
    sup: name.sup,
    numeral,
    borrowed,
  }
}

/** A bare note, for when no pad is held and Key Mode is off. */
export function resolveSingleNote(root: PitchClass, octave: number): MidiNote {
  return 12 * (octave + 1) + mod12(root)
}
