/**
 * The voicing stack — a vertical pitch axis with the sounding notes on it.
 *
 * This is the one thing on screen that is not a control. The instrument's whole
 * claim is that voice leading becomes tactile: turn the dial and the chord
 * walks up the keyboard one note at a time. That is invisible on a keybed and
 * unreadable in a note list, but it is obvious the moment you plot the notes at
 * their real height — the marks slide, the shape stays.
 *
 * Ruled like manuscript paper, with the octave Cs as the heavier lines, so the
 * eye has something to measure against.
 */

import { memo } from 'react'

import { noteWithOctave } from '../core/spelling.js'
import { usePanel } from '../state/panel.js'
import type { Sounding } from '../App.js'

/** The window the axis shows, in MIDI notes. C1 to C7 covers the useful range. */
const LOW = 24
const HIGH = 96

const height = (note: number) => ((HIGH - note) / (HIGH - LOW)) * 100

export const VoicingStack = memo(function VoicingStack({
  sounding,
}: {
  sounding: Sounding | undefined
}) {
  const key = usePanel((s) => s.key)
  const keyMode = usePanel((s) => s.keyMode)
  const voicing = usePanel((s) => s.voicing)

  // Every C in range, as the ruled lines.
  const octaves: number[] = []
  for (let n = LOW; n <= HIGH; n += 12) octaves.push(n)

  const notes = sounding?.notes ?? []
  const bass = sounding?.bass

  return (
    <aside className="stack" aria-label="Sounding notes by pitch">
      <div className="stack-plot">
        {octaves.map((n) => (
          <div key={n} className="stack-rule" style={{ top: `${height(n)}%` }}>
            <span>{noteWithOctave(n, keyMode ? key : undefined)}</span>
          </div>
        ))}

        {bass !== undefined && (
          <div className="stack-note is-bass" style={{ top: `${height(bass)}%` }}>
            <span className="stack-label">{noteWithOctave(bass, keyMode ? key : undefined)}</span>
          </div>
        )}

        {notes.map((n, i) => (
          <div
            key={`${n}-${i}`}
            className="stack-note"
            style={{ top: `${height(n)}%` }}
            data-borrowed={sounding?.borrowed ?? false}
          >
            <span className="stack-label">{noteWithOctave(n, keyMode ? key : undefined)}</span>
          </div>
        ))}
      </div>

      <footer className="stack-foot">
        <span className="stack-foot-key">Voicing</span>
        {/* Signed and unbounded on purpose: it is a position on the keyboard,
            not an inversion number, and there is deliberately no home. */}
        <span className="stack-foot-value">{voicing > 0 ? `+${voicing}` : voicing}</span>
      </footer>
    </aside>
  )
})
