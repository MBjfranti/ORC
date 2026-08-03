/**
 * Panel state — what the UI renders and the keyboard drives.
 *
 * NOT in here: which notes are sounding, or where the arpeggiator is. Audio
 * state lives in the engine and is mirrored into React only where it has to be
 * seen. If a note-on triggers a render, timing becomes unpredictable and the
 * instrument feels mushy.
 */

import { create } from 'zustand'

import { buildChord } from '../core/chord.js'
import { clockAt, clockRow, CLOCK_ROWS } from '../core/beats.js'
import { OPTIONS } from '../core/options.js'
import { CHANNEL_VALUES, channelFromRow, rowFromChannel } from '../core/options.js'
import { getMidi } from '../engine/midi.js'
import type { Stream as MidiStream } from '../engine/midi.js'
import { SECRET_MODES, secretsEnabled } from '../core/secret.js'
import type { SecretMode } from '../core/secret.js'
import type { OptionId } from '../core/options.js'
import { GRIDS, LOOP_BARS } from '../core/looper.js'
import { nextFree } from '../core/slots.js'
import type { Slots } from '../core/slots.js'
import { readSlots, writeSlots } from '../engine/slots.js'
import { clampVoicing } from '../core/voicing.js'
import type { Grid, Loop } from '../core/looper.js'
import type { LoopState } from '../engine/looper.js'
import { PERFORM_MODES } from '../core/performance.js'
import type { PerformMode } from '../core/performance.js'
import { MODES } from '../core/types.js'
import type { ChordType, Extension, Key, Mode, PitchClass } from '../core/types.js'
import { BASS_MODES, BASS_SOUNDS } from '../engine/bass.js'
import type { BassMode } from '../engine/bass.js'
import { FX_EXIT_ROW, FX_ROWS, fxSlotAt, prominentFx } from '../engine/fx.js'
import type { FxId as RackId } from '../engine/fx.js'
import { SOUNDS, soundAt } from '../engine/sounds.js'
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
  /**
   * Semitones every played root is shifted by — Key's press-and-turn axis
   * (research/13 §B.7, §9.4).
   *
   * Applied to the root rather than to the finished notes, so the chord you
   * see is the chord you hear: transposing up two and pressing C really is a D
   * chord, not a C chord playing D's pitches.
   */
  transpose: number
  /**
   * The quick key select prompt is up (§9.2).
   *
   * Not a list — the display shows the words `select key` and a keyboard, and
   * you dismiss it by *playing* the root you want, holding `Min` for a minor
   * key. So it is a mode the keybed is in, not a menu with a cursor.
   */
  keySelect: boolean

  // --- voicing ---
  /** Position along the infinite note stack. Unbounded and signed. */
  voicing: number
  octave: number
  /**
   * Which of the two voicing dials the arrow keys drive.
   *
   * Stored as which dial rather than as an encoder index, so the state layer
   * does not have to know anything about the panel's layout — `encoders.ts`
   * already imports from here, and the reverse would close the loop.
   */
  voicingFocus: 'chord' | 'bass'
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
  /**
   * The BPM dial's clock: which time signature counts, and which beat plays.
   *
   * One selection across both, because the hardware makes it one list — "long
   * press the BPM Dial and **scroll past the time signatures** to access Beats"
   * (§11.4). `beatIndex` of `null` means the cursor is up among the signatures,
   * and so the thing the dial addresses is the metronome.
   *
   * That is what makes one switch enough: "the Metronome **or** Beats can be
   * toggled on/off by pressing the BPM Dial" (§12.6). `clockOn` is that switch,
   * and what it starts depends on where you left the cursor.
   */
  meter: number
  beatIndex: number | null
  clockOn: boolean
  /** Independently adjustable, per §4.2 — hence two numbers, not one. */
  beatLevel: number
  clickLevel: number

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
  /** Drum FX — the two rows §8.1 puts at the tail of the effects list. */
  drumReverb: number
  drumSat: number
  /**
   * The FX rack's menu, which is the only two-state control on the panel:
   * turning browses until you press, and then turning adjusts (research/13
   * §B.4, quoting §8.2).
   */
  fxCursor: number
  fxAdjusting: boolean
  /**
   * FX lock (§8.3), set by holding the encoder and shown on its LED.
   *
   * Locked, the rack survives a change of sound. Unlocked, a new sound brings
   * its own effects with it — which is what makes the library's per-preset
   * reverb, chorus and delay levels mean anything.
   */
  fxLock: boolean
  /**
   * Perform's half of the same machine as FX, and its lock (§7.3).
   *
   * The lock is real on the panel and inert underneath for now: it exists so
   * that browsing sounds keeps the articulation, and our presets do not carry
   * one to lose. It will start mattering the moment they do.
   */
  performAdjusting: boolean
  performLock: boolean
  bassOn: boolean
  bassLevel: number
  /** Which bass sound, numbered independently of the treble list. */
  bassIndex: number
  /** How the bass responds to what you play — see `BASS_MODES`. */
  bassMode: BassMode

  // --- looper ---
  /** Length of the next recording. `null` records until you stop it. */
  loopBars: number | null
  /**
   * Which of Loop Mode's three screens is up (research/13 §M7–M9).
   *
   *   sync       the Waiting Room — pick Free or a bar count, then record
   *   transport  while a loop runs — Overdub / Pause / Undo
   *   save       the hold menu — Save As / Load / Delete / Exit
   *
   * `null` is not in Loop Mode at all. The manual treats entering as a real
   * state change, not a view: "push or turn the Loop Dial to access the Loop
   * Mode Waiting Room".
   */
  loopScreen: 'sync' | 'transport' | 'save' | null
  loopCursor: number
  /**
   * The transport's state and layer count, mirrored from the engine.
   *
   * Only the discrete parts. The ring's *position* is deliberately absent —
   * it moves every frame, and the spec has it animated by CSS off a duration
   * rather than driven through React, which is also what keeps a running loop
   * from re-rendering the tree sixty times a second.
   */
  loopState: LoopState
  loopLayers: number
  /** Seconds per pass, which is the progress ring's animation duration. */
  loopLength: number
  /**
   * Beats left in the count-in, 4 down to 1.
   *
   * Ours rather than the manual's: the hardware counts you in audibly and says
   * nothing about showing it. A bar of silence with nothing moving on screen
   * reads as a hang.
   */
  loopCount: number
  /**
   * The ten save slots (§12.7), and which picker is open over them.
   *
   * `loopPicker` is `null` on the Save menu itself and names the job once you
   * have chosen one — the same two-level shape the Options menu uses, and for
   * the same reason: `Save As Loop 01` and a slot list will not share a row.
   */
  loopSlots: Slots
  loopPicker: 'saveAs' | 'load' | 'delete' | null

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
  /**
   * The transient value readout (research/13 §C.3, measured).
   *
   * Turning a dial raises a giant number over whatever the screen was showing,
   * and it drops away again about 1.2 seconds after the last turn. The stamp is
   * what lets a repeated turn re-arm that timer even when the value it is
   * showing has not changed.
   */
  glance: {
    value: string
    label: string
    level?: number | undefined
    /**
     * Raised by a press-and-turn rather than a plain turn.
     *
     * The display marks the difference with a solid inverted footer bar —
     * measured on the manual's only two press-and-turn readouts, Bass Volume
     * and Transpose (research/13 §C.3). It gives the secondary axis a signature
     * of its own, so you can see you are editing the hidden parameter and not
     * the obvious one.
     */
    secondary?: boolean | undefined
    stamp: number
  } | null


  /**
   * Where the Options menu is: its root, or one setting's value list.
   *
   * `null` at the root — "flat" means no grouping, but a label and its value
   * cannot share a 128px row, so choosing a value happens on a second screen.
   */
  optionsPage: OptionId | null
  /**
   * The third level, which only `MIDI Channels` has.
   *
   * Its page lists the output and the three streams; each of those then needs
   * its own list of ports or channels. Everything else in Options is two deep.
   */
  optionsSub: string | null
  optionsCursor: number
  /** Which value each setting is on, by row. Only the built ones do anything. */
  optionValue: Readonly<Record<string, number>>
  /**
   * Battery, read from the browser rather than imitated.
   *
   * §14.1 shows the instrument's charge; a laptop has one too, so this is one
   * of the few hardware readouts that can be answered honestly. `null` where
   * the platform declines to say.
   */
  battery: number | null

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
  cycleRootLayout: () => void
  nudgeTranspose: (delta: number) => void
  openKeySelect: () => void
  /** Answer the prompt by playing a root. `minor` when the Min pad is held. */
  pickKey: (root: PitchClass, minor: boolean) => void
  cancelKeySelect: () => void

  nudgeVoicing: (delta: number) => void
  setVoicingFocus: (which: 'chord' | 'bass') => void
  setVoicing: (position: number) => void
  nudgeOctave: (delta: number) => void
  toggleVoiceLead: () => void

  setPerformMode: (mode: PerformMode) => void
  cyclePerformMode: (delta: number) => void
  setPerformAmount: (amount: number) => void
  togglePerform: () => void
  pressPerform: () => void
  togglePerformLock: () => void
  /** Walk the one list: signatures, then the twenty beats. */
  cycleClock: (delta: number) => void
  /** The press — start or stop whichever of the two the cursor is pointed at. */
  toggleClock: () => void
  /** Press-and-turn: the volume of whichever one that is. */
  nudgeClockLevel: (delta: number) => void
  setBpm: (bpm: number) => void

  setSound: (index: number) => void
  cycleSound: (delta: number) => void
  setFx: (fx: FxId) => void
  cycleFx: (delta: number) => void
  /** Set whichever effect the dial is currently pointing at. */
  nudgeFxAmount: (delta: number) => void
  moveFxCursor: (delta: number) => void
  pressFx: () => void
  toggleFxLock: () => void
  setFxAmount: (id: RackId, value: number) => void
  nudgeFxSelected: (delta: number) => void
  nudgeFxProminent: (delta: number) => void
  setCutoff: (n: number) => void
  setChorus: (n: number) => void
  setReverb: (n: number) => void
  setDelay: (n: number) => void
  setVolume: (n: number) => void
  toggleBass: () => void
  setBassLevel: (n: number) => void
  setBassSound: (index: number) => void
  cycleBassSound: (delta: number) => void
  setBassMode: (mode: BassMode) => void
  cycleBassMode: (delta: number) => void
  cycleLoopBars: (delta: number) => void
  setLoopScreen: (screen: PanelState['loopScreen']) => void
  setLoopPicker: (picker: PanelState['loopPicker']) => void
  /** Write the current loop into a slot, overwriting without ceremony (§12.7). */
  saveLoopTo: (slot: number, loop: Loop) => void
  clearSlot: (slot: number) => void
  moveLoopCursor: (delta: number, rows: number) => void
  syncLoop: (state: LoopState, layers: number, bars: number | null, length: number, countBeat: number) => void
  toggleLatch: () => void
  setDialFocus: (index: number) => void
  moveOptionsCursor: (delta: number) => void
  /** The press: descend into a setting, choose a value, or leave. */
  pressOption: () => void
  setOptionsPage: (page: OptionId | null) => void
  setBattery: (level: number | null) => void
  setOptionsSub: (sub: string | null) => void
  setOptionValue: (id: OptionId, value: number) => void
  setScreenList: (index: number | null) => void
  showGlance: (value: string, label: string, level?: number, secondary?: boolean) => void
  clearGlance: () => void
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Which row of the Save menu opens each picker — §12.7's own order. */
const PICKER_ROW: Record<'saveAs' | 'load' | 'delete', number> = { saveAs: 1, load: 2, delete: 3 }

/** How the pads and the keys interact — `Options → Play Style` (§14.5). */
export type PlayStyle = 'simple' | 'advanced' | 'free'

export const PLAY_STYLES: readonly PlayStyle[] = ['simple', 'advanced', 'free']

/** Read through the menu row, so there is one copy of the setting. */
export const playStyleOf = (s: PanelState): PlayStyle =>
  PLAY_STYLES[s.optionValue.playStyle ?? 2] ?? 'free'

/**
 * What adding an extension to a sounding chord does — §14.6.
 *
 * > "Add Note – Adds only the additional extension without retriggering the
 * > full chord. Play Chord – Replays the full chord when extensions are added."
 *
 * §14.6's own note scopes it: "In Advanced and Free modes". Simple latches its
 * chord at the key, so there is nothing for it to mean there.
 */
export type ExtensionMode = 'addNote' | 'playChord'

export const extensionModeOf = (s: PanelState): ExtensionMode =>
  (s.optionValue.extensionAddition ?? 0) === 1 ? 'playChord' : 'addNote'

/** `Off` / `Simple PlayStyle` / `All PlayStyle` — §14.8. */
export const secretModeOf = (s: PanelState): SecretMode =>
  SECRET_MODES[s.optionValue.secretChords ?? 0] ?? 'off'

/** Whether Secret Chords are reachable in the style currently selected. */
export const secretsOn = (s: PanelState): boolean =>
  secretsEnabled(secretModeOf(s), playStyleOf(s) === 'simple')

/**
 * Where the keyboard splits, or `undefined` for one octave — §14.7.
 *
 * `Split Keyboard` is value 0 and `Full Octave Keyboard` value 1, in the
 * manual's own order. The split *point* is fixed at G for now: §5.5 calls it "a
 * point that you choose on the keyboard", but the mechanism for choosing it is
 * the Chord Voicing dial's own position on hardware, and this keyboard has no
 * equivalent free axis. **MANUAL SILENT for our layout** — the mode is real,
 * the movable point is not built.
 */
export const SPLIT_POINT = 7 as PitchClass

export const splitPointOf = (s: PanelState): PitchClass | undefined =>
  (s.optionValue.singleNote ?? 1) === 0 ? SPLIT_POINT : undefined

/** The app's own version, standing in for §14.13's firmware version. */
export const APP_VERSION = '0.1.0'

/** How many values a setting's page lists. */
const optionRowCount = (id: OptionId): number =>
  OPTIONS.find((o) => o.id === id)?.values?.length ?? 1

/**
 * What an `info` or unbuilt row reports when pressed.
 *
 * `--` is the same mark the FX rack puts on an effect it does not have, so the
 * panel says "not built" in one voice rather than two.
 */
function optionReadout(s: PanelState, id: OptionId): string {
  if (id === 'battery') return s.battery === null ? '--' : String(Math.round(s.battery * 99))
  if (id === 'version') return APP_VERSION
  return '--'
}

/**
 * Where each rack slot's amount actually lives.
 *
 * The four we have were already fields on this store, wired through to the
 * synth, so the rack reads and writes them rather than duplicating them into a
 * map that would then need keeping in step.
 */
export function fxAmountOf(s: PanelState, id: RackId): number {
  switch (id) {
    case 'reverb':
      return s.reverb
    case 'chorus':
      return s.chorus
    case 'delay':
      return s.delay
    case 'filter':
      return s.cutoff
    case 'drumReverb':
      return s.drumReverb
    case 'drumSat':
      return s.drumSat
    default:
      return 0
  }
}

/**
 * Load a sound, and let it bring its own effects with it.
 *
 * Every preset in the library carries a reverb, chorus and delay level chosen
 * so it arrives playable without touching a knob — and until now nothing read
 * them. FX lock is what makes that safe to do: locked, the rack you have built
 * survives a change of sound, which is the whole point of the lock (§8.3).
 *
 * The filter is deliberately not reset. It is the Colour macro, centred on
 * whatever the preset's own cutoff is, so 0.5 already means "as designed" on
 * every sound — moving it here would fight the synth's own centring.
 */
function loadSound(s: PanelState, soundIndex: number): Partial<PanelState> {
  if (s.fxLock) return { soundIndex }
  const sound = soundAt(soundIndex)
  return {
    soundIndex,
    reverb: clamp01(sound.reverb),
    chorus: clamp01(sound.chorus),
    delay: clamp01(sound.delay),
  }
}

const fxPatch = (id: RackId, value: number): Partial<PanelState> => {
  switch (id) {
    case 'reverb':
      return { reverb: value }
    case 'chorus':
      return { chorus: value }
    case 'delay':
      return { delay: value }
    case 'filter':
      return { cutoff: value }
    case 'drumReverb':
      return { drumReverb: value }
    case 'drumSat':
      return { drumSat: value }
    default:
      return {}
  }
}

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
  transpose: 0,
  keySelect: false,

  voicing: 0,
  octave: 3,
  voicingFocus: 'chord',
  voiceLead: true,

  performMode: 'off',
  performAmount: 0.35,
  performOn: true,
  bpm: 96,
  meter: 0, // 4/4
  beatIndex: null, // up among the signatures, so the press means the click
  clockOn: false,
  beatLevel: 0.8,
  clickLevel: 0.6,

  soundIndex: 0,
  fx: 'reverb',
  cutoff: 0.5,
  chorus: 0.2,
  reverb: 0.22,
  delay: 0,
  volume: 0.75,
  drumReverb: 0.12,
  drumSat: 0.2,
  fxCursor: 1, // Reverb — the first real row, as PDF p12 shows it
  fxAdjusting: false,
  fxLock: false,
  performAdjusting: false,
  performLock: false,
  bassOn: true,
  bassLevel: 0.8,
  bassIndex: 3, // 04 PBass — the plainest of the documented names
  bassMode: 'chords',

  loopBars: 4,
  loopScreen: null,
  loopCursor: 3, // 4 Bars, the length PDF p18 shows selected
  loopState: 'empty',
  loopLayers: 0,
  loopLength: 0,
  loopCount: 0,
  // Read once at startup. A reload is a tab's version of powering off, and
  // unlike the hardware these survive it.
  loopSlots: readSlots(),
  loopPicker: null,

  dialFocus: 0,
  optionsPage: null,
  optionsSub: null,
  optionsCursor: 1, // `Battery`, the first row that is not `Exit`
  optionValue: {
    // Defaults are the manual's, where it gives one, and research/13 §A's
    // inference where it does not — each is argued at its row.
    view: 1, // `Chord`
    audioOutput: 0, // `Auto`
    midiChannels: 0,
    playStyle: 2, // `Free` — the closest to what the keybed actually does
    extensionAddition: 0, // `Add Note`
    singleNote: 1, // `Full Octave Keyboard`
    secretChords: 0, // `Off`
    quantization: 0, // `None`, and it is listed first
    metronomeClick: 0, // `Beep`
    velocitySense: 0, // `ON`
    autoPowerOff: 2, // `Never` — a browser tab does not power off
  },
  battery: null,
  screenList: null,
  glance: null,
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

  /**
   * The Root Layout switch: what the twelve keys mean against a seven-note key.
   *
   * Three positions, because a twelve-key keyboard against a seven-note scale
   * leaves five keys with no diatonic answer and the choice is the single most
   * consequential one in Key Mode (research/04). Two fields hold it — the
   * layout of the keybed and the policy for out-of-scale roots — so the switch
   * walks them together rather than exposing both.
   *
   *   Chromatic  twelve keys, out-of-key roots get borrowed harmony
   *   Correct    twelve keys, out-of-key roots snap to the nearest degree
   *   Scale      seven keys, and nothing you play can be out of key
   */
  /** Transpose, a semitone at a time. Two octaves either way is plenty. */
  nudgeTranspose: (delta) =>
    set((s) => ({ transpose: Math.max(-24, Math.min(24, s.transpose + delta)) })),

  openKeySelect: () => set({ keySelect: true }),
  cancelKeySelect: () => set({ keySelect: false }),

  /*
   * Spell the key with the chord grammar you already know — hold `Min` and
   * play C to get C minor — rather than scrolling eighty-four entries.
   * Answering the prompt also switches Key Mode on: you did not go looking for
   * a key in order to leave it off.
   */
  pickKey: (root, minor) =>
    set({ key: { tonic: root, mode: minor ? 'aeolian' : 'ionian' }, keySelect: false, keyMode: true }),

  cycleRootLayout: () =>
    set((s) => {
      if (s.rootMode === 'scale') return { rootMode: 'chromatic', chromatic: 'colour' }
      if (s.chromatic === 'colour') return { rootMode: 'chromatic', chromatic: 'snap' }
      return { rootMode: 'scale', chromatic: 'snap' }
    }),

  /*
   * Clamped against the chord currently under the hands, so the dial stops
   * where the keyboard does rather than counting on into silence.
   *
   * The reference root is C: the real root moves the window by less than an
   * octave, which the range's own margins absorb, and reaching for the pressed
   * key here would drag the whole play path into the store for no audible gain.
   */
  nudgeVoicing: (delta) =>
    set((s) => {
      const type = s.heldTypes[s.heldTypes.length - 1] ?? 'maj'
      const intervals = buildChord({ root: 0, type, extensions: s.heldExtensions })
      return {
        voicing: clampVoicing(intervals, 12 * (s.octave + 1), s.voicing + delta),
      }
    }),
  setVoicingFocus: (voicingFocus) => set({ voicingFocus }),
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

  /**
   * The press, in Perform's two states.
   *
   * `Off` is a mode rather than a row you commit to — selecting it is already
   * the whole gesture, so there is nothing to adjust and dropping into ADJUST
   * would leave the knob turning a parameter that does not exist.
   */
  pressPerform: () =>
    set((s) => (s.performMode === 'off' ? { performAdjusting: false } : { performAdjusting: !s.performAdjusting })),
  togglePerformLock: () => set((s) => ({ performLock: !s.performLock })),

  /**
   * One cursor across signatures and beats.
   *
   * Leaving the signatures does not forget which one you were on — `meter` is
   * the click's setting and stays set while a beat plays, so scrolling back up
   * lands where you left rather than resetting to four-four.
   */
  cycleClock: (delta) =>
    set((s) => {
      const at = clockRow(s.meter, s.beatIndex)
      const next = Math.max(0, Math.min(CLOCK_ROWS - 1, at + delta))
      const { meter, beat } = clockAt(next)
      return beat === null ? { meter, beatIndex: null } : { beatIndex: beat }
    }),

  toggleClock: () => set((s) => ({ clockOn: !s.clockOn })),

  /*
   * Two levels behind one gesture, chosen by where the cursor is — which is
   * exactly what "independently adjust the volume of Beats **or** the
   * Metronome" describes (§4.2). A single shared level would make the click
   * unusable the moment you set the beat where you wanted it.
   */
  nudgeClockLevel: (delta) =>
    set((s) =>
      s.beatIndex === null
        ? { clickLevel: clamp01(s.clickLevel + delta * 0.02) }
        : { beatLevel: clamp01(s.beatLevel + delta * 0.02) },
    ),

  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(220, Math.round(bpm))) }),

  setSound: (soundIndex) =>
    set((s) => loadSound(s, Math.max(0, Math.min(SOUNDS.length - 1, soundIndex)))),
  cycleSound: (delta) =>
    set((s) => loadSound(s, clampIndex(SOUNDS.length, s.soundIndex, delta))),
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

  // --- the FX rack ---------------------------------------------------------

  /** Move the menu cursor. Clamps: PDF p12 shows a blank row above `Exit`. */
  moveFxCursor: (delta) =>
    set((s) => ({ fxCursor: Math.max(0, Math.min(FX_ROWS - 1, s.fxCursor + delta)) })),

  /**
   * The press, which means different things in the machine's two states.
   *
   * On `Exit` it closes the menu, because `Exit` is a row you choose rather
   * than a gesture you make (research/13 §B.5). Otherwise it drops into ADJUST,
   * or comes back out of it.
   */
  pressFx: () =>
    set((s) => {
      if (s.fxCursor === FX_EXIT_ROW) return { screenList: null, fxAdjusting: false }
      const slot = fxSlotAt(s.fxCursor)
      // Nothing to adjust on a row we have not built.
      if (!slot?.built) return { fxAdjusting: false }
      return { fxAdjusting: !s.fxAdjusting }
    }),

  toggleFxLock: () => set((s) => ({ fxLock: !s.fxLock })),

  setFxAmount: (id, value) => set(fxPatch(id, clamp01(value))),

  nudgeFxSelected: (delta) =>
    set((s) => {
      const slot = fxSlotAt(s.fxCursor)
      if (!slot?.built) return {}
      return fxPatch(slot.id, clamp01(fxAmountOf(s, slot.id) + delta * 0.02))
    }),

  /**
   * The dial's resting behaviour, before the menu is ever opened.
   *
   * > "By default, the FX Dial will automatically increase and decrease the
   * > most prominent effect of the currently selected sound." — §8.2
   */
  nudgeFxProminent: (delta) =>
    set((s) => {
      const id = prominentFx(soundAt(s.soundIndex))
      return fxPatch(id, clamp01(fxAmountOf(s, id) + delta * 0.02))
    }),
  setCutoff: (n) => set({ cutoff: clamp01(n) }),
  setChorus: (n) => set({ chorus: clamp01(n) }),
  setReverb: (n) => set({ reverb: clamp01(n) }),
  setDelay: (n) => set({ delay: clamp01(n) }),
  setVolume: (n) => set({ volume: clamp01(n) }),
  toggleBass: () => set((s) => ({ bassOn: !s.bassOn })),
  setBassSound: (bassIndex) =>
    set({ bassIndex: Math.max(0, Math.min(BASS_SOUNDS.length - 1, bassIndex)) }),
  cycleBassSound: (delta) =>
    set((s) => ({ bassIndex: clampIndex(BASS_SOUNDS.length, s.bassIndex, delta) })),
  setBassMode: (bassMode) => set({ bassMode }),
  cycleBassMode: (delta) =>
    set((s) => ({
      bassMode: BASS_MODES[clampIndex(BASS_MODES.length, BASS_MODES.indexOf(s.bassMode), delta)]!,
    })),
  cycleLoopBars: (delta) =>
    set((s) => ({
      loopBars: LOOP_BARS[
        clampIndex(LOOP_BARS.length, LOOP_BARS.indexOf(s.loopBars), delta)
      ] as number | null,
    })),
  setBassLevel: (n) => set({ bassLevel: clamp01(n) }),
  toggleLatch: () => set((s) => ({ latched: !s.latched })),
  setDialFocus: (dialFocus) => set({ dialFocus }),

  // --- Options ---------------------------------------------------------------

  moveOptionsCursor: (delta) =>
    set((s) => {
      const rows =
        s.optionsSub !== null
          ? s.optionsSub === 'output'
            ? Math.max(2, getMidi().ports().length + 1)
            : CHANNEL_VALUES.length
          : s.optionsPage === null
            ? OPTIONS.length
            : optionRowCount(s.optionsPage)
      return { optionsCursor: Math.max(0, Math.min(rows - 1, s.optionsCursor + delta)) }
    }),

  setOptionsSub: (optionsSub) =>
    set((s) => ({
      optionsSub,
      optionsCursor:
        optionsSub === null
          ? ['output', 'performance', 'bass', 'chord'].indexOf(s.optionsSub ?? 'output')
          : optionsSub === 'output'
            ? Math.max(0, getMidi().ports().findIndex((p) => p.id === getMidi().portId) + 1)
            : rowFromChannel(getMidi().channelOf(optionsSub as MidiStream)),
    })),

  setOptionsPage: (optionsPage) =>
    set((s) => ({
      optionsPage,
      optionsSub: null,
      // Entering a setting lands on the value it is already on, which is the
      // only useful place to start; leaving lands back on the row you came from.
      optionsCursor:
        optionsPage === null
          ? OPTIONS.findIndex((o) => o.id === s.optionsPage)
          : (s.optionValue[optionsPage] ?? 0),
    })),

  /**
   * The press, at whichever of the menu's two levels you are on.
   *
   * At the root: `Exit` closes, a setting opens its values, and anything that
   * only reports — `Battery`, `Version` — throws its value up as a glance
   * rather than pretending to be adjustable. An unbuilt row raises `--` over
   * its own name, which says "documented, present, does nothing" in the one
   * place you are looking.
   *
   * In a value list: choose, and come back.
   */
  pressOption: () => {
    const s = usePanel.getState()

    /*
     * Third level: an output port, or a stream's channel. These are the only
     * settings in the menu that live outside `optionValue`, because they belong
     * to a device rather than to the instrument — the port list changes while
     * the page is open, and a channel is meaningless without one.
     */
    if (s.optionsSub !== null) {
      if (s.optionsSub === 'output') {
        const ports = getMidi().ports()
        // Row 0 is `None`; the rest are ports in the order the system lists them.
        getMidi().select(s.optionsCursor === 0 ? null : (ports[s.optionsCursor - 1]?.id ?? null))
      } else {
        getMidi().setChannel(s.optionsSub as MidiStream, channelFromRow(s.optionsCursor))
      }
      usePanel.getState().setOptionsSub(null)
      return
    }

    if (s.optionsPage === 'midiChannels') {
      // Asking for access here rather than at startup: a permission prompt
      // before anyone has shown an interest in MIDI is one people block.
      const sub = ['output', 'performance', 'bass', 'chord'][s.optionsCursor] ?? 'output'
      void getMidi()
        .enable()
        .then(() => usePanel.getState().setOptionsSub(sub))
      return
    }

    if (s.optionsPage !== null) {
      set({ optionValue: { ...s.optionValue, [s.optionsPage]: s.optionsCursor } })
      usePanel.getState().setOptionsPage(null)
      return
    }
    const row = OPTIONS[s.optionsCursor]
    if (!row) return
    if (row.id === 'exit') {
      // The whole stack, not just this level — `Exit` means the menu, not a page.
      set({ screenList: null, optionsPage: null, optionsSub: null })
      return
    }
    if (row.kind === 'enum' && row.built) {
      usePanel.getState().setOptionsPage(row.id)
      return
    }
    // Everything else reports rather than changes.
    const value = optionReadout(s, row.id)
    s.showGlance(value, row.label)
  },

  setBattery: (battery) => set({ battery }),

  setOptionValue: (id, value) =>
    set((s) => ({ optionValue: { ...s.optionValue, [id]: value } })),
  /*
   * Closing the display drops the FX rack back to browsing.
   *
   * Otherwise leaving mid-adjust and coming back later lands you in a state you
   * did not choose, and the next turn sets a level when you meant to move.
   * Only on a full close — reopening the same menu has to preserve the state,
   * or the press that toggles adjust would clear it on the way in.
   */
  setLoopScreen: (loopScreen) => set({ loopScreen, loopPicker: null }),
  setLoopPicker: (loopPicker) =>
    set((s) => ({
      loopPicker,
      /*
       * Opening a picker lands on the slot the menu was about to use; closing
       * one returns to the row that opened it rather than to the top of the
       * menu, so a save and a delete do not send you hunting for your place.
       */
      loopCursor:
        loopPicker === null ? PICKER_ROW[s.loopPicker ?? 'saveAs'] : nextFree(s.loopSlots),
    })),

  saveLoopTo: (slot, loop) =>
    set((s) => {
      const loopSlots = s.loopSlots.map((existing, i) => (i === slot ? loop : existing))
      writeSlots(loopSlots)
      return { loopSlots }
    }),

  clearSlot: (slot) =>
    set((s) => {
      const loopSlots = s.loopSlots.map((existing, i) => (i === slot ? null : existing))
      writeSlots(loopSlots)
      return { loopSlots }
    }),
  moveLoopCursor: (delta, rows) =>
    set((s) => ({ loopCursor: Math.max(0, Math.min(rows - 1, s.loopCursor + delta)) })),

  /**
   * Mirror the transport in, so the panel re-renders when it moves.
   *
   * Also parks the cursor: coming out of a recording onto the transport menu
   * should land on `Pause`, which is where PDF p18's illustration has it and
   * the only row you are likely to want first.
   */
  syncLoop: (loopState, loopLayers, bars, loopLength, loopCount) =>
    set((s) => {
      const running = loopState !== 'empty'
      const screen = s.loopScreen === null ? null : s.loopScreen === 'save' ? 'save' : running ? 'transport' : 'sync'
      const cursor = screen !== s.loopScreen && screen === 'transport' ? 1 : s.loopCursor
      return {
        loopState,
        loopLayers,
        loopLength,
        loopCount,
        loopScreen: screen,
        loopCursor: cursor,
        ...(bars !== undefined && running ? { loopBars: bars } : {}),
      }
    }),

  setScreenList: (screenList) =>
    set(
      screenList === null
        ? { screenList, fxAdjusting: false, performAdjusting: false, optionsPage: null, optionsSub: null }
        : { screenList },
    ),
  showGlance: (value, label, level, secondary) =>
    set({ glance: { value, label, level, secondary, stamp: performance.now() } }),
  clearGlance: () => set({ glance: null }),
}))

/** Which pitch class each physical key plays, given the current layout. */
export type { PitchClass }
