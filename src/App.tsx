import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Instrument } from './engine/instrument.js'
import type { Sounding } from './engine/instrument.js'
import { Looper } from './engine/looper.js'
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
import { ENCODERS } from './ui/encoders.js'
import { ChordDisplay } from './ui/ChordDisplay.js'
import { Console } from './ui/Console.js'
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
  const looperRef = useRef<Looper>(undefined)
  looperRef.current ??= new Looper(synth)
  const looper = looperRef.current

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
    synth.setBpm(s.bpm)
  }, [synth])

  // --- settings → engine ---------------------------------------------------

  const soundIndex = usePanel((s) => s.soundIndex)
  const cutoff = usePanel((s) => s.cutoff)
  const chorus = usePanel((s) => s.chorus)
  const reverb = usePanel((s) => s.reverb)
  const delayAmount = usePanel((s) => s.delay)
  const volume = usePanel((s) => s.volume)
  const bassLevel = usePanel((s) => s.bassLevel)
  const bpm = usePanel((s) => s.bpm)
  const loopGrid = usePanel((s) => s.loopGrid)

  useEffect(() => void synth.setSound(soundIndex), [synth, soundIndex])
  useEffect(() => void synth.setCutoff(cutoff), [synth, cutoff])
  useEffect(() => void synth.setChorus(chorus), [synth, chorus])
  useEffect(() => void synth.setReverb(reverb), [synth, reverb])
  useEffect(() => void synth.setDelay(delayAmount), [synth, delayAmount])
  useEffect(() => void synth.setVolume(volume), [synth, volume])
  useEffect(() => void synth.setBassLevel(bassLevel), [synth, bassLevel])
  useEffect(() => void synth.setBpm(bpm), [synth, bpm])

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
    looper.configure({ bpm, grid: loopGrid, onChange: () => setLoopView(looper.view()) })
  }, [looper, bpm, loopGrid])

  /**
   * Mirror the loop's position on rAF — but **only while a loop is running**,
   * and only when the rounded position actually moved.
   *
   * The previous version ran unconditionally and set state every frame, so the
   * whole tree re-rendered 60 times a second whether or not anything had
   * happened. Every keypress then had to compete with a render that was always
   * in flight, which showed up as jitter rather than as latency.
   */
  const live = loopView.state !== 'empty'
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
        if (n >= 1 && n <= ENCODERS.length) {
          e.preventDefault()
          s.setDialFocus(n - 1)
          // Selecting an encoder opens its list. Pressing the same number again
          // closes it, so one key both reaches and dismisses.
          s.setScreenList(s.screenList === n - 1 ? null : n - 1)
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
          const encoder = ENCODERS[s.dialFocus]
          encoder?.turn(s, e.code === 'Minus' ? -1 : 1)
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
        case 'Escape':
          s.setScreenList(null)
          instrument.panic()
          break
      }
    }

    const onUp = (e: KeyboardEvent) => {
      const s = usePanel.getState()
      const roots = rootMap(s.rootMode, s.key)
      if (e.code in roots) return instrument.release(roots[e.code]!)
      if (e.code in TYPE_KEYS) return s.setHeldType(TYPE_KEYS[e.code]!, false)
      if (e.code in EXTENSION_KEYS) return s.setHeldExtension(EXTENSION_KEYS[e.code]!, false)
    }

    const wake = () => void unlock()
    const onBlur = () => instrument.panic()

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', wake)
    return () => {
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

          <Console />
        </section>

        <section className="hand hand-left" aria-label="Chord buttons">
          <Pads legends={legends} />
          {/* The core gesture is not discoverable from looking at it — you have
              to know the pads are held rather than clicked. */}
          <p className="hint">
            <span>Hold a pad, press a key</span>
            <span>
              Encoders <kbd>1</kbd> · turn <kbd>-</kbd>
              <kbd>=</kbd> · close <kbd>0</kbd> · Octave <kbd>,</kbd>
              <kbd>.</kbd>
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
