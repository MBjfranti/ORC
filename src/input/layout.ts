/**
 * The QWERTY keyboard mapping.
 *
 * Bound to `event.code` (physical position), never `event.key`, so the layout
 * survives AZERTY, QWERTZ and Dvorak — a French player still gets a piano under
 * their fingers. See research/11-webapp-implications.md §1.
 *
 * On an ANSI board the home row sits +0.25u right of the top row, which places
 * every black key precisely between its two white keys:
 *
 *     Q  W  E  R  T   Y  U  I  O  P  [        types      black keys
 *      A  S  D  F  G  H  J  K  L  ;  '        extensions white keys
 */

import { scaleRoots } from '../core/key.js'
import type { ChordType, Extension, Key, PitchClass } from '../core/types.js'

/** Physical key code -> pitch class, 0 = C. */
export const ROOT_KEYS: Readonly<Record<string, PitchClass>> = {
  KeyG: 0, // C
  KeyY: 1, // C#
  KeyH: 2, // D
  KeyU: 3, // D#
  KeyJ: 4, // E
  KeyK: 5, // F
  KeyO: 6, // F#
  KeyL: 7, // G
  KeyP: 8, // G#
  Semicolon: 9, // A
  BracketLeft: 10, // A#
  Quote: 11, // B
}

/** Physical key code -> chord type. Top row, left hand. */
export const TYPE_KEYS: Readonly<Record<string, ChordType>> = {
  KeyQ: 'dim',
  KeyW: 'min',
  KeyE: 'maj',
  KeyR: 'sus',
}

/** Physical key code -> extension. Home row, left hand. */
export const EXTENSION_KEYS: Readonly<Record<string, Extension>> = {
  KeyA: '6',
  KeyS: 'm7',
  KeyD: 'M7',
  KeyF: '9',
}

/**
 * The one shortcut that survives.
 *
 * Everything else is reached by selecting a dial (1-9) and turning it
 * (arrows) or pressing it (Enter). Latch, preset browsing and tier cycling
 * all used to live here and were removed — each was a second, undocumented
 * way to reach something the encoder row already covers.
 *
 * Voicing is different in kind. It is the one control you reach for *while a
 * chord is sounding*, which is exactly when your other hand is on the
 * keyboard and cannot go and select a dial first. The hardware gives it a
 * dedicated knob under your left hand for the same reason; `-` and `+` are
 * the closest a computer keyboard gets.
 *
 * Hold Ctrl and the same keys walk the *bass* voicing — the deck's second,
 * smaller knob, and the same argument applies to it.
 */
export const VOICING_KEYS: Readonly<Record<string, number>> = {
  Minus: -1,
  Equal: 1,
  NumpadSubtract: -1,
  NumpadAdd: 1,
}

/** The seven keys drawn as white keys, low to high. */
export const WHITE_KEYS: readonly string[] = [
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
  'Quote',
]

/** The five keys drawn as black keys, low to high. */
export const BLACK_KEYS: readonly string[] = ['KeyY', 'KeyU', 'KeyO', 'KeyP', 'BracketLeft']

/**
 * How the twelve physical keys map onto pitch.
 *
 * `chromatic` and `correct` share a layout and differ only in what an
 * out-of-key root produces; `scale` re-maps the keyboard itself.
 */
export type RootLayout = 'chromatic' | 'correct' | 'scale'

export const ROOT_LAYOUT_LABEL: Record<RootLayout, string> = {
  chromatic: 'Chromatic',
  correct: 'Correct',
  scale: 'Scale',
}

/**
 * Which pitch each physical key plays.
 *
 * In `scale` layout the keyboard collapses to seven keys: G H J K L ; ' walk
 * the notes of the mode, and the black keys drop out entirely.
 *
 * Keeping the black keys and giving them the five leftover chromatic notes was
 * the obvious alternative, and it reads terribly — the leftovers interleave with
 * the scale, so in C Dorian the keybed spells `C D♭ D E E♭ F …` and no longer
 * ascends. Seven keys in a row is what "the notes of the mode" actually looks
 * like. Chromatic colour stays one switch away.
 *
 * This is our answer to the twelve-keys-versus-seven-degrees problem flagged in
 * research/04-key-mode-and-harmony.md.
 */
export function rootMap(layout: RootLayout, key: Key): Record<string, RootId> {
  const map: Record<string, RootId> = {}

  if (layout === 'scale') {
    const scale = scaleRoots(key)
    WHITE_KEYS.forEach((code, i) => {
      const pc = scale[i]
      if (pc !== undefined) map[code] = pc
    })
  } else {
    Object.assign(map, ROOT_KEYS)
  }

  return map
}

/**
 * A root, encoded as `pitchClass + 12 × octaveShift`.
 *
 * Carrying the shift in the same value keeps the octave key distinguishable
 * from the tonic it doubles — otherwise both are pitch class 0 and the two
 * collide in the held-roots stack.
 */
export type RootId = number

export function pitchClassOf(root: RootId): PitchClass {
  return ((root % 12) + 12) % 12
}

export function octaveShiftOf(root: RootId): number {
  return Math.floor(root / 12)
}

/** Ordered root keys, low to high — the keybed's left-to-right order. */
export const KEYBED_ORDER: readonly string[] = [
  'KeyG',
  'KeyY',
  'KeyH',
  'KeyU',
  'KeyJ',
  'KeyK',
  'KeyO',
  'KeyL',
  'KeyP',
  'Semicolon',
  'BracketLeft',
  'Quote',
]

/** True for the five keys drawn as black keys. */
export function isBlackKey(code: string): boolean {
  const pc = ROOT_KEYS[code]
  return pc !== undefined && [1, 3, 6, 8, 10].includes(pc)
}

/**
 * What is printed on the physical keycap, for the silkscreen legends in
 * research/11-webapp-implications.md §1c.
 *
 * US QWERTY fallback. `resolveLegends` upgrades these using the Keyboard Map
 * API where the browser supports it.
 */
const US_LEGEND: Readonly<Record<string, string>> = {
  KeyQ: 'q',
  KeyW: 'w',
  KeyE: 'e',
  KeyR: 'r',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyF: 'f',
  KeyG: 'g',
  KeyY: 'y',
  KeyH: 'h',
  KeyU: 'u',
  KeyJ: 'j',
  KeyK: 'k',
  KeyO: 'o',
  KeyL: 'l',
  KeyP: 'p',
  Semicolon: ';',
  BracketLeft: '[',
  BracketRight: ']',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Minus: '-',
  Equal: '=',
  Space: 'space',
  Escape: 'esc',
  KeyZ: 'z',
  KeyX: 'x',
  KeyC: 'c',
  KeyV: 'v',
  KeyB: 'b',
  KeyN: 'n',
  KeyM: 'm',
  Slash: '/',
  Enter: '⏎',
  Backquote: '`',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
}

export type LegendMap = Readonly<Record<string, string>>

/** The US QWERTY legends, used as-is when the Keyboard Map API is unavailable. */
export const DEFAULT_LEGENDS: LegendMap = US_LEGEND

/**
 * Resolve what each bound key actually shows on this user's keyboard.
 *
 * Chromium-only (`navigator.keyboard`); everywhere else this resolves to the US
 * defaults. The *bindings* never change — only the printed labels.
 */
export async function resolveLegends(): Promise<LegendMap> {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard
  if (!keyboard?.getLayoutMap) return US_LEGEND

  try {
    const map = await keyboard.getLayoutMap()
    const resolved: Record<string, string> = { ...US_LEGEND }
    for (const code of Object.keys(US_LEGEND)) {
      const label = map.get(code)
      if (label) resolved[code] = label
    }
    return resolved
  } catch {
    return US_LEGEND
  }
}

interface KeyboardApi {
  getLayoutMap?: () => Promise<Map<string, string>>
}
