/**
 * Where the ten slots actually live.
 *
 * The hardware's loops "stay in memory until the device powers off"
 * (research/08). A tab's equivalent of powering off is a reload, and losing an
 * afternoon's loops to a stray refresh would be a worse instrument than the one
 * being modelled — so they go to `localStorage`.
 *
 * Split from `core/slots.ts` so the rules stay testable without a browser: that
 * file knows what a loop *is*, this one knows where it is kept.
 */

import { emptySlots, parseSlots } from '../core/slots.js'
import type { Slots } from '../core/slots.js'

const KEY = 'orc.loops.v1'

/**
 * Everything here tolerates storage being unavailable.
 *
 * `localStorage` throws rather than returns on a blocked origin, in private
 * windows on some platforms, and when a quota is exceeded. None of those are
 * reasons for the instrument to stop working — the slots simply become
 * session-only, which is exactly what the hardware does anyway.
 */
export function readSlots(): Slots {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptySlots()
    return parseSlots(JSON.parse(raw))
  } catch {
    return emptySlots()
  }
}

export function writeSlots(slots: Slots): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots))
  } catch {
    // Saved for this session and no further. Better than refusing to save.
  }
}
