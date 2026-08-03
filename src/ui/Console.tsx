/**
 * The console — the top bar's visual language.
 *
 * Two kinds of control, and the difference between them is what each one is
 * *for*:
 *
 *   **Labelled dial** — discrete. Its choices are printed around it and a
 *   pointer swings to one. You can read the whole range without turning it,
 *   which is the entire point of silkscreening an amp knob. Says *what*.
 *
 *   **Encoder** — continuous, and endless. It has no printed range because it
 *   has none; instead a lit screen beside it reports where it is. Says
 *   *how much*.
 *
 * They pair. The FX dial points at an effect; the encoder next to it edits
 * whichever effect that is, and its screen re-reads on the way past. One
 * glance tells you both which effect you are on and what it is set to, and
 * neither control has to be labelled twice.
 *
 * The screens are the only dark elements on the page. That is deliberate:
 * against paper, a dark panel reads as lit, and nothing else has to work hard
 * to say "this is a display".
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { amountLabel, PERFORM_LABEL, PERFORM_MODES } from '../core/performance.js'
import { barsLabel, LOOP_BARS } from '../core/looper.js'
import { noteName, noteWithOctave } from '../core/spelling.js'
import type { Sounding } from '../engine/instrument.js'
import { keyIndex, KEYS, MODE_LABEL, MODE_SUFFIX } from '../core/types.js'
import type { Key } from '../core/types.js'
import { viewPieces } from '../core/options.js'
import { getSynth } from '../engine/synth.js'
import { soundNumber, SOUNDS } from '../engine/sounds.js'
import { FX_IDS, FX_LABEL, usePanel } from '../state/panel.js'
import type { FxId } from '../state/panel.js'
import { Dial } from './Dial.js'
import {
  columnIndices,
  ENCODERS,
  encoderLegend,
  isCapturing,
  isPlaceholder,
  isStoppable,
  loopRows,
  rowIndices,
  SCREEN_AFTER,
  screenLabel,
  screenRows,
  turnEncoder,
} from './encoders.js'
import { ScreenList } from './ScreenList.js'

/**
 * Which units are on the panel.
 *
 * The top section is being rebuilt one control at a time, so everything except
 * the summary is switched off here rather than deleted — each unit is finished
 * work waiting for its turn, and flipping a flag is how it comes back.
 */
const SHOW = {
  sound: true,
  perform: false,
  fx: false,
  key: false,
  voicing: false,
  level: false,
} as const

/** 0–99, the unit an instrument panel uses. Never a percentage. */
const level = (n: number) => String(Math.round(n * 99)).padStart(2, '0')

export const Console = memo(function Console({ sounding }: { sounding: Sounding | undefined }) {
  const s = usePanel()

  const fxAmount: Record<FxId, number> = {
    colour: s.cutoff,
    chorus: s.chorus,
    delay: s.delay,
    reverb: s.reverb,
  }

  return (
    <div className="console" role="group" aria-label="Sound controls">
      {/*
        The row, split around the screen. Nine encoders in the order Telepathic
        give them, four to the left and five to the right, each with no readout
        of its own — the screen in the middle is the readout, and whichever knob
        you reach for takes it over.
      */}
      <EncoderBank indices={rowIndices.slice(0, SCREEN_AFTER)} />
      <StatScreen sounding={sounding} />
      <EncoderBank indices={rowIndices.slice(SCREEN_AFTER)} />

              {/*
          Perform is the one section with both kinds of control, because it has
          both kinds of parameter: *which* articulation (discrete, printed round
          the dial) and *how fast* (continuous, on the encoder's screen). The
          lamp under the dial is the section's bypass — the mode stays dialled in
          while it is dark.
        */}
      {SHOW.perform && (
        <Unit label="Perform">
          <div className="stackpair">
            <LabelledDial
              label="Perform"
              items={PERFORM_MODES.map((m) => PERFORM_LABEL[m])}
              index={PERFORM_MODES.indexOf(s.performMode)}
              onTurn={(d) => s.cyclePerformMode(d)}
              onSelect={(i) => s.setPerformMode(PERFORM_MODES[i]!)}
            />
            <Lamp on={s.performOn} onToggle={s.togglePerform} label="Perform on" />
          </div>
          <Dial
            label="Speed"
            readout=""
            bare
            position={s.performAmount}
            onTurn={(d) => s.setPerformAmount(s.performAmount + d * 0.05)}
            clickSteps={2}
          />
          <ValueScreen
            value={s.performOn ? amountLabel(s.performMode, s.performAmount) || '—' : 'byp'}
            caption={s.performOn ? 'speed' : 'bypassed'}
          />
        </Unit>
      )}

              {/* FX: the dial says which, the encoder says how much. */}
      {SHOW.fx && (
        <Unit label="FX">
          <LabelledDial
            label="FX"
            items={FX_IDS.map((f) => FX_LABEL[f])}
            index={FX_IDS.indexOf(s.fx)}
            onTurn={(d) => s.cycleFx(d)}
            onSelect={(i) => s.setFx(FX_IDS[i]!)}
          />
          <Dial
            label="Amount"
            readout=""
            bare
            position={fxAmount[s.fx]}
            onTurn={(d) => s.nudgeFxAmount(d)}
            clickSteps={5}
          />
          <ValueScreen value={level(fxAmount[s.fx])} caption={FX_LABEL[s.fx]} />
        </Unit>
      )}

              {/* Key: one encoder through every key the instrument offers, with the
            name on a small screen. A dial with legends could not hold 84 of
            them, which is exactly the line between the two control types. */}
      {SHOW.key && (
        <Unit label="Key">
          <Dial
            label="Key"
            readout=""
            bare
            active={s.keyMode}
            onTurn={(d) => {
              const i = Math.max(0, Math.min(KEYS.length - 1, keyIndex(s.key) + d))
              s.setKey(KEYS[i]!)
            }}
            onClick={() => s.setKey(KEYS[(keyIndex(s.key) + 1) % KEYS.length]!)}
            sensitivity={10}
          />
          <ValueScreen
            value={noteName(s.key.tonic, s.key) + MODE_SUFFIX[s.key.mode]}
            caption={s.keyMode ? 'locked' : 'off'}
          />
          <Switch label="Key mode" on={s.keyMode} onToggle={s.toggleKeyMode} />
        </Unit>
      )}

      {SHOW.voicing && (
        <Unit label="Voicing">
          <Dial
            label="Voicing"
            readout=""
            bare
            active={s.voiceLead}
            onTurn={s.nudgeVoicing}
            sensitivity={8}
          />
          <Switch label="Lead" on={s.voiceLead} onToggle={s.toggleVoiceLead} />
          <ValueScreen
            value={s.voicing > 0 ? `+${s.voicing}` : String(s.voicing)}
            caption={`oct ${s.octave}`}
          />
        </Unit>
      )}

      {SHOW.level && (
        <Unit label="Level">
          <Dial
            label="Volume"
            readout=""
            bare
            position={s.volume}
            onTurn={(d) => s.setVolume(s.volume + d * 0.02)}
            clickSteps={5}
          />
          <Dial
            label="Bass"
            readout=""
            bare
            position={s.bassOn ? s.bassLevel : 0}
            active={s.bassOn}
            onTurn={(d) => s.setBassLevel(s.bassLevel + d * 0.02)}
            clickSteps={5}
          />
          <Switch label="Bass" on={s.bassOn} onToggle={s.toggleBass} />
          <ValueScreen value={level(s.volume)} caption={s.bassOn ? `bass ${level(s.bassLevel)}` : 'bass off'} />
        </Unit>
      )}
    </div>
  )
})

/**
 * The lamp under a dial.
 *
 * A section's bypass, drawn as the indicator a panel would actually have rather
 * than as a labelled button — the dial above it already says what it governs.
 */
function Lamp({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className="lamp"
      data-on={on}
      aria-pressed={on}
      aria-label={label}
      onClick={onToggle}
    />
  )
}

/**
 * An on/off.
 *
 * These used to live on the dial's press, which the click gesture now owns —
 * a click steps the value, so a state toggle needed a control of its own
 * rather than a hidden second meaning on the same knob.
 */
function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="switch" data-on={on} aria-pressed={on} onClick={onToggle}>
      <span className="switch-dot" aria-hidden />
      {label}
    </button>
  )
}

/**
 * One numbered encoder from the row.
 *
 * The number under it is the key that reaches it, so the legend prints both —
 * `Sound (1)`. Focus is shown on the cap rather than as a separate indicator,
 * because the cap is the thing your eye is already on.
 */
/** A run of encoders, kept together so the screen sits between two banks. */
function EncoderBank({ indices }: { indices: number[] }) {
  const shown = indices.filter((i) => ENCODERS[i]!.shown)
  if (shown.length === 0) return null
  return (
    <div className="encoder-bank">
      {shown.map((i) => (
        <EncoderUnit key={ENCODERS[i]!.id} index={i} />
      ))}
    </div>
  )
}

/**
 * The two voicing dials, stacked between the hands.
 *
 * Its own export because it does not belong to the console — it sits in the
 * lower half, between the pads and the keybed, where the hand holding a chord
 * can reach it without leaving the chord.
 */
export const Voicings = memo(function Voicings() {
  const shown = columnIndices.filter((i) => ENCODERS[i]!.shown)
  if (shown.length === 0) return null
  return (
    <div className="voicings" role="group" aria-label="Voicing">
      {shown.map((i) => (
        <EncoderUnit key={ENCODERS[i]!.id} index={i} />
      ))}
    </div>
  )
})

function EncoderUnit({ index }: { index: number }) {
  const encoder = ENCODERS[index]!
  const focused = usePanel((s) => s.dialFocus === index)
  const setDialFocus = usePanel((s) => s.setDialFocus)
  const bassOn = usePanel((s) => s.bassOn)
  const state = usePanel()

  /*
   * Press and hold opens the encoder's menu. The hardware hides a lot behind
   * this gesture and it is the source of the "menu diving" complaint
   * (research/02), so it is worth it being the *only* hidden thing: a hold
   * opens a list, and the list is then visible and turnable like any other.
   *
   * The hold has to cancel the click, or letting go would fire both — on Bass
   * that would open the menu and switch the engine off on the way out.
   */
  const fired = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  const startHold = useCallback(() => {
    setDialFocus(index)
    fired.current = false
    if (!encoder.hold) return
    timer.current = window.setTimeout(() => {
      fired.current = true
      encoder.hold!(usePanel.getState())
    }, 550)
  }, [encoder, index, setDialFocus])

  const endHold = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  useEffect(() => endHold, [endHold])

  // The bass engine can be switched off from its own knob, so the cap says so.
  const off = encoder.id === 'bass' && !bassOn
  const pending = isPlaceholder(encoder)

  return (
    <div
      className="encoder"
      data-focus={focused}
      data-off={off}
      data-pending={pending}
      data-size={encoder.size ?? 'md'}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onPointerLeave={endHold}
    >
      <Dial
        label={encoder.label}
        readout=""
        bare
        cap={encoder.cap}
        onTurn={(d) => turnEncoder(index, usePanel.getState(), d)}
        onClick={
          encoder.press
            ? () => {
                if (fired.current) {
                  fired.current = false
                  return
                }
                encoder.press!(usePanel.getState())
              }
            : undefined
        }
        sensitivity={encoder.sensitivity ?? 6}
      />
      {encoder.lamp && (
        <span
          className="encoder-lamp"
          data-on={encoder.lamp(state)}
          data-kind={encoder.lampKind ?? 'power'}
          role="img"
          aria-label={
            encoder.lampKind === 'lock'
              ? `${encoder.label} ${encoder.lamp(state) ? 'locked' : 'unlocked'}`
              : `${encoder.label} ${encoder.lamp(state) ? 'on' : 'off'}`
          }
        />
      )}
      <span className="encoder-legend">{encoderLegend(index)}</span>
    </div>
  )
}

/** A control and its screen, kept together and named once. */
function Unit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="unit">
      <h2 className="unit-title">{label}</h2>
      <div className="unit-body">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

/**
 * The display.
 *
 * At rest it shows nothing — a panel that is always reporting is a panel you
 * stop reading. Selecting an encoder opens *its* list, which is the only thing
 * the screen is for while your hand is on a knob.
 */
function StatScreen({ sounding }: { sounding: Sounding | undefined }) {
  const s = usePanel()
  const view = screenRows(s.screenList, s)
  const glance = s.glance
  const clearGlance = s.clearGlance

  /*
   * The glance is the only thing on this screen that expires. Menus and lists
   * are sticky — they are somewhere you are, and they stay until you leave
   * (research/13 §B.6). A value readout is feedback on a turn, so it gets out
   * of the way on its own.
   *
   * Keyed on the stamp rather than the value, so turning a dial back to a
   * number it was already showing still re-arms the timer.
   */
  useEffect(() => {
    if (!glance) return
    const timer = window.setTimeout(clearGlance, GLANCE_MS)
    return () => window.clearTimeout(timer)
  }, [glance?.stamp, glance, clearGlance])

  /*
   * **Nothing else on this screen expires.** Lists and menus alike stay until
   * you leave them, and `Esc` is how you leave.
   *
   * Browse lists used to time out after 2.6 seconds, on the reading of
   * research/13 §B.6 that a list of values is feedback rather than a place.
   * That reading does not survive contact with a long list: the beat list is
   * twenty-six rows, so it closed while you were still reading it, and being
   * interrupted by the panel is worse than having to press a key to leave. It
   * also meant the screen could change without anyone touching anything, which
   * is the one thing a panel should never do.
   *
   * The glance above is the exception and stays timed, because it genuinely is
   * feedback: a number thrown up by a turn, over whatever you were looking at,
   * with nothing to leave.
   */

  /*
   * The quick key select prompt outranks everything, because it is the one
   * screen that is *waiting on you* — the keybed is in a different mode until
   * it is answered, and hiding that behind a glance would be a trap (§9.2).
   */
  if (s.keySelect) {
    return (
      <div className="screen screen-stat" role="status" aria-label="Select key">
        <ScreenPrompt />
      </div>
    )
  }

  if (glance) {
    return (
      <div className="screen screen-stat" role="status" aria-label={`${glance.label} ${glance.value}`}>
        <ScreenValue
          value={glance.value}
          label={glance.label}
          level={glance.level}
          secondary={glance.secondary}
        />
      </div>
    )
  }

  /*
   * Loop Mode is a mode, not a view — "push or turn the Loop Dial to access the
   * Loop Mode Waiting Room" (§12.1) — so it outranks whichever encoder list
   * happens to be open, and it is the only screen that draws the border. The
   * Options, FX and Perform menus are edge-to-edge lists with no ring
   * (research/13 §C.4, scope).
   */
  if (s.loopScreen !== null) {
    return (
      <div className="screen screen-stat" data-ring="true" role="status" aria-label="Loop">
        {/*
          In the Waiting Room the border follows the *cursor*, not the armed
          length: "selecting a length immediately redraws the border with that
          many segments" — 4 Bars gives four segments on PDF p18, 16 Bars gives
          sixteen on p19. It is how you see the length before you record it.
        */}
        <LoopRing
          bars={s.loopScreen === 'sync' ? (LOOP_BARS[s.loopCursor] ?? null) : s.loopBars}
          length={s.loopLength}
          state={s.loopState}
        />
        {/*
          Three panels, not two.

          Counting in — the bar's countdown, alone and large.

          Capturing — `Rec`, which §12.3 says the display shows, *and* the row
          you press to end it where one exists. Showing `Rec` by itself was the
          whole of it before, which meant that during an overdub the screen
          named no way out and there wasn't one.

          Otherwise — the menu, whichever of the three it is.
        */}
        <div className="loop-panel" data-capturing={isCapturing(s)}>
          {s.loopState === 'counting' ? (
            <span className="loop-rec">{s.loopCount || BEATS_IN}</span>
          ) : isCapturing(s) ? (
            <>
              <span className="loop-rec loop-rec-small">Rec</span>
              {isStoppable(s) && <ScreenList rows={loopRows(s)} cursor={0} visible={1} />}
            </>
          ) : (
            <ScreenList rows={loopRows(s)} cursor={s.loopCursor} visible={3} />
          )}
        </div>
      </div>
    )
  }

  // Nothing else is asking for the screen, so it goes back to playing. Menus do
  // *not* time out into this — they are sticky and left by choosing `Exit`
  // (research/13 §B.6). Only the glance expires.
  if (!view) {
    return (
      <div className="screen screen-stat" role="status" aria-label="Display">
        <ScreenPlaying sounding={sounding} />
      </div>
    )
  }

  return (
    <div className="screen screen-stat" role="status" aria-label={screenLabel(s.screenList!, s)}>
      <ScreenList rows={view.rows} cursor={view.cursor} />
    </div>
  )
}

/**
 * The looping border — the signature graphic (research/13 §C.4, measured on
 * PDF p18a, p18b and p19).
 *
 * Every number is off the framebuffer: a 17px ring around the whole 128px
 * display, outer corners r≈11, an inner black panel of 94×94 at (17,17) with
 * r≈6, and 3px gaps cutting the full thickness. **The segments are bars** —
 * four gaps for a 4-bar loop, sixteen for a 16-bar one — so the border tells
 * you the length before you have played a note.
 *
 * The ring is also the progress indicator. Measured on p18b: solid white begins
 * immediately clockwise of the top-centre gap and runs to 30.9% of the
 * perimeter, so it **starts at twelve o'clock and fills clockwise, dither for
 * what is left and solid for what has elapsed**.
 *
 * The fill is animated by CSS off the pass length rather than driven through
 * React — a ring redrawn sixty times a second through the store would put a
 * render between every keypress and its note. It is `linear` and must not ease:
 * this is a clock.
 */
function LoopRing({ bars, length, state }: { bars: number | null; length: number; state: string }) {
  // Free loops have no bar count to segment by, so they get one unbroken ring.
  const segments = bars ?? 1
  const running = state === 'playing' || state === 'recording' || state === 'overdubbing'

  return (
    <>
      <svg className="loop-ring" viewBox="0 0 128 128" aria-hidden>
        <defs>
          {/* 1px 50% checkerboard, the display's only intermediate tone. */}
          <pattern id="ring-dither" width="2" height="2" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="#fff" />
            <rect x="1" y="1" width="1" height="1" fill="#fff" />
          </pattern>
        </defs>
        {/* What is left to play. */}
        <path className="ring-path" d={RING} stroke="url(#ring-dither)" />
      </svg>

      {/*
        What has elapsed — a conic sweep rather than a dashed stroke.

        A conic gradient starts at twelve o'clock and runs clockwise by
        definition, which is exactly what §C.4 measured and is not something
        that has to be discovered. The dashed version needed an empirical
        quarter-turn correction to start in the right place, and that
        correction then clipped the final quarter: shifting a dash window along
        an open path runs it off the end.

        It sweeps by *angle* where the manual measured *perimeter*. On a square
        those differ, but at the one point p18b pins down the two readings are
        30.9% and 32% — inside the width of the measurement itself.
      */}
      <div
        className="ring-sweep"
        data-running={running}
        data-paused={state === 'paused'}
        style={{ ['--pass' as string]: `${length || 1}s` }}
        aria-hidden
      />

      <svg className="loop-ring" viewBox="0 0 128 128" aria-hidden>

      {/*
        The bar gaps, cut through both layers. One lands on twelve o'clock,
        which is what PDF p18a shows.

        Drawn as radial ticks rather than as gaps in a dash pattern. A dash gap
        is measured along the *centreline*, and at a corner the outer edge has
        four times the centreline's radius — so a 3px gap ballooned into a
        13px wedge at every corner, which is exactly where the gaps land once
        you get past four bars.
      */}
      {ringTicks(segments).map((t, i) => (
        <rect
          key={i}
          x={-GAP_PX / 2}
          y={-8.5}
          width={GAP_PX}
          height={17}
          fill="#000"
          transform={`translate(${t.x} ${t.y}) rotate(${t.angle})`}
        />
      ))}

        {/* The panel the menu is drawn on. */}
        <rect x="17" y="17" width="94" height="94" rx="6" fill="#000" />
      </svg>
    </>
  )
}

/**
 * The ring's centreline, starting at top-centre and running clockwise.
 *
 * Drawn by hand rather than as a `<rect>` because a rect's path begins after
 * the top-left corner, and the fill has to begin at twelve o'clock. Inset 8.5
 * so a 17px stroke lands its outer edge on 0 and its inner edge on 17.
 */
const RING =
  'M 64 8.5 H 117 A 2.5 2.5 0 0 1 119.5 11 V 117 A 2.5 2.5 0 0 1 117 119.5 ' +
  'H 11 A 2.5 2.5 0 0 1 8.5 117 V 11 A 2.5 2.5 0 0 1 11 8.5 H 64'

/** 3px of black, cutting the full 17px thickness — measured, §C.4. */
const GAP_PX = 3

/**
 * Where each bar boundary sits on the ring, and which way it faces.
 *
 * Measured off the path itself rather than worked out by hand: the ring is a
 * rounded rectangle, so the mapping from "a fraction of the way round" to a
 * point and a tangent is not something worth deriving twice. The path is
 * static, so this is computed once per segment count and cached.
 *
 * The angle comes from a pair of neighbouring points rather than from a
 * formula, which keeps it right through the corner arcs where the direction is
 * turning fastest — and the corners are precisely where the gaps land at eight
 * and sixteen bars.
 */
const tickCache = new Map<number, { x: number; y: number; angle: number }[]>()

function ringTicks(segments: number): { x: number; y: number; angle: number }[] {
  const cached = tickCache.get(segments)
  if (cached) return cached

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', RING)
  const total = path.getTotalLength()

  const ticks = Array.from({ length: segments }, (_, i) => {
    const at = (i / segments) * total
    const here = path.getPointAtLength(at)
    const ahead = path.getPointAtLength((at + 1) % total)
    const angle = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI
    /*
     * The tick is 3 wide and 17 tall, and it turns to face *along* the ring —
     * so its 3px dimension lies across the direction of travel and its 17px
     * dimension cuts the full thickness, which is what §C.4 measured.
     *
     * A quarter turn too far and it lies flat along the ring instead: a 17px
     * smear down the middle of the band rather than a slot through it. Which
     * is what the first version did.
     */
    return { x: here.x, y: here.y, angle }
  })

  tickCache.set(segments, ticks)
  return ticks
}

/**
 * A quarter turn, because the browser does not start dashing where the path
 * starts.
 *
 * Measured rather than reasoned: with a 6% dash and no offset, the mark lands
 * on the **left edge midpoint** — three quarters of the way round — even though
 * `getPointAtLength(0)` reports the path's start as `64,9`, top-centre, and
 * `getPointAtLength(0.25)` reports `120,64`, so the parameterisation itself is
 * clockwise from twelve as intended. The dash origin and the path origin simply
 * disagree by 25%.
 *
 * Shifting by a quarter turn puts the fill back at twelve o'clock, which is
 * where §C.4 measured it starting. Worth re-checking if the ring ever looks
 * rotated in a different browser — this is a compensation for observed
 * behaviour, not for something the spec asked for.
 */
const DASH_ORIGIN = -25

/** How long a value readout stays up after the last turn. research/13 §B.6. */
const GLANCE_MS = 1200

/** Beats in the count-in bar. */
const BEATS_IN = 4

/**
 * How long the chord stays up after you let go.
 *
 * v3.90: "chord display now lingers briefly after chord release". A number is
 * not given, so this is ours — long enough that a chord change does not blink
 * through empty, short enough that the screen is not lying about what is
 * sounding.
 */
const LINGER_MS = 1400

/** Hold on to the last truthy value for a moment after it goes away. */
function useLinger<T>(value: T | undefined, ms: number): T | undefined {
  const [held, setHeld] = useState(value)
  useEffect(() => {
    if (value !== undefined) {
      setHeld(value)
      return
    }
    const timer = window.setTimeout(() => setHeld(undefined), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return value ?? held
}

/**
 * The playing screen — where the display sits when nothing else is happening.
 *
 * Measured on PDF p15b (research/13 §C.2): a status rail flush to the top,
 * `y = 0…10`, **white on black rather than an inverted bar**, with the key name
 * in the top-left corner and the transposition in the top-right. §9.5 confirms
 * both placements. The formats are the manual's own — `C# Major`, the tonic
 * plus the full mode word, not `Key: C#`; and `Trans +1`, not `+01`.
 *
 * The rest of the panel is the view. The hardware has five (Options → System →
 * View): chord notation, a notes list, a reactive waveform, a keyboard, and
 * `Geek Out` which shows three at once. This is the first of them.
 */
function ScreenPlaying({ sounding }: { sounding: Sounding | undefined }) {
  const key = usePanel((s) => s.key)
  const keyMode = usePanel((s) => s.keyMode)
  const transpose = usePanel((s) => s.transpose)
  const view = usePanel((s) => s.optionValue.view ?? 1)
  const chord = useLinger(sounding, LINGER_MS)

  return (
    <div className="scr-play">
      {/*
        The status rail, measured on PDF p15b: y=0..10, flush to the top, white
        on black and *not* an inverted bar. Everything below it — y=11..127 — is
        "the view", and which view is `Options -> View` (SS14.2).
      */}
      <div className="scr-rail">
        <span>{keyMode ? `${noteName(key.tonic, key)} ${MODE_LABEL[key.mode]}` : ''}</span>
        {/* MANUAL SILENT on whether a zero shows. Left off: a rail that always
            reads `Trans +0` is a rail you stop reading. */}
        <span>{transpose === 0 ? '' : `Trans ${transpose > 0 ? '+' : ''}${transpose}`}</span>
      </div>
      <ScreenView mode={view} chord={chord} keySig={keyMode ? key : undefined} />
    </div>
  )
}

/**
 * The six View modes (SS14.2), filling the display below the status rail.
 *
 * > `React` "displays an oscilloscope"; `Chord` "only the current chord being
 * > played in large text"; `Keyboard` "a visual keyboard with highlighted notes
 * > being played"; `Chord & Keyboard` "both"; `Notes` "the chord name and the
 * > individual notes… in written format"; `Geek Out` "maximum information,
 * > including the keyboard, chord name, and notes."
 *
 * They compose from three pieces rather than six layouts, because that is what
 * the manual's own descriptions do — `Geek Out` is named as the union of the
 * other three, so building it as one is how the descriptions stay true.
 */
function ScreenView({
  mode,
  chord,
  keySig,
}: {
  mode: number
  chord: Sounding | undefined
  keySig: Key | undefined
}) {
  const pieces = viewPieces(mode)
  if (pieces.scope) return <ScreenScope />

  // Geek Out fits three things into 117px, so the chord symbol gives way first.
  const dense = pieces.chord && pieces.keyboard && pieces.notes

  return (
    <div className="scr-view" data-dense={dense}>
      {pieces.chord && (
        <div className="scr-chord">
          {chord && (
            <span>
              {chord.root}
              {chord.base}
              {chord.sup && <sup>{chord.sup}</sup>}
            </span>
          )}
        </div>
      )}
      {pieces.keyboard && <ScreenKeys notes={chord?.notes} keySig={keySig} />}
      {pieces.notes && (
        <div className="scr-notes">
          {chord?.notes.map((n, i) => (
            <span key={i}>{noteWithOctave(n, keySig)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One octave with the sounding notes knocked out.
 *
 * The same glyph the quick-key-select prompt draws, and for the same reason a
 * black key sits on the *boundary* between two white keys rather than taking
 * its own share of twelve — see `ScreenPrompt`.
 */
const BLACK_AFTER = [0, 1, 3, 4, 5]
const WHITE_PC = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PC: Record<number, number> = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 }

function ScreenKeys({ notes, keySig }: { notes: readonly number[] | undefined; keySig: Key | undefined }) {
  void keySig
  // Pitch classes, so a chord voiced across two octaves lights both its keys
  // once — the keyboard is one octave and shows *which notes*, not where.
  const lit = new Set((notes ?? []).map((n) => ((n % 12) + 12) % 12))
  return (
    <div className="scr-keys" aria-hidden>
      {WHITE_PC.map((pc, i) => (
        <span key={i} className="scr-key" data-lit={lit.has(pc)} />
      ))}
      {BLACK_AFTER.map((after) => (
        <span
          key={after}
          className="scr-key-black"
          data-lit={lit.has(BLACK_PC[after]!)}
          style={{ ['--after' as string]: String(after) }}
        />
      ))}
    </div>
  )
}

/**
 * `React` — "an oscilloscope for a real-time visual representation of the
 * waveform" (SS14.2).
 *
 * Drawn on a canvas from a rAF loop that lives entirely outside React. A
 * waveform is sixty new frames a second and pushing that through the store
 * would re-render the whole panel on every one of them — the same reason the
 * looping border is a CSS animation rather than rendered state.
 *
 * The analyser is only attached while this view is showing, so choosing any
 * other mode costs nothing at all.
 */
function ScreenScope() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    const scope = getSynth().scope()
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const data = scope?.()
      const { width, height } = el
      ctx.clearRect(0, 0, width, height)
      if (!data) return
      ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * width
        // Clamped, because a loud patch through the drive can exceed +/-1 and a
        // trace that leaves the box reads as a broken screen rather than a hot
        // signal.
        const y = height / 2 - Math.max(-1, Math.min(1, data[i]!)) * (height / 2 - 1)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Backing store at the panel's own resolution: 128 wide, 117 tall below the
  // rail. Scaled up by CSS, so the trace keeps the display's chunky pixels.
  return <canvas ref={canvas} className="scr-scope" width={128} height={117} aria-hidden />
}

/**
 * The value readout, as the hardware draws it (research/13 §C.3, measured).
 *
 * A giant number filling 84% of the panel with its label along the bottom. Every
 * number below is off the framebuffer illustrations rather than chosen: the
 * value field is 108 of the 128 pixels, the label sits at y 114–124 with the
 * same 11px cap height the list rows use, and the two are separated by a 2px
 * gap and nothing else.
 *
 * `level` fills the numeral field from the bottom and knocks the digits out
 * where it crosses them. `difference` is the honest way to do a 1-bit XOR:
 * white over white goes black, white over black stays white — which is exactly
 * what the Bass Volume illustration shows.
 */
/**
 * The quick key select prompt (§9.2, research/13 §M4).
 *
 * Not a list — "long press the Key Dial until **select key** and keyboard
 * appears on the display", and you answer it by *playing* the root rather than
 * by choosing a row. The keyboard graphic is the instruction: it says where to
 * look next.
 *
 * Drawn as one octave, black keys in their real positions, at the panel's own
 * pixel. No octave number on it — v3.90 removed one that used to be there, and
 * it was right to: the prompt wants a pitch class, not a note.
 */
function ScreenPrompt() {
  /*
   * A black key sits on the *boundary between two white keys*, not at its own
   * share of twelve — which is why they group two-then-three, with gaps at
   * E–F and B–C. Positioning them by pitch class over twelve spreads them
   * evenly and stops looking like a keyboard at all.
   */
  const BLACK = [0, 1, 3, 4, 5] // the white key each one sits after
  return (
    <div className="scr-prompt">
      <span className="scr-prompt-text">select key</span>
      <div className="scr-keys" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="scr-key" />
        ))}
        {BLACK.map((after) => (
          <span
            key={after}
            className="scr-key-black"
            style={{ ['--after' as string]: String(after) }}
          />
        ))}
      </div>
    </div>
  )
}

function ScreenValue({
  value,
  label,
  level,
  secondary,
}: {
  value: string
  label: string
  level?: number | undefined
  secondary?: boolean | undefined
}) {
  /*
   * The height is measured; the width has to be earned.
   *
   * A 108px cap height needs a 132px type size, and at this face's 0.60em digit
   * advance three glyphs then want 238px inside a 128px panel. The hardware's
   * numerals are far narrower than anything we have — so keep the measured
   * height and condense horizontally to fit, which is what a display face does
   * in the first place. One glyph is left alone; only longer values squeeze.
   */
  const ADVANCE = 0.6 // em per glyph, measured in the browser for this face
  const scale = Math.min(1, 126 / (ADVANCE * 132 * value.length))

  return (
    <div className="scr-value">
      <div className="scr-value-field">
        {level !== undefined && (
          <span
            className="scr-value-fill"
            style={{ ['--level' as string]: String(Math.max(0, Math.min(1, level))) }}
            aria-hidden
          />
        )}
        <span className="scr-value-num" style={{ ['--scale' as string]: String(scale) }}>
          {value}
        </span>
      </div>
      <span className="scr-value-label" data-secondary={secondary === true}>
        {label}
      </span>
    </div>
  )
}

/** Three lines of a list: what you left, what you are on, what is next. */
function ListScreen({
  items,
  index,
}: {
  items: { number: string; name: string }[]
  index: number
}) {
  // Windowed around the selection and clamped, so the list never wraps round —
  // running off the end should feel like an end.
  const start = Math.max(0, Math.min(items.length - 3, index - 1))
  const window = items.slice(start, start + 3)

  return (
    <div className="screen screen-list" role="status">
      {window.map((item, i) => (
        <p key={item.number} data-on={start + i === index}>
          <span className="list-number">{item.number}</span>
          <span className="list-name">{item.name}</span>
        </p>
      ))}
    </div>
  )
}

/** One value, large, with what it belongs to underneath. */
function ValueScreen({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="screen screen-value" role="status">
      <span className="value-main">{value}</span>
      <span className="value-caption">{caption}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The labelled dial
// ---------------------------------------------------------------------------

/**
 * A dial whose positions are printed around it.
 *
 * The legends sit on a 270° arc with the gap at the bottom, which is where
 * every amp knob puts it — the hand comes from below, so the bottom is the one
 * place you cannot read anyway.
 */
function LabelledDial({
  label,
  items,
  index,
  onTurn,
  onSelect,
}: {
  label: string
  items: string[]
  index: number
  onTurn: (delta: number) => void
  /** Where a click should land — supplied because wrapping needs the count. */
  onSelect: (index: number) => void
}) {
  const span = 270
  const step = items.length > 1 ? span / (items.length - 1) : 0

  return (
    <div className="labelled">
      <div className="labelled-ring" aria-hidden>
        {items.map((item, i) => {
          const angle = -135 + i * step
          return (
            <span
              key={item}
              className="labelled-legend"
              data-on={i === index}
              style={{
                // Pushed out along its own angle, then un-rotated so the text
                // stays horizontal — a legend you have to tilt your head for is
                // a legend nobody reads.
                transform: `rotate(${angle}deg) translate(0, -2.35rem) rotate(${-angle}deg)`,
              }}
            >
              {item}
            </span>
          )
        })}
      </div>

      <Dial
        label={label}
        readout=""
        bare
        position={items.length > 1 ? index / (items.length - 1) : 0}
        onTurn={onTurn}
        onClick={() => onSelect((index + 1) % items.length)}
        sensitivity={12}
      />
    </div>
  )
}
