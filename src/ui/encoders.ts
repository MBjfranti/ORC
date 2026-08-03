/**
 * The encoders, as data.
 *
 * One definition drives the rendered knobs, the number keys and what the screen
 * shows, so the three can never disagree about what encoder 1 is. The panel
 * prints its number under each one — `Sound (1)` — because that number *is* the
 * keyboard shortcut, not a label for a separate feature.
 *
 * ## Two places, because the hardware has two
 *
 * Telepathic list the encoders as *Sound, Perform, FX, Key, Bass, Loop, BPM,
 * Voicing (×2)*, and separately name a **Volume dial** and an **Options dial**
 * (research/02 §The encoders, [OFFICIAL]; whether those are two of the nine is
 * [UNKNOWN]).
 *
 * The two Voicing dials do not live in that row. They sit **between the hands**
 * — below the chord pads, beside the keybed — because that is what they are
 * for: walking inversions while a chord is sounding, with the hand that is
 * already holding it. Putting them up with the browse knobs would be tidier and
 * wrong. So `place` distinguishes the top row from the column between the
 * hands, and `digit` is the key that reaches a knob rather than its position in
 * this array, which means the array can be reordered without moving a shortcut
 * that is printed on the panel.
 */

import { BEATS, beatLabel, clockRow, METERS } from '../core/beats.js'
import { barsLabel, LOOP_BARS } from '../core/looper.js'
import { amountLabel, PERFORM_LABEL, PERFORM_MODES } from '../core/performance.js'
import { looperOrNull } from '../engine/looper.js'
import { noteName } from '../core/spelling.js'
import { keyIndex, KEYS, MODE_SUFFIX } from '../core/types.js'
import type { Key } from '../core/types.js'
import { BASS_MODE_LABEL, BASS_MODES, BASS_SOUNDS, bassLabel } from '../engine/bass.js'
import { SOUNDS, soundLabel } from '../engine/sounds.js'
import { FX_SLOTS, fxLevel, prominentFx } from '../engine/fx.js'
import { soundAt } from '../engine/sounds.js'
import { fxAmountOf, usePanel } from '../state/panel.js'
import type { PanelState } from '../state/panel.js'
import type { Row } from './ScreenList.js'

export interface Encoder {
  readonly id: string
  readonly label: string
  /** On the panel today. Unshown encoders keep their place and stay unreachable. */
  readonly shown: boolean
  /** The top row, or the column between the two hands. */
  readonly place: 'row' | 'column'
  /**
   * The number key that reaches it, printed under the knob.
   *
   * The column knobs have none: they are big dials you grab rather than
   * addresses you type, and the digits are already spoken for by the row.
   */
  readonly digit?: number
  /**
   * Cap colour, which is how the hardware tells its encoders apart at a glance.
   * Telepathic name only one of them in the public docs — Bass is orange
   * (research/02) — so that one is not a choice.
   */
  readonly cap: 'amber' | 'orange' | 'black'
  /** Chord Voicing is the biggest knob on the instrument. It has earned it. */
  readonly size?: 'lg' | 'md'
  /**
   * Turned: a signed number of detents.
   *
   * Absent means the knob is on the panel but not built yet. It renders, it
   * holds its place and its number, and it does nothing — which is the honest
   * state to be in, and better than a knob that turns without effect.
   */
  readonly turn?: (s: PanelState, delta: number) => void
  /** Pressed. */
  readonly press?: (s: PanelState) => void
  /** Held. The hardware puts a menu behind this on most encoders. */
  readonly hold?: (s: PanelState) => void
  /**
   * Press-and-turn: the secondary axis (research/13 §B.7).
   *
   * Four encoders have one, and all four are documented: Volume reaches Bass
   * Volume, BPM reaches beat volume, Key reaches Transpose, Sound switches to
   * browsing by name. Holding the knob's number and turning is the gesture —
   * which is also the shape of the hardware's, a hand on the cap and a turn.
   *
   * Turning *cancels the pending hold*, or the menu would open underneath you.
   * The hardware shipped with exactly that bug: v3.90's changelog reads
   * "Transpose adjustment no longer accidentally toggles Key" (research/04).
   */
  readonly secondary?: {
    readonly label: string
    readonly turn: (s: PanelState, delta: number) => void
    readonly value: (s: PanelState) => string
  }
  /** What the screen shows while this encoder is selected. */
  readonly list?: (s: PanelState) => { rows: Row[]; cursor: number }
  /**
   * The transient value readout raised by turning this knob — research/13 §C.3,
   * measured from the illustrations: a giant number filling 84% of the display
   * with its label along the bottom, gone again about 1.2 seconds later.
   *
   * A knob has a list *or* a readout, not both: the list is for choosing from a
   * set you can name, the glance is for a quantity that only has a number.
   * `level` fills the numeral field from the bottom, and belongs only to
   * bounded 0–99 values (measured on Bass Volume, inferred for the rest).
   */
  readonly readout?: (
    s: PanelState,
  ) => { value: string; label: string; level?: number } | undefined
  /**
   * An indicator lamp beside the knob, and whether it is lit.
   *
   * The hardware puts an LED next to an encoder to say that section is live,
   * documented on **Key** ("an LED next to the encoder") and on **Perform**
   * ("press and hold until the LED lights") — research/02, both [OFFICIAL].
   *
   * Bass is the one that needs it most, because its press is a mute and a
   * silent engine with no lamp is indistinguishable from a broken one. The
   * public docs do not describe a Bass LED, so this one is inferred from the
   * idiom rather than copied — flagged here so it is not later mistaken for
   * something the manual said.
   */
  readonly lamp?: (s: PanelState) => boolean
  /**
   * What that lamp is reporting, because it is not the same thing everywhere.
   *
   * `power` — the section is doing its job: the bass engine sounds, Key Mode
   * quantises. Lit means on.
   *
   * `lock` — the section is *frozen*, which is a different claim entirely. A
   * lit FX lock says nothing about whether any effects are running; it says
   * they will survive a change of sound. Drawn as a ring rather than a filled
   * dot so it cannot be misread as "on" at a glance — the two states are not
   * comparable and should not look it.
   *
   * Neither FX nor Perform has an on/off at all. Effects switch off by their
   * own amount reaching `00`, and Perform by turning fully left to `Off`
   * (research/02 §7.1) — so the lock is the only binary either one has.
   */
  readonly lampKind?: 'power' | 'lock'
  /** How far the pointer travels for one detent. Coarse lists want more. */
  readonly sensitivity?: number
}

/**
 * Where FX sits in the row. Its own behaviour depends on whether its menu is
 * the one on screen, so it has to be able to ask.
 */
const FX_INDEX = 2

/** Perform runs the same machine, and needs the same question answered. */
const PERFORM_INDEX = 1

/** Key, so its readout can stand aside while its own list is showing. */
const KEY_INDEX = 3

/** `C`, `F♯m`, `D Dor` — the key as the display names it. */
const keyName = (key: Key) => noteName(key.tonic, key) + MODE_SUFFIX[key.mode]

// --- Loop -----------------------------------------------------------------

/**
 * What the Loop screen is showing, row by row.
 *
 * Three different menus behind one knob, which is why they are built here
 * rather than inline: the encoder's `turn` needs the row *count* to clamp
 * against, and `press` needs to know which row it is on, so both have to ask
 * the same question and get the same answer.
 */
export function loopRows(s: PanelState): Row[] {
  if (s.loopScreen === 'save') {
    // §12.7, with `Exit` from [02]. `XX` is the manual's own placeholder for
    // the next free slot.
    return [
      { label: 'Save As Loop 01' },
      { label: 'Save As' },
      { label: 'Load Loop' },
      { label: 'Delete Loop' },
      { label: 'Exit' },
    ]
  }

  if (s.loopScreen === 'transport') {
    // PDF p18's second illustration shows exactly these three.
    return [
      { label: 'Overdub' },
      { label: s.loopState === 'paused' ? 'Play' : 'Pause' },
      // "If you undo all overdubs back to the original recording, the Undo
      // option changes to Clear, which will erase the loop completely." §12.5
      { label: s.loopLayers > 1 ? 'Undo' : 'Clear' },
    ]
  }

  return LOOP_BARS.map((bars) => ({ label: barsLabel(bars) }))
}

/** The press, in whichever of Loop Mode's three screens is up. */
function loopPress(s: PanelState): void {
  const looper = looperOrNull()
  if (!looper) return

  if (s.loopScreen === null) {
    s.setLoopScreen('sync')
    return
  }

  if (s.loopScreen === 'save') {
    /*
     * `Exit` leaves **Loop Mode**, not just this menu — it is the official way
     * out: "press and hold Loop dial → Loop Menu → Exit" (research/08). The
     * loop is not destroyed by it: "the loop stays in memory… so pressing Loop
     * again restarts it", which is what separates this from the hard exit.
     *
     * It was returning to the Waiting Room, which left no way out of Loop Mode
     * at all short of the two-handed shortcut.
     */
    if (s.loopCursor === 4) {
      looper.pause()
      s.setLoopScreen(null)
    }
    // The ten slots still need somewhere to live before the rest can work.
    return
  }

  if (s.loopScreen === 'transport') {
    switch (s.loopCursor) {
      case 0:
        looper.overdub()
        return
      case 1:
        if (s.loopState === 'paused') looper.resume()
        else looper.pause()
        return
      default:
        // Undo peels a layer; Clear wipes it and hands you back the Waiting
        // Room, which is where §12.4 says a cleared loop leaves you.
        if (s.loopLayers > 1) looper.undo()
        else {
          looper.reset()
          s.setLoopScreen('sync')
        }
        return
    }
  }

  // The Waiting Room. Recording stops on the next press, whether it is a Free
  // loop being closed by hand or a bar-locked one being cut short.
  if (s.loopState === 'recording' || s.loopState === 'counting') {
    looper.closeFree()
    return
  }
  looper.arm(LOOP_BARS[s.loopCursor] ?? null)
}

/** `+03`, `-02`, `00` — two digits and always a sign, as Transpose is drawn. */
const signed = (n: number) =>
  n === 0 ? '00' : `${n > 0 ? '+' : '-'}${String(Math.abs(n)).padStart(2, '0')}`

/** `00`–`99`, the range every volume on this instrument is drawn in (§4.2). */
const level99 = (n: number) => String(Math.round(n * 99)).padStart(2, '0')

// --- the beat machine ------------------------------------------------------

/**
 * The BPM dial's list, addressed past the end of the row so it cannot collide
 * with an encoder's own index — the same trick `BASS_MODE_LIST` plays.
 *
 * One list holding two different kinds of thing, because that is how §11.4
 * describes reaching it: "long press the BPM Dial for one second and **scroll
 * past the time signatures** to access Beats."
 */
export const BEAT_LIST = 101

/**
 * Signatures, then beats. No value column, deliberately.
 *
 * It carried `On` on the running row at first. That cost thirty-four pixels of
 * every row, and `02 Orchid Bossanova` — the longest name Telepathic actually
 * give us — was clipped to `02 Orchid Bossa`. Truncating a documented name to
 * make room for a bit you can hear is the wrong way round: whether a beat is
 * playing is reported by the encoder's lamp, and by the drums.
 *
 * Only the cursor row could ever have been marked anyway. One selection, one
 * switch — so the mark was always going to land on the row already inverted.
 */
export function beatRows(): Row[] {
  return [
    ...METERS.map((m) => ({ label: m.label })),
    ...BEATS.map((_, i) => ({ label: beatLabel(i) })),
  ]
}

export const ENCODERS: readonly Encoder[] = [
  // --- the top row ---------------------------------------------------------
  {
    id: 'sound',
    label: 'Sound',
    shown: true,
    place: 'row',
    digit: 1,
    cap: 'amber',
    turn: (s, d) => s.cycleSound(d),
    /*
     * No press yet, deliberately.
     *
     * It used to step to the next sound, which is a shortcut the hardware does
     * not have and which broke the one rule the panel keeps: press is the
     * section's switch. Sound's real press switches browsing from *by number*
     * to *by name* (§5.1), and its hold opens the Save menu (§8.4) — neither
     * built. Leaving it unassigned is the honest state; a press that quietly
     * means something else is worse than a press that does nothing.
     */
    list: (s) => ({
      rows: SOUNDS.map((_, i) => ({ label: soundLabel(i) })),
      cursor: s.soundIndex,
    }),
    // Fifty of them, so the dial wants real travel rather than a hair-trigger.
    sensitivity: 8,
  },
  {
    /*
     * Perform. The same two-state machine as FX, and for the same documented
     * reason — §7.1 states the first half and §8.2 the second, and research/13
     * §B.4 reads them together:
     *
     *   turn, browsing  → scroll the modes
     *   turn, adjusting → that mode's own parameter (speed, pattern number)
     *   tap             → lock the setting, with the LED (§7.3)
     *   hold            → select the mode you are on and drop into ADJUST,
     *                     again to come back out
     *
     * Tap and hold are swapped relative to the manual, for the reason given on
     * the FX encoder above: one meaning per gesture across the panel.
     *
     * There is no on/off press here, and there was never meant to be: the
     * manual puts it at the end of the travel — "turn fully left → performance
     * off" — which is the `Off` mode sitting at the head of the list.
     */
    id: 'perform',
    label: 'Perform',
    shown: true,
    place: 'row',
    digit: 2,
    cap: 'amber',
    turn: (s, d) =>
      s.performAdjusting ? s.setPerformAmount(s.performAmount + d * 0.05) : s.cyclePerformMode(d),
    press: (s) => s.togglePerformLock(),
    hold: (s) => {
      if (s.screenList !== PERFORM_INDEX) {
        s.setScreenList(PERFORM_INDEX)
        return
      }
      s.pressPerform()
    },
    lamp: (s) => s.performLock, // [OFFICIAL] §7.3 — "until the LED lights"
    lampKind: 'lock',
    list: (s) => ({
      rows: PERFORM_MODES.map((m) => ({
        label: PERFORM_LABEL[m],
        value: m === s.performMode ? amountLabel(m, s.performAmount) || undefined : undefined,
        editing: s.performAdjusting && m === s.performMode,
      })),
      cursor: PERFORM_MODES.indexOf(s.performMode),
    }),
    sensitivity: 10,
  },
  {
    /*
     * FX. The one two-state control on the instrument (research/13 §B.4,
     * quoting §8.2):
     *
     *   turn, menu shut   → the sound's most prominent effect, as a macro
     *   turn, browsing    → move the cursor
     *   turn, adjusting   → that effect's intensity
     *   tap               → lock the rack, with the LED (§8.3)
     *   hold              → commit the row you are on, and drop into ADJUST;
     *                       again to come back out; on `Exit`, leave
     *
     * The manual puts the commit on the press and the lock on the hold. We
     * swap them, because our keyboard has to spend a gesture on *reaching* an
     * encoder that the hardware spends a hand on — so a tap means one thing
     * across the whole panel (this section's switch) and both menu jobs live
     * on the hold. Fidelity to the grammar rather than to the gesture.
     */
    id: 'fx',
    label: 'FX',
    shown: true,
    place: 'row',
    digit: 3,
    cap: 'amber',
    turn: (s, d) => {
      if (s.screenList !== FX_INDEX) return s.nudgeFxProminent(d)
      return s.fxAdjusting ? s.nudgeFxSelected(d) : s.moveFxCursor(d)
    },
    press: (s) => s.toggleFxLock(),
    hold: (s) => {
      if (s.screenList !== FX_INDEX) {
        s.setScreenList(FX_INDEX)
        return
      }
      s.pressFx()
    },
    lamp: (s) => s.fxLock, // [OFFICIAL] §8.3 — the lock has an LED
    lampKind: 'lock',
    /*
     * With the menu shut the knob is a macro on the sound's own signature
     * effect, and the glance says which one it just moved — `05` over `Reverb`
     * is one of the readouts the manual illustrates (research/13 §C.3). With
     * the menu open the list is already showing every value live, so there is
     * nothing to add.
     */
    readout: (s) => {
      if (s.screenList === FX_INDEX) return undefined
      const id = prominentFx(soundAt(s.soundIndex))
      const amount = fxAmountOf(s, id)
      return {
        value: fxLevel(amount),
        label: FX_SLOTS.find((f) => f.id === id)!.label,
        level: amount,
      }
    },
    // Every row carries a live two-digit amount, unlike the Perform menu.
    list: (s) => ({
      rows: [
        { label: 'Exit' },
        ...FX_SLOTS.map((slot, i) => ({
          label: slot.label,
          value: slot.built ? fxLevel(fxAmountOf(s, slot.id)) : '--',
          // Marked only on the row the knob is actually turning.
          editing: s.fxAdjusting && s.fxCursor === i + 1,
        })),
      ],
      cursor: s.fxCursor,
    }),
    // While adjusting, the knob is setting a level rather than picking a row,
    // and a level wants finer travel than a list does.
    sensitivity: 8,
  },
  {
    id: 'key',
    label: 'Key',
    shown: true,
    place: 'row',
    digit: 4,
    cap: 'black',
    turn: (s, d) => {
      const i = Math.max(0, Math.min(KEYS.length - 1, keyIndex(s.key) + d))
      s.setKey(KEYS[i]!)
    },
    press: (s) => {
      s.toggleKeyMode()
      // v3.90: "Turning Key off now shows an explicit `Off` on the display."
      // Worth honouring — a key name that simply stops applying, with only a
      // lamp to say so, is the sort of thing you discover four chords later.
      const next = usePanel.getState()
      next.showGlance(next.keyMode ? keyName(next.key) : 'Off', 'Key')
    },
    // Quick key select: hold, then *play* the key you want, with `Min` held
    // for a minor one. You spell it with the grammar you already know rather
    // than scrolling eighty-four entries (§9.2).
    hold: (s) => s.openKeySelect(),
    // `C` over `Key` is one of the readouts the manual illustrates (§C.3, p14).
    readout: (s) =>
      s.screenList === KEY_INDEX
        ? undefined
        : { value: s.keyMode ? keyName(s.key) : 'Off', label: 'Key' },
    lamp: (s) => s.keyMode, // [OFFICIAL] research/02 — one of two documented LEDs
    secondary: {
      label: 'Transpose',
      turn: (s, d) => s.nudgeTranspose(d),
      value: (s) => signed(s.transpose),
    },
    list: (s) => ({
      rows: KEYS.map((k) => ({ label: noteName(k.tonic, k) + MODE_SUFFIX[k.mode] })),
      cursor: keyIndex(s.key),
    }),
    sensitivity: 10,
  },
  {
    /*
     * Bass. Orange on the hardware, and the one encoder whose press is not a
     * value change: it switches the whole engine on and off (research/02
     * §Bass encoder, [OFFICIAL]).
     *
     *   turn  → change the bass sound
     *   press → enable/disable the bass engine
     *   hold  → the bass behaviour menu
     */
    id: 'bass',
    label: 'Bass',
    shown: true,
    place: 'row',
    digit: 5,
    cap: 'orange',
    // While the behaviour menu is open the knob walks *that*, which is what
    // hold-then-turn means on the hardware: one encoder, two lists, and the
    // one on screen is the one you are turning.
    turn: (s, d) => (s.screenList === BASS_MODE_LIST ? s.cycleBassMode(d) : s.cycleBassSound(d)),
    press: (s) => s.toggleBass(),
    lamp: (s) => s.bassOn, // inferred from the idiom, not documented
    hold: (s) => s.setScreenList(BASS_MODE_LIST),
    list: (s) => ({
      rows: BASS_SOUNDS.map((_, i) => ({ label: bassLabel(i) })),
      cursor: s.bassIndex,
    }),
    // Twelve, not fifty, so it wants less travel than Sound.
    sensitivity: 6,
  },

  /*
   * The rest of the row, all on the panel and none built yet. They hold their
   * positions and their numbers so the ones already working never have to be
   * renumbered around them.
   *
   * What each owes, when its turn comes (research/02, all [OFFICIAL]):
   *
   *   Loop (6)     press or turn enters loop mode; turn picks sync length
   *                (1/2/4/8/16 bars or Free); press records with a one-bar
   *                count-in; hold gives Save / Save as / Load / Delete. Much of
   *                this already exists in `core/looper.ts`.
   *   BPM (7)      turn sets tempo; hold lists the Beats; press stops a running
   *                beat; hold-and-turn sets beat volume.
   *   Options (8)  enters the Options menu — the full tree is transcribed in
   *                research/02, including Bass plays, Single Notes, MIDI
   *                channels and Volumes.
   */
  {
    /*
     * Loop. The one encoder the manual gives a whole chapter, and the only one
     * that *enters a mode* rather than adjusting a value.
     *
     *   turn or press, outside  → the Waiting Room (§12.1 — "push **or** turn")
     *   turn, waiting           → the sync mode: Free, or 1/2/4/8/16 Bars
     *   press, waiting          → record, after a one-bar count-in in BPM mode
     *   press, recording        → stop, and start playing back
     *   turn, playing           → the transport menu
     *   press, playing          → Overdub / Pause / Undo, whichever you are on
     *   hold                    → the Save Loop menu (§12.7)
     *
     * `Undo` becomes `Clear` once every overdub is off, and `Clear` returns you
     * to the Waiting Room rather than leaving Loop Mode (§12.5).
     */
    id: 'loop',
    label: 'Loop',
    shown: true,
    place: 'row',
    digit: 6,
    cap: 'black',
    turn: (s, d) => {
      if (s.loopScreen === null) {
        s.setLoopScreen('sync')
        return
      }
      s.moveLoopCursor(d, loopRows(s).length)
    },
    press: (s) => loopPress(s),
    hold: (s) => (s.loopScreen === null ? s.setLoopScreen('sync') : s.setLoopScreen('save')),
    lamp: (s) => s.loopState !== 'empty',
    list: (s) => ({ rows: loopRows(s), cursor: s.loopCursor }),
    sensitivity: 10,
  },
  {
    /*
     * BPM. One clock drives everything — the arpeggiator, Pattern, loop bar
     * lengths and loop quantisation (research/08 §Master clock). There is no
     * per-function tempo, which is why turning this while a loop is armed
     * changes how long a bar is.
     *
     *   turn, list shut → the tempo, 40–220
     *   turn, list open → the one list: signatures, then the twenty beats
     *   press           → start or stop whichever the cursor is pointed at
     *   hold            → open that list, or close it
     *   hold and turn   → the volume of that same thing
     *
     * The beat list is addressed separately from this encoder's own index so
     * that the dial's *primary* job survives having it open — reaching for BPM
     * must never be the reason you cannot change the tempo. Bass does the same
     * thing with its behaviour menu, and for the same reason.
     */
    id: 'bpm',
    label: 'BPM',
    shown: true,
    place: 'row',
    digit: 7,
    cap: 'black',
    turn: (s, d) => (s.screenList === BEAT_LIST ? s.cycleClock(d) : s.setBpm(s.bpm + d)),
    press: (s) => s.toggleClock(),
    hold: (s) => s.setScreenList(s.screenList === BEAT_LIST ? null : BEAT_LIST),
    lamp: (s) => s.clockOn,
    // The click and the beat have separate levels, so the label has to say
    // which one the gesture is about to move (§4.2).
    secondary: {
      label: 'Volume',
      turn: (s, d) => s.nudgeClockLevel(d),
      value: (s) => level99(s.beatIndex === null ? s.clickLevel : s.beatLevel),
    },
    // The tempo, unless its own list is up — the list already shows what the
    // knob is doing, and a number over the top of it would say less.
    readout: (s) =>
      s.screenList === BEAT_LIST ? undefined : { value: String(s.bpm), label: 'BPM' },
    sensitivity: 6,
  },
  { id: 'options', label: 'Options', shown: true, place: 'row', digit: 8, cap: 'black' },

  // --- between the hands ---------------------------------------------------
  //
  // Two dials, stacked, sitting between the chord pads and the keybed. Chord
  // Voicing is the larger of the two and the instrument's signature control —
  // "two dedicated voicing controls for lead and bass let you walk through
  // inversions" (research/05, [PRESS]). Bass Voicing is the same idea applied
  // independently to the bass line, so you can walk the bass separately from
  // the chord.
  {
    id: 'chordVoicing',
    label: 'Chord Voicing',
    shown: true,
    place: 'column',
    cap: 'black',
    size: 'lg',
    // Turning while a chord sounds walks its inversions; the chord follows
    // live, because `recolour` is already watching `voicing`.
    turn: (s, d) => s.nudgeVoicing(d),
    // Signed, like the manual's Transpose readout (`+01`) — this is a position
    // either side of the chord's home, not a count of anything, so the sign is
    // the whole point. What number the hardware prints here is MANUAL SILENT.
    readout: (s) => ({ value: signed(s.voicing), label: 'Voicing' }),
    sensitivity: 8,
  },
  {
    /*
     * Not built. Needs its own voicing state before it can do anything — the
     * bass currently tracks the octave setting rather than a voiced position,
     * which is the open issue in research/15.
     *
     * Also a shortcut modifier on the hardware: Bass Voicing + Loop hard-exits
     * loop mode (research/05).
     */
    id: 'bassVoicing',
    label: 'Bass Voicing',
    shown: true,
    place: 'column',
    cap: 'black',
  },
]

/** Indices of the knobs in the top row, in order. */
export const rowIndices = ENCODERS.flatMap((e, i) => (e.place === 'row' ? [i] : []))

/** Indices of the knobs in the column between the hands, top first. */
export const columnIndices = ENCODERS.flatMap((e, i) => (e.place === 'column' ? [i] : []))

/** How many of the row's knobs sit left of the screen. */
export const SCREEN_AFTER = 4

/** The index of a knob by id, or `undefined` if there is no such knob. */
export function encoderById(id: string): number | undefined {
  const i = ENCODERS.findIndex((e) => e.id === id)
  return i === -1 ? undefined : i
}

/** The index a number key reaches, or `undefined` if no knob answers to it. */
export function encoderByDigit(digit: number): number | undefined {
  const i = ENCODERS.findIndex((e) => e.digit === digit && e.shown)
  return i === -1 ? undefined : i
}

/**
 * The bass behaviour menu, which is a list the screen can show but not an
 * encoder in its own right — holding Bass opens it, and turning Bass then walks
 * it. Addressed by an index past the end of the row so it cannot collide with a
 * knob's own index.
 */
export const BASS_MODE_LIST = 100

export function menuList(s: PanelState): { rows: Row[]; cursor: number } {
  return {
    rows: BASS_MODES.map((m) => ({ label: BASS_MODE_LABEL[m] })),
    cursor: BASS_MODES.indexOf(s.bassMode),
  }
}

/** What the screen shows for whatever is open, or `null` at rest. */
export function screenRows(
  open: number | null,
  s: PanelState,
): { rows: Row[]; cursor: number } | null {
  if (open === null) return null
  if (open === BASS_MODE_LIST) return menuList(s)
  if (open === BEAT_LIST) return { rows: beatRows(), cursor: clockRow(s.meter, s.beatIndex) }
  return ENCODERS[open]?.list?.(s) ?? null
}

/** What the screen is titled, for whatever is open. */
export function screenLabel(open: number): string {
  if (open === BASS_MODE_LIST) return 'Bass plays'
  if (open === BEAT_LIST) return 'Beats'
  return ENCODERS[open]?.label ?? 'Display'
}


/** A knob that is on the panel but not built yet. */
export const isPlaceholder = (e: Encoder) => e.turn === undefined

/**
 * Turn a knob, and raise its readout if it has one.
 *
 * The one place a turn happens, so the mouse and the keyboard cannot drift
 * apart on whether the screen reacts. The readout is read *after* the turn, on
 * fresh state, or it would always show the value you just left.
 */
export function turnEncoder(index: number, s: PanelState, delta: number): void {
  const encoder = ENCODERS[index]
  if (!encoder?.turn) return
  encoder.turn(s, delta)
  const next = usePanel.getState()
  if (!encoder.readout) return
  // A readout may decline — FX has nothing to add while its own menu is the
  // thing on screen, and covering a live list with a number would be worse
  // than saying nothing.
  const shown = encoder.readout(next)
  if (shown) next.showGlance(shown.value, shown.label, shown.level)
}



/** `Sound (1)`, or just `Chord Voicing` for a knob with no number. */
export function encoderLegend(index: number): string {
  const encoder = ENCODERS[index]!
  return encoder.digit === undefined ? encoder.label : `${encoder.label} (${encoder.digit})`
}
