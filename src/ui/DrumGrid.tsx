/**
 * The drum step grid.
 *
 * Sixteen steps across, one row per voice. Click a cell to toggle a hit.
 *
 * The factory patterns are a starting point rather than a fixed menu — editing
 * one forks it into your own copy (marked with a `*`) and leaves the original
 * intact, so you can always get back with Reset.
 */

import { memo } from 'react'

import { DRUM_VOICES, isEdited } from '../core/beats.js'
import type { Beat, DrumVoice } from '../core/beats.js'

const VOICE_LABEL: Record<DrumVoice, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  hat: 'Hat',
  openhat: 'Open',
  rim: 'Rim',
  tom: 'Tom',
}

interface Props {
  beat: Beat
  playhead: number
  running: boolean
  /** Omitted outside Extended — the grid becomes a read-only display. */
  /** Omitted outside Extended — the grid becomes a read-only display. */
  onToggle?: ((voice: DrumVoice, step: number) => void) | undefined
}

export const DrumGrid = memo(function DrumGrid({ beat, playhead, running, onToggle }: Props) {
  const steps = Array.from({ length: beat.steps }, (_, i) => i)

  return (
    <div className="drum-grid" role="group" aria-label="Drum pattern">
      {DRUM_VOICES.map((voice) => (
        <div className="drum-row" key={voice}>
          <span className="drum-label">{VOICE_LABEL[voice]}</span>
          <div className="drum-cells">
            {steps.map((step) => {
              const on = beat.hits[voice]?.includes(step) ?? false
              return (
                <button
                  key={step}
                  className="drum-cell"
                  data-on={on}
                  // Every fourth cell starts a beat — the grid is unreadable
                  // without something marking where the pulse falls.
                  data-downbeat={step % 4 === 0}
                  data-playing={running && playhead === step}
                  onClick={onToggle ? () => onToggle(voice, step) : undefined}
                  disabled={!onToggle}
                  aria-label={`${VOICE_LABEL[voice]} step ${step + 1}${on ? ', on' : ', off'}`}
                  aria-pressed={on}
                />
              )
            })}
          </div>
        </div>
      ))}

      <div className="drum-footer">
        <span className="drum-name" data-edited={isEdited(beat)}>
          {beat.name}
        </span>
        {beat.swing > 0 && <span className="drum-swing">swing {String(Math.round(beat.swing * 99)).padStart(2, '0')}</span>}
      </div>
    </div>
  )
})
