/**
 * User sounds.
 *
 * A user sound is **not** a synthesis patch — it is a snapshot of the whole
 * signal chain: which factory sound, where the filter sits, every effect
 * amount, and the performance mode on top. The hardware describes it exactly
 * that way ("save that combination of a sound patch, effects, performance, and
 * filter"), and it is the more useful unit: what you want to keep is the vibe
 * you stumbled into, not an oscillator setting.
 *
 * See research/07-sound-engines-fx-and-presets.md.
 */

import { FX_TYPES } from './SynthEngine.js'
import type { FxAmounts, FxType } from './SynthEngine.js'
import type { PerformMode } from '../core/performance.js'

export const USER_SLOTS = 30

export interface UserSound {
  readonly name: string
  readonly presetIndex: number
  readonly cutoff: number
  readonly fx: FxAmounts
  readonly performMode: PerformMode
  readonly performAmount: number
}

export type UserSounds = (UserSound | null)[]

export function emptyUserSounds(): UserSounds {
  return Array.from({ length: USER_SLOTS }, () => null)
}

/**
 * Structural check on a stored sound.
 *
 * Same reasoning as the loop slots: a malformed sound would reach the engine
 * and produce silence or a stuck filter, which is worse than the slot simply
 * reading as empty.
 */
export function isUserSound(value: unknown): value is UserSound {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<UserSound>
  if (typeof s.name !== 'string') return false
  if (typeof s.presetIndex !== 'number' || !Number.isFinite(s.presetIndex)) return false
  if (typeof s.cutoff !== 'number' || !Number.isFinite(s.cutoff)) return false
  if (typeof s.performAmount !== 'number' || !Number.isFinite(s.performAmount)) return false
  if (typeof s.performMode !== 'string') return false
  if (!s.fx || typeof s.fx !== 'object') return false
  return FX_TYPES.every((t) => typeof (s.fx as Record<string, unknown>)[t] === 'number')
}

/** A default name, so saving never demands typing before you can hear it. */
export function autoName(slot: number, presetName: string): string {
  return `U${String(slot + 1).padStart(2, '0')} ${presetName}`
}

export function fxAmount(fx: FxAmounts, type: FxType): number {
  return Math.max(0, Math.min(1, fx[type] ?? 0))
}
