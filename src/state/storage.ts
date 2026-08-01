/**
 * Persistence.
 *
 * Two rules throughout: **never throw**, and **never trust what comes back**.
 * Storage can be full, disabled entirely (private browsing), or hold data
 * written by an older version of this app. Any of those must degrade to
 * defaults rather than take the instrument down — losing a saved key is a
 * nuisance, failing to boot is not.
 */

import type { Loop } from '../core/looper.js'
import { emptyUserSounds, isUserSound, USER_SLOTS } from '../engine/userSounds.js'
import type { UserSound, UserSounds } from '../engine/userSounds.js'

const PREFIX = 'orc1'
const SETTINGS_KEY = `${PREFIX}.settings`
const LOOPS_KEY = `${PREFIX}.loops`

/**
 * Bump when a change would make old data misleading rather than merely
 * incomplete. Anything with a different version is discarded on read, which is
 * why every field is validated below instead of being cast.
 */
const VERSION = 1

export const LOOP_SLOTS = 10

/** Settings worth remembering. Deliberately excludes anything transient. */
export interface PersistedSettings {
  presetIndex: number
  voicing: number
  octave: number
  bpm: number
  performMode: string
  performAmount: number
  bassOn: boolean
  bassMode: string
  bassVoicing: number
  bassPresetIndex: number
  singleNotes: string
  splitPoint: number
  keyMode: boolean
  keyTonic: number
  keyMode_: string
  rootLayout: string
  tier: string
  loopBars: number | null
  quantize: string
  beatOn: boolean
  beatIndex: number
  playStyle: string
  extensionAddition: string
  secretChords: string
  extended: boolean
  performLock: boolean
  fxLock: boolean
  transpose: number
  velocitySense: boolean
  metronome: string
  timeSignature: string
  soundIndex: number
  masterVolume: number
  bassVolume: number
  drumVolume: number
  view: string
  midiChannels: Record<string, number | null>
  midiPort: string
}

function available(): Storage | undefined {
  try {
    const s = window.localStorage
    // Private mode can expose the API and reject every write, so prove it works.
    const probe = `${PREFIX}.probe`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return undefined
  }
}

function read<T>(key: string): T | undefined {
  const store = available()
  if (!store) return undefined
  try {
    const raw = store.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { version?: number; data?: T }
    if (parsed?.version !== VERSION) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

function write(key: string, data: unknown): boolean {
  const store = available()
  if (!store) return false
  try {
    store.setItem(key, JSON.stringify({ version: VERSION, data }))
    return true
  } catch {
    // Almost always the quota. Callers carry on without persistence.
    return false
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function loadSettings(): Partial<PersistedSettings> {
  const raw = read<Record<string, unknown>>(SETTINGS_KEY)
  if (!raw || typeof raw !== 'object') return {}

  // Copy field by field with type checks. A hand-edited or half-migrated blob
  // should contribute whatever is valid and nothing else.
  const out: Partial<PersistedSettings> = {}
  const num = (k: keyof PersistedSettings) => {
    const v = raw[k]
    if (typeof v === 'number' && Number.isFinite(v)) (out as Record<string, unknown>)[k] = v
  }
  const bool = (k: keyof PersistedSettings) => {
    const v = raw[k]
    if (typeof v === 'boolean') (out as Record<string, unknown>)[k] = v
  }
  const str = (k: keyof PersistedSettings) => {
    const v = raw[k]
    if (typeof v === 'string') (out as Record<string, unknown>)[k] = v
  }

  num('presetIndex')
  num('soundIndex')
  num('masterVolume')
  num('bassVolume')
  num('drumVolume')
  num('voicing')
  num('octave')
  num('bpm')
  num('performAmount')
  num('bassVoicing')
  num('bassPresetIndex')
  num('transpose')
  num('splitPoint')
  num('keyTonic')
  num('beatIndex')
  bool('bassOn')
  bool('keyMode')
  bool('beatOn')
  str('secretChords')
  bool('extended')
  bool('performLock')
  bool('fxLock')
  bool('velocitySense')
  str('metronome')
  str('timeSignature')
  str('view')
  str('singleNotes')
  str('playStyle')
  str('extensionAddition')
  str('performMode')
  str('bassMode')
  str('keyMode_')
  str('rootLayout')
  str('tier')
  str('quantize')
  str('midiPort')

  if (raw.loopBars === null || typeof raw.loopBars === 'number') out.loopBars = raw.loopBars
  if (raw.midiChannels && typeof raw.midiChannels === 'object') {
    out.midiChannels = raw.midiChannels as Record<string, number | null>
  }

  return out
}

export function saveSettings(settings: PersistedSettings): boolean {
  return write(SETTINGS_KEY, settings)
}

// ---------------------------------------------------------------------------
// Loop slots
// ---------------------------------------------------------------------------

export type LoopSlots = (Loop | null)[]

function emptySlots(): LoopSlots {
  return Array.from({ length: LOOP_SLOTS }, () => null)
}

export function loadLoops(): LoopSlots {
  const raw = read<unknown[]>(LOOPS_KEY)
  if (!Array.isArray(raw)) return emptySlots()

  return Array.from({ length: LOOP_SLOTS }, (_, i) => {
    const candidate = raw[i]
    return isLoop(candidate) ? candidate : null
  })
}

export function saveLoops(slots: LoopSlots): boolean {
  return write(LOOPS_KEY, slots.slice(0, LOOP_SLOTS))
}

/**
 * Structural check on a loaded loop.
 *
 * A malformed loop would otherwise reach the scheduler and throw on every pass,
 * which is a far worse failure than the slot appearing empty.
 */
function isLoop(value: unknown): value is Loop {
  if (!value || typeof value !== 'object') return false
  const loop = value as Partial<Loop>
  if (typeof loop.lengthSeconds !== 'number' || !(loop.lengthSeconds > 0)) return false
  if (!(loop.bars === null || typeof loop.bars === 'number')) return false
  if (!Array.isArray(loop.layers)) return false

  return loop.layers.every(
    (layer) =>
      layer &&
      Array.isArray(layer.events) &&
      (layer.events as unknown[]).every(
        (e: any) =>
          typeof e?.time === 'number' &&
          typeof e?.note === 'number' &&
          typeof e?.duration === 'number' &&
          typeof e?.velocity === 'number' &&
          (e?.stream === 'performance' || e?.stream === 'bass'),
      ),
  )
}

// ---------------------------------------------------------------------------
// User sounds
// ---------------------------------------------------------------------------

const SOUNDS_KEY = `${PREFIX}.sounds`

export function loadUserSounds(): UserSounds {
  const raw = read<unknown[]>(SOUNDS_KEY)
  if (!Array.isArray(raw)) return emptyUserSounds()
  return Array.from({ length: USER_SLOTS }, (_, i) =>
    isUserSound(raw[i]) ? (raw[i] as UserSound) : null,
  )
}

export function saveUserSounds(sounds: UserSounds): boolean {
  return write(SOUNDS_KEY, sounds.slice(0, USER_SLOTS))
}

/** Wipe everything this app has stored. */
export function clearAll(): void {
  const store = available()
  if (!store) return
  try {
    store.removeItem(SETTINGS_KEY)
    store.removeItem(LOOPS_KEY)
    store.removeItem(SOUNDS_KEY)
  } catch {
    /* nothing useful to do */
  }
}
