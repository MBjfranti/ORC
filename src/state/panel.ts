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
import { SOUNDS } from '../engine/sounds.js'
import type { ChromaticPolicy } from '../core/key.js'

/**
 * The effects rack.
 *
 * One is selected at a time — that is what the FX dial points at — and the
 * encoder beside it edits whichever one that is. The others hold their value,
 * so you build a chain up rather than being limited to one live effect.
 */
export type FxId = 'colour' | 'chorus' | 'delay' | 'reverb'

export const FX_IDS: readonly FxId[] = ['colour', 'chorus', 'delay', 'reverb']

export const FX_LABEL: Record<FxId, string> = {
  colour: 'Colour',
  chorus: 'Chorus',
  delay: 'Delay',
  reverb: 'Reverb',
}

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
  /**
   * The Perform section's on/off, separate from the `off` position on the dial.
   *
   * A bypass rather than a mode: switching it off drops back to block chords
   * without losing which mode you had dialled in, so you can drop the
   * articulation for a phrase and bring the same one back. The dial's own `off`
   * is for when you want the pointer to say so.
   */
  performOn: boolean
  bpm: number

  // --- sound ---
  /** Index into the fifty-strong library. */
  soundIndex: number
  /** Which effect the FX dial is pointing at; the encoder edits this one. */
  fx: FxId
  cutoff: number
  chorus: number
  reverb: number
  delay: number
  volume: number
  bassOn: boolean
  bassLevel: number

  // --- looper ---
  /** Length of the next recording. `null` records until you stop it. */
  loopBars: number | null
  loopGrid: Grid

  /**
   * Which encoder the number row is addressing.
   *
   * The digits pick a knob and `-`/`=` turn it, which is how you reach the top
   * row without letting go of the keyboard — the whole point of numbering them
   * on the panel.
   */
  dialFocus: number
  /**
   * Which encoder's list the screen is showing, or `null` for the resting
   * display.
   *
   * Selecting an encoder opens its list — that is what the number keys are
   * for, and it is why the panel prints the number under each knob.
   */
  screenList: number | null

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
  togglePerform: () => void
  setBpm: (bpm: number) => void

  setSound: (index: number) => void
  cycleSound: (delta: number) => void
  setFx: (fx: FxId) => void
  cycleFx: (delta: number) => void
  /** Set whichever effect the dial is currently pointing at. */
  nudgeFxAmount: (delta: number) => void
  setCutoff: (n: number) => void
  setChorus: (n: number) => void
  setReverb: (n: number) => void
  setDelay: (n: number) => void
  setVolume: (n: number) => void
  toggleBass: () => void
  setBassLevel: (n: number) => void
  cycleLoopBars: (delta: number) => void
  setLoopGrid: (grid: Grid) => void
  toggleLatch: () => void
  setDialFocus: (index: number) => void
  setScreenList: (index: number | null) => void
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
  performOn: true,
  bpm: 96,

  soundIndex: 0,
  fx: 'reverb',
  cutoff: 0.5,
  chorus: 0.2,
  reverb: 0.22,
  delay: 0,
  volume: 0.75,
  bassOn: true,
  bassLevel: 0.8,

  loopBars: 4,
  loopGrid: 'off',

  dialFocus: 0,
  screenList: null,
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
  togglePerform: () => set((s) => ({ performOn: !s.performOn })),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(220, Math.round(bpm))) }),

  setSound: (soundIndex) =>
    set({ soundIndex: Math.max(0, Math.min(SOUNDS.length - 1, soundIndex)) }),
  cycleSound: (delta) =>
    set((s) => ({ soundIndex: clampIndex(SOUNDS.length, s.soundIndex, delta) })),
  setFx: (fx) => set({ fx }),
  cycleFx: (delta) =>
    set((s) => ({ fx: FX_IDS[clampIndex(FX_IDS.length, FX_IDS.indexOf(s.fx), delta)] as FxId })),
  nudgeFxAmount: (delta) =>
    set((s) => {
      const step = delta * 0.02
      switch (s.fx) {
        case 'colour':
          return { cutoff: clamp01(s.cutoff + step) }
        case 'chorus':
          return { chorus: clamp01(s.chorus + step) }
        case 'delay':
          return { delay: clamp01(s.delay + step) }
        default:
          return { reverb: clamp01(s.reverb + step) }
      }
    }),
  setCutoff: (n) => set({ cutoff: clamp01(n) }),
  setChorus: (n) => set({ chorus: clamp01(n) }),
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
  setDialFocus: (dialFocus) => set({ dialFocus }),
  setScreenList: (screenList) => set({ screenList }),
}))

/** Which pitch class each physical key plays, given the current layout. */
export type { PitchClass }
