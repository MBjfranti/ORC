import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { beatAt, meterAt } from './core/beats.js'
import { Instrument } from './engine/instrument.js'
import type { Sounding } from './engine/instrument.js'
import { getLooper } from './engine/looper.js'
import type { LoopView } from './engine/looper.js'
import { getSynth } from './engine/synth.js'
import {
  DEFAULT_LEGENDS,
  EXTENSION_KEYS,
  resolveLegends,
  rootMap,
  TYPE_KEYS,
} from './input/layout.js'
import type { Legends } from './input/layout.js'
import { usePanel } from './state/panel.js'
import type { PanelState } from './state/panel.js'
import { ENCODERS, encoderByDigit, encoderById, turnEncoder } from './ui/encoders.js'
import { ChordDisplay } from './ui/ChordDisplay.js'
import { Console, Voicings } from './ui/Console.js'
import { Keybed } from './ui/Keybed.js'
import { Loop } from './ui/Loop.js'
import { Pads } from './ui/Pads.js'
import { VoicingStack } from './ui/VoicingStack.js'

export type { Sounding }

/**
 * The chord readout, the pitch axis and the looper.
 *
 * Off while the top section is rebuilt one control at a time. They are still
 * wired and still correct — this is a curtain, not a deletion, and each comes
 * back as it earns its place on the panel again.
 */
const SHOW_READOUTS = false

/**
 * The shell.
 *
 * Deliberately thin. Playing a note does not go through this component — the
 * keyboard handler calls straight into `Instrument`, which reaches the synth
 * with no hooks, no store writes and no render in the way. React learns what
 * happened on the next animation frame by pulling a snapshot, and only
 * re-renders if that snapshot actually changed.
 */
export default function App() {
  const [legends, setLegends] = useState<Legends>(DEFAULT_LEGENDS)

  const synth = getSynth()
  const looper = getLooper(synth)

  const instrumentRef = useRef<Instrument>(undefined)
  instrumentRef.current ??= new Instrument(synth, looper)
  const instrument = instrumentRef.current

  // The one subscription the play path feeds. Coalesced onto a frame inside
  // `Instrument`, so a strum costs one render rather than one per note.
  const { sounding, pressed } = useSyncExternalStore(instrument.subscribe, instrument.snapshot)

  useEffect(() => {
    void resolveLegends().then(setLegends)
  }, [])

  /**
   * Build the audio graph during load, not on the first keypress.
   *
   * The context starts suspended — no gesture is needed to *construct* one — so
   * the reverb's impulse response and the four synths are all ready before
   * anyone touches a key. The first note then only has to wait for `resume()`.
   */
  useEffect(() => {
    void synth.prepare()
  }, [synth])

  // --- audio start ---------------------------------------------------------

  /**
   * Browsers will not open an AudioContext without a gesture, which is the only
   * reason a start button ever existed. It does not have to be a button, so the
   * instrument is simply *there* and wakes under the first key you touch.
   */
  const starting = useRef(false)
  const unlock = useCallback(async () => {
    if (starting.current) return
    starting.current = true
    await synth.start()
    const s = usePanel.getState()
    synth.setSound(s.soundIndex)
    synth.setCutoff(s.cutoff)
    synth.setChorus(s.chorus)
    synth.setReverb(s.reverb)
    synth.setDelay(s.delay)
    synth.setVolume(s.volume)
    synth.setBassLevel(s.bassLevel)
    synth.setBassSound(s.bassIndex)
    synth.setBpm(s.bpm)
    synth.setBeatLevel(s.beatLevel)
    synth.setClickLevel(s.clickLevel)
    synth.setDrumReverb(s.drumReverb)
    synth.setDrumSaturation(s.drumSat)
    synth.setMetronome(s.clockOn && s.beatIndex === null, meterAt(s.meter))
    synth.setBeat(s.clockOn && s.beatIndex !== null ? beatAt(s.beatIndex) : undefined)
  }, [synth])

  // --- settings → engine ---------------------------------------------------

  const soundIndex = usePanel((s) => s.soundIndex)
  const cutoff = usePanel((s) => s.cutoff)
  const chorus = usePanel((s) => s.chorus)
  const reverb = usePanel((s) => s.reverb)
  const delayAmount = usePanel((s) => s.delay)
  const volume = usePanel((s) => s.volume)
  const bassLevel = usePanel((s) => s.bassLevel)
  const bassIndex = usePanel((s) => s.bassIndex)
  const bpm = usePanel((s) => s.bpm)
  const meterIndex = usePanel((s) => s.meter)
  const beatIndex = usePanel((s) => s.beatIndex)
  const clockOn = usePanel((s) => s.clockOn)
  const beatLevel = usePanel((s) => s.beatLevel)
  const clickLevel = usePanel((s) => s.clickLevel)
  const drumReverb = usePanel((s) => s.drumReverb)
  const drumSat = usePanel((s) => s.drumSat)
  const loopGrid = usePanel((s) => s.loopGrid)
  const meter = meterAt(meterIndex)

  useEffect(() => void synth.setSound(soundIndex), [synth, soundIndex])
  useEffect(() => void synth.setCutoff(cutoff), [synth, cutoff])
  useEffect(() => void synth.setChorus(chorus), [synth, chorus])
  useEffect(() => void synth.setReverb(reverb), [synth, reverb])
  useEffect(() => void synth.setDelay(delayAmount), [synth, delayAmount])
  useEffect(() => void synth.setVolume(volume), [synth, volume])
  useEffect(() => void synth.setBassLevel(bassLevel), [synth, bassLevel])
  useEffect(() => void synth.setBassSound(bassIndex), [synth, bassIndex])
  useEffect(() => void synth.setBpm(bpm), [synth, bpm])

  /*
   * Build the playback synth for whichever preset you have settled on.
   *
   * Loop layers replay on their own preset, and constructing one costs 8-12ms.
   * `Looper` already warms at the moment capture starts, which keeps that cost
   * off the audio path — but it still lands on the record press, measured at
   * 23ms for a preset never used before. Doing it here as well means the press
   * is ~1ms, because by then it exists.
   *
   * On a delay, so scrolling the fifty-strong list builds nothing: only a sound
   * you have stopped on for a moment is one you might record with.
   */
  useEffect(() => {
    const id = window.setTimeout(() => synth.warm(soundIndex, bassIndex), 400)
    return () => window.clearTimeout(id)
  }, [synth, soundIndex, bassIndex])
  useEffect(() => void synth.setBeatLevel(beatLevel), [synth, beatLevel])
  useEffect(() => void synth.setClickLevel(clickLevel), [synth, clickLevel])
  useEffect(() => void synth.setDrumReverb(drumReverb), [synth, drumReverb])
  useEffect(() => void synth.setDrumSaturation(drumSat), [synth, drumSat])

  /*
   * One switch, two things it can start.
   *
   * `clockOn` is the BPM dial's press and `beatIndex` is where its list was
   * left, so these two effects are the whole of "the Metronome **or** Beats can
   * be toggled on/off by pressing the BPM Dial" (§12.6). Scrolling from a
   * signature onto a beat while the clock runs hands over live, because both
   * effects re-run on the same change.
   */
  useEffect(
    () => void synth.setMetronome(clockOn && beatIndex === null, meter),
    [synth, clockOn, beatIndex, meter],
  )
  useEffect(
    () => void synth.setBeat(clockOn && beatIndex !== null ? beatAt(beatIndex) : undefined),
    [synth, clockOn, beatIndex],
  )

  // --- live chord edits ----------------------------------------------------

  const heldTypes = usePanel((s) => s.heldTypes)
  const heldExtensions = usePanel((s) => s.heldExtensions)
  const voicing = usePanel((s) => s.voicing)
  const octave = usePanel((s) => s.octave)
  const keyMode = usePanel((s) => s.keyMode)
  const key = usePanel((s) => s.key)
  const performMode = usePanel((s) => s.performMode)
  const performAmount = usePanel((s) => s.performAmount)
  const performOn = usePanel((s) => s.performOn)

  useEffect(() => {
    instrument.recolour()
      // `bpm` belongs here: the arpeggiator and Pattern are BPM-synced, and
    // without it a tempo change mid-chord left the loop running at the old
    // interval until the next keypress.
  }, [
    instrument,
    heldTypes,
    heldExtensions,
    voicing,
    octave,
    keyMode,
    key,
    performMode,
    performAmount,
    performOn,
    bpm,
  ])

  // --- looper --------------------------------------------------------------

  const [loopView, setLoopView] = useState<LoopView>(() => looper.view())

  useEffect(() => {
    looper.configure({
      bpm,
      grid: loopGrid,
      meter,
      // Pushed in rather than looked up, so the looper never reaches into the
      // store. Whichever pair is loaded when a pass starts is stamped onto that
      // layer and is what it replays with.
      sound: soundIndex,
      bassSound: bassIndex,
      /*
       * The handoff v3.90 describes: the click counts the bar in, and if a beat
       * is selected it takes over the moment recording starts. Only when one is
       * selected — with the cursor up among the signatures there is nothing to
       * hand over to, and starting the drums would be inventing a beat the
       * player never chose.
       */
      onRecord: () => {
        const s = usePanel.getState()
        if (s.beatIndex !== null && !s.clockOn) s.toggleClock()
      },
      onChange: () => {
        const view = looper.view()
        setLoopView(view)
        // Mirror the discrete parts into the panel so the screen re-renders on
        // a transport event. The *position* stays out of it — the ring animates
        // itself off the pass length.
        usePanel
          .getState()
          .syncLoop(view.state, view.layers, view.bars, view.lengthSeconds, view.countBeat)
      },
    })
  }, [looper, bpm, loopGrid, meter, soundIndex, bassIndex])

  /**
   * Mirror the loop's position on rAF — but **only while a loop is running**,
   * and only when the rounded position actually moved.
   *
   * The previous version ran unconditionally and set state every frame, so the
   * whole tree re-rendered 60 times a second whether or not anything had
   * happened. Every keypress then had to compete with a render that was always
   * in flight, which showed up as jitter rather than as latency.
   */
  /*
   * Only for the readouts. The looping border does not need this: it is a CSS
   * animation off the pass length, so a running loop now costs zero renders
   * instead of two hundred a pass.
   */
  const live = SHOW_READOUTS && loopView.state !== 'empty'
  useEffect(() => {
    if (!live) return
    let raf = 0
    let lastPosition = -1
    const tick = () => {
      const next = looper.view()
      // Quantised to the ring's own resolution: sub-percent moves are invisible
      // and not worth a render.
      const position = Math.round(next.position * 200)
      if (position !== lastPosition || next.state !== loopView.state) {
        lastPosition = position
        setLoopView(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [looper, live, loopView.state])

  const advanceLoop = useCallback(() => {
    void unlock()
    looper.advance(usePanel.getState().loopBars)
    setLoopView(looper.view())
  }, [looper, unlock])

  // --- keyboard ------------------------------------------------------------

  useEffect(() => {
    /**
     * Holding an encoder key keeps turning it.
     *
     * The OS would do this for us, but every note key goes through the same
     * handler and notes must never autorepeat — so autorepeat is refused at the
     * top of `onDown` and the encoders bring their own. Which is the better
     * arrangement anyway: the OS repeat rate is a system preference, and
     * scrolling fifty sounds should not feel different on someone else's
     * machine.
     *
     * It accelerates. A short delay first, so a tap stays a tap, then steadily
     * faster the longer it is held — near enough to spinning a real encoder,
     * and it keeps a fifty-item list about a second away end to end.
     */
    let repeatTimer: number | undefined
    const stopRepeat = () => {
      if (repeatTimer !== undefined) window.clearTimeout(repeatTimer)
      repeatTimer = undefined
    }
    /**
     * Always re-read: the focused encoder and its value both move under us.
     *
     * With a knob's number held down this turns its **secondary** axis instead
     * — Key reaches Transpose that way, and Volume and BPM will reach their own
     * when they arrive (research/13 §B.7). Turning also cancels the pending
     * hold, or the menu would open underneath the gesture. The hardware shipped
     * with precisely that bug: "Transpose adjustment no longer accidentally
     * toggles Key", v3.90.
     */
    const turnFocused = (delta: number) => {
      const st = usePanel.getState()
      const held = digitHold
      const secondary = held ? ENCODERS[held.index]?.secondary : undefined
      if (held && secondary) {
        stopDigitHold()
        secondary.turn(st, delta)
        const next = usePanel.getState()
        next.showGlance(secondary.value(next), secondary.label, undefined, true)
        return
      }
      turnEncoder(st.dialFocus, st, delta)
    }
    /** Do it once now, then keep doing it, faster, for as long as it is held. */
    const startRepeat = (act: () => void) => {
      stopRepeat()
      act()
      let step = 0
      const tick = () => {
        act()
        step += 1
        repeatTimer = window.setTimeout(tick, step < 6 ? 90 : step < 16 ? 50 : 28)
      }
      repeatTimer = window.setTimeout(tick, 300)
    }

    /**
     * A number key is that encoder's cap. The whole gesture set lives on the
     * one digit, with no modifier:
     *
     *   tap         → open that encoder's list
     *   double-tap  → press it (Bass switches its engine off, Key toggles
     *                 Key Mode) — the hardware's press, which is a real
     *                 function and not a way of selecting anything
     *   hold        → its menu
     *
     * The list opens on key *up*, because a tap and the start of a hold look
     * identical until you let go: opening on the way down would flash a list
     * nobody asked for on the way to every menu.
     */
    let digitHold: { index: number; timer: number; fired: boolean } | null = null

    const stopDigitHold = () => {
      if (digitHold) window.clearTimeout(digitHold.timer)
      digitHold = null
    }
    const startDigitHold = (index: number) => {
      stopDigitHold()
      const hold = { index, fired: false, timer: 0 }
      hold.timer = window.setTimeout(() => {
        hold.fired = true
        ENCODERS[index]?.hold?.(usePanel.getState())
      }, 550)
      digitHold = hold
    }

    /**
     * A completed tap: **reach for the knob, or press it.**
     *
     * A physical panel does not need a way to say "this knob" — your hand says
     * it. A keyboard does, and that gesture has to come from somewhere. Giving
     * it the first tap and leaving the press to a *second* tap costs a tap only
     * when you change knobs, which is exactly when it should cost something.
     *
     *     5   Bass takes focus, its list opens      (reach)
     *     5   engine off                            (press)
     *     5   engine on                             (press)
     *
     * The earlier arrangement put the press on a timed double-tap, which made
     * the one-gesture rule — press is always the section's switch — into a
     * different gesture on the keyboard than on the panel, and made Bass on/off
     * depend on how fast you can type. This keeps one press meaning one press.
     *
     * Nothing here closes the display: `0`, Escape and the `Exit` row do that,
     * the last of which is how the hardware does it.
     */
    const resolveTap = (index: number, s: PanelState) => {
      if (s.dialFocus !== index) {
        s.setDialFocus(index)
        s.setScreenList(index)
        // Reaching for Loop *is* entering Loop Mode — "push or turn the Loop
        // Dial to access the Waiting Room" (§12.1). Everything else has nothing
        // to do here, which is the point of a reach.
        ENCODERS[index]?.reach?.(usePanel.getState())
        return
      }
      ENCODERS[index]?.press?.(s)
    }

    /**
     * The play path.
     *
     * This calls the instrument directly. No state is read through a hook, no
     * store is written, and nothing here can trigger a render — the note is in
     * the synth before React is told anything happened.
     */
    const onDown = (e: KeyboardEvent) => {
      // Notes must never autorepeat — the OS would retrigger them forever.
      if (e.repeat) return
      const s = usePanel.getState()
      const roots = rootMap(s.rootMode, s.key)

      if (e.code in roots) {
        e.preventDefault()
        const root = roots[e.code]!

        /*
         * The quick key select prompt is up, so the keybed is answering it
         * rather than playing: the root you press *is* the key, minor if the
         * `Min` pad is down (§9.2). No note sounds — you are spelling a key,
         * not playing one.
         */
        if (s.keySelect) {
          s.pickKey(root, s.heldTypes.includes('min'))
          return
        }

        // The first note of the session arrives before there is anywhere to
        // play it. Rather than swallowing it, wait for the context and then
        // play it — if the key is still down by the time we get there.
        if (!synth.running) {
          instrument.press(root)
          void unlock().then(() => instrument.isHeld(root) && instrument.sound(root))
          return
        }
        instrument.press(root)
        return
      }

      if (e.code in TYPE_KEYS) {
        e.preventDefault()
        s.setHeldType(TYPE_KEYS[e.code]!, true)
        return
      }
      if (e.code in EXTENSION_KEYS) {
        e.preventDefault()
        s.setHeldExtension(EXTENSION_KEYS[e.code]!, true)
        return
      }

      /*
       * The number row reaches the encoders, and `-`/`=` turn whichever one is
       * selected. That is the whole grammar of the top row from the keyboard:
       * pick a knob, turn it, without your hand leaving the keys.
       */
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5))
        // The digit addresses a knob by its printed number, not by where it
        // happens to sit in the array — so the array can be reordered without
        // moving a shortcut.
        const index = encoderByDigit(n)
        if (index !== undefined) {
          e.preventDefault()
          // Focus is claimed on the way *up*, in `resolveTap`. Taking it here
          // would mean every tap arrived already focused, and so every tap
          // would read as a press.
          startDigitHold(index)
          return
        }
        if (n === 0) {
          e.preventDefault()
          s.setScreenList(null)
          return
        }
      }

      switch (e.code) {
        case 'Minus':
        case 'Equal': {
          e.preventDefault()
          const delta = e.code === 'Minus' ? -1 : 1
          startRepeat(() => turnFocused(delta))
          break
        }

        /*
         * The arrow cluster is the voicing control: left and right walk the
         * chord through its inversions, up and down choose which of the two
         * stacked dials you are walking. It reads the way the dials are
         * physically arranged — Chord above Bass — so the gesture matches the
         * panel rather than having to be remembered separately.
         */
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault()
          const delta = e.code === 'ArrowLeft' ? -1 : 1
          startRepeat(() => {
            const st = usePanel.getState()
            const i = encoderById(st.voicingFocus === 'chord' ? 'chordVoicing' : 'bassVoicing')
            if (i !== undefined) turnEncoder(i, st, delta)
          })
          break
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          const which = e.code === 'ArrowUp' ? 'chord' : 'bass'
          s.setVoicingFocus(which)
          // Move the panel's focus with it, so the ring on the cap says which
          // dial the arrows are about to move.
          const i = encoderById(which === 'chord' ? 'chordVoicing' : 'bassVoicing')
          if (i !== undefined) s.setDialFocus(i)
          break
        }
        case 'BracketLeft':
        case 'BracketRight':
          e.preventDefault()
          s.nudgeVoicing(e.code === 'BracketLeft' ? -1 : 1)
          break
        case 'Comma':
        case 'Period':
          e.preventDefault()
          s.nudgeOctave(e.code === 'Comma' ? -1 : 1)
          break
        case 'Space':
          e.preventDefault()
          s.toggleLatch()
          if (!usePanel.getState().latched) instrument.panic()
          break
        case 'KeyB':
          e.preventDefault()
          advanceLoop()
          break
        /*
         * Root Layout: what the twelve keys mean against a seven-note key.
         * Chromatic → Correct → Scale, the three answers to the problem
         * research/04 calls the most consequential in Key Mode.
         */
        case 'Slash': {
          e.preventDefault()
          s.cycleRootLayout()
          const next = usePanel.getState()
          next.showGlance(
            next.rootMode === 'scale' ? 'Scale' : next.chromatic === 'colour' ? 'Colour' : 'Snap',
            'Root Layout',
          )
          break
        }
        /*
         * The hard exit: "long press the Bass Voicing Dial and press the Loop
         * Dial to instantly stop your Loop and leave Loop Mode" (§12.4). It is
         * the one two-handed shortcut on the instrument, and it is documented
         * as losing an unsaved loop — so it stays deliberate rather than being
         * folded into Escape.
         */
        case 'Backslash':
          e.preventDefault()
          looper.reset()
          s.setLoopScreen(null)
          break
        /*
         * Escape returns to the playing screen — and that is now the *only* way
         * back, because nothing times out any more.
         *
         * It backs out of whatever is open and stops there. It used to also
         * panic every time, which was survivable while lists closed themselves
         * and is not now: closing the Sound list is an ordinary thing to do
         * mid-chord, and killing every sounding note to do it would make the
         * one key you need the one key you cannot afford to press.
         *
         * So the panic moves to the bottom of the stack. With nothing open
         * there is nothing to back out of, and Escape means what it means
         * everywhere else — stop.
         */
        case 'Escape': {
          e.preventDefault()
          const showing = s.keySelect || s.screenList !== null || s.loopScreen !== null
          s.cancelKeySelect()
          s.setScreenList(null)
          // The loop keeps playing — leaving Loop Mode is not the same as
          // stopping it, which is what `\` is for.
          s.setLoopScreen(null)
          if (!showing) instrument.panic()
          break
        }
      }
    }

    const onUp = (e: KeyboardEvent) => {
      const s = usePanel.getState()
      const roots = rootMap(s.rootMode, s.key)
      if (
        e.code === 'Minus' ||
        e.code === 'Equal' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        return stopRepeat()
      }

      if (e.code.startsWith('Digit') && digitHold) {
        const index = encoderByDigit(Number(e.code.slice(5)))
        if (index !== undefined && digitHold.index === index) {
          const tapped = !digitHold.fired
          stopDigitHold()
          if (tapped) resolveTap(index, s)
          return
        }
      }

      if (e.code in roots) return instrument.release(roots[e.code]!)
      if (e.code in TYPE_KEYS) return s.setHeldType(TYPE_KEYS[e.code]!, false)
      if (e.code in EXTENSION_KEYS) return s.setHeldExtension(EXTENSION_KEYS[e.code]!, false)
    }

    const wake = () => void unlock()
    // Losing focus mid-hold means the keyup never arrives, and a repeat left
    // running would keep scrolling a list nobody is looking at.
    const onBlur = () => {
      stopRepeat()
      stopDigitHold()
      instrument.panic()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', wake)
    return () => {
      stopRepeat()
      stopDigitHold()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', wake)
    }
  }, [instrument, synth, unlock, advanceLoop])

  const onPressKey = useCallback(
    (pc: number) => {
      void unlock()
      instrument.press(pc)
    },
    [instrument, unlock],
  )
  const onReleaseKey = useCallback((pc: number) => instrument.release(pc), [instrument])

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          Orchid<span className="mark">·</span>
        </h1>
        <p className="tagline">Chords under one finger</p>
      </header>

      <main className="stage">
        {/*
          Three areas, split the way the instrument is actually held: the top
          half is everything you read, and the bottom is the two things your
          hands are on — pads under the left, keys under the right. That is the
          core gesture (hold a pad, press a key) laid out as geometry.
        */}
        <section className="top">
          {/*
            Hidden while the top section is rebuilt, not removed — the chord
            readout, the pitch axis and the looper are all still wired and come
            back as each earns its place on the panel again.
          */}
          {SHOW_READOUTS && (
            <div className="readouts">
              <ChordDisplay sounding={sounding} />
              <VoicingStack sounding={sounding} />
              <Loop
                view={loopView}
                onAdvance={advanceLoop}
                onUndo={() => {
                  looper.undo()
                  setLoopView(looper.view())
                }}
                onClear={() => {
                  looper.reset()
                  setLoopView(looper.view())
                }}
                onPause={() => {
                  if (looper.view().state === 'paused') looper.resume()
                  else looper.pause()
                  setLoopView(looper.view())
                }}
              />
            </div>
          )}

          <Console sounding={sounding} />
        </section>

        {/*
          The voicing dials, between the hands. Not part of the console: this
          is the control you reach for *while* a chord is sounding, so it sits
          where the hand holding it already is, not up with the browse knobs.
        */}
        <Voicings />

        <section className="hand hand-left" aria-label="Chord buttons">
          <Pads legends={legends} />
          {/* The core gesture is not discoverable from looking at it — you have
              to know the pads are held rather than clicked. */}
          <p className="hint">
            <span>Hold a pad, press a key</span>
            <span>
              Encoders <kbd>1</kbd>–<kbd>8</kbd> · turn <kbd>-</kbd>
              <kbd>=</kbd> · tap again for on/off · hold to edit
            </span>
            {/* Nothing on the screen times out, so the way back has to be
                printed where the other gestures are. */}
            <span>
              Back to the playing screen <kbd>esc</kbd> · or <kbd>0</kbd>
            </span>
            <span>
              Voicing <kbd>←</kbd>
              <kbd>→</kbd> · chord/bass <kbd>↑</kbd>
              <kbd>↓</kbd> · Octave <kbd>,</kbd>
              <kbd>.</kbd> · Root layout <kbd>/</kbd>
            </span>
            <span>
              Hold a number and turn for its second axis — <kbd>4</kbd>+<kbd>-</kbd>
              <kbd>=</kbd> transposes
            </span>
            <span>
              Loop <kbd>6</kbd> · stop and clear <kbd>\</kbd>
            </span>
            <span>
              Latch <kbd>space</kbd> · Loop <kbd>B</kbd>
            </span>
          </p>
        </section>

        <section className="hand hand-right" aria-label="Keys">
          <Keybed
            legends={legends}
            pressed={pressed}
            onPress={onPressKey}
            onRelease={onReleaseKey}
          />
        </section>
      </main>
    </div>
  )
}
