/**
 * The dials, as data.
 *
 * One definition drives the rendered knobs and the keyboard alike, so the two
 * can never disagree about what a dial does.
 *
 * ## Two axes per dial
 *
 * The hardware's gesture grammar has four moves (research/02): turn, press,
 * press-and-hold, and **press-and-turn for a secondary setting** — the manual
 * cites "press & hold while turning → Beat Volume" and "→ Bass Volume".
 *
 * We lean on that fourth gesture hard. Every dial carries *two* values:
 *
 *   turn          the obvious one
 *   press + turn  its partner
 *   tap           the on/off, where there is one
 *
 * Between them, every setting in the instrument is reachable without opening a
 * menu at all. Pages still exist for the things that are genuinely lists — the
 * drum grid, the progression — but you never *need* one to change a value.
 *
 * Nine dials sit along the top strip. The two voicing dials live down on the
 * deck, because they are the ones you turn while a chord is sounding.
 */

import { BASS_MODE_LABEL } from '../core/bass.js'
import { BASS_PRESETS, bassPresetAt } from '../engine/bassPresets.js'
import { performAmountLabel, PERFORM_LABEL } from '../core/performance.js'
import { PLAY_STYLE_LABEL } from '../core/playStyle.js'
import { barsLabel } from '../core/looper.js'
import { noteName } from '../core/spelling.js'
import { MODE_LABEL, MODE_SUFFIX } from '../core/types.js'
import type { Key, PitchClass } from '../core/types.js'
import { FX_LABEL, FX_TYPES } from '../engine/SynthEngine.js'
import { soundAt, soundList } from '../engine/soundList.js'
import { VIEW_LABEL } from '../state/panel.js'
import type { PanelState } from '../state/panel.js'
import type { EncoderCap } from './Encoder.js'
import type { ScreenPage } from './Screen.js'

export type DialId =
  | 'sound'
  | 'perform'
  | 'fx'
  | 'key'
  | 'bass'
  | 'loop'
  | 'bpm'
  | 'options'
  | 'volume'
  | 'voicing'
  | 'bassVoicing'

export interface DialAxis {
  readonly label: string
  readonly readout: (s: PanelState) => string
  readonly turn: (s: PanelState, delta: number) => void
  /** 0–1 pointer position, where the value has a real range. */
  readonly position?: (s: PanelState) => number
}

export interface DialSpec {
  readonly id: DialId
  readonly label: string
  readonly cap: EncoderCap
  /** Opened by press-and-hold. Only for genuinely list-shaped things. */
  readonly page?: ScreenPage
  readonly primary: DialAxis
  readonly secondary?: DialAxis
  /** A tap toggles this, where the dial has an on/off. */
  readonly press?: (s: PanelState) => void
  /**
   * Press-and-hold, where it means something other than "open the page".
   *
   * Only Perform uses it — the manual attaches its hold gesture to locking
   * the mode, not to revealing a menu, and its menu is on the plain press.
   */
  readonly hold?: (s: PanelState) => void
  readonly active?: (s: PanelState) => boolean
}

/** Wrap an unbounded value into 0–1 so the pointer keeps moving. */
const endless = (n: number, span = 24) => (((n % span) + span) % span) / span

/**
 * The instrument's own unit.
 *
 * The manual quotes Beat Volume and Bass Volume as **0-99**, and nothing on
 * the panel is expressed as a percentage or in decibels. A 0-99 readout is
 * what the hardware shows, so it is what we show; dB stays internal to the
 * audio graph where it belongs.
 */
const unit = (n: number) => String(Math.round(Math.max(0, Math.min(1, n)) * 99)).padStart(2, '0')

/** `C`, `Bm`, `D Dorian` — the form the encoder shows. */
export const keyName = (key: Key) => noteName(key.tonic, key) + MODE_SUFFIX[key.tonality]

/** dB is how the engine thinks; 0-99 is how the panel reports. */
const dbToUnit = (db: number) => unit((db + 40) / 46)

/**
 * What the display shows while you browse.
 *
 * Turning leads with the number, press-turning leads with the name — the
 * readout tells you which order you are walking, so the two gestures are
 * distinguishable on screen and not just in the hand.
 */
function soundReadout(s: PanelState, order: 'number' | 'name'): string {
  const entry = soundAt(soundList(s.userSounds), s.soundIndex)
  if (!entry) return '—'
  const number = String(entry.number).padStart(2, '0')
  const mark = entry.user ? '∗' : ''
  return order === 'name' ? `${entry.name}${mark}` : `${number}  ${entry.name}${mark}`
}

function soundPosition(s: PanelState): number {
  const list = soundList(s.userSounds)
  return list.length > 1 ? s.soundIndex / (list.length - 1) : 0
}

export const TOP_DIALS: readonly DialSpec[] = [
  {
    id: 'sound',
    label: 'Sound',
    cap: 'amber',
    page: 'sound',
    // "Rotate to browse Sounds by number. Press, then rotate, to browse by
    // name." Two genuinely different traversals of one list — the second is not
    // a relabelled readout, it walks alphabetically. User sounds sit after the
    // factory ones in both, so turning far enough reaches them.
    primary: {
      label: 'Sound',
      readout: (s) => soundReadout(s, 'number'),
      position: soundPosition,
      turn: (s, d) => s.browseSound(d, 'number'),
    },
    secondary: {
      label: 'By name',
      readout: (s) => soundReadout(s, 'name'),
      position: soundPosition,
      turn: (s, d) => s.browseSound(d, 'name'),
    },
  },
  {
    id: 'perform',
    label: 'Perform',
    cap: 'amber',
    page: 'perform',
    primary: {
      label: 'Mode',
      readout: (s) => PERFORM_LABEL[s.performMode],
      turn: (s, d) => s.cyclePerformMode(d),
    },
    secondary: {
      label: 'Amount',
      // In the units it actually has — a note division, a pattern number, or a
      // strum spread in milliseconds. Never a percentage.
      readout: (s) => performAmountLabel(s.performMode, s.performAmount) || '—',
      position: (s) => s.performAmount,
      turn: (s, d) => s.setPerformAmount(s.performAmount + d * 0.08),
    },
    // Press and hold until the LED lights: the LED means *locked*, not
    // "a mode is running". That is what the manual attaches it to.
    hold: (s) => s.togglePerformLock(),
    active: (s) => s.performLock,
  },
  {
    id: 'fx',
    label: 'FX',
    cap: 'amber',
    page: 'fx',
    /*
     * The FX dial is modal, which nothing else on the panel is (§8.2):
     *
     *   turn            adjust the selected effect
     *   press           show the effect list — now turn to choose
     *   press again     select it, and go back to adjusting
     *
     * Filter keeps the second axis: it is the one FX control you sweep
     * mid-phrase, and the manual lists it among the effects but gives it a
     * dedicated control of its own.
     */
    primary: {
      label: 'FX',
      readout: (s) =>
        s.fxChoosing
          ? FX_LABEL[s.fxType]
          : `${FX_LABEL[s.fxType]} ${unit(s.fxAmounts[s.fxType] ?? 0)}`,
      position: (s) =>
        s.fxChoosing
          ? FX_TYPES.indexOf(s.fxType) / Math.max(1, FX_TYPES.length - 1)
          : (s.fxAmounts[s.fxType] ?? 0),
      turn: (s, d) => (s.fxChoosing ? s.cycleFxType(d) : s.nudgeFx(d * 0.05)),
    },
    secondary: {
      label: 'Filter',
      readout: (s) => {
        const off = Math.round((s.cutoff - 0.5) * 99)
        return off === 0 ? 'centre' : `${off > 0 ? '+' : '−'}${Math.abs(off)}`
      },
      position: (s) => s.cutoff,
      turn: (s, d) => s.nudgeCutoff(d * 0.05),
    },
    // "Push the FX Dial to see the available effects" — so the press brings
    // the list up as well as switching the turn's meaning, and pressing again
    // selects and puts it away.
    press: (s) => {
      s.toggleFxChoosing()
      if (s.fxChoosing) s.goHome()
      else s.pinPage('fx')
    },
    hold: (s) => s.toggleFxLock(),
    // "When FX lock is active, an LED beside the FX Dial will illuminate."
    active: (s) => s.fxLock,
  },
  {
    id: 'key',
    label: 'Key',
    cap: 'dark',
    page: 'key',
    // "Turn -> select key (e.g. `Bm`, `C`)". The key is the tonic *and* its
    // tonality, written the way keys are written — the readout used to show
    // the tonic alone, so C major and C minor both displayed as `C`.
    primary: {
      label: 'Key',
      readout: (s) => (s.keyMode ? keyName(s.key) : 'Off'),
      position: (s) => s.key.tonic / 11,
      turn: (s, d) => s.cycleKey(d),
    },
    // "Press and turn the Key Dial to transpose the entire output of Orchid
    // by a semi-tone at a time." This axis held the mode before, which turned
    // out to be a guess: the mode is part of the key the plain turn selects.
    secondary: {
      label: 'Transpose',
      readout: (s) =>
        s.transpose === 0
          ? '00'
          : `${s.transpose > 0 ? '+' : '−'}${String(Math.abs(s.transpose)).padStart(2, '0')}`,
      position: (s) => (s.transpose + 12) / 24,
      turn: (s, d) => s.nudgeTranspose(d),
    },
    press: (s) => s.toggleKeyMode(),
    active: (s) => s.keyMode,
  },
  {
    id: 'bass',
    label: 'Bass',
    cap: 'orange',
    page: 'bass',
    // "Turn the orange Bass encoder to change bass sound; press to
    // enable/disable." The bass has its own sound list with its own numbering,
    // so this browses that — not the bass *behaviour*, which is a
    // press-and-hold menu (and Options → Bass). Voicing has its own dial on
    // the deck and does not need a second home here.
    primary: {
      label: 'Bass Sound',
      readout: (s) =>
        s.bassOn
          ? `${String(bassPresetAt(s.bassPresetIndex).id).padStart(2, '0')}  ${bassPresetAt(s.bassPresetIndex).name}`
          : 'Off',
      position: (s) => s.bassPresetIndex / Math.max(1, BASS_PRESETS.length - 1),
      turn: (s, d) => s.browseBassSound(d),
    },
    secondary: {
      label: 'Bass plays',
      readout: (s) => (s.bassOn ? BASS_MODE_LABEL[s.bassMode] : 'Off'),
      turn: (s, d) => s.cycleBassMode(d),
    },
    press: (s) => s.toggleBass(),
    active: (s) => s.bassOn,
  },
  {
    id: 'loop',
    label: 'Loop',
    cap: 'dark',
    page: 'loop',
    // Turn chooses sync length; that is the encoder's whole turn function on
    // the hardware. Record/save/load live behind the press gestures.
    primary: {
      label: 'Length',
      readout: (s) => barsLabel(s.loopBars),
      turn: (s, d) => s.cycleLoopBars(d),
    },
    /*
     * "Press -> start recording (1-bar count-in in BPM mode)."
     *
     * Unless the Bass Voicing dial is being held, which is the manual's
     * shortcut for leaving Loop Mode outright (§12.4). It is a two-hand
     * gesture, so it only exists for the pointer — the keyboard focuses one
     * dial at a time and cannot express it.
     */
    press: (s) => {
      if (s.holdingDial === BASS_VOICING_DIAL) s.loopHardExit?.()
      else s.loopAction?.()
    },
  },
  {
    id: 'bpm',
    label: 'BPM',
    cap: 'dark',
    page: 'bpm',
    primary: {
      label: 'Tempo',
      readout: (s) => `${s.bpm}`,
      position: (s) => (s.bpm - 40) / 180,
      turn: (s, d) => s.setBpm(s.bpm + d),
    },
    secondary: {
      label: 'Beat Volume',
      readout: (s) => dbToUnit(s.drumVolume),
      position: (s) => (s.drumVolume + 40) / 46,
      turn: (s, d) => s.setDrumVolume(s.drumVolume + d),
    },
    /*
     * "Push the BPM Dial once to turn the metronome on/off" (§11.2), and
     * "Press the BPM Dial to start or stop a Beat" (§11.4) — the same press,
     * read in context. Once a Beat is running it is what the press stops;
     * otherwise the press is the click.
     */
    press: (s) => (s.beatOn ? s.toggleBeat() : s.toggleMetronome()),
    active: (s) => s.beatOn || s.metronomeOn,
  },
  {
    id: 'options',
    label: 'Options',
    cap: 'dark',
    page: 'options',
    primary: {
      label: 'View',
      readout: (s) => VIEW_LABEL[s.view],
      turn: (s, d) => s.cycleView(d),
    },
    secondary: {
      label: 'Play Style',
      readout: (s) => PLAY_STYLE_LABEL[s.playStyle],
      turn: (s, d) => s.cyclePlayStyle(d),
    },
    // "Enters the Options menu." Pressing it opens the menu — it used to
    // cycle Secret Chords, which is a menu item and an arbitrary thing to
    // attach to the press of a dial named Options.
    press: (s) => s.pinPage('options'),
  },
  {
    id: 'volume',
    label: 'Volume',
    cap: 'dark',
    primary: {
      label: 'Master',
      readout: (s) => dbToUnit(s.masterVolume),
      position: (s) => (s.masterVolume + 40) / 46,
      turn: (s, d) => s.setMasterVolume(s.masterVolume + d),
    },
    secondary: {
      label: 'Bass Volume',
      readout: (s) => dbToUnit(s.bassVolume),
      position: (s) => (s.bassVolume + 40) / 46,
      turn: (s, d) => s.setBassVolume(s.bassVolume + d),
    },
  },
]

/** The two you reach for while a chord is sounding. */
export const SESSION_DIALS: readonly DialSpec[] = [
  {
    id: 'voicing',
    label: 'Chord Voicing',
    cap: 'dark',
    primary: {
      label: 'Voicing',
      readout: (s) => (s.voicing > 0 ? `+${s.voicing}` : `${s.voicing}`),
      position: (s) => endless(s.voicing + 12),
      turn: (s, d) => s.nudgeVoicing(d),
    },
    // "Press the Chord Voicing dial to toggle Split vs Octave mode", and in
    // Split mode the octave jump lands "at the point displayed on the screen"
    // — so the second axis moves that point. In Octave mode there is no split
    // to place and the axis picks the register instead.
    secondary: {
      label: 'Octave / Split',
      readout: (s) =>
        s.singleNotes === 'split' ? noteName(s.splitPoint, s.key) : `${s.octave}`,
      position: (s) => (s.singleNotes === 'split' ? s.splitPoint / 11 : (s.octave - 1) / 6),
      turn: (s, d) =>
        s.singleNotes === 'split'
          ? s.setSplitPoint((((s.splitPoint + d) % 12) + 12) % 12 as PitchClass)
          : s.setOctave(s.octave + d),
    },
    press: (s) => s.toggleSingleNotes(),
    active: (s) => s.singleNotes === 'split',
  },
  {
    id: 'bassVoicing',
    label: 'Bass',
    cap: 'dark',
    primary: {
      label: 'Bass Voicing',
      readout: (s) => (s.bassVoicing > 0 ? `+${s.bassVoicing}` : `${s.bassVoicing}`),
      position: (s) => endless(s.bassVoicing + 12),
      turn: (s, d) => s.nudgeBassVoicing(d),
    },
  },
]

export const ALL_DIALS: readonly DialSpec[] = [...TOP_DIALS, ...SESSION_DIALS]

/** Index of the Chord Voicing dial, for the `-`/`+` shortcut. */
export const VOICING_DIAL = ALL_DIALS.findIndex((d) => d.id === 'voicing')

/** Index of the Bass Voicing dial, for the Loop hard-exit shortcut. */
export const BASS_VOICING_DIAL = ALL_DIALS.findIndex((d) => d.id === 'bassVoicing')

export function dialAt(index: number): DialSpec {
  const i = ((index % ALL_DIALS.length) + ALL_DIALS.length) % ALL_DIALS.length
  return ALL_DIALS[i]!
}

/** The axis a gesture addresses: plain turn, or press-and-turn. */
export function axisOf(dial: DialSpec, secondary: boolean): DialAxis {
  return (secondary && dial.secondary) || dial.primary
}
