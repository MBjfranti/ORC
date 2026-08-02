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

import { memo, useCallback, useEffect, useRef } from 'react'

import { amountLabel, PERFORM_LABEL, PERFORM_MODES } from '../core/performance.js'
import { barsLabel } from '../core/looper.js'
import { noteName } from '../core/spelling.js'
import { keyIndex, KEYS, MODE_LABEL, MODE_SUFFIX } from '../core/types.js'
import { soundNumber, SOUNDS } from '../engine/sounds.js'
import { FX_IDS, FX_LABEL, usePanel } from '../state/panel.js'
import type { FxId } from '../state/panel.js'
import { Dial } from './Dial.js'
import {
  BASS_MODE_LIST,
  columnIndices,
  ENCODERS,
  encoderLegend,
  isPlaceholder,
  rowIndices,
  SCREEN_AFTER,
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

export const Console = memo(function Console() {
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
      <StatScreen />
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
function StatScreen() {
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

  if (!view) {
    return <div className="screen screen-stat" role="status" aria-label="Display" />
  }

  const label =
    s.screenList === BASS_MODE_LIST ? 'Bass plays' : (ENCODERS[s.screenList!]?.label ?? 'Display')

  return (
    <div className="screen screen-stat" role="status" aria-label={label}>
      <ScreenList rows={view.rows} cursor={view.cursor} />
    </div>
  )
}

/** How long a value readout stays up after the last turn. research/13 §B.6. */
const GLANCE_MS = 1200

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
