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

import { memo } from 'react'

import { amountLabel, PERFORM_LABEL, PERFORM_MODES } from '../core/performance.js'
import { barsLabel } from '../core/looper.js'
import { noteName } from '../core/spelling.js'
import { keyIndex, KEYS, MODE_LABEL, MODE_SUFFIX } from '../core/types.js'
import { soundNumber, SOUNDS } from '../engine/sounds.js'
import { FX_IDS, FX_LABEL, usePanel } from '../state/panel.js'
import type { FxId } from '../state/panel.js'
import { Dial } from './Dial.js'
import { ENCODERS, encoderLegend } from './encoders.js'
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
        Sound: the encoder alone, with no screen of its own. The summary already
        reports which sound is loaded, so a second readout beside the knob would
        say the same thing twice.
      */}
      {SHOW.sound && <EncoderUnit index={0} />}

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

      <StatScreen />


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
function EncoderUnit({ index }: { index: number }) {
  const encoder = ENCODERS[index]!
  const focused = usePanel((s) => s.dialFocus === index)
  const setDialFocus = usePanel((s) => s.setDialFocus)
  const state = usePanel()

  return (
    <div className="encoder" data-focus={focused} onPointerDown={() => setDialFocus(index)}>
      <Dial
        label={encoder.label}
        readout=""
        bare
        cap="amber"
        onTurn={(d) => encoder.turn(state, d)}
        onClick={encoder.press ? () => encoder.press!(state) : undefined}
        sensitivity={encoder.sensitivity ?? 6}
      />
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
  const open = usePanel((st) => st.screenList)
  const soundIndex = usePanel((st) => st.soundIndex)

  if (open === null) {
    return <div className="screen screen-stat" role="status" aria-label="Display" />
  }

  // Only Sound has a list so far; the rest arrive as their encoders do.
  return (
    <div className="screen screen-stat" role="status" aria-label={ENCODERS[open]?.label}>
      <ScreenList
        rows={SOUNDS.map((sound, i) => ({ label: `${soundNumber(i)} ${sound.name}` }))}
        cursor={soundIndex}
      />
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
