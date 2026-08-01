/**
 * The progression, as a screen page.
 *
 * Each chip renders its chord live through the current key and spelling, so
 * transposing the instrument re-labels the whole progression rather than
 * leaving stale names behind.
 */

import { memo } from 'react'

import { resolveChord } from '../core/resolve.js'
import type { ProgressionStep } from '../core/progression.js'
import type { ProgressionSnapshot } from '../engine/ProgressionPlayer.js'
import { chromaticPolicy, usePanel } from '../state/panel.js'

interface Props {
  view: ProgressionSnapshot
  onToggle: () => void
  onExport: () => void
}

export const ProgressionStrip = memo(function ProgressionStrip({
  view,
  onToggle,
  onExport,
}: Props) {
  const s = usePanel()
  const steps = s.progression.steps

  const label = (step: ProgressionStep): string =>
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
      voicing: 0,
    })?.name ?? '—'

  return (
    <>
      <div className="pg-actions">
        <button data-on={view.playing} onClick={onToggle} disabled={steps.length === 0}>
          {view.playing ? '■ Stop' : '▶ Play'}
        </button>
        <button data-on={s.progArmed} onClick={() => s.toggleProgArmed()}>
          {s.progArmed ? '● Writing' : '● Write'}
        </button>
        <button onClick={onExport} disabled={steps.length === 0}>
          Export
        </button>
        <button onClick={() => s.clearProgression()} disabled={steps.length === 0}>
          Clear
        </button>
      </div>

      <div className="prog-steps">
        {steps.length === 0 && (
          <span className="prog-empty">Press Write, then play chords to lay them down</span>
        )}

        {steps.map((step, i) => (
          <div
            key={i}
            className="prog-chip"
            data-selected={s.progStep === i}
            data-playing={view.playing && view.current === i}
          >
            <button className="prog-chip-main" onClick={() => s.setProgStep(i)}>
              <span className="prog-chord">{label(step)}</span>
              <span className="prog-bars">{step.bars === 1 ? '1 bar' : `${step.bars} bars`}</span>
            </button>
            <div className="prog-chip-tools">
              <button onClick={() => s.nudgeStepBars(i, -1)} aria-label="Shorter">
                −
              </button>
              <button onClick={() => s.nudgeStepBars(i, 1)} aria-label="Longer">
                +
              </button>
              <button onClick={() => s.removeProgStep(i)} aria-label="Remove">
                ✗
              </button>
            </div>
          </div>
        ))}

        {s.progArmed && s.progStep >= steps.length && <div className="prog-caret">▏</div>}
      </div>
    </>
  )
})
