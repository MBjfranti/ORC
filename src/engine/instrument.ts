/**
 * The instrument, with no React in it.
 *
 * ## Why this exists
 *
 * A keypress must reach the synth without waiting for anything. Previously the
 * whole play path lived in `App.tsx`, which meant every note ran inside a React
 * event handler and ended in two `setState` calls — so the audio trigger was
 * sandwiched between voice-leading maths and a synchronous re-render of the
 * entire tree. Measured, that handler blocked for 2–3.5ms per note, and it was
 * competing with a 60fps render loop that ran whether or not anything moved.
 *
 * The fix is a hard split:
 *
 *   keydown ──► Instrument.press() ──► synth          (synchronous, no React)
 *                      │
 *                      └──► mark dirty ──► rAF ──► React reads a snapshot
 *
 * Nothing on the audio path allocates a component, reads a hook, or writes to a
 * store. React finds out on the next frame by pulling a snapshot, and if the
 * snapshot is unchanged it does not render at all.
 *
 * `useSyncExternalStore` is the React side of this contract, which is why
 * `snapshot()` must return a **cached** object — returning a fresh one each
 * call would make React think the world changed on every frame.
 */

import { buildChord } from '../core/chord.js'
import { isCycle, performChord } from '../core/performance.js'
import { resolveChord, resolveSingleNote } from '../core/resolve.js'
import { routeKeypress } from './bass.js'
import { getMidi } from './midi.js'
import type { Resolved } from '../core/resolve.js'
import type { MidiNote, PitchClass } from '../core/types.js'
import { nearestPosition } from '../core/voicing.js'
import { extensionModeOf, playStyleOf, secretsOn, splitPointOf, usePanel } from '../state/panel.js'
import type { PanelState } from '../state/panel.js'
import type { ChordType, Extension } from '../core/types.js'
import type { Looper } from './looper.js'
import { Player } from './player.js'
import type { Synth } from './synth.js'

export interface Sounding extends Resolved {
  readonly bass: MidiNote | undefined
}

/** Everything the display needs, and nothing the audio path needs. */
export interface View {
  readonly sounding: Sounding | undefined
  readonly pressed: PitchClass | undefined
}

const EMPTY: View = { sounding: undefined, pressed: undefined }

/** Same extensions, order-insensitively — the pads can be pressed in any order. */
const sameExtensions = (a: readonly Extension[], b: readonly Extension[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x))

/** Dev-only ring of recent key-to-synth times, in ms. Read from the console. */
const latency: number[] = []
if (import.meta.env.DEV) {
  Object.assign(window, {
    __latency: () => {
      const sorted = [...latency].sort((a, b) => a - b)
      return {
        samples: sorted.length,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        max: sorted[sorted.length - 1],
        clear: () => (latency.length = 0),
      }
    },
    __latencyReset: () => (latency.length = 0),
  })
}

export class Instrument {
  private player: Player
  private listeners = new Set<() => void>()

  /**
   * Root keys physically down, oldest first.
   *
   * One chord at a time, but keeping the stack buys last-note priority with
   * return: press G, press J, release J, and you fall back to the G you never
   * let go of, exactly like a monophonic synth.
   */
  private heldRoots: PitchClass[] = []
  private current: Sounding | undefined
  /**
   * The root the player is keyed by.
   *
   * Not the same as the chord's root: in Key Mode a pressed black key can snap
   * or borrow onto a different root, and the player is keyed by what was
   * *pressed*. Keeping it separate is what stops `recolour` retuning a group
   * that does not exist.
   */
  private currentRoot: PitchClass | undefined

  /** The snapshot React reads. Replaced only when something actually changed. */
  private view: View = EMPTY
  private dirty = false
  private frame = 0

  constructor(
    private synth: Synth,
    private looper: Looper,
  ) {
    this.player = new Player(synth, (note, velocity, on) =>
      on ? looper.captureOn(note, velocity, 'chord') : looper.captureOff(note, 'chord'),
    )
  }

  // --- the React contract --------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Cached on purpose — see the note at the top of the file. */
  snapshot = (): View => this.view

  /**
   * Tell React, but not now.
   *
   * Coalesced onto a frame so a strum, a chord change and a release inside one
   * animation frame cost exactly one render between them.
   */
  private notify(): void {
    this.dirty = true
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (!this.dirty) return
      this.dirty = false
      this.view = { sounding: this.current, pressed: this.heldRoots[this.heldRoots.length - 1] }
      for (const listener of this.listeners) listener()
    })
  }

  // --- playing -------------------------------------------------------------

  /**
   * A key went down — and what that means depends on `Options → Play Style`.
   *
   * > **Simple** — "You need to press and hold a Chord Type button *before* you
   * > press a key… The chord will sustain as long as you hold the key, even if
   * > you release the Chord Type button. You cannot change the chord type
   * > without releasing the key first."
   * >
   * > **Advanced** — "You can press a key to play a single note, and then press
   * > a Chord Type button while the key is still held to trigger the chord."
   * >
   * > **Free** — "…just like Advanced Mode, but… chords can be switched or
   * > re-triggered repeatedly after releasing either the Chord Type button or
   * > Key." (§14.5)
   *
   * So Simple *latches* the chord at the key, and the other two let the pads
   * keep working afterwards — Advanced once, Free for as long as you like.
   */
  press(root: PitchClass): void {
    if (!this.heldRoots.includes(root)) this.heldRoots.push(root)
    const s = usePanel.getState()

    this.padsSpent = false
    this.chordFormed = s.heldTypes.length > 0

    if (playStyleOf(s) === 'simple') {
      // The type is decided here and cannot change until the key is released.
      this.latchedTypes = [...s.heldTypes]
      /*
       * A bare key in Simple is **silent**, and that is **MANUAL SILENT**.
       *
       * §14.5 says only that you must hold a pad first; it never says what a
       * lone key does. Silence is the reading that makes that sentence literally
       * true. The alternatives both contradict something: a single note is the
       * feature §14.5 uses to *distinguish* Advanced, and a default major chord
       * would invent harmony nobody asked for and make the `maj` pad redundant.
       */
      if (this.latchedTypes.length === 0) {
        this.silence()
        return
      }
    }

    this.sound(root)
  }

  release(root: PitchClass): void {
    const i = this.heldRoots.indexOf(root)
    if (i >= 0) this.heldRoots.splice(i, 1)

    // Latch keeps the chord after your hands leave; the stack still empties, so
    // the next key you press takes over cleanly.
    if (usePanel.getState().latched) {
      this.notify()
      return
    }

    const previous = this.heldRoots[this.heldRoots.length - 1]
    if (previous !== undefined) this.sound(previous)
    else this.silence()
  }

  /**
   * Play Style bookkeeping, all of it per-keypress.
   *
   * `latchedTypes` is Simple's frozen chord; `chordFormed` records that a chord
   * ever existed for this key, and `padsSpent` that every pad has since been
   * let go — which is the thing Advanced will not let you take back.
   */
  private latchedTypes: ChordType[] = []
  private chordFormed = false
  private padsSpent = false
  /**
   * The extensions in force last time anything sounded.
   *
   * `Play Chord` replays the chord "when **extensions are added**" (§14.6) — so
   * it has to know that an extension is what changed. Without this it fired on
   * any recolour, and simply forming a chord played it twice: once from the
   * key, once from the effect that follows the pad.
   */
  private lastExtensions: readonly Extension[] = []

  /** True while a key is down, so the caller can skip a stale async start. */
  isHeld(root: PitchClass): boolean {
    return this.heldRoots.includes(root)
  }

  /**
   * Sound `root` as the one current chord.
   *
   * Ordered so the synth is reached as early as possible: everything before
   * `player.start` is the minimum needed to know *which* notes to play, and
   * everything after it is bookkeeping.
   */
  sound(root: PitchClass): void {
    const t0 = import.meta.env.DEV ? performance.now() : 0
    const s = usePanel.getState()
    const previous = this.current

    if (previous?.bass !== undefined) this.looper.captureOff(previous.bass, 'bass')
    this.synth.bassOff()

    this.lastExtensions = [...s.heldExtensions]
    const resolved = this.resolve(root, s, previous)
    // No chord held, so this is a single note — and where it lands is Single
    // Note Mode's whole job (§14.7).
    const notes = resolved ? resolved.notes : [resolveSingleNote(root, s.octave, splitPointOf(s))]
    // The bypass wins over the dial, so an articulation can be dropped for a
    // phrase without losing which one it was.
    const mode = s.performOn ? s.performMode : 'off'
    const articulation = performChord(notes, mode, { amount: s.performAmount, bpm: s.bpm })

    // Which engines this press reaches — see `routeKeypress` for why a
    // switched-off bass puts the treble back rather than muting everything.
    const routing = routeKeypress(s.bassOn, s.bassMode, resolved !== undefined)

    if (routing.treble) {
      /*
       * A running arpeggio keeps its rhythm across a chord change. Restarting
       * the loop on every root is what makes a progression stutter back to step
       * one and drift off the beat — the notes should change underneath the
       * groove, not interrupt it.
       */
      const moved =
        this.currentRoot !== undefined &&
        this.player.moveCycle(this.currentRoot, root, articulation)

      if (!moved) {
        this.player.stopAll()
        this.player.start(root, articulation)
      }
    } else {
      this.player.stopAll()
    }
    this.currentRoot = root

    // How long the keypress took to reach the synth. Everything after this
    // point is bookkeeping the player cannot hear.
    if (import.meta.env.DEV) latency.push(performance.now() - t0)

    let bass: MidiNote | undefined
    if (routing.bass) {
      // Two octaves under the chord's own root, so it anchors without muddying
      // the voicing above it. With no chord held there is no `resolved` to take
      // a root from, so the key you pressed *is* the root.
      bass = 12 * (s.octave - 1) + (resolved ? resolved.spec.root : root)
      this.synth.bassOn(bass)
      this.looper.captureOn(bass, 0.85, 'bass')
    }

    /*
     * The **chord** stream: the raw block, "regardless of performance mode"
     * (research/09). Sent from here rather than from the synth precisely
     * because the synth only ever sees the articulated version — an arpeggio
     * reaches it as a sequence, and channel 3 is supposed to be the harmony as
     * *data*, not as gesture.
     */
    getMidi().endStream('chord')
    if (resolved) for (const n of resolved.notes) getMidi().noteOn('chord', n, 0.8)

    this.current = resolved
      ? { ...resolved, notes, bass }
      : {
          spec: { root, type: 'maj', extensions: [] },
          notes,
          root: '',
          base: '',
          sup: '',
          numeral: '',
          borrowed: false,
          bass,
        }

    this.notify()
  }

  /**
   * Work out the chord, applying voice leading.
   *
   * The search runs *before* any audio, so it is the one place worth keeping
   * lean — it is bounded to nine candidate positions around wherever the dial
   * already sits, which smooths the transition without overruling the player.
   */
  /**
   * Which chord types are in force.
   *
   * Simple answers with what was held when the key went down, so releasing or
   * changing a pad mid-note cannot move the chord. Everything else reads the
   * pads live.
   */
  private typesFor(s: PanelState): readonly ChordType[] {
    return playStyleOf(s) === 'simple' ? this.latchedTypes : s.heldTypes
  }

  private resolve(root: PitchClass, s: PanelState, previous: Sounding | undefined) {
    const input = {
      root,
      types: this.typesFor(s),
      extensions: s.heldExtensions,
      keyMode: s.keyMode,
      key: s.key,
      chromatic: s.chromatic,
      octave: s.octave,
      voicing: s.voicing,
      transpose: s.transpose,
      secrets: secretsOn(s),
    }

    if (!s.voiceLead || !previous) return resolveChord(input)

    const probe = resolveChord(input)
    if (!probe) return probe

    const position = nearestPosition(
      buildChord(probe.spec),
      12 * (s.octave + 1) + probe.spec.root,
      previous.notes,
      s.voicing,
    )
    return position === s.voicing ? probe : resolveChord({ ...input, voicing: position })
  }

  /**
   * Re-colour whatever is sounding, without re-articulating it.
   *
   * This is where the pads reach a chord that is already down, so it is where
   * the three Play Styles part company.
   */
  recolour(): void {
    const held = this.current
    if (!held) return
    const s = usePanel.getState()
    const style = playStyleOf(s)

    if (style !== 'simple') {
      /*
       * Letting go of every pad *spends* them, in Advanced.
       *
       * Free's stated difference is that chords can be "switched or re-triggered
       * repeatedly **after releasing** either the Chord Type button or Key", so
       * that release is exactly what Advanced does not let you undo — the chord
       * stands until the key comes up. Pads pressed while others are still held
       * are not a release and keep working in both.
       */
      if (s.heldTypes.length === 0 && this.chordFormed) this.padsSpent = true
      if (style === 'advanced' && this.padsSpent) return
      if (s.heldTypes.length > 0) this.chordFormed = true
    }
    // Keyed by what was pressed, not by the chord's root — Key Mode can move
    // the latter without moving the former.
    const root = this.currentRoot
    if (root === undefined) return

    const resolved = resolveChord({
      // Already transposed once when it was resolved, so re-colouring must not
      // shift it again — this root is an outcome, not a key that was pressed.
      root: held.spec.root,
      types: this.typesFor(s),
      extensions: s.heldExtensions,
      keyMode: s.keyMode,
      key: s.key,
      chromatic: s.chromatic,
      octave: s.octave,
      voicing: s.voicing,
      secrets: secretsOn(s),
    })
    if (!resolved) return

    // §14.6 is about extensions specifically, so a type change must not trip it.
    const addedExtension = !sameExtensions(s.heldExtensions, this.lastExtensions)
    this.lastExtensions = [...s.heldExtensions]

    const mode = s.performOn ? s.performMode : 'off'
    if (isCycle(mode)) {
      // Swap the step data under the running loop so it keeps its place.
      this.player.retune(
        root,
        performChord(resolved.notes, mode, { amount: s.performAmount, bpm: s.bpm }),
      )
    } else if (style !== 'simple' && extensionModeOf(s) === 'playChord' && addedExtension) {
      /*
       * > "Play Chord – Replays the full chord when extensions are added."
       * > (§14.6)
       *
       * Against `Add Note`, which "adds only the additional extension without
       * retriggering the full chord" — and that is what `update` already does,
       * since it diffs and only starts what was not already sounding. Scoped to
       * Advanced and Free by §14.6's own note.
       */
      this.player.stopAll()
      this.player.start(root, performChord(resolved.notes, mode, { amount: s.performAmount, bpm: s.bpm }))
    } else {
      this.player.update(root, resolved.notes)
    }

    this.current = { ...resolved, bass: held.bass }
    this.notify()
  }

  silence(): void {
    getMidi().endStream('chord')
    this.player.stopAll()
    if (this.current?.bass !== undefined) this.looper.captureOff(this.current.bass, 'bass')
    this.synth.bassOff()
    this.current = undefined
    this.currentRoot = undefined
    this.notify()
  }

  panic(): void {
    this.player.stopAll()
    this.synth.allNotesOff()
    this.heldRoots.length = 0
    this.current = undefined
    this.currentRoot = undefined
    // The pads are held by keys that will never send their keyup once focus is
    // gone. Leaving them latched is what leaves the instrument stuck in a chord.
    usePanel.getState().clearHeld()
    usePanel.setState({ latched: false })
    this.notify()
  }
}
