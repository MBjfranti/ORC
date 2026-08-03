/**
 * The looper.
 *
 * One button that does the next sensible thing — record, then overdub, then
 * stop — because that is how a looper is actually played: with one hand, while
 * the other is busy. The secondary actions only appear once there is something
 * to act on.
 *
 * The ring is the loop's position, drawn as an arc rather than a bar because a
 * loop is a cycle and a bar implies an end.
 */

import { memo } from 'react'

import { barsLabel, GRIDS, LOOP_BARS } from '../core/looper.js'
import type { Grid } from '../core/looper.js'
import type { LoopView } from '../engine/looper.js'
import { usePanel } from '../state/panel.js'

interface Props {
  view: LoopView
  onAdvance: () => void
  onUndo: () => void
  onClear: () => void
  onPause: () => void
}

/** What the main button does next, given where the loop is. */
const ACTION: Record<LoopView['state'], string> = {
  empty: 'Record',
  // Free mode, waiting for you to play — §12.3 starts the clock on the first
  // note, so until then the button is offering to give up rather than to stop.
  armed: 'Play to start',
  counting: 'Count in',
  recording: 'Recording',
  playing: 'Overdub',
  overdubbing: 'Stop',
  paused: 'Resume',
}

export const Loop = memo(function Loop({ view, onAdvance, onUndo, onClear, onPause }: Props) {
  const loopBars = usePanel((s) => s.loopBars)
  const cycleLoopBars = usePanel((s) => s.cycleLoopBars)
  const grid = usePanel((s) => s.loopGrid)
  const setGrid = usePanel((s) => s.setLoopGrid)

  const live = view.state !== 'empty'
  const armed = view.state === 'recording' || view.state === 'overdubbing'

  return (
    <section className="loop" aria-label="Looper">
      <button
        type="button"
        className="loop-go"
        data-armed={armed}
        data-live={live}
        onClick={onAdvance}
      >
        <Ring position={view.position} armed={armed} live={live} />
        <span className="loop-go-label">{ACTION[view.state]}</span>
      </button>

      <div className="loop-side">
        {!live ? (
          <>
            <div className="field-head">
              <span className="field-label">Length</span>
              <span className="field-value">{barsLabel(loopBars)}</span>
            </div>
            <div className="stepper">
              <button type="button" onClick={() => cycleLoopBars(-1)} aria-label="Shorter">
                –
              </button>
              <span className="stepper-value">{barsLabel(loopBars)}</span>
              <button type="button" onClick={() => cycleLoopBars(1)} aria-label="Longer">
                +
              </button>
            </div>

            <div className="field-head">
              <span className="field-label">Quantize</span>
            </div>
            <select
              className="select"
              value={grid}
              onChange={(e) => setGrid(e.target.value as Grid)}
            >
              {GRIDS.map((g) => (
                <option key={g} value={g}>
                  {g === 'off' ? 'None' : g}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p className="loop-meta">
              {view.layers} {view.layers === 1 ? 'layer' : 'layers'} · {barsLabel(view.bars)}
            </p>
            <div className="loop-actions">
              <button type="button" onClick={onPause}>
                {view.state === 'paused' ? 'Play' : 'Pause'}
              </button>
              {/* Undo becomes Clear once there is only the base layer left —
                  the same button, saying what it will actually do. */}
              <button type="button" onClick={view.layers > 1 ? onUndo : onClear}>
                {view.layers > 1 ? 'Undo' : 'Clear'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
})

/**
 * The position ring.
 *
 * `pathLength` normalises the circumference to 100, so the dash maths is in
 * percent and does not care about the element's real size. Driven by the
 * rendered position rather than a CSS animation, because the loop can be
 * paused, re-armed and overdubbed — a keyframe animation would have to be
 * restarted correctly on all three and gets out of step.
 */
function Ring({ position, armed, live }: { position: number; armed: boolean; live: boolean }) {
  return (
    <svg className="loop-ring" viewBox="0 0 48 48" aria-hidden>
      <circle className="loop-ring-track" cx="24" cy="24" r="21" pathLength={100} />
      {live && (
        <circle
          className="loop-ring-fill"
          cx="24"
          cy="24"
          r="21"
          pathLength={100}
          data-armed={armed}
          strokeDasharray={`${Math.max(0.5, position * 100)} 100`}
        />
      )}
    </svg>
  )
}
