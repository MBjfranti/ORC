/**
 * The chord you are playing, set as a chord symbol.
 *
 * The suffix is engraved as a superscript because that is how chord symbols are
 * actually written, and because it keeps a long name like `Cm7♭5` readable at
 * the size this is set. Empty rather than placeholder when nothing sounds — a
 * readout that always shows something is lying half the time.
 */

import { memo } from 'react'

import { usePanel } from '../state/panel.js'
import type { Sounding } from '../App.js'

export const ChordDisplay = memo(function ChordDisplay({
  sounding,
}: {
  sounding: Sounding | undefined
}) {
  const keyMode = usePanel((s) => s.keyMode)

  return (
    <div className="readout">
      <div className="readout-chord" data-empty={!sounding?.root}>
        {sounding?.root ? (
          <>
            <span className="readout-root">
              {sounding.root}
              {sounding.base}
            </span>
            {sounding.sup && <sup className="readout-sup">{sounding.sup}</sup>}
          </>
        ) : null}
      </div>

      <div className="readout-meta">
        {keyMode && sounding?.numeral && (
          <span className="readout-numeral" data-borrowed={sounding.borrowed}>
            {sounding.numeral}
          </span>
        )}
        {sounding?.borrowed && <span className="readout-tag">borrowed</span>}
      </div>
    </div>
  )
})
