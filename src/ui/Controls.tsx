/**
 * The controls.
 *
 * Grouped by what they change rather than by widget type: harmony, then
 * articulation, then tone. Each control says what it does in the units it
 * actually has — the arpeggiator's amount reads `1/16`, not `63%`, because the
 * parameter is not continuous and does not mean the same thing twice.
 */

import { memo } from 'react'

import { amountLabel, PERFORM_LABEL, PERFORM_MODES } from '../core/performance.js'
import type { PerformMode } from '../core/performance.js'
import { noteName } from '../core/spelling.js'
import { MODE_LABEL, MODES } from '../core/types.js'
import type { Mode } from '../core/types.js'
import { VOICE_LABEL, VOICES } from '../engine/synth.js'
import type { Voice } from '../engine/synth.js'
import { usePanel } from '../state/panel.js'

export const Controls = memo(function Controls() {
  // Subscribes to the whole store on purpose: this panel reads most of it, and
  // it is never on the note path — the keyboard talks to the engine directly.
  const s = usePanel()

  return (
    <section className="controls" aria-label="Controls">
      <Group title="Harmony">
        <Toggle label="Key mode" on={s.keyMode} onChange={s.toggleKeyMode} />

        <Field label="Key">
          <div className="pair">
            <Stepper
              value={noteName(s.key.tonic, s.key)}
              onStep={(d) => s.nudgeTonic(d)}
              title="Tonic"
            />
            <Select<Mode>
              value={s.key.mode}
              options={MODES}
              label={(m) => MODE_LABEL[m]}
              onChange={(mode) => s.setKey({ ...s.key, mode })}
              title="Mode"
            />
          </div>
        </Field>

        <Field label="Off-key roots">
          <div className="segmented" role="group">
            <button
              type="button"
              data-on={s.chromatic === 'colour'}
              onClick={() => s.setChromatic('colour')}
              title="Chromatic roots borrow a major triad"
            >
              Borrow
            </button>
            <button
              type="button"
              data-on={s.chromatic === 'snap'}
              onClick={() => s.setChromatic('snap')}
              title="Chromatic roots round to the nearest degree"
            >
              Snap
            </button>
            <button
              type="button"
              data-on={s.rootMode === 'scale'}
              onClick={() => s.setRootMode(s.rootMode === 'scale' ? 'chromatic' : 'scale')}
              title="Collapse the keybed to the seven notes of the mode"
            >
              Scale
            </button>
          </div>
        </Field>

        <Field label="Voicing">
          <Stepper
            value={s.voicing > 0 ? `+${s.voicing}` : String(s.voicing)}
            onStep={(d) => s.nudgeVoicing(d)}
            title="Slide the chord along the keyboard"
          />
        </Field>

        <Field label="Octave">
          <Stepper value={String(s.octave)} onStep={(d) => s.nudgeOctave(d)} />
        </Field>

        <Toggle label="Voice leading" on={s.voiceLead} onChange={s.toggleVoiceLead} />
      </Group>

      <Group title="Articulation">
        <Field label="Mode">
          <Select<PerformMode>
            value={s.performMode}
            options={PERFORM_MODES}
            label={(m) => PERFORM_LABEL[m]}
            onChange={s.setPerformMode}
          />
        </Field>

        {s.performMode !== 'off' && (
          <Field label="Amount" value={amountLabel(s.performMode, s.performAmount)}>
            <Slider value={s.performAmount} onChange={s.setPerformAmount} />
          </Field>
        )}

        <Field label="Tempo" value={`${s.bpm} bpm`}>
          <Slider
            value={(s.bpm - 40) / 180}
            onChange={(n) => s.setBpm(40 + n * 180)}
          />
        </Field>

        <Toggle label="Latch" on={s.latched} onChange={s.toggleLatch} />
      </Group>

      <Group title="Tone">
        <Field label="Voice">
          <Select<Voice>
            value={s.voice}
            options={VOICES}
            label={(v) => VOICE_LABEL[v]}
            onChange={s.setVoice}
          />
        </Field>

        <Field label="Colour" value={pct(s.cutoff)}>
          <Slider value={s.cutoff} onChange={s.setCutoff} />
        </Field>
        <Field label="Reverb" value={pct(s.reverb)}>
          <Slider value={s.reverb} onChange={s.setReverb} />
        </Field>
        <Field label="Delay" value={pct(s.delay)}>
          <Slider value={s.delay} onChange={s.setDelay} />
        </Field>
        <Field label="Volume" value={pct(s.volume)}>
          <Slider value={s.volume} onChange={s.setVolume} />
        </Field>

        <Toggle label="Bass" on={s.bassOn} onChange={s.toggleBass} />
      </Group>
    </section>
  )
})

const pct = (n: number) => `${Math.round(n * 100)}`

// --- primitives ------------------------------------------------------------

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="group">
      <h2 className="group-title">{title}</h2>
      <div className="group-body">{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{label}</span>
        {value && <span className="field-value">{value}</span>}
      </div>
      {children}
    </div>
  )
}

function Slider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      className="slider"
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function Stepper({
  value,
  onStep,
  title,
}: {
  value: string
  onStep: (delta: number) => void
  title?: string
}) {
  return (
    <div className="stepper" title={title}>
      <button type="button" onClick={() => onStep(-1)} aria-label="Down">
        –
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" onClick={() => onStep(1)} aria-label="Up">
        +
      </button>
    </div>
  )
}

function Select<T extends string>({
  value,
  options,
  label,
  onChange,
  title,
}: {
  value: T
  options: readonly T[]
  label: (v: T) => string
  onChange: (v: T) => void
  title?: string
}) {
  return (
    <select
      className="select"
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: () => void
}) {
  return (
    <button type="button" className="toggle" data-on={on} aria-pressed={on} onClick={onChange}>
      <span className="toggle-dot" aria-hidden />
      {label}
    </button>
  )
}
