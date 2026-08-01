/**
 * Enharmonically-correct note spelling.
 *
 * The Orchid deliberately spells notes to suit the key signature rather than
 * always picking the convenient enharmonic — it will print `Fx` (F double-sharp)
 * instead of `G` to stay theoretically honest. We do the same: the same physical
 * key reads `C#` in D major and `D♭` in A♭ major.
 *
 * See research/03-chord-engine.md and research/04-key-mode-and-harmony.md.
 */

import type { Key, Letter, Mode, PitchClass, SpelledNote, Tonality } from './types.js'

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

/** Pitch class of each natural letter. */
const LETTER_PC: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

export const SHARP = '♯'
export const FLAT = '♭'
export const DOUBLE_SHARP = 'x'
export const DOUBLE_FLAT = '𝄫'

/** Render a spelled note as text, e.g. `C♯`, `B♭`, `Fx`. */
export function renderNote(note: SpelledNote): string {
  return note.letter + renderAccidental(note.accidental)
}

/** Render just the accidental portion of a spelled note. */
export function renderAccidental(accidental: number): string {
  switch (accidental) {
    case 0:
      return ''
    case 1:
      return SHARP
    case -1:
      return FLAT
    case 2:
      return DOUBLE_SHARP
    case -2:
      return DOUBLE_FLAT
    default:
      return accidental > 0 ? SHARP.repeat(accidental) : FLAT.repeat(-accidental)
  }
}

/** Pitch class of a spelled note, normalised to 0–11. */
export function spelledToPitchClass(note: SpelledNote): PitchClass {
  return mod12(LETTER_PC[note.letter] + note.accidental)
}

/**
 * Build a spelled note from a letter and a target pitch class, choosing whatever
 * accidental makes the letter land on that pitch class. Used when the letter is
 * already determined by position in a scale or chord.
 */
export function spellWithLetter(letter: Letter, pc: PitchClass): SpelledNote {
  const natural = LETTER_PC[letter]
  // Choose the accidental in -6..+6 that maps `letter` onto `pc`.
  let accidental = mod12(pc - natural)
  if (accidental > 6) accidental -= 12
  return { letter, accidental }
}

// ---------------------------------------------------------------------------
// Key signatures
// ---------------------------------------------------------------------------

/**
 * Key signatures expressed as the number of sharps (positive) or flats
 * (negative) for each major tonic pitch class.
 *
 * Two pitch classes are genuinely ambiguous and we pick the conventional
 * spelling: 6 is F♯ major (6 sharps) rather than G♭ (6 flats), and 1 is
 * D♭ major (5 flats) rather than C♯ (7 sharps).
 */
const MAJOR_FIFTHS: Record<number, number> = {
  0: 0, // C
  7: 1, // G
  2: 2, // D
  9: 3, // A
  4: 4, // E
  11: 5, // B
  6: 6, // F#
  1: -5, // Db
  8: -4, // Ab
  3: -3, // Eb
  10: -2, // Bb
  5: -1, // F
}

/**
 * Minor keys are spelled independently rather than inherited from the relative
 * major, so that each tonic gets the name players actually expect.
 *
 * Only one tonic is genuinely ambiguous, and it is the reason this table exists:
 * pitch class 3 derives to D♯ minor from F♯ major, but songwriters overwhelmingly
 * write **E♭ minor**. We therefore break relative-key consistency on purpose —
 * F♯ major and E♭ minor are both the common spelling of their own tonic, even
 * though they are not each other's relative.
 */
const MINOR_FIFTHS: Record<number, number> = {
  9: 0, // Am
  4: 1, // Em
  11: 2, // Bm
  6: 3, // F#m
  1: 4, // C#m
  8: 5, // G#m
  3: -6, // Ebm — chosen over D#m
  10: -5, // Bbm
  5: -4, // Fm
  0: -3, // Cm
  7: -2, // Gm
  2: -1, // Dm
}

/** Order in which sharps and flats are applied to letters. */
const SHARP_ORDER: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const
const FLAT_ORDER: readonly Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const

/**
 * Semitones from a mode's relative major tonic up to the mode's own tonic.
 * Every mode is a rotation of the major scale, so its signature is the
 * signature of the major key it rotates.
 */
const MODE_OFFSET: Record<Mode, number> = {
  major: 0,
  dorian: 2,
  phrygian: 4,
  lydian: 5,
  mixolydian: 7,
  minor: 9,
  locrian: 11,
}

/** Signed count of sharps (+) or flats (-) in a key's signature. */
export function keySignature(key: Key): number {
  // Minor keeps its own table so that pitch class 3 spells E♭m, not D♯m.
  if (key.tonality === 'minor') return MINOR_FIFTHS[mod12(key.tonic)] ?? 0

  const relativeMajor = mod12(key.tonic - MODE_OFFSET[key.tonality])
  return MAJOR_FIFTHS[relativeMajor] ?? 0
}

/** The accidental applied to a given letter by a key signature. */
function signatureAccidental(letter: Letter, fifths: number): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0
  return 0
}

/**
 * The seven diatonic notes of a key, correctly spelled, starting at the tonic.
 *
 * Uses one letter per scale degree — which is what produces spellings like
 * `E♯` in F♯ major rather than the enharmonic `F`.
 */
/**
 * Cached: there are only 24 keys, the result is immutable, and this sits on the
 * hot path — every note name on the keybed resolves through it, so recomputing
 * it per call showed up as real main-thread time during playing.
 */
const scaleCache = new Map<string, SpelledNote[]>()

export function scaleNotes(key: Key): SpelledNote[] {
  const cacheKey = `${key.tonic}:${key.tonality}`
  const cached = scaleCache.get(cacheKey)
  if (cached) return cached

  const fifths = keySignature(key)
  const tonicLetter = tonicLetterFor(key, fifths)
  const startIndex = LETTERS.indexOf(tonicLetter)

  const notes = Array.from({ length: 7 }, (_, degree) => {
    const letter = LETTERS[(startIndex + degree) % 7]!
    return { letter, accidental: signatureAccidental(letter, fifths) }
  })

  scaleCache.set(cacheKey, notes)
  return notes
}

/** Which letter names the tonic, given the key signature. */
function tonicLetterFor(key: Key, fifths: number): Letter {
  for (const letter of LETTERS) {
    const acc = signatureAccidental(letter, fifths)
    if (mod12(LETTER_PC[letter] + acc) === key.tonic) return letter
  }
  // Unreachable for the twelve supported tonics, but stay honest.
  return nearestLetter(key.tonic, fifths >= 0)
}

// ---------------------------------------------------------------------------
// Spelling a pitch class in context
// ---------------------------------------------------------------------------

/**
 * Spell a pitch class in the context of a key.
 *
 * Diatonic pitch classes use the key's own spelling. Chromatic ones follow the
 * key's direction of travel: sharps in sharp keys, flats in flat keys.
 */
export function spellInKey(pc: PitchClass, key: Key): SpelledNote {
  const target = mod12(pc)

  for (const note of scaleNotes(key)) {
    if (spelledToPitchClass(note) === target) return note
  }

  return nearestSpelling(target, keySignature(key) >= 0)
}

/**
 * Spell a pitch class with no key context, preferring sharps or flats.
 * Used when Key Mode is off.
 */
export function spellChromatic(pc: PitchClass, preferSharps = true): SpelledNote {
  return nearestSpelling(mod12(pc), preferSharps)
}

/**
 * Choose a spelling for a pitch class using at most one accidental, biased
 * toward sharps or flats.
 */
function nearestSpelling(pc: PitchClass, preferSharps: boolean): SpelledNote {
  for (const letter of LETTERS) {
    if (LETTER_PC[letter] === pc) return { letter, accidental: 0 }
  }
  return { letter: nearestLetter(pc, preferSharps), accidental: preferSharps ? 1 : -1 }
}

/** The letter a chromatic pitch class attaches to, given sharp/flat bias. */
function nearestLetter(pc: PitchClass, preferSharps: boolean): Letter {
  const offset = preferSharps ? -1 : 1
  const naturalPc = mod12(pc + offset)
  for (const letter of LETTERS) {
    if (LETTER_PC[letter] === naturalPc) return letter
  }
  return 'C'
}

/** Convenience: spell a pitch class in a key and render it as text. */
export function noteName(pc: PitchClass, key?: Key): string {
  return renderNote(key ? spellInKey(pc, key) : spellChromatic(pc))
}

/** Build a Key value. */
export function makeKey(tonic: PitchClass, tonality: Tonality): Key {
  return { tonic: mod12(tonic), tonality }
}

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12
}
