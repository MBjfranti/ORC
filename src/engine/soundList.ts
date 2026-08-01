/**
 * The Sound list, and the two orders you can walk it in.
 *
 * The hardware's Sound encoder does one thing two ways:
 *
 *   turn          browse by **number**
 *   press + turn  browse by **name**
 *
 * That is not a relabelled readout — it is a genuinely different traversal of
 * the same list. Turning lands you on 06, 07, 08; pressing and turning walks
 * alphabetically, so from "Cosmic Day Spa" the next one is "DX Guitar" no
 * matter what number either carries. Both gestures select from one list, and
 * **user sounds appear after the factory sounds** in it.
 *
 * See research/07-sound-engines-fx-and-presets.md §Browsing.
 *
 * Pure, so the ordering rules can be tested without an audio context. It lives
 * in `engine/` rather than `core/` because a sound list is not music theory.
 */

import { PRESETS } from './presets.js'
import type { UserSound, UserSounds } from './userSounds.js'

export interface SoundEntry {
  /** Position in number order — the canonical index everything else uses. */
  readonly index: number
  /** What the display shows to the left of the name. */
  readonly number: number
  readonly name: string
  /** User sounds sort and label differently, and can be overwritten. */
  readonly user: boolean
  /** Which of the 30 slots, for user sounds only. */
  readonly slot?: number
}

/**
 * The whole browsable list, in number order.
 *
 * Factory sounds keep their catalogue numbers. User sounds continue the
 * numbering after them rather than restarting at 1 — on the hardware they are
 * one continuous list you keep turning into, not a separate bank.
 */
export function soundList(userSounds: UserSounds): SoundEntry[] {
  const list: SoundEntry[] = PRESETS.map((preset, i) => ({
    index: i,
    number: preset.id,
    name: preset.name,
    user: false,
  }))

  userSounds.forEach((sound, slot) => {
    if (!sound) return
    list.push({
      index: list.length,
      number: PRESETS.length + slot + 1,
      name: sound.name,
      user: true,
      slot,
    })
  })

  return list
}

/**
 * The same entries, alphabetically.
 *
 * Case-insensitive and numeric-aware, so "Sound 2" precedes "Sound 10" — the
 * default string sort puts them the other way round, which reads as a bug the
 * first time you scroll past it. Ties break on index so the order is total and
 * the traversal can never stall.
 */
export function nameOrder(list: readonly SoundEntry[]): SoundEntry[] {
  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
  return [...list].sort((a, b) => collator.compare(a.name, b.name) || a.index - b.index)
}

/**
 * Step `delta` places through the list in the given order.
 *
 * Returns a number-order index, whichever order was walked, because that is
 * what selection is keyed on. Clamps rather than wraps: the hardware's encoder
 * stops at the ends of the list, and wrapping from the last user sound back to
 * factory 01 makes it impossible to tell where the list ends.
 */
export function stepSound(
  list: readonly SoundEntry[],
  current: number,
  delta: number,
  order: 'number' | 'name',
): number {
  if (list.length === 0) return 0

  const walk = order === 'name' ? nameOrder(list) : list
  const at = walk.findIndex((e) => e.index === current)
  // An index that is not in the list — a user sound deleted from under the
  // cursor — starts the walk from the top rather than throwing.
  const from = at < 0 ? 0 : at
  const next = Math.max(0, Math.min(walk.length - 1, from + delta))
  return walk[next]!.index
}

/** The entry at a number-order index, or the first one if it has gone. */
export function soundAt(list: readonly SoundEntry[], index: number): SoundEntry | undefined {
  return list[index] ?? list[0]
}

/** How the display labels a sound: `06  Trout`. */
export function soundLabel(entry: SoundEntry): string {
  return `${String(entry.number).padStart(2, '0')}  ${entry.name}`
}

/** The first free user slot, or -1 when all thirty are full. */
export function freeSlot(userSounds: UserSounds): number {
  return userSounds.findIndex((s) => s === null)
}

/**
 * Name a newly saved sound after the factory sound it grew out of.
 *
 * "Trout 2" tells you where you were when you found it; "User 07" tells you
 * nothing. Disambiguated against the names already in use so saving the same
 * patch twice does not produce two identical entries.
 */
export function autoName(userSounds: UserSounds, from: string): string {
  const taken = new Set(userSounds.filter((s): s is UserSound => s !== null).map((s) => s.name))
  for (let n = 2; ; n++) {
    const candidate = `${from} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}
