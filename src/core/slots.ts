/**
 * The ten loop slots — §12.7.
 *
 * > "You can save up to 10 Loops on Orchid. Long press the Loop Dial to access
 * > the Save Loop menu. Select **Save As Loop XX** to save your loop in the next
 * > available spot. Select **Save As** to select which spot to save your Loop
 * > in. Select **Load Loop** to retrieve and play your saved Loops. Select
 * > **Delete Loop** to delete your saved Loops."
 *
 * ## Ten, and why not more
 *
 * research/08 calls this "the single clearest gap for our webapp… a browser has
 * localStorage, IndexedDB, file export and unlimited slots". True, and the
 * temptation is to give it fifty. It keeps ten: the count is documented, `Save
 * As Loop XX` names a two-digit slot, and an instrument with a different number
 * of slots from the one it is modelled on stops being the same instrument.
 *
 * What a browser *can* add without changing the interface is **persistence**.
 * The hardware's loops live "in memory until the device powers off"; these
 * survive a reload. Same ten slots, longer memory — an improvement that costs
 * the imitation nothing.
 *
 * ## Overwriting
 *
 * research/08: "New loops **overwrite** an occupied slot without a separate
 * confirm step — worth designing around." Kept, because a confirm step on a
 * four-row menu is the kind of safety that makes an instrument tiring. `Delete`
 * is the deliberate act; `Save As` onto a full slot is the player's business.
 */

import type { Loop } from './looper.js'

/** §12.7, and the reason the label has two digits. */
export const SLOT_COUNT = 10

/** `Loop 01` — one-based and zero-padded, as §12.7 writes it. */
export const slotLabel = (index: number): string => `Loop ${String(index + 1).padStart(2, '0')}`

export type Slots = readonly (Loop | null)[]

export const emptySlots = (): Slots => Array.from({ length: SLOT_COUNT }, () => null)

/**
 * The slot `Save As Loop XX` will use — "the next available spot".
 *
 * With every slot full there is no next available spot and the manual does not
 * say what happens. It falls back to the first, which is at least consistent
 * with the documented overwrite-without-confirm behaviour, and is flagged on
 * the row itself by the number it prints.
 */
export function nextFree(slots: Slots): number {
  const free = slots.findIndex((s) => s === null)
  return free === -1 ? 0 : free
}

/** A short description of what is in a slot, for the picker's value column. */
export function slotSummary(loop: Loop | null): string {
  if (!loop) return '--'
  // Bars is what the Waiting Room chose, so it is what the player will
  // recognise. `Free` loops have none, so their length stands in.
  if (loop.bars === null) return `${loop.lengthSeconds.toFixed(1)}s`
  return loop.bars === 1 ? '1 Bar' : `${loop.bars} Bars`
}

/**
 * Whether a value read back from storage is really a loop.
 *
 * Anything can end up in localStorage — an older build's shape, a half-written
 * value, someone poking at devtools. A malformed slot must read as *empty*
 * rather than crash the looper on load, so this checks the shape rather than
 * trusting it.
 */
export function isLoop(value: unknown): value is Loop {
  if (typeof value !== 'object' || value === null) return false
  const loop = value as Partial<Loop>
  if (typeof loop.lengthSeconds !== 'number' || !Number.isFinite(loop.lengthSeconds)) return false
  if (!(loop.bars === null || typeof loop.bars === 'number')) return false
  if (!Array.isArray(loop.layers)) return false
  return loop.layers.every(
    (layer) =>
      typeof layer === 'object' &&
      layer !== null &&
      Array.isArray(layer.events) &&
      typeof layer.sound === 'number' &&
      typeof layer.bassSound === 'number' &&
      layer.events.every(
        (e: unknown) =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as { note?: unknown }).note === 'number' &&
          typeof (e as { time?: unknown }).time === 'number',
      ),
  )
}

/** Read a whole bank back, replacing anything unrecognisable with an empty slot. */
export function parseSlots(raw: unknown): Slots {
  if (!Array.isArray(raw)) return emptySlots()
  return Array.from({ length: SLOT_COUNT }, (_, i) => (isLoop(raw[i]) ? (raw[i] as Loop) : null))
}

/** Every distinct preset a loop's layers need, so they can be built before it plays. */
export function presetsIn(loop: Loop): { sounds: number[]; basses: number[] } {
  return {
    sounds: [...new Set(loop.layers.map((l) => l.sound))],
    basses: [...new Set(loop.layers.map((l) => l.bassSound))],
  }
}
