/**
 * Resolving panel state into an actual chord.
 *
 * This is the join between the chord engine, Key Mode and the voicing engine —
 * still pure, still testable, no audio and no React.
 */

import { buildChord, chordParts, chordSuffix, secretChordFor } from './chord.js'
import { chordForRoot } from './key.js'
import { secretChordsApply } from './playStyle.js'
import type { PlayStyle, SecretChordMode } from './playStyle.js'
import { noteName } from './spelling.js'
import { voiceChord } from './voicing.js'
import type { ChromaticPolicy } from './key.js'
import type { ChordSpec, ChordType, Extension, Key, MidiNote, PitchClass } from './types.js'

export interface ResolveInput {
  readonly root: PitchClass
  /** All chord-type buttons held. Two or more may reach a Secret Chord. */
  readonly heldTypes: readonly ChordType[]
  readonly extensions: readonly Extension[]
  /** Options → Instrument → Secret Chords. Defaults to the hardware's `simple`. */
  readonly secretChords?: SecretChordMode
  readonly playStyle?: PlayStyle
  readonly keyMode: boolean
  readonly key: Key
  readonly chromatic?: ChromaticPolicy
  readonly octave: number
  readonly voicing: number
}

export interface ResolvedChord {
  readonly spec: ChordSpec
  readonly notes: MidiNote[]
  /** Display name, e.g. `Dm9`. Empty when nothing would sound. */
  readonly name: string
  /**
   * The same name split where the screen splits it: `root + base` at full
   * size, `ext` as a superscript. See the notation plates in the manual §6.5.
   */
  readonly root: string
  readonly ext: string
  /** Roman numeral in Key Mode, otherwise empty. */
  readonly numeral: string
}

/**
 * Work out what a given root key would play right now.
 *
 * Also used to populate the third tier on every key — which is why it must be
 * cheap and side-effect free. See research/11-webapp-implications.md §1c.
 */
export function resolveChord(input: ResolveInput): ResolvedChord | undefined {
  const { root, heldTypes, extensions, keyMode, key, octave, voicing } = input

  // A secret chord replaces the triad outright, so it is resolved first and
  // wins over both the single-button type and Key Mode's diatonic quality —
  // holding two buttons is an unambiguous statement about what you want.
  const secret = secretChordsApply(input.secretChords ?? 'simple', input.playStyle ?? 'simple')
    ? secretChordFor(heldTypes)
    : undefined

  let type: ChordType
  let actualRoot = root
  let numeral = ''
  let allExtensions = extensions

  if (secret) {
    // Key Mode still supplies the root; the quality comes from the combination.
    const degree = keyMode ? chordForRoot(root, key, policy(input)) : undefined
    actualRoot = degree?.root ?? root
    numeral = degree?.numeral ?? ''
    type = 'maj'
  } else if (heldTypes.length > 0) {
    /*
     * A held Chord Type button overrides Key Mode.
     *
     * "You can override key mode temporarily by playing chords as usual using
     * the Chord Type buttons" (§9.3). Key Mode used to be checked first, so
     * holding Min and pressing G♯ in the key of C gave whatever the scale
     * wanted — G♯ is not in C, so it was snapped to G and suspended, and
     * G♯m6 was simply unreachable without switching Key Mode off.
     *
     * The root is the key you actually pressed, too: an override is a
     * statement about *this* chord, so nothing about it gets quantised.
     *
     * Numeral stays blank because the chord is no longer a degree of the key
     * — the numeral describes Key Mode's choice, and this isn't it.
     */
    // The most recently pressed button wins, so rolling from Maj onto Min
    // lands on Min rather than nothing.
    type = heldTypes[heldTypes.length - 1]!
  } else if (keyMode) {
    const degree = chordForRoot(root, key, policy(input))
    type = degree.type
    actualRoot = degree.root
    numeral = degree.numeral
    if (degree.forcedExtension && !extensions.includes(degree.forcedExtension)) {
      allExtensions = [...extensions, degree.forcedExtension]
    }
  } else {
    // Nothing held and no Key Mode: a single note, not a chord.
    return undefined
  }

  const spec: ChordSpec = secret
    ? { root: actualRoot, type, extensions: allExtensions, secret }
    : { root: actualRoot, type, extensions: allExtensions }
  const intervals = buildChord(spec)
  const rootMidi = 12 * (octave + 1) + actualRoot
  const notes = voiceChord(intervals, rootMidi, voicing)

  const printed = noteName(actualRoot, keyMode ? key : undefined)
  const parts = chordParts(spec)

  return {
    spec,
    notes,
    name: printed + chordSuffix(spec),
    root: printed + parts.base,
    ext: parts.ext,
    numeral,
  }
}

function policy(input: ResolveInput) {
  return input.chromatic ? { chromatic: input.chromatic } : {}
}

/** A single note, for when no chord type is held and Key Mode is off. */
export function resolveSingleNote(root: PitchClass, octave: number): MidiNote {
  return 12 * (octave + 1) + root
}
