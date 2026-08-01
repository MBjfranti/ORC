import { useCallback, useEffect, useRef, useState } from 'react'

import { BASS_MODE_LABEL, bassNote, bassSounds, trebleSounds } from './core/bass.js'
import { buildChord } from './core/chord.js'
import { isContinuous, performChord, PERFORM_LABEL } from './core/performance.js'
import { allowsLiveEdit, carriesTypeToNextRoot } from './core/playStyle.js'
import { resolveChord, resolveSingleNote } from './core/resolve.js'
import { splitShift } from './core/split.js'
import { noteName } from './core/spelling.js'
import { BEATS } from './core/beats.js'
import { DrumMachine } from './engine/DrumMachine.js'
import { LoopPlayer } from './engine/LoopPlayer.js'
import { canExport, downloadMidi, loopToMidi, progressionToMidi } from './engine/midiExport.js'
import { ProgressionPlayer } from './engine/ProgressionPlayer.js'
import type { LoopSnapshot } from './engine/LoopPlayer.js'
import { MidiOut, STREAMS } from './engine/midi.js'
import type { MidiPort } from './engine/midi.js'
import { PerformanceScheduler } from './engine/scheduler.js'
import { Panel } from './ui/Panel.js'
import { ALL_DIALS, axisOf, BASS_VOICING_DIAL, dialAt, VOICING_DIAL } from './ui/dials.js'
import { HOLD_MS } from './ui/hold.js'
import type { ChordType, MidiNote, PitchClass } from './core/types.js'
import { getEngine } from './engine/ToneEngine.js'
import { PRESETS } from './engine/presets.js'
import { bassPresetAt } from './engine/bassPresets.js'
import {
  DEFAULT_LEGENDS,
  EXTENSION_KEYS,
  VOICING_KEYS,
  TYPE_KEYS,
  octaveShiftOf,
  pitchClassOf,
  resolveLegends,
  rootMap,
} from './input/layout.js'
import type { LegendMap, RootId } from './input/layout.js'
import { chromaticPolicy, restoreSettings, settingsSnapshot, usePanel } from './state/panel.js'
import {
  loadLoops,
  loadSettings,
  loadUserSounds,
  saveLoops,
  saveSettings,
  saveUserSounds,
} from './state/storage.js'
import type { LoopSlots } from './state/storage.js'
import { FX_TYPES, presetFx } from './engine/SynthEngine.js'
import { ChordButtons } from './ui/ChordButtons.js'
import { Keybed } from './ui/Keybed.js'

/** A chord currently sounding, captured at the moment it was triggered. */
interface Sounding {
  readonly notes: MidiNote[]
  readonly name: string
  /** The name split for the display: full-size part, then the superscript. */
  readonly root: string
  readonly ext: string
  readonly numeral: string
  /**
   * The chord-type buttons this was built with — *sticky*.
   *
   * Once a sounding note has been harmonised, releasing the buttons must not
   * collapse it back to a bare note. The hardware is explicit about this: the
   * chord sustains as long as you hold the key, even after you let go of the
   * Chord Type button. A set rather than one value, so a Secret Chord survives
   * the same way an ordinary triad does.
   */
  readonly types: readonly ChordType[]
}

export default function App() {
  const [started, setStarted] = useState(false)
  const [legends, setLegends] = useState<LegendMap>(DEFAULT_LEGENDS)
  const [pressed, setPressed] = useState<ReadonlySet<PitchClass>>(new Set())

  const engine = getEngine()

  // MIDI and the scheduler both live for the app's lifetime. The scheduler owns
  // per-chord arp loops and mirrors performance notes to MIDI channel 1.
  const midiRef = useRef<MidiOut>(undefined)
  midiRef.current ??= new MidiOut()
  const midi = midiRef.current

  const drumsRef = useRef<DrumMachine>(undefined)
  drumsRef.current ??= new DrumMachine()
  const drums = drumsRef.current

  const looperRef = useRef<LoopPlayer>(undefined)
  looperRef.current ??= new LoopPlayer(engine, midi)
  const looper = looperRef.current

  const schedulerRef = useRef<PerformanceScheduler>(undefined)
  schedulerRef.current ??= new PerformanceScheduler(engine, midi, looper)
  const scheduler = schedulerRef.current

  const [loopView, setLoopView] = useState<LoopSnapshot>(() => looper.snapshot())

  const [midiPorts, setMidiPorts] = useState<MidiPort[]>([])
  const [midiPort, setMidiPort] = useState<string>('')

  /**
   * What is currently sounding, keyed by the root that triggered it.
   * Held in a ref, not state — this is audio bookkeeping and must never cause
   * a render. See research/12-tech-stack.md §React traps.
   *
   * The chord's name is captured at trigger time, so the display always
   * describes what you can hear rather than what the panel would play if you
   * pressed a key right now. Those diverge the moment you add an extension to
   * an already-sounding chord.
   */
  const soundingRef = useRef(new Map<PitchClass, Sounding>())

  useEffect(() => {
    void resolveLegends().then(setLegends)
  }, [])

  /**
   * Restore the panel before the first paint, so nothing flashes at defaults
   * and then jumps. Runs once — the ref guard survives StrictMode's double
   * mount, which would otherwise restore over any change made in between.
   */
  const restoredRef = useRef(false)
  if (!restoredRef.current) {
    restoredRef.current = true
    // User sounds first, and not merely for tidiness: `restoreSettings` clamps
    // the saved browse cursor against the sound list, and the list is short by
    // however many user sounds have not loaded yet. Restore them afterwards and
    // a cursor parked on a user sound silently snaps back into the factory
    // range on every reload.
    usePanel.getState().setUserSounds(loadUserSounds())
    restoreSettings()
    const saved = loadSettings()
    if (saved.midiChannels) {
      for (const stream of STREAMS) {
        const channel = saved.midiChannels[stream]
        if (channel === null || typeof channel === 'number') midi.setChannel(stream, channel)
      }
    }
  }

  const [slots, setSlots] = useState<LoopSlots>(() => loadLoops())
  const [slot, setSlot] = useState(0)

  /**
   * Persist on a trailing delay.
   *
   * Nudging the voicing dial fires a state change per click; writing
   * localStorage synchronously on each one would block the main thread in the
   * middle of playing. A second of quiet is plenty.
   */
  useEffect(() => {
    const unsubscribe = usePanel.subscribe(() => {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const channels = Object.fromEntries(STREAMS.map((s) => [s, midi.getChannel(s)]))
        saveSettings(settingsSnapshot(channels, midiPortRef.current))
      }, 1000)
    })
    return () => {
      clearTimeout(saveTimerRef.current)
      unsubscribe()
    }
  }, [midi])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  /** In-flight Enter press: the timer, and whether it already became a hold. */
  const enterTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const enterHeldRef = useRef<{ fired: boolean } | null>(null)
  const midiPortRef = useRef('')

  /**
   * Dev-only handle on the live instances.
   *
   * Dynamically importing a module from the console gives you a *different*
   * copy under Vite, so `getEngine()` there is not the engine this app is
   * using. This is the only reliable way to inspect the real one.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    Object.assign(window, {
      __orc: { engine, scheduler, midi, looper, drums, panel: usePanel },
    })
  }, [engine, scheduler, midi, looper, drums])

  // MIDI is strictly additive — everything works without it, so a browser that
  // lacks Web MIDI (Safari) or a user who denies permission just gets no ports.
  useEffect(() => {
    void midi.init().then(setMidiPorts)
  }, [midi])

  useEffect(() => {
    midiPortRef.current = midiPort
    midi.select(midiPort || undefined)
  }, [midi, midiPort])

  // Reconnect the saved MIDI device once the port list arrives.
  useEffect(() => {
    const wanted = loadSettings().midiPort
    if (wanted && midiPorts.some((p) => p.id === wanted)) setMidiPort(wanted)
  }, [midiPorts])

  const saveSlot = useCallback(() => {
    const loop = looper.current
    // A loop with no layers is a length and nothing else. Saving it would mark
    // the slot occupied and load back as silence.
    if (!loop || loop.layers.length === 0) return
    const next = [...slots]
    next[slot] = loop
    setSlots(next)
    saveLoops(next)
  }, [looper, slots, slot])

  const loadSlot = useCallback(() => {
    const loop = slots[slot]
    if (!loop) return
    looper.load(loop)
    setLoopView(looper.snapshot())
  }, [looper, slots, slot])

  const deleteSlot = useCallback(() => {
    const next = [...slots]
    next[slot] = null
    setSlots(next)
    saveLoops(next)
  }, [slots, slot])

  // --- sound -------------------------------------------------------------

  /** Bass note currently sounding per root, so releases stay symmetric. */
  const bassRef = useRef(new Map<PitchClass, MidiNote>())

  /**
   * Root keys physically down, oldest first.
   *
   * The instrument plays **one chord at a time** — same as the hardware, whose
   * keyboard is monophonic for roots. Pressing a new root moves the chord
   * instead of stacking a second one, so holding D major and reaching for F
   * gives you F major rather than both at once.
   *
   * Keeping the stack (rather than just the latest root) buys last-note
   * priority with return: press G, press J, release J, and you fall back to the
   * G you never let go of, exactly like a monophonic synth.
   */
  const heldRootsRef = useRef<PitchClass[]>([])

  /**
   * The chord type in force, which outlives both the button and the root.
   *
   * Hold Maj and play D, let go of Maj, then reach for F: you get F major, not a
   * bare F. The quality is a *mode you are in*, not a modifier on one keypress.
   * It clears only when every root is released, so the next thing you play from
   * silence is a plain note again.
   */
  const stickyTypesRef = useRef<ChordType[]>([])

  /** Silence everything currently sounding, across all three outputs. */
  const silence = useCallback(() => {
    scheduler.stopAll()
    for (const held of soundingRef.current.values()) {
      for (const n of held.notes) midi.noteOff('chord', n)
    }
    for (const n of bassRef.current.values()) {
      midi.noteOff('bass', n)
      looper.captureOff(n, 'bass')
    }
    bassRef.current.clear()
    engine.bassOff()
    soundingRef.current.clear()
  }, [scheduler, midi, engine, looper])

  /**
   * Sound `root` as the one current chord, replacing whatever came before.
   *
   * `root` is a RootId, not a bare pitch class: the octave key doubles the
   * tonic, so the shift has to travel with it.
   */
  const sound = useCallback(
    (root: RootId) => {
      const s = usePanel.getState()
      silence()

      const pc = pitchClassOf(root)
      const octave = s.octave + octaveShiftOf(root) + splitShift(pc, s.singleNotes, s.splitPoint)
      const semitones = s.transpose

      // Only Free carries the quality onto a new root. In Simple and Advanced a
      // key pressed with no button held is a bare note, which is what makes
      // them feel deliberate rather than sticky.
      const types =
        s.heldTypes.length > 0
          ? s.heldTypes
          : carriesTypeToNextRoot(s.playStyle)
            ? stickyTypesRef.current
            : []
      stickyTypesRef.current = types

      const resolved = resolveChord({
        root: pc,
        heldTypes: types,
        secretChords: s.secretChords,
        playStyle: s.playStyle,
        extensions: s.heldExtensions,
        keyMode: s.keyMode,
        key: s.key,
        chromatic: chromaticPolicy(s.rootLayout),
        octave,
        voicing: s.voicing,
      })

      const raw = resolved ? resolved.notes : [resolveSingleNote(pc, octave)]
      // Transposition shifts the whole output — chord, bass and MIDI — which
      // is why it lands here rather than inside the chord engine.
      const notes = semitones === 0 ? raw : raw.map((n) => n + semitones)
      const isChord = resolved !== undefined

      if (trebleSounds(s.bassMode, s.bassOn, isChord)) {
        scheduler.start(
          root,
          performChord(notes, s.performMode, {
            amount: s.performAmount,
            bpm: s.bpm,
            velocitySense: s.velocitySense,
          }),
        )
        // Channel 3 carries the raw block chord, unaffected by performance mode
        // — the harmony as data rather than as gesture.
        for (const n of notes) midi.noteOn('chord', n, 0.8)
      }

      if (bassSounds(s.bassMode, s.bassOn, isChord)) {
        const intervals = resolved ? buildChord(resolved.spec) : [0]
        const bassRoot = resolved ? resolved.spec.root : pc
        const bn = bassNote(intervals, bassRoot, s.bassVoicing) + semitones
        engine.bassOn(bn)
        midi.noteOn('bass', bn, 0.85)
        looper.captureOn(bn, 0.85, 'bass')
        bassRef.current.set(root, bn)
      }

      soundingRef.current.set(root, {
        notes,
        name: resolved?.name ?? noteName(pc),
        root: resolved?.root ?? noteName(pc),
        ext: resolved?.ext ?? '',
        numeral: resolved?.numeral ?? '',
        types,
      })
      setPressed(new Set([root]))

      // Writing to the progression captures what you *pressed*, not what was
      // played — so the step re-performs under whatever key, voicing and
      // arpeggiator are set later.
      if (s.progArmed && !fromProgressionRef.current) {
        s.captureStep({ root: pc, types, extensions: s.heldExtensions, bars: 1 })
      }
    },
    [engine, midi, scheduler, silence],
  )

  const press = useCallback(
    (root: RootId) => {
      const stack = heldRootsRef.current
      if (!stack.includes(root)) stack.push(root)
      sound(root)
    },
    [sound],
  )

  const release = useCallback(
    (root: RootId) => {
      const stack = heldRootsRef.current
      const i = stack.indexOf(root)
      if (i >= 0) stack.splice(i, 1)

      // Latch holds the chord after your hands leave; the stack still empties,
      // so the next key you press takes over cleanly.
      if (usePanel.getState().latched) return

      const previous = stack[stack.length - 1]
      if (previous !== undefined) {
        sound(previous)
      } else {
        // Back to silence. Simple and Advanced forget the quality here, so the
        // next key played from nothing is a bare note again. Free keeps it —
        // that is precisely what defines Free: the chord survives releasing the
        // button *and* the key, until you choose a different one.
        if (!carriesTypeToNextRoot(usePanel.getState().playStyle)) {
          stickyTypesRef.current = []
        }
        silence()
        setPressed(new Set())
      }
    },
    [sound, silence],
  )

  /**
   * Live chord edits — harmonise or re-colour whatever is already sounding.
   *
   * Two behaviours fall out of this, both matching the hardware:
   *
   *  - Play a bare note (or latch one), then press a Chord Type button and it
   *    becomes a chord. Releasing that button does *not* undo it, because the
   *    type is sticky — `heldType ?? held.type`.
   *  - Press or release an extension and the chord gains or loses those notes,
   *    since extensions are read live rather than stored.
   *
   * Only the *difference* is played. Notes common to both voicings are left
   * completely alone, so the chord swells and thins instead of re-articulating.
   * That is the hardware's "Add Note" mode (research/03-chord-engine.md); its
   * "Play Chord" alternative re-triggers everything and is a future option.
   *
   * Diffing also handles a subtlety for free: adding a fourth note changes the
   * voicing window's period, so existing notes can legitimately move. Whatever
   * actually moved gets retriggered; whatever didn't, doesn't.
   */
  const heldExtensions = usePanel((st) => st.heldExtensions)
  const heldTypes = usePanel((st) => st.heldTypes)
  const voicing = usePanel((st) => st.voicing)
  const octave = usePanel((st) => st.octave)
  const keyMode = usePanel((st) => st.keyMode)
  const panelKey = usePanel((st) => st.key)
  const bassVoicing = usePanel((st) => st.bassVoicing)

  useEffect(() => {
    if (soundingRef.current.size === 0) return
    const s = usePanel.getState()

    // Simple fixes a chord the moment it is struck: it sustains after you let
    // go of the button, but its quality cannot be changed without releasing
    // the key first.
    if (!allowsLiveEdit(s.playStyle)) return

    for (const [root, held] of soundingRef.current) {
      const pc = pitchClassOf(root)
      const octave = s.octave + octaveShiftOf(root) + splitShift(pc, s.singleNotes, s.splitPoint)
      const semitones = s.transpose
      const effectiveTypes = s.heldTypes.length > 0 ? s.heldTypes : held.types

      const resolved = resolveChord({
        root: pc,
        heldTypes: effectiveTypes,
        secretChords: s.secretChords,
        playStyle: s.playStyle,
        extensions: s.heldExtensions,
        keyMode: s.keyMode,
        key: s.key,
        chromatic: chromaticPolicy(s.rootLayout),
        octave,
        voicing: s.voicing,
      })
      const rawNext = resolved ? resolved.notes : [resolveSingleNote(pc, octave)]
      const next = semitones === 0 ? rawNext : rawNext.map((n) => n + semitones)

      if (isContinuous(s.performMode)) {
        // Swap the arp's notes underneath it — it keeps its place and its
        // phase, so the groove carries on rather than stuttering back to one.
        scheduler.retune(
          root,
          performChord(next, s.performMode, { amount: s.performAmount, bpm: s.bpm, velocitySense: s.velocitySense }),
        )
      } else if (s.extensionAddition === 'chord') {
        // Re-articulate the whole chord so the extension arrives as a fresh
        // strike rather than a swell.
        scheduler.start(
          root,
          performChord(next, s.performMode, { amount: s.performAmount, bpm: s.bpm, velocitySense: s.velocitySense }),
        )
      } else {
        scheduler.update(root, next)
      }

      // The chord MIDI stream carries the block chord, so it has to move too.
      for (const n of held.notes) if (!next.includes(n)) midi.noteOff('chord', n)
      for (const n of next) if (!held.notes.includes(n)) midi.noteOn('chord', n, 0.8)

      soundingRef.current.set(pc, {
        notes: next,
        name: resolved?.name ?? noteName(pc),
        root: resolved?.root ?? noteName(pc),
        ext: resolved?.ext ?? '',
        numeral: resolved?.numeral ?? '',
        types: effectiveTypes,
      })

      // The bass follows the chord's root and its own dial.
      const previousBass = bassRef.current.get(pc)
      if (previousBass !== undefined) {
        const intervals = resolved ? buildChord(resolved.spec) : [0]
        const root = resolved ? resolved.spec.root : pc
        const nextBass = bassNote(intervals, root, s.bassVoicing) + semitones
        if (nextBass !== previousBass) {
          midi.noteOff('bass', previousBass)
          engine.bassOn(nextBass)
          midi.noteOn('bass', nextBass, 0.85)
          bassRef.current.set(pc, nextBass)
        }
      }
    }

    // Nudge a render so the display follows the new chord.
    setPressed(new Set(soundingRef.current.keys()))
  }, [heldExtensions, heldTypes, voicing, octave, keyMode, panelKey, bassVoicing, engine, midi, scheduler])

  const panic = useCallback(() => {
    scheduler.stopAll()
    engine.allNotesOff()
    midi.allNotesOff()
    bassRef.current.clear()
    soundingRef.current.clear()
    heldRootsRef.current.length = 0
    stickyTypesRef.current = []
    usePanel.getState().setLatched(false)
    setPressed(new Set())
  }, [engine, scheduler, midi])

  /**
   * The Loop button is one button that means the next sensible thing:
   * record → (auto) play → overdub → stop → overdub…
   *
   * A free-length loop is the exception — it has no boundary to close itself
   * on, so the second press is what ends the first pass.
   */
  /**
   * User sounds live in the store, not here.
   *
   * They have to: the Sound encoder browses one list of factory *and* user
   * sounds, so the dial definition needs to see them. While they were React
   * state the dial could only ever reach the factory presets, and the
   * `handlersRef` indirection existed purely to smuggle them into the
   * bind-once keyboard listener.
   */
  const userSounds = usePanel((st) => st.userSounds)

  /**
   * Persist user sounds — but never the first value we see.
   *
   * The effect fires once on mount, and if the store has not been restored at
   * that moment the value it would write is `emptyUserSounds()`. That is not a
   * hypothetical: it wiped every saved slot during development the first time
   * a hot reload re-created the store module without re-running the restore.
   * Anything that remounts App, or reorders restore against effects, does the
   * same. Skipping the initial run costs nothing — there is no change to save
   * until something changes.
   */
  const soundsDirtyRef = useRef(false)
  useEffect(() => {
    if (!soundsDirtyRef.current) {
      soundsDirtyRef.current = true
      return
    }
    saveUserSounds(userSounds)
  }, [userSounds])

  /**
   * Guards against a played-back progression recording itself.
   *
   * Playback goes through the same `sound()` path as a keypress — which is the
   * point, since it inherits every setting — but that means capture would
   * happily rewrite the step it just played, and the progression would eat its
   * own tail.
   */
  const fromProgressionRef = useRef(false)

  // The player is built once but needs the current closures, same reasoning as
  // the keyboard listener's handler ref.
  const soundRef = useRef(sound)
  soundRef.current = sound
  const silenceRef = useRef(silence)
  silenceRef.current = silence

  const progPlayerRef = useRef<ProgressionPlayer>(undefined)
  progPlayerRef.current ??= new ProgressionPlayer((step) => {
    fromProgressionRef.current = true
    try {
      if (!step) {
        silenceRef.current()
        return
      }
      const s = usePanel.getState()
      usePanel.setState({ heldTypes: [...step.types], heldExtensions: [...step.extensions] })
      soundRef.current(step.root)
    } finally {
      fromProgressionRef.current = false
    }
  })
  const progPlayer = progPlayerRef.current

  const [progView, setProgView] = useState(() => progPlayer.snapshot())

  const exportProgression = useCallback(() => {
    const s = usePanel.getState()
    if (!s.extended || s.progression.steps.length === 0) return

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const bytes = progressionToMidi(
      s.progression,
      (step) =>
        resolveChord({
          root: step.root,
          heldTypes: step.types,
          secretChords: s.secretChords,
          playStyle: s.playStyle,
          extensions: step.extensions,
          keyMode: s.keyMode,
          key: s.key,
          chromatic: chromaticPolicy(s.rootLayout),
          octave: s.octave,
          voicing: s.voicing,
        })?.notes ?? [],
      { bpm: s.bpm, name: 'ORC-1 Progression' },
    )
    downloadMidi(bytes, `orc1-progression-${stamp}.mid`)
  }, [])

  const exportLoop = useCallback(() => {
    const loop = looper.current
    if (!usePanel.getState().extended || !canExport(loop)) return
    const bpm = usePanel.getState().bpm
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    downloadMidi(loopToMidi(loop, { bpm, name: 'ORC-1' }), `orc1-loop-${stamp}.mid`)
  }, [looper])

  const loopAction = useCallback(() => {
    const s = usePanel.getState()
    const { state } = looper.snapshot()

    if (state === 'empty') looper.arm(s.loopBars)
    else if (state === 'recording' && s.loopBars === null) looper.closeFreeLoop()
    else if (state === 'playing') looper.overdub()
    else if (state === 'overdubbing') looper.stopRecording()

    setLoopView(looper.snapshot())
  }, [looper])

  // The Loop encoder's press runs this. Registered rather than imported,
  // because the looper is an audio object and the store holds no audio.
  useEffect(() => {
    usePanel.getState().setLoopAction(loopAction)
  }, [loopAction])

  useEffect(() => {
    usePanel.getState().setLoopHardExit(() => {
      looper.reset()
      setLoopView(looper.snapshot())
      usePanel.getState().goHome()
    })
  }, [looper])

  // --- keyboard ----------------------------------------------------------
  // One listener pair on window, bound once. Current state is read through
  // the store rather than closed over, so nothing needs re-binding.

  useEffect(() => {
    if (!started) return

    /**
     * The whole keyboard, and deliberately nothing more.
     *
     * Twelve root keys, eight chord-modifier keys, and the four gestures a
     * hand makes on the encoder row:
     *
     *   1–9      select a dial          (0 returns to the playing display)
     *   ← →      roll between dials
     *   ↑ ↓      turn it                (Shift = press-and-turn)
     *   Enter    press it               (Shift = press-and-hold)
     *
     * Every other shortcut this app used to carry — latch, voicing nudges,
     * tier cycling, preset browsing, the progression transport, save-sound —
     * has been removed. They were ours, not the instrument's, and each one was
     * a second way to reach something the dials already do. If a thing cannot
     * be reached by turning a dial, that is a gap in the dial grammar and
     * should be fixed there.
     */
    const onDown = (e: KeyboardEvent) => {
      const s = usePanel.getState()

      // Resolved per-event, because Scale layout re-maps the keys to whatever
      // mode is currently selected.
      const roots = rootMap(s.rootLayout, s.key)

      // Notes must never autorepeat — the OS would retrigger them forever.
      // The encoder keys below *want* the repeat: that is how holding an arrow
      // turns a dial through several stops instead of one per tap.
      if (e.repeat && (e.code in roots || e.code in TYPE_KEYS || e.code in EXTENSION_KEYS)) {
        return
      }

      if (e.code in roots) {
        e.preventDefault()

        /*
         * Quick key select.
         *
         * "Press and hold Key, then press a keyboard key (with a chord-type
         * button) to set the key" — hold Min and press C and you are in C
         * minor. Holding the encoder is what pins its page here, so an open
         * Key page *is* the held gesture, and the root key sets the key
         * rather than sounding.
         */
        if (s.screenPage === 'key' && s.screenPinned) {
          const tonic = pitchClassOf(roots[e.code]!)
          const tonality = s.heldTypes.includes('min') ? 'minor' : 'major'
          s.setKey({ tonic, tonality })
          if (!s.keyMode) s.toggleKeyMode()
          return
        }

        press(roots[e.code]!)
        return
      }
      if (e.code in TYPE_KEYS) {
        s.toggleType(TYPE_KEYS[e.code]!, true)
        return
      }
      if (e.code in EXTENSION_KEYS) {
        s.toggleExtension(EXTENSION_KEYS[e.code]!, true)
        return
      }

      /*
       * Voicing, without going and selecting its dial first.
       *
       * Repeats like the arrow keys do, so holding walks the inversions. It
       * takes focus the same way turning a knob with the mouse does, which
       * keeps the screen showing what your hand last touched.
       */
      if (e.code in VOICING_KEYS) {
        // Also stops Chrome's Ctrl +/- page zoom, which would otherwise
        // resize the whole instrument out from under you mid-chord.
        e.preventDefault()
        const step = VOICING_KEYS[e.code]!
        if (e.ctrlKey || e.metaKey) {
          s.setDialFocus(BASS_VOICING_DIAL)
          s.nudgeBassVoicing(step)
        } else {
          s.setDialFocus(VOICING_DIAL)
          s.nudgeVoicing(step)
        }
        s.setDialAxis(false)
        usePanel.getState().glanceValue()
        return
      }

      switch (e.code) {
        // 1–9 jump straight to a dial in the top row, left to right; 0 returns
        // to the playing display.
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5':
        case 'Digit6':
        case 'Digit7':
        case 'Digit8':
        case 'Digit9': {
          if (e.repeat) break
          const index = Number(e.code.slice(-1)) - 1
          const dial = dialAt(index)
          s.setDialFocus(index)
          if (dial.page) s.pinPage(dial.page)
          break
        }
        case 'Digit0':
          if (e.repeat) break
          s.goHome()
          break

        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault()
          if (e.repeat) break // rolling between dials should not run away
          const step = e.code === 'ArrowRight' ? 1 : -1
          const next = (s.dialFocus + step + ALL_DIALS.length) % ALL_DIALS.length
          s.setDialFocus(next)
          // Rolling between dials while a page is up follows along, so the
          // screen always describes the dial your hand is on.
          const page = dialAt(next).page
          if (page && s.screenPage !== 'home') usePanel.getState().glance(page)
          break
        }

        // Held, these repeat — turning several stops, as a real encoder does.
        // Shift is press-and-turn: the same second axis the knobs expose.
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          const dial = dialAt(s.dialFocus)
          axisOf(dial, e.shiftKey).turn(s, e.code === 'ArrowUp' ? 1 : -1)
          s.setDialAxis(e.shiftKey)
          usePanel.getState().glanceValue()
          break
        }

        /*
         * Enter is a press *or* a hold, told apart by how long you keep it
         * down — the same distinction the knobs make, and the same one the
         * hardware makes. Nothing can happen on the way down, because until
         * you release we do not know which gesture this is.
         *
         * Pressing the Perform dial opens the mode list; holding it locks the
         * mode. A modifier key could not express that, which is what this
         * replaced.
         */
        case 'Enter': {
          e.preventDefault()
          if (e.repeat || enterHeldRef.current) break
          enterHeldRef.current = { fired: false }
          usePanel.getState().setHoldingDial(s.dialFocus)

          enterTimerRef.current = setTimeout(() => {
            const held = enterHeldRef.current
            if (held) held.fired = true
            const st = usePanel.getState()
            st.setHoldingDial(null)
            const dial = dialAt(st.dialFocus)
            if (dial.hold) dial.hold(st)
            else if (dial.page) st.pinPage(dial.page)
          }, HOLD_MS)
          break
        }
      }
    }

    const onUp = (e: KeyboardEvent) => {
      const s = usePanel.getState()

      if (e.code === 'Enter') {
        clearTimeout(enterTimerRef.current)
        const held = enterHeldRef.current
        enterHeldRef.current = null
        s.setHoldingDial(null)
        // Released before the ring filled, so it was a press after all.
        if (held && !held.fired) {
          const dial = dialAt(s.dialFocus)
          if (dial.press) {
            dial.press(s)
            if (dial.page) usePanel.getState().glance(dial.page)
          } else if (dial.page) {
            s.pinPage(dial.page)
          }
        }
        return
      }

      const roots = rootMap(s.rootLayout, s.key)
      if (e.code in roots) return release(roots[e.code]!)
      if (e.code in TYPE_KEYS) return s.toggleType(TYPE_KEYS[e.code]!, false)
      if (e.code in EXTENSION_KEYS) return s.toggleExtension(EXTENSION_KEYS[e.code]!, false)
    }

    // Alt-tab mid-chord is a guaranteed stuck note — and would otherwise leave
    // a hold timer running against a key that is no longer down.
    const cancelHold = () => {
      clearTimeout(enterTimerRef.current)
      enterHeldRef.current = null
      usePanel.getState().setHoldingDial(null)
    }

    window.addEventListener('blur', cancelHold)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', panic)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', panic)
      window.removeEventListener('blur', cancelHold)
      cancelHold()
    }
  }, [started, press, release, panic, looper, loopAction, progPlayer])

  // --- preset ------------------------------------------------------------

  /**
   * Changing Sound while a chord is held re-sounds it on the new preset.
   *
   * Necessary, not just nice: switching between the three synth engines calls
   * `allNotesOff`, so without this the held chord would simply vanish the moment
   * you browsed past an engine boundary. Auditioning sounds against a held or
   * latched chord is the whole reason the hardware has a Sound dial you can
   * turn mid-note.
   *
   * This one *does* re-articulate — you want to hear the new sound's attack.
   */
  const cutoff = usePanel((s) => s.cutoff)
  const fxAmounts = usePanel((s) => s.fxAmounts)

  useEffect(() => {
    if (started) engine.setCutoff(cutoff)
  }, [started, engine, cutoff])

  useEffect(() => {
    if (!started) return
    for (const type of FX_TYPES) {
      // The two Drum FX share the panel's FX list but live on the beat bus.
      if (type === 'drumReverb' || type === 'drumSaturation') {
        drums.setDrumFx(type, fxAmounts[type] ?? 0)
      } else {
        engine.setFx(type, fxAmounts[type] ?? 0)
      }
    }
  }, [started, engine, drums, fxAmounts])

  const presetIndex = usePanel((s) => s.presetIndex)
  useEffect(() => {
    if (!started) return
    engine.setPreset(PRESETS[presetIndex]!)

    const s = usePanel.getState()
    for (const [pc, held] of soundingRef.current) {
      const perf = performChord(held.notes, s.performMode, {
        amount: s.performAmount,
        bpm: s.bpm,
        velocitySense: s.velocitySense,
      })
      // An arp keeps running through a sound change; a sustained chord
      // re-articulates so you hear the new preset's attack.
      if (isContinuous(s.performMode)) scheduler.retune(pc, perf)
      else scheduler.start(pc, perf)

      const bass = bassRef.current.get(pc)
      if (bass !== undefined) engine.bassOn(bass)
    }
  }, [started, presetIndex, engine, scheduler])

  const bpm = usePanel((st) => st.bpm)
  const quantize = usePanel((st) => st.quantize)

  useEffect(() => {
    if (started) engine.setBpm(bpm)
  }, [started, bpm, engine])

  const timeSignature = usePanel((st) => st.timeSignature)

  useEffect(() => {
    if (started) drums.setTimeSignature(timeSignature)
  }, [started, drums, timeSignature])

  useEffect(() => {
    looper.configure({
      bpm,
      quantize,
      timeSignature,
      onChange: () => setLoopView(looper.snapshot()),
      countIn: (bars) => drums.countIn(bars),
    })
  }, [looper, drums, bpm, quantize, timeSignature])

  /**
   * A glanced page returns home on its own; a pinned one stays.
   *
   * Without this, turning any dial would leave its page stuck on screen and
   * you'd have to dismiss it manually before you could see what you're playing.
   */
  const screenTouched = usePanel((st) => st.screenTouched)
  const screenPinned = usePanel((st) => st.screenPinned)
  const screenPage = usePanel((st) => st.screenPage)

  useEffect(() => {
    if (screenPinned || screenPage === 'home') return
    const t = setTimeout(() => usePanel.getState().goHome(), 2600)
    return () => clearTimeout(t)
  }, [screenTouched, screenPinned, screenPage])

  const progression = usePanel((st) => st.progression)
  useEffect(() => {
    progPlayer.setProgression(progression)
    setProgView(progPlayer.snapshot())
  }, [progPlayer, progression])

  useEffect(() => {
    if (!started) return
    let raf = 0
    const tick = () => {
      setProgView(progPlayer.snapshot())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, progPlayer])

  const beatOn = usePanel((st) => st.beatOn)
  const beat = usePanel((st) => st.beat)
  const drumVolume = usePanel((st) => st.drumVolume)

  useEffect(() => {
    if (!started) return
    // Follows the *edited* pattern, not the factory index — toggling a cell
    // must be audible on the very next pass.
    drums.setBeat(beat)
    if (beatOn) drums.start()
    else drums.stop()
  }, [started, drums, beatOn, beat])

  useEffect(() => {
    if (started) drums.setVolume(drumVolume)
  }, [started, drums, drumVolume])

  /**
   * The three volumes.
   *
   * Master and Bass both had setters on the engine and values in the store
   * with nothing joining them — turning the Volume dial moved a number on the
   * screen and changed no sound at all. Bass Volume is the Volume encoder's
   * press-and-turn on the hardware; Beat Volume is the BPM encoder's.
   */
  const masterVolume = usePanel((st) => st.masterVolume)
  const bassVolume = usePanel((st) => st.bassVolume)

  useEffect(() => {
    if (started) engine.setMasterVolume(masterVolume)
  }, [started, engine, masterVolume])

  useEffect(() => {
    if (started) engine.setBassVolume(bassVolume)
  }, [started, engine, bassVolume])

  // Options -> Audio and MIDI -> Metronome Click. The DrumMachine has always
  // supported both sounds; nothing was selecting between them.
  const metronome = usePanel((st) => st.metronome)
  useEffect(() => {
    if (started) drums.setMetronomeSound(metronome)
  }, [started, drums, metronome])

  const metronomeOn = usePanel((st) => st.metronomeOn)
  useEffect(() => {
    if (!started) return
    drums.setMetronome(metronomeOn)
    // The click needs the transport running even with no Beat playing.
    if (metronomeOn) drums.start()
    else if (!usePanel.getState().beatOn) drums.stop()
  }, [started, drums, metronomeOn])

  const bassPresetIndex = usePanel((st) => st.bassPresetIndex)
  useEffect(() => {
    if (started) engine.setBassPreset(bassPresetAt(bassPresetIndex))
  }, [started, engine, bassPresetIndex])

  /** Playhead for the grid. Read on rAF; never drives audio. */
  const [playhead, setPlayhead] = useState(-1)
  useEffect(() => {
    if (!started || !beatOn) {
      setPlayhead(-1)
      return
    }
    let raf = 0
    const tick = () => {
      setPlayhead(drums.currentStep)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, beatOn, drums])

  /**
   * Mirror the looper into React on rAF.
   *
   * The progress ring needs to move every frame; the loop itself must not be
   * driven by React. Same rule as the rest of the audio path — the engine owns
   * the truth, the UI renders a copy that is allowed to lag a frame.
   */
  useEffect(() => {
    if (!started) return
    let raf = 0
    const tick = () => {
      setLoopView(looper.snapshot())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, looper])


  /**
   * Changing the Perform mode or its parameter re-articulates whatever is
   * sounding, so you can audition modes against a latched chord — which is the
   * whole point of latch existing.
   */
  const performMode = usePanel((st) => st.performMode)
  const performAmount = usePanel((st) => st.performAmount)

  useEffect(() => {
    if (soundingRef.current.size === 0) return
    const s = usePanel.getState()
    for (const [pc, held] of soundingRef.current) {
      // `retune` keeps the phase when both old and new modes are cycles, and
      // falls back to a clean start when crossing between mode families.
      scheduler.retune(
        pc,
        performChord(held.notes, s.performMode, { amount: s.performAmount, bpm: s.bpm, velocitySense: s.velocitySense }),
      )
    }
  }, [performMode, performAmount, scheduler])

  // --- render ------------------------------------------------------------

  // Read from what is actually sounding, not from what the panel would play.
  const sounding = [...soundingRef.current.values()]
  const display = sounding[0]
  const soundingNotes = sounding.flatMap((h) => h.notes)

  return (
    <div className="app">
      {!started && (
        <div className="start">
          <div className="inner">
            <button
              onClick={async () => {
                await engine.start()
                engine.setPreset(PRESETS[usePanel.getState().presetIndex]!)
                drums.build()
                setStarted(true)
                if (import.meta.env.DEV) {
                  console.info('[orc-1] latency (ms)', engine.latencyReport?.())
                }
              }}
            >
              Start
            </button>
            <p>
              Hold <strong>Q W E R</strong> for chord type, <strong>A S D F</strong> for extensions,
              and play roots on <strong>G H J K L ; '</strong> with black keys on{' '}
              <strong>Y U O P [</strong>.
            </p>
          </div>
        </div>
      )}

      <Panel
        legends={legends}
        chord={display?.root ?? ''}
        chordExt={display?.ext ?? ''}
        notes={
          soundingNotes.length > 0
            ? soundingNotes.map((n) => noteName(n % 12) + (Math.floor(n / 12) - 1)).join('  ')
            : ''
        }
        midiNotes={soundingNotes}
        pressed={pressed}
        onPressKey={press}
        onReleaseKey={release}
        loop={loopView}
        prog={progView}
        slots={slots}
        slot={slot}
        playhead={playhead}
        midi={midi}
        midiPorts={midiPorts}
        midiPort={midiPort}
        onMidiPort={setMidiPort}
        onLoopAction={loopAction}
        onLoopUndo={() => {
          looper.undo()
          setLoopView(looper.snapshot())
        }}
        onLoopPause={() => {
          const { state } = looper.snapshot()
          if (state === 'paused') looper.resume()
          else looper.pause()
          setLoopView(looper.snapshot())
        }}
        onLoopClear={() => {
          looper.reset()
          setLoopView(looper.snapshot())
        }}
        onSlot={setSlot}
        onSlotSave={saveSlot}
        onSlotLoad={loadSlot}
        onSlotDelete={deleteSlot}
        onExportLoop={exportLoop}
        onProgToggle={() => {
          progPlayer.toggle()
          setProgView(progPlayer.snapshot())
        }}
        onExportProg={exportProgression}
      />
    </div>
  )
}
