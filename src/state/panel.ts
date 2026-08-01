/**
 * Panel state.
 *
 * Dial values, held buttons, switch positions — the things the UI renders.
 *
 * NOT in here: which notes are sounding, scheduler position, voice allocation.
 * Audio state lives in the engine and is mirrored into React on rAF. If a
 * note-on ever triggers a render, timing becomes unpredictable and the
 * instrument feels mushy. See research/12-tech-stack.md §React traps.
 */

import { create } from 'zustand'

import { MODES } from '../core/types.js'
import type { SingleNotes } from '../core/split.js'
import type { ChordType, Extension, Key, Mode, PitchClass } from '../core/types.js'
import { FX_TYPES, presetFx, prominentFx } from '../engine/SynthEngine.js'
import type { FxAmounts, FxType } from '../engine/SynthEngine.js'
import { freeSlot, soundAt, soundList, stepSound, autoName } from '../engine/soundList.js'
import { emptyUserSounds } from '../engine/userSounds.js'
import type { UserSound, UserSounds } from '../engine/userSounds.js'
import { loadSettings } from './storage.js'
import type { PersistedSettings } from './storage.js'
import type { ChromaticPolicy } from '../core/key.js'
import type { RootLayout } from '../input/layout.js'

/** `correct` snaps out-of-key roots inward; the others let them colour. */
/**
 * `harmonic` is what the hardware does, so it is the parity default. The
 * richer `borrow` policy is ours and rides with the Scale layout, which is
 * itself Extended-only.
 */
export function chromaticPolicy(layout: RootLayout): ChromaticPolicy {
  if (layout === 'correct') return 'snap'
  return layout === 'scale' ? 'borrow' : 'harmonic'
}
import { BASS_MODES } from '../core/bass.js'
import { BASS_PRESETS, DEFAULT_BASS_PRESET } from '../engine/bassPresets.js'
import type { BassMode } from '../core/bass.js'
import { BEATS, clearHits, setSwing, toggleHit } from '../core/beats.js'
import type { MetronomeSound } from '../engine/DrumMachine.js'
import {
  DEFAULT_TIME_SIGNATURE,
  sameTimeSignature,
  TIME_SIGNATURES,
  timeSignatureAt,
  timeSignatureLabel,
} from '../core/timeSignature.js'
import type { TimeSignature } from '../core/timeSignature.js'
import type { Beat, DrumVoice } from '../core/beats.js'
import { LOOP_BARS, QUANTIZE_ORDER } from '../core/looper.js'
import type { QuantizeGrid } from '../core/looper.js'
import { PERFORM_MODES } from '../core/performance.js'
import type { PerformMode } from '../core/performance.js'
import { EXTENSION_ADDITIONS, PLAY_STYLES, SECRET_CHORD_MODES } from '../core/playStyle.js'
import type { SecretChordMode } from '../core/playStyle.js'
import type { ExtensionAddition, PlayStyle } from '../core/playStyle.js'
import {
  addStep,
  emptyProgression,
  MAX_STEPS,
  removeStep,
  replaceStep,
  setStepBars,
} from '../core/progression.js'
import type { Progression, ProgressionStep } from '../core/progression.js'
import { DEFAULT_PRESET } from '../engine/presets.js'
import { PRESETS } from '../engine/presets.js'

/** What the third tier on each key displays. */
export type TierMode = 'chord' | 'numeral' | 'off'

/**
 * What the display shows while you play — the hardware's five View settings
 * (Options → System → View). "Geek Out" is the community favourite: chord,
 * notes and keyboard at once.
 */
export type ViewMode = 'wave' | 'chord' | 'keys' | 'chordkeys' | 'notes' | 'geek'

/** The six modes, in the order Options → View lists them (manual §14.2). */
export const VIEW_MODES: readonly ViewMode[] = [
  'wave',
  'chord',
  'keys',
  'chordkeys',
  'notes',
  'geek',
]

export const VIEW_LABEL: Record<ViewMode, string> = {
  // "React" is the instrument's own name for the oscilloscope view; calling it
  // Waveform was a guess made before the manual was to hand.
  wave: 'React',
  chord: 'Chord',
  keys: 'Keyboard',
  chordkeys: 'Chord & Keyboard',
  notes: 'Notes',
  geek: 'Geek Out',
}

export interface PanelState {
  // --- held buttons (mirrors of the physical panel) ---
  /** All chord-type buttons currently down. Two or more reach a Secret Chord. */
  heldTypes: ChordType[]
  heldExtensions: Extension[]
  heldRoot: PitchClass | undefined
  secretChords: SecretChordMode
  /**
   * Everything the real ORC-1 does not have, behind one switch: the progression
   * sequencer, MIDI file export, drum-pattern editing, the five extra modes,
   * and the alternate root layouts.
   *
   * Off by default. The instrument should be the instrument first — the extras
   * are ours, and they should announce themselves rather than quietly changing
   * what the hardware would do.
   */
  extended: boolean
  view: ViewMode
  playStyle: PlayStyle
  extensionAddition: ExtensionAddition

  // --- dials ---
  presetIndex: number
  voicing: number
  /** Options → Instrument → Single Notes, also the Chord Voicing dial's press. */
  singleNotes: SingleNotes
  /** Where the octave jump falls, in Split mode. */
  splitPoint: PitchClass
  octave: number
  bpm: number

  // --- perform ---
  performMode: PerformMode
  /** The Perform dial's secondary parameter: speed, spread, or pattern number. */
  performAmount: number
  performLock: boolean
  /** Options → Instrument → Velocity Sense. */
  velocitySense: boolean
  /** Options → Audio and MIDI → Metronome Click. */
  metronome: MetronomeSound
  /** §11.2 — the BPM dial's press starts and stops the click. */
  metronomeOn: boolean
  /** §11.2 — first in the BPM encoder's hold menu, before the Beats. */
  timeSignature: TimeSignature

  // --- bass ---
  bassOn: boolean
  bassMode: BassMode
  bassVoicing: number
  /** Index into the bass sound list — its own list, its own numbering. */
  bassPresetIndex: number

  // --- key mode ---
  keyMode: boolean
  /**
   * Transposition, in semitones.
   *
   * "Press and turn the Key Dial to transpose the entire output of Orchid by
   * a semi-tone at a time. This is useful for adjusting the output to match
   * vocalists." Shown in the top-right of the display whenever it is not zero.
   */
  transpose: number
  key: Key
  rootLayout: RootLayout

  // --- switches ---
  tier: TierMode
  latched: boolean

  // --- looper ---
  loopBars: number | null
  quantize: QuantizeGrid

  // --- beats ---
  beatOn: boolean
  beatIndex: number
  /** The pattern actually playing — a factory beat, or your edit of one. */
  beat: Beat
  drumVolume: number
  bassVolume: number

  // --- progression ---
  progression: Progression
  /** Which step edits land on; -1 when nothing is selected. */
  progStep: number
  /** When on, playing a chord writes it into the selected step and advances. */
  progArmed: boolean

  // --- sound shaping ---
  /** 0–1; 0.5 is the preset's own cutoff. */
  cutoff: number
  fxType: FxType
  /**
   * Whether the FX dial is choosing an effect rather than adjusting one.
   *
   * The dial is modal (§8.2): "Push the FX Dial to see the available effects.
   * Turn the FX Dial to choose the effect you wish to change. Push the FX Dial
   * to select the effect. Turn the dial to adjust the selected effect's
   * intensity." One press in, one press back out.
   */
  fxChoosing: boolean
  /** §8.3 — long-press FX to hold the rack steady while browsing sounds. */
  fxLock: boolean
  fxAmounts: FxAmounts
  masterVolume: number

  // --- panel ---
  /** Index into ALL_DIALS: which knob the arrow keys are pointed at. */
  dialFocus: number
  screenPage: string
  /**
   * A pinned page stays until dismissed; an unpinned one is a glance — it
   * appears because you turned something and fades back to home on its own.
   */
  screenPinned: boolean
  /** True when the last turn was a press-and-turn, so the screen can say so. */
  dialAxis: boolean
  /**
   * Which dial is being held, if any.
   *
   * A press cannot act on the way down any more — it has to wait to see
   * whether it becomes a hold — so the screen shows a ring filling in the
   * meantime. Two state changes per gesture, not one per frame: the fill is a
   * CSS animation.
   */
  holdingDial: number | null
  /** Bumped on every screen interaction, so the auto-return timer can restart. */
  screenTouched: number
  /** Set when a user sound is loaded, so the display names it rather than the
   *  factory preset sitting underneath it. */
  userSoundName: string | undefined
  /**
   * The 30 user slots, and where the browse cursor sits in the combined list.
   *
   * These live in the store rather than in App so that the Sound encoder can
   * reach user sounds at all — before this they were React state, and the dial
   * could only ever browse the factory presets.
   */
  userSounds: UserSounds
  soundIndex: number

  toggleType: (type: ChordType, held: boolean) => void
  /**
   * Let go of every chord-type and extension pad at once.
   *
   * The panel's held buttons are a mirror of what your fingers are doing, and
   * that mirror only stays true while the window is receiving key events. Lose
   * focus mid-chord — alt-tab, a click into the address bar, the OS taking over
   * — and the keyup never arrives, so the pad stays lit and every note you play
   * afterwards comes out as that chord. This is how you get back to nothing.
   */
  clearHeld: () => void
  cycleSecretChords: (delta?: number) => void
  toggleExtended: () => void
  cycleView: (delta: number) => void
  cyclePlayStyle: (delta: number) => void
  toggleExtensionAddition: () => void
  toggleExtension: (ext: Extension, held: boolean) => void
  setRoot: (root: PitchClass | undefined) => void

  setPresetIndex: (i: number) => void
  nudgeVoicing: (delta: number) => void
  toggleSingleNotes: () => void
  setSplitPoint: (pc: PitchClass) => void
  setVoicing: (v: number) => void
  setOctave: (o: number) => void
  setBpm: (bpm: number) => void

  cyclePerformMode: (delta: number) => void
  /**
   * Perform Lock — press and hold the encoder until the LED lights.
   *
   * Pins the performance mode while you audition sounds. Timbre and
   * articulation are orthogonal, and the hardware lets you hold one still
   * while browsing the other; without it, every sound you try drags its own
   * performance setting in with it and you lose the groove you were building.
   */
  togglePerformLock: () => void
  toggleVelocitySense: () => void
  cycleMetronome: () => void
  toggleMetronome: () => void
  cycleTimeSignature: (delta: number) => void
  setTimeSignature: (ts: TimeSignature) => void
  setPerformAmount: (a: number) => void

  toggleBass: () => void
  cycleBassMode: (delta: number) => void
  browseBassSound: (delta: number) => void
  nudgeBassVoicing: (delta: number) => void

  toggleKeyMode: () => void
  setKey: (key: Key) => void
  /** Step the tonic through all twelve, keeping the mode. */
  cycleKey: (delta: number) => void
  /** Step through the seven modes, keeping the tonic. */
  cycleMode: (delta: number) => void
  nudgeTranspose: (delta: number) => void
  cycleRootLayout: (delta: number) => void

  cycleTier: () => void
  setLatched: (latched: boolean) => void

  cycleLoopBars: (delta: number) => void
  /**
   * What the Loop encoder's press does, registered by App.
   *
   * "Press -> start recording." The looper itself is an audio object and must
   * never live in this store, so the store holds the *action* instead. Without
   * this the encoder had no press at all and recording could only be started
   * from the page — the one gesture the manual is most explicit about.
   */
  loopAction: (() => void) | undefined
  setLoopAction: (fn: () => void) => void
  /** §12.4's hard exit — stops and leaves Loop Mode, losing an unsaved loop. */
  loopHardExit: (() => void) | undefined
  setLoopHardExit: (fn: () => void) => void
  cycleQuantize: (delta: number) => void

  toggleBeat: () => void
  cycleBeat: (delta: number) => void
  selectBeat: (index: number) => void
  toggleBeatHit: (voice: DrumVoice, step: number) => void
  clearBeat: () => void
  resetBeat: () => void
  setBeatSwing: (swing: number) => void
  setDrumVolume: (db: number) => void
  setBassVolume: (db: number) => void

  setProgression: (p: Progression) => void
  setProgStep: (index: number) => void
  toggleProgArmed: () => void
  /** Write a chord into the selected step (or append), then advance. */
  captureStep: (step: ProgressionStep) => void
  removeProgStep: (index: number) => void
  nudgeStepBars: (index: number, delta: number) => void
  clearProgression: () => void

  setMasterVolume: (db: number) => void
  setDialFocus: (index: number) => void
  setDialAxis: (secondary: boolean) => void
  setHoldingDial: (index: number | null) => void
  /** Glance at a page — it returns home on its own. */
  glance: (page: string) => void
  /**
   * Show the value of whatever was just turned.
   *
   * "The display will change to show 'Bass Volume' or 'Beat Volume'
   * respectively with its current level (0-99)" — turning an encoder always
   * displays the thing it is changing. That has to work for dials with no
   * page at all, which is why this is not `glance(page)`: Volume and Bass
   * Voicing have no menu behind them and used to change silently.
   */
  glanceValue: () => void
  /** Pin a page open, or close it if it is already the pinned one. */
  pinPage: (page: string) => void
  goHome: () => void
  nudgeCutoff: (delta: number) => void
  cycleFxType: (delta: number) => void
  toggleFxChoosing: () => void
  toggleFxLock: () => void
  nudgeFx: (delta: number) => void
  /** Adopt a preset's FX and reset the filter — used when the sound changes. */
  adoptPresetFx: (fx: FxAmounts) => void
  applyUserSound: (sound: UserSound) => void
  setUserSounds: (sounds: UserSounds) => void
  /** Walk the sound list. `order` is which gesture asked — turn, or press-turn. */
  browseSound: (delta: number, order: 'number' | 'name') => void
  selectSound: (index: number) => void
  /** Snapshot the whole chain into the first free slot. Returns false if full. */
  saveUserSound: () => boolean
}

const TIER_ORDER: TierMode[] = ['chord', 'numeral', 'off']

export const usePanel = create<PanelState>((set, get) => ({
  heldTypes: [],
  heldExtensions: [],
  heldRoot: undefined,
  secretChords: 'simple',
  extended: false,
  view: 'geek',
  playStyle: 'free',
  extensionAddition: 'add',

  presetIndex: PRESETS.indexOf(DEFAULT_PRESET),
  voicing: 0,
  singleNotes: 'octave',
  splitPoint: 7,
  octave: 4,
  bpm: 96,

  performMode: 'off',
  performAmount: 0.5,
  performLock: false,
  velocitySense: true,
  metronome: 'beep',
  metronomeOn: false,
  timeSignature: DEFAULT_TIME_SIGNATURE,

  bassOn: false,
  bassMode: 'chords',
  bassVoicing: 0,
  bassPresetIndex: BASS_PRESETS.indexOf(DEFAULT_BASS_PRESET),

  keyMode: false,
  transpose: 0,
  key: { tonic: 0, tonality: 'major' },
  rootLayout: 'chromatic',

  tier: 'chord',
  latched: false,

  loopBars: 4,
  quantize: 'off',

  beatOn: false,
  beatIndex: 0,
  beat: BEATS[0]!,
  drumVolume: -3,
  bassVolume: 0,

  progression: emptyProgression(),
  progStep: -1,
  progArmed: false,

  cutoff: 0.5,
  fxType: 'reverb',
  fxChoosing: false,
  fxLock: false,
  fxAmounts: presetFx(DEFAULT_PRESET),
  masterVolume: -6,
  userSoundName: undefined,
  userSounds: emptyUserSounds(),
  soundIndex: PRESETS.indexOf(DEFAULT_PRESET),

  dialFocus: 0,
  screenPage: 'home',
  screenPinned: false,
  screenTouched: 0,
  dialAxis: false,
  holdingDial: null,

  toggleType: (type, held) =>
    set((s) => ({
      heldTypes: held
        ? s.heldTypes.includes(type)
          ? s.heldTypes
          : [...s.heldTypes, type]
        : s.heldTypes.filter((t) => t !== type),
    })),

  clearHeld: () => set({ heldTypes: [], heldExtensions: [] }),
  // Three-way, as on the hardware, so a press steps rather than toggles.
  cycleSecretChords: (delta = 1) =>
    set((s) => {
      const i = SECRET_CHORD_MODES.indexOf(s.secretChords)
      const n = SECRET_CHORD_MODES.length
      return { secretChords: SECRET_CHORD_MODES[(i + delta + n) % n]! }
    }),

  // Leaving Extended resets anything the hardware cannot express, so the
  // instrument can never be left in a state the real one has no name for.
  toggleExtended: () =>
    set((s) => {
      if (s.extended) {
        return {
          extended: false,
          progArmed: false,
          rootLayout: 'chromatic' as RootLayout,
          key: {
            tonic: s.key.tonic,
            tonality: (s.key.tonality === 'minor' ? 'minor' : 'major') as Mode,
          },
        }
      }
      return { extended: true }
    }),

  cycleView: (delta) =>
    set((s) => {
      const i = VIEW_MODES.indexOf(s.view)
      return { view: VIEW_MODES[(i + delta + VIEW_MODES.length) % VIEW_MODES.length]! }
    }),

  cyclePlayStyle: (delta) =>
    set((s) => {
      const i = PLAY_STYLES.indexOf(s.playStyle)
      return { playStyle: PLAY_STYLES[(i + delta + PLAY_STYLES.length) % PLAY_STYLES.length]! }
    }),

  toggleExtensionAddition: () =>
    set((s) => ({ extensionAddition: s.extensionAddition === 'add' ? 'chord' : 'add' })),

  toggleExtension: (ext, held) =>
    set((s) => ({
      heldExtensions: held
        ? s.heldExtensions.includes(ext)
          ? s.heldExtensions
          : [...s.heldExtensions, ext]
        : s.heldExtensions.filter((e) => e !== ext),
    })),

  setRoot: (heldRoot) => set({ heldRoot }),

  setPresetIndex: (i) => set({ presetIndex: Math.max(0, Math.min(PRESETS.length - 1, i)) }),
  nudgeVoicing: (delta) => set((s) => ({ voicing: s.voicing + delta })),
  toggleSingleNotes: () =>
    set((s) => ({ singleNotes: s.singleNotes === 'split' ? 'octave' : 'split' })),
  setSplitPoint: (splitPoint) => set({ splitPoint }),
  setVoicing: (voicing) => set({ voicing }),
  setOctave: (o) => set({ octave: Math.max(1, Math.min(7, o)) }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(220, bpm)) }),

  /**
   * "Turn fully left → off."
   *
   * Which means the mode list is a travel with a stop at each end, not a ring.
   * Wrapping made Off reachable only by turning *right* past Harp, so there
   * was no way to switch performance off by feel — you had to watch the
   * screen and count. `off` is the first entry, so clamping puts it hard left
   * where the manual says it is.
   */
  cyclePerformMode: (delta) =>
    set((s) => {
      const i = PERFORM_MODES.indexOf(s.performMode)
      const next = Math.max(0, Math.min(PERFORM_MODES.length - 1, i + delta))
      return { performMode: PERFORM_MODES[next]! }
    }),
  setPerformAmount: (a) => set({ performAmount: Math.max(0, Math.min(1, a)) }),
  togglePerformLock: () => set((s) => ({ performLock: !s.performLock })),
  toggleVelocitySense: () => set((s) => ({ velocitySense: !s.velocitySense })),
  cycleMetronome: () => set((s) => ({ metronome: s.metronome === 'beep' ? 'hat' : 'beep' })),
  toggleMetronome: () => set((s) => ({ metronomeOn: !s.metronomeOn })),
  cycleTimeSignature: (delta) =>
    set((s) => {
      const i = TIME_SIGNATURES.findIndex((t) => sameTimeSignature(t, s.timeSignature))
      return { timeSignature: timeSignatureAt(Math.max(0, i) + delta) }
    }),
  setTimeSignature: (timeSignature) => set({ timeSignature }),

  toggleBass: () => set((s) => ({ bassOn: !s.bassOn })),
  browseBassSound: (delta) =>
    set((s) => ({
      bassPresetIndex: Math.max(
        0,
        Math.min(BASS_PRESETS.length - 1, s.bassPresetIndex + delta),
      ),
    })),
  cycleBassMode: (delta) =>
    set((s) => {
      const i = BASS_MODES.indexOf(s.bassMode)
      return { bassMode: BASS_MODES[(i + delta + BASS_MODES.length) % BASS_MODES.length]! }
    }),
  nudgeBassVoicing: (delta) => set((s) => ({ bassVoicing: s.bassVoicing + delta })),

  // Key Mode changes release latch — the held chord may no longer be meaningful.
  toggleKeyMode: () => set((s) => ({ keyMode: !s.keyMode, latched: false })),
  setKey: (key) => set({ key, latched: false }),

  /**
   * Turn the Key encoder to select your key — the *whole* key.
   *
   * "Turn the Key Dial to select your desired key (e.g., C Major, A Minor)."
   * It is one list of keys, not a tonic with the tonality parked on a second
   * axis: C major and C minor are different keys and turning has to reach
   * both. This used to walk tonics only, so half the keys on the instrument
   * were unreachable by the gesture the manual describes.
   *
   * Interleaved as C, Cm, C#, C#m … so one click from any key gives its
   * parallel minor — the most common move — rather than twelve.
   *
   * Extended widens the tonality pool to all seven modes; the gesture is the
   * same, the list is just longer.
   */
  cycleKey: (delta) =>
    set((s) => {
      const pool = s.extended ? MODES : (['major', 'minor'] as const)
      const at = pool.indexOf(s.key.tonality as never)
      const index = s.key.tonic * pool.length + Math.max(0, at)
      const size = 12 * pool.length
      const next = ((index + delta) % size + size) % size
      return {
        key: {
          tonic: Math.floor(next / pool.length) as PitchClass,
          tonality: pool[next % pool.length]!,
        },
        latched: false,
      }
    }),

  cycleMode: (delta) =>
    set((s) => {
      // The hardware knows major and minor. The other five modes are ours.
      const pool = s.extended ? MODES : (['major', 'minor'] as const)
      const i = Math.max(0, pool.indexOf(s.key.tonality as never))
      return {
        key: { tonic: s.key.tonic, tonality: pool[(i + delta + pool.length) % pool.length]! },
        latched: false,
      }
    }),

  // An octave either way is the useful range; beyond that you would move the
  // Voicing dial instead.
  nudgeTranspose: (delta) =>
    set((s) => ({ transpose: Math.max(-12, Math.min(12, s.transpose + delta)), latched: false })),

  cycleRootLayout: (delta) =>
    set((s) => {
      if (!s.extended) return { rootLayout: 'chromatic' as RootLayout }
      const order: RootLayout[] = ['chromatic', 'correct', 'scale']
      const i = order.indexOf(s.rootLayout)
      return { rootLayout: order[(i + delta + order.length) % order.length]! }
    }),

  cycleTier: () =>
    set((s) => ({ tier: TIER_ORDER[(TIER_ORDER.indexOf(s.tier) + 1) % TIER_ORDER.length]! })),
  setLatched: (latched) => set({ latched }),

  loopAction: undefined,
  setLoopAction: (fn) => set({ loopAction: fn }),
  loopHardExit: undefined,
  setLoopHardExit: (fn) => set({ loopHardExit: fn }),

  cycleLoopBars: (delta) =>
    set((s) => {
      const i = LOOP_BARS.indexOf(s.loopBars)
      return { loopBars: LOOP_BARS[(i + delta + LOOP_BARS.length) % LOOP_BARS.length]! }
    }),

  cycleQuantize: (delta) =>
    set((s) => {
      const i = QUANTIZE_ORDER.indexOf(s.quantize)
      return { quantize: QUANTIZE_ORDER[(i + delta + QUANTIZE_ORDER.length) % QUANTIZE_ORDER.length]! }
    }),

  toggleBeat: () => set((s) => ({ beatOn: !s.beatOn })),

  cycleBeat: (delta) =>
    set((s) => {
      const beatIndex = (s.beatIndex + delta + BEATS.length) % BEATS.length
      return { beatIndex, beat: BEATS[beatIndex]! }
    }),

  selectBeat: (index) => {
    const beatIndex = Math.max(0, Math.min(BEATS.length - 1, index))
    set({ beatIndex, beat: BEATS[beatIndex]! })
  },

  // The hardware's beats are fixed patterns you select, not grids you edit.
  // Editing is ours, so it lives behind Extended — and the guard sits here
  // rather than in the UI, because a store action is the only chokepoint every
  // caller must pass through.
  toggleBeatHit: (voice, step) =>
    set((s) => (s.extended ? { beat: toggleHit(s.beat, voice, step) } : {})),
  clearBeat: () => set((s) => (s.extended ? { beat: clearHits(s.beat) } : {})),
  // Back to the factory pattern this one started as.
  resetBeat: () => set((s) => ({ beat: BEATS[s.beatIndex]! })),
  setBeatSwing: (swing) => set((s) => ({ beat: setSwing(s.beat, swing) })),
  setDrumVolume: (db) => set({ drumVolume: Math.max(-40, Math.min(6, db)) }),
  setBassVolume: (db) => set({ bassVolume: Math.max(-40, Math.min(6, db)) }),

  setProgression: (progression) => set({ progression }),
  setProgStep: (progStep) => set({ progStep }),
  toggleProgArmed: () =>
    set((s) =>
      s.extended ? { progArmed: !s.progArmed, progStep: s.progArmed ? s.progStep : 0 } : {},
    ),

  /**
   * Overwrite the selected step, or append when the selection is past the end.
   *
   * Advancing afterwards is what makes capture feel like typing: play four
   * chords in a row and you have four steps, without touching the mouse.
   */
  captureStep: (step) =>
    set((s) => {
      if (!s.extended) return {}
      const target = s.progStep
      const exists = target >= 0 && target < s.progression.steps.length
      const progression = exists
        ? replaceStep(s.progression, target, step)
        : addStep(s.progression, step)
      const written = exists ? target : progression.steps.length - 1
      return { progression, progStep: Math.min(written + 1, MAX_STEPS - 1) }
    }),

  removeProgStep: (index) =>
    set((s) => {
      const progression = removeStep(s.progression, index)
      return { progression, progStep: Math.min(s.progStep, progression.steps.length) }
    }),

  nudgeStepBars: (index, delta) =>
    set((s) => {
      const step = s.progression.steps[index]
      if (!step) return {}
      return { progression: setStepBars(s.progression, index, step.bars + delta) }
    }),

  clearProgression: () => set({ progression: emptyProgression(), progStep: -1, progArmed: false }),

  setMasterVolume: (db) => set({ masterVolume: Math.max(-40, Math.min(6, Math.round(db))) }),
  setDialFocus: (dialFocus) => set({ dialFocus }),
  setDialAxis: (dialAxis) => set({ dialAxis }),
  setHoldingDial: (holdingDial) => set({ holdingDial }),

  // Turning something you already pinned must not un-pin it, or the page would
  // vanish mid-adjustment.
  glanceValue: () =>
    set((s) => ({
      screenPage: 'value',
      screenPinned: false,
      screenTouched: s.screenTouched + 1,
    })),

  glance: (screenPage) =>
    set((s) => ({
      screenPage,
      screenPinned: s.screenPinned && s.screenPage === screenPage,
      screenTouched: s.screenTouched + 1,
    })),

  pinPage: (screenPage) =>
    set((s) =>
      s.screenPinned && s.screenPage === screenPage
        ? { screenPage: 'home', screenPinned: false, screenTouched: s.screenTouched + 1 }
        : { screenPage, screenPinned: true, screenTouched: s.screenTouched + 1 },
    ),

  goHome: () =>
    set((s) => ({ screenPage: 'home', screenPinned: false, screenTouched: s.screenTouched + 1 })),

  nudgeCutoff: (delta) =>
    set((s) => ({ cutoff: Math.max(0, Math.min(1, s.cutoff + delta)) })),

  toggleFxChoosing: () => set((s) => ({ fxChoosing: !s.fxChoosing })),
  toggleFxLock: () => set((s) => ({ fxLock: !s.fxLock })),

  cycleFxType: (delta) =>
    set((s) => {
      const i = FX_TYPES.indexOf(s.fxType)
      return { fxType: FX_TYPES[(i + delta + FX_TYPES.length) % FX_TYPES.length]! }
    }),

  nudgeFx: (delta) =>
    set((s) => ({
      fxAmounts: {
        ...s.fxAmounts,
        [s.fxType]: Math.max(0, Math.min(1, (s.fxAmounts[s.fxType] ?? 0) + delta)),
      },
    })),

  // Browsing to a new factory sound takes its FX with it and re-centres the
  // filter — otherwise a previous sound's cutoff silently reshapes the next one.
  adoptPresetFx: (fx) => set({ fxAmounts: fx, cutoff: 0.5, userSoundName: undefined }),

  applyUserSound: (sound) =>
    set((s) => ({
      presetIndex: sound.presetIndex,
      ...(s.fxLock ? {} : { cutoff: sound.cutoff }),
      userSoundName: sound.name,
      ...(s.fxLock ? {} : { fxAmounts: sound.fx, fxType: prominentFx(sound.fx) }),
      ...(s.performLock
        ? {}
        : { performMode: sound.performMode, performAmount: sound.performAmount }),
    })),

  setUserSounds: (userSounds) => set({ userSounds }),

  browseSound: (delta, order) => {
    const s = get()
    const list = soundList(s.userSounds)
    s.selectSound(stepSound(list, s.soundIndex, delta, order))
  },

  /**
   * Land on a sound, whichever order you arrived in.
   *
   * A factory sound brings its own FX and re-centres the filter; a user sound
   * restores the entire chain it was saved from. Either way the cursor and the
   * sounding patch stay in agreement — they disagreed before, which is why the
   * panel came back from a reload showing one sound and playing another.
   */
  selectSound: (index) => {
    const s = get()
    const entry = soundAt(soundList(s.userSounds), index)
    if (!entry) return

    if (entry.user && entry.slot !== undefined) {
      const sound = s.userSounds[entry.slot]
      if (sound) {
        s.applyUserSound(sound)
        set({ soundIndex: entry.index })
      }
      return
    }

    const preset = PRESETS[entry.index]!
    const fx = presetFx(preset)
    set({
      soundIndex: entry.index,
      presetIndex: entry.index,
      userSoundName: undefined,
      fxChoosing: false,
      // FX Lock holds the whole rack — amounts, filter and which effect the
      // dial is on — steady while you audition sounds.
      ...(s.fxLock ? {} : { fxAmounts: fx, cutoff: 0.5, fxType: prominentFx(fx) }),
      // Sounds arrive with an articulation as well as a timbre. Perform Lock
      // is precisely the switch that stops that happening, so it is the one
      // thing a sound change must not override.
      ...(s.performLock
        ? {}
        : {
            performMode: preset.perform ?? ('off' as const),
            performAmount: preset.performAmount ?? 0.5,
          }),
    })
  },

  saveUserSound: () => {
    const s = get()
    const slot = freeSlot(s.userSounds)
    if (slot < 0) return false

    const userSounds = [...s.userSounds]
    userSounds[slot] = {
      name: autoName(s.userSounds, PRESETS[s.presetIndex]!.name),
      presetIndex: s.presetIndex,
      cutoff: s.cutoff,
      fx: s.fxAmounts,
      performMode: s.performMode,
      performAmount: s.performAmount,
    }
    set({ userSounds })
    return true
  },
}))

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode)
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T =>
  allowed.includes(v as T)

/**
 * Restore saved settings over the defaults.
 *
 * Every value is checked against its own domain rather than cast — a preset
 * index from a build with more sounds, or a mode name that no longer exists,
 * must fall back rather than put the panel in a state nothing else expects.
 */
export function restoreSettings(): void {
  const saved = loadSettings()
  const patch: Partial<PanelState> = {}

  if (saved.soundIndex !== undefined) {
    const list = soundList(usePanel.getState().userSounds)
    const index = Math.max(0, Math.min(list.length - 1, Math.round(saved.soundIndex)))
    patch.soundIndex = index
    // Landing on a user sound has to *apply* it, not merely point at it — the
    // display name and the whole saved chain live in the slot, not in the
    // settings blob, so a bare cursor would come back showing a factory sound
    // while claiming to be somewhere else.
    const entry = list[index]
    if (entry?.user && entry.slot !== undefined) {
      const sound = usePanel.getState().userSounds[entry.slot]
      if (sound) {
        patch.presetIndex = sound.presetIndex
        patch.cutoff = sound.cutoff
        patch.fxAmounts = sound.fx
        patch.performMode = sound.performMode
        patch.performAmount = sound.performAmount
        patch.userSoundName = sound.name
      }
    }
  }
  for (const key of ['masterVolume', 'bassVolume', 'drumVolume'] as const) {
    const v = saved[key]
    if (typeof v === 'number') patch[key] = Math.max(-40, Math.min(6, Math.round(v)))
  }
  if (saved.presetIndex !== undefined) {
    patch.presetIndex = Math.max(0, Math.min(PRESETS.length - 1, Math.round(saved.presetIndex)))
  }
  if (saved.voicing !== undefined) patch.voicing = Math.round(saved.voicing)
  if (saved.octave !== undefined) patch.octave = Math.max(1, Math.min(7, Math.round(saved.octave)))
  if (saved.bpm !== undefined) patch.bpm = Math.max(40, Math.min(220, Math.round(saved.bpm)))

  if (oneOf(saved.performMode, PERFORM_MODES)) patch.performMode = saved.performMode
  if (saved.performAmount !== undefined) {
    patch.performAmount = Math.max(0, Math.min(1, saved.performAmount))
  }

  if (saved.bassOn !== undefined) patch.bassOn = saved.bassOn
  if (oneOf(saved.bassMode, BASS_MODES)) patch.bassMode = saved.bassMode
  if (saved.bassVoicing !== undefined) patch.bassVoicing = Math.round(saved.bassVoicing)

  if (saved.keyMode !== undefined) patch.keyMode = saved.keyMode
  if (saved.keyTonic !== undefined && isMode(saved.keyMode_)) {
    patch.key = { tonic: ((saved.keyTonic % 12) + 12) % 12, tonality: saved.keyMode_ }
  }
  if (oneOf(saved.rootLayout, ['chromatic', 'correct', 'scale'] as const)) {
    patch.rootLayout = saved.rootLayout
  }
  if (oneOf(saved.tier, ['chord', 'numeral', 'off'] as const)) patch.tier = saved.tier
  if (saved.loopBars !== undefined && LOOP_BARS.includes(saved.loopBars)) {
    patch.loopBars = saved.loopBars
  }
  if (oneOf(saved.quantize, QUANTIZE_ORDER)) patch.quantize = saved.quantize
  if (saved.beatOn !== undefined) patch.beatOn = saved.beatOn
  if (oneOf(saved.secretChords, SECRET_CHORD_MODES)) patch.secretChords = saved.secretChords
  if (typeof saved.bassPresetIndex === 'number') {
    patch.bassPresetIndex = Math.max(
      0,
      Math.min(BASS_PRESETS.length - 1, Math.round(saved.bassPresetIndex)),
    )
  }
  if (oneOf(saved.singleNotes, ['octave', 'split'] as const)) patch.singleNotes = saved.singleNotes
  if (typeof saved.splitPoint === 'number') {
    patch.splitPoint = (((Math.round(saved.splitPoint) % 12) + 12) % 12) as PitchClass
  }
  if (saved.extended !== undefined) patch.extended = saved.extended
  if (typeof saved.transpose === 'number') {
    patch.transpose = Math.max(-12, Math.min(12, Math.round(saved.transpose)))
  }
  if (saved.performLock !== undefined) patch.performLock = saved.performLock
  if (saved.fxLock !== undefined) patch.fxLock = saved.fxLock
  if (typeof saved.timeSignature === 'string') {
    const found = TIME_SIGNATURES.find((t) => timeSignatureLabel(t) === saved.timeSignature)
    if (found) patch.timeSignature = found
  }
  if (saved.velocitySense !== undefined) patch.velocitySense = saved.velocitySense
  if (oneOf(saved.metronome, ['beep', 'hat'] as const)) patch.metronome = saved.metronome
  if (oneOf(saved.view, VIEW_MODES)) patch.view = saved.view
  if (oneOf(saved.playStyle, PLAY_STYLES)) patch.playStyle = saved.playStyle
  if (oneOf(saved.extensionAddition, EXTENSION_ADDITIONS)) {
    patch.extensionAddition = saved.extensionAddition
  }
  if (saved.beatIndex !== undefined) {
    patch.beatIndex = Math.max(0, Math.min(BEATS.length - 1, Math.round(saved.beatIndex)))
  }

  usePanel.setState(patch)
}

/** The current panel, reduced to what is worth remembering. */
export function settingsSnapshot(
  midiChannels: Record<string, number | null>,
  midiPort: string,
): PersistedSettings {
  const s = usePanel.getState()
  return {
    presetIndex: s.presetIndex,
    soundIndex: s.soundIndex,
    masterVolume: s.masterVolume,
    bassVolume: s.bassVolume,
    drumVolume: s.drumVolume,
    voicing: s.voicing,
    octave: s.octave,
    bpm: s.bpm,
    performMode: s.performMode,
    performAmount: s.performAmount,
    performLock: s.performLock,
    fxLock: s.fxLock,
    velocitySense: s.velocitySense,
    metronome: s.metronome,
    timeSignature: timeSignatureLabel(s.timeSignature),
    bassOn: s.bassOn,
    bassMode: s.bassMode,
    bassVoicing: s.bassVoicing,
    bassPresetIndex: s.bassPresetIndex,
    singleNotes: s.singleNotes,
    splitPoint: s.splitPoint,
    keyMode: s.keyMode,
    transpose: s.transpose,
    keyTonic: s.key.tonic,
    keyMode_: s.key.tonality,
    rootLayout: s.rootLayout,
    tier: s.tier,
    loopBars: s.loopBars,
    quantize: s.quantize,
    beatOn: s.beatOn,
    beatIndex: s.beatIndex,
    playStyle: s.playStyle,
    extensionAddition: s.extensionAddition,
    secretChords: s.secretChords,
    extended: s.extended,
    view: s.view,
    midiChannels,
    midiPort,
  }
}
