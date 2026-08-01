/**
 * The QWERTY mapping.
 *
 * Bound to `event.code` — physical position — never `event.key`, so the layout
 * survives AZERTY, QWERTZ and Dvorak. A French player still gets a piano under
 * their fingers; only the printed legends change.
 *
 * On an ANSI board the home row sits a quarter-key right of the top row, which
 * puts every black key precisely between its two white keys:
 *
 *     Q  W  E  R      Y  U     O  P  [        types  ·  black keys
 *      A  S  D  F    G  H  J  K  L  ;  '      exts   ·  white keys
 */

import { scaleNotes } from '../core/key.js'
import type { Key, PitchClass } from '../core/types.js'
import type { ChordType, Extension } from '../core/types.js'
import type { RootMode } from '../state/panel.js'

/** Physical key → pitch class, chromatic layout. */
export const ROOT_KEYS: Readonly<Record<string, PitchClass>> = {
  KeyG: 0,
  KeyY: 1,
  KeyH: 2,
  KeyU: 3,
  KeyJ: 4,
  KeyK: 5,
  KeyO: 6,
  KeyL: 7,
  KeyP: 8,
  Semicolon: 9,
  BracketLeft: 10,
  Quote: 11,
}

export const TYPE_KEYS: Readonly<Record<string, ChordType>> = {
  KeyQ: 'dim',
  KeyW: 'min',
  KeyE: 'maj',
  KeyR: 'sus',
}

/**
 * Extensions on the bottom row, not the home row.
 *
 * `A S D F` is the obvious choice and it is the wrong one: a chord with an
 * extension needs three keys down at once, and on many keyboards the home row
 * sits in the same matrix neighbourhood as `Q W E R`, so the third keystroke is
 * silently dropped. `Z X C V` is one row further away and stays under the same
 * hand.
 */
export const EXTENSION_KEYS: Readonly<Record<string, Extension>> = {
  KeyZ: '6',
  KeyX: 'm7',
  KeyC: 'M7',
  KeyV: '9',
}

export const WHITE_KEYS: readonly string[] = [
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
  'Quote',
]

export const BLACK_KEYS: readonly string[] = ['KeyY', 'KeyU', 'KeyO', 'KeyP', 'BracketLeft']

/** Which white key each black key sits after — the shape that reads as a piano. */
export const BLACK_AFTER = [0, 1, 3, 4, 5]

/**
 * Which pitch each physical key plays.
 *
 * In `scale` mode the keybed collapses to seven keys walking the mode, and the
 * black keys drop out entirely. Keeping them and handing them the five leftover
 * chromatic notes is the obvious alternative and it reads terribly — the
 * leftovers interleave with the scale, so C Dorian spells `C D♭ D E E♭ F` and
 * stops ascending. Seven keys in a row is what "the notes of the mode" looks
 * like; chromatic colour is one switch away.
 */
let cached: { mode: RootMode; tonic: number; keyMode: string; map: Record<string, PitchClass> } | undefined

export function rootMap(mode: RootMode, key: Key): Record<string, PitchClass> {
  // Called on every keydown *and* keyup, so it must not allocate. The answer
  // depends on exactly three values; hold on to the last one.
  if (
    cached &&
    cached.mode === mode &&
    cached.tonic === key.tonic &&
    cached.keyMode === key.mode
  ) {
    return cached.map
  }

  let map: Record<string, PitchClass>
  if (mode !== 'scale') {
    map = ROOT_KEYS as Record<string, PitchClass>
  } else {
    map = {}
    const scale = scaleNotes(key)
    WHITE_KEYS.forEach((code, i) => {
      const pc = scale[i]
      if (pc !== undefined) map[code] = pc
    })
  }

  cached = { mode, tonic: key.tonic, keyMode: key.mode, map }
  return map
}

/** US QWERTY legends, upgraded per-keyboard where the browser allows it. */
const US: Readonly<Record<string, string>> = {
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
  KeyR: 'R',
  KeyZ: 'Z',
  KeyX: 'X',
  KeyC: 'C',
  KeyV: 'V',
  KeyG: 'G',
  KeyY: 'Y',
  KeyH: 'H',
  KeyU: 'U',
  KeyJ: 'J',
  KeyK: 'K',
  KeyO: 'O',
  KeyL: 'L',
  KeyP: 'P',
  Semicolon: ';',
  BracketLeft: '[',
  Quote: "'",
}

export type Legends = Readonly<Record<string, string>>
export const DEFAULT_LEGENDS: Legends = US

/**
 * What each bound key actually shows on this keyboard.
 *
 * Chromium-only; everywhere else this resolves to the US defaults. The
 * *bindings* never change — only the printed labels.
 */
export async function resolveLegends(): Promise<Legends> {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard
  if (!keyboard?.getLayoutMap) return US

  try {
    const map = await keyboard.getLayoutMap()
    const out: Record<string, string> = { ...US }
    for (const code of Object.keys(US)) {
      const label = map.get(code)
      if (label) out[code] = label.toUpperCase()
    }
    return out
  } catch {
    return US
  }
}

interface KeyboardApi {
  getLayoutMap?: () => Promise<Map<string, string>>
}
