/**
 * The encoder row, as data.
 *
 * One definition drives both the rendered knobs and the number keys, so the two
 * can never disagree about what encoder 1 is. The panel prints its number under
 * each one — `Sound (1)` — because that number *is* the keyboard shortcut, not
 * a label for a separate feature.
 *
 * The row is being rebuilt one encoder at a time; this list is the order they
 * appear in and the order the digits address them.
 */

import { SOUNDS } from '../engine/sounds.js'
import type { PanelState } from '../state/panel.js'

export interface Encoder {
  readonly id: string
  readonly label: string
  /** Turned: a signed number of detents. */
  readonly turn: (s: PanelState, delta: number) => void
  /** Pressed. Steps to the next value, wrapping — see `Dial`. */
  readonly press?: (s: PanelState) => void
  /** How far the pointer travels for one detent. Coarse lists want more. */
  readonly sensitivity?: number
}

export const ENCODERS: readonly Encoder[] = [
  {
    id: 'sound',
    label: 'Sound',
    turn: (s, d) => s.cycleSound(d),
    press: (s) => s.setSound((s.soundIndex + 1) % SOUNDS.length),
    // Fifty of them, so the dial wants real travel rather than a hair-trigger.
    sensitivity: 8,
  },
]

/** `Sound (1)` — the printed legend, number included. */
export function encoderLegend(index: number): string {
  return `${ENCODERS[index]!.label} (${index + 1})`
}
