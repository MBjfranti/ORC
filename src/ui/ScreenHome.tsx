/**
 * What the display shows while you play.
 *
 * The hardware offers five View settings (Options → System → View): a plain
 * chord name, a note list, a reactive waveform, a keyboard, or "Geek Out" —
 * chord, notes and keyboard together, which is the one the community actually
 * uses. All five are here.
 *
 * See research/02-hardware-panel-and-controls.md §Display.
 */

import { memo } from 'react'

import { noteName } from '../core/spelling.js'
import { usePanel } from '../state/panel.js'
import type { ViewMode } from '../state/panel.js'

interface Props {
  chord: string
  /** Superscript half of the name. Printed small, raised, at the top right. */
  chordExt: string
  /** MIDI notes currently sounding. */
  notes: readonly number[]
}

export const ScreenHome = memo(function ScreenHome({ chord, chordExt, notes }: Props) {
  const view = usePanel((s) => s.view)

  /**
   * Geek Out: chord, notes and keyboard, stacked.
   *
   * This is the view the community actually uses, and stacking is what it
   * looks like on the device. It only fits because the display is a 2:1
   * module rather than the letterbox strip this used to be drawn as — at
   * 3.7:1 the three rows overflowed and the chord drew over the status rail.
   */
  if (view === 'geek') {
    return (
      <div className="pg-home" data-view="geek">
        <Chord name={chord} ext={chordExt} />
        <div className="pg-notes">{notes.length > 0 ? notes.map(spell).join('  ') : 'ready'}</div>
        <MiniKeys notes={notes} />
      </div>
    )
  }

  return (
    <div className="pg-home" data-view={view}>
      {(view === 'chord' || view === 'chordkeys') && <Chord name={chord} ext={chordExt} />}

      {/* "Notes: displays the chord name *and* the individual notes" — §14.2.
          It used to show the notes alone. */}
      {view === 'notes' && (
        <>
          <Chord name={chord} ext={chordExt} />
          <div className="pg-notes">{notes.length > 0 ? notes.map(spell).join('  ') : 'ready'}</div>
        </>
      )}

      {view === 'wave' && <Waveform active={notes.length > 0} />}

      {(view === 'keys' || view === 'chordkeys') && <MiniKeys notes={notes} />}
    </div>
  )
})

/**
 * The chord, as the device prints it.
 *
 * Root and triad at full size, extensions raised and small at the top right —
 * `Cᴹ⁷`, not `CM7`. The manual's notation plates show every combination
 * drawn this way, and it is the difference between a chord name and a string.
 */
function Chord({ name, ext }: { name: string; ext: string }) {
  if (!name) return <div className="pg-chord"><span className="pg-idle">—</span></div>
  return (
    <div className="pg-chord">
      {name}
      {ext && <sup>{ext}</sup>}
    </div>
  )
}

function spell(n: number): string {
  return noteName(((n % 12) + 12) % 12) + (Math.floor(n / 12) - 1)
}

/**
 * A reactive waveform.
 *
 * Deliberately not a real analyser: it is decorative, and tapping the audio
 * graph for it would put a render on the audio path for no musical gain.
 */
function Waveform({ active }: { active: boolean }) {
  const bars = 48
  return (
    <div className="pg-wave" data-active={active}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ ['--i' as string]: String(i) }} />
      ))}
    </div>
  )
}

/** Two octaves, lighting whichever notes are sounding. */
function MiniKeys({ notes }: { notes: readonly number[] }) {
  const lit = new Set(notes.map((n) => ((n % 12) + 12) % 12))
  const white = [0, 2, 4, 5, 7, 9, 11]
  const black: Array<[number, number]> = [
    [1, 0],
    [3, 1],
    [6, 3],
    [8, 4],
    [10, 5],
  ]

  return (
    <div className="pg-keys">
      <div className="pg-keys-white">
        {white.map((pc) => (
          <span key={pc} data-lit={lit.has(pc)} />
        ))}
      </div>
      <div className="pg-keys-black">
        {black.map(([pc, after]) => (
          <span
            key={pc}
            data-lit={lit.has(pc)}
            style={{ left: `${((after + 1) / white.length) * 100}%` }}
          />
        ))}
      </div>
    </div>
  )
}


