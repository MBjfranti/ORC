/**
 * Panel state — what the UI renders and the keyboard drives.
 *
 * NOT in here: which notes are sounding, or where the arpeggiator is. Audio
 * state lives in the engine and is mirrored into React only where it has to be
 * seen. If a note-on triggers a render, timing becomes unpredictable and the
 * instrument feels mushy.
 */

import { create } from 'zustand'

import { GRIDS, LOOP_BARS } from '../core/looper.js'
import type { Grid } from '../core/looper.js'
import { PERFORM_MODES } from '../core/performance.js'
import type { PerformMode } from '../core/performance.js'
import { MODES } from '../core/types.js'
import type { ChordType, Extension, Key, Mode, PitchClass } from '../core/types.js'
import { VOICES } from '../engine/synth.js'
import type { Voice } from '../engine/synth.js'
import type { ChromaticPolicy } from '../core/key.js'

/** Where the keybed sends out-of-key roots. */
export type RootMode = 'chromatic' | 'scale'

export interface PanelState {
  // --- held, mirrors of what the hands are doing ---
  heldTypes: ChordType[]
  heldExtensions: Extension[]

  // --- harmony ---
  keyMode: boolean
  key: Key
  chromatic: ChromaticPolicy
  rootMode: RootMode

  // --- voicing ---
  /** Position along the infinite note stack. Unbounded and signed. */
  voicing: number
  octave: number
  /** Follow the previous chord instead of jumping to an absolute position. */
  voiceLead: boolean

  // --- articulation ---
  performMode: PerformMode
  performAmount: number
  bpm: number

  // --- sound ---
  voice: Voice
  cutoff: number
  reverb: number
  delay: number
  volume: number
  bassOn: boolean
  bassLevel: number

  // --- looper ---
  /** Length of the next recording. `null` records until you stop it. */
  loopBars: number | null
  loopGrid: Grid

  /** Held chords keep sounding after the hands leave. */
  latched: boolean

  setHeldType: (type: ChordType, held: boolean) => void
  setHeldExtension: (ext: Extension, held: boolean) => void
  /** Let go of every pad at once — for when a keyup never arrives. */
  clearHeld: () => void

  toggleKeyMode: () => void
  setKey: (key: Key) => void
  nudgeTonic: (delta: number) => void
  cycleMode: (delta: number) => void
  setChromatic: (policy: ChromaticPolicy) => void
  setRootMode: (mode: RootMode) => void

  nudgeVoicing: (delta: number) => void
  setVoicing: (position: number) => void
  nudgeOctave: (delta: number) => void
  toggleVoiceLead: () => void

  setPerformMode: (mode: PerformMode) => void
  cyclePerformMode: (delta: number) => void
  setPerformAmount: (amount: number) => void
  setBpm: (bpm: number) => void

  setVoice: (voice: Voice) => void
  cycleVoice: (delta: number) => void
  setCutoff: (n: number) => void
  setReverb: (n: number) => void
  setDelay: (n: number) => void
  setVolume: (n: number) => void
  toggleBass: () => void
  setBassLevel: (n: number) => void
  cycleLoopBars: (delta: number) => void
  setLoopGrid: (grid: Grid) => void
  toggleLatch: () => void
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Step an index, stopping at the ends rather than wrapping. */
const clampIndex = (count: number, i: number, delta: number) =>
  Math.max(0, Math.min(count - 1, i + delta))

export const usePanel = create<PanelState>((set) => ({
  heldTypes: [],
  heldExtensions: [],

  keyMode: false,
  key: { tonic: 0, mode: 'ionian' },
  chromatic: 'colour',
  rootMode: 'chromatic',

  voicing: 0,
  octave: 3,
  voiceLead: true,

  performMode: 'off',
  performAmount: 0.35,
  bpm: 96,

  voice: 'warm',
  cutoff: 0.5,
  reverb: 0.22,
  delay: 0,
  volume: 0.75,
  bassOn: true,
  bassLevel: 0.8,

  loopBars: 4,
  loopGrid: 'off',

  latched: false,

  setHeldType: (type, held) =>
    set((s) => ({
      heldTypes: held
        ? s.heldTypes.includes(type)
          ? s.heldTypes
          : [...s.heldTypes, type]
        : s.heldTypes.filter((t) => t !== type),
    })),

  setHeldExtension: (ext, held) =>
    set((s) => ({
      heldExtensions: held
        ? s.heldExtensions.includes(ext)
          ? s.heldExtensions
          : [...s.heldExtensions, ext]
        : s.heldExtensions.filter((e) => e !== ext),
    })),

  /*
   * The pads mirror what your fingers are doing, and that mirror is only true
   * while the window is receiving key events. Alt-tab mid-chord and the keyup
   * never arrives, so the pad stays lit and everything you play afterwards
   * comes out as that chord — silent, but wrong.
   */
  clearHeld: () => set({ heldTypes: [], heldExtensions: [] }),

  toggleKeyMode: () => set((s) => ({ keyMode: !s.keyMode })),
  setKey: (key) => set({ key }),
  nudgeTonic: (delta) =>
    set((s) => ({ key: { ...s.key, tonic: (((s.key.tonic + delta) % 12) + 12) % 12 } })),
  cycleMode: (delta) =>
    set((s) => {
      const i = MODES.indexOf(s.key.mode)
      return { key: { ...s.key, mode: MODES[(i + delta + MODES.length) % MODES.length] as Mode } }
    }),
  setChromatic: (chromatic) => set({ chromatic }),
  setRootMode: (rootMode) => set({ rootMode }),

  nudgeVoicing: (delta) => set((s) => ({ voicing: s.voicing + delta })),
  setVoicing: (voicing) => set({ voicing }),
  nudgeOctave: (delta) => set((s) => ({ octave: Math.max(1, Math.min(6, s.octave + delta)) })),
  toggleVoiceLead: () => set((s) => ({ voiceLead: !s.voiceLead })),

  setPerformMode: (performMode) => set({ performMode }),
  cyclePerformMode: (delta) =>
    set((s) => ({
      performMode: PERFORM_MODES[
        clampIndex(PERFORM_MODES.length, PERFORM_MODES.indexOf(s.performMode), delta)
      ] as PerformMode,
    })),
  setPerformAmount: (amount) => set({ performAmount: clamp01(amount) }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(220, Math.round(bpm))) }),

  setVoice: (voice) => set({ voice }),
  cycleVoice: (delta) =>
    set((s) => ({
      voice: VOICES[clampIndex(VOICES.length, VOICES.indexOf(s.voice), delta)] as Voice,
    })),
  setCutoff: (n) => set({ cutoff: clamp01(n) }),
  setReverb: (n) => set({ reverb: clamp01(n) }),
  setDelay: (n) => set({ delay: clamp01(n) }),
  setVolume: (n) => set({ volume: clamp01(n) }),
  toggleBass: () => set((s) => ({ bassOn: !s.bassOn })),
  cycleLoopBars: (delta) =>
    set((s) => ({
      loopBars: LOOP_BARS[
        clampIndex(LOOP_BARS.length, LOOP_BARS.indexOf(s.loopBars), delta)
      ] as number | null,
    })),
  setLoopGrid: (loopGrid) => set({ loopGrid }),
  setBassLevel: (n) => set({ bassLevel: clamp01(n) }),
  toggleLatch: () => set((s) => ({ latched: !s.latched })),
}))

/** Which pitch class each physical key plays, given the current layout. */
export type { PitchClass }
