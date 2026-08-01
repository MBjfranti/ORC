/**
 * A rotary encoder.
 *
 * Modelled on the hardware's knobs: a capped shaft with a pointer, a
 * silkscreened label beneath, and an LED for when the section is live.
 *
 * ## Gestures
 *
 *   drag / wheel / ↑↓            turn — the primary value
 *   shift + drag / wheel / ↑↓    press-and-turn — the secondary value
 *   click                        press — toggles, where there is a toggle
 *   hold                         press-and-hold — opens the page
 *
 * Press-and-turn is the whole point: it doubles what a knob can reach, so
 * almost nothing needs a menu. Shift stands in for pushing the shaft down,
 * since a mouse has no way to do that literally.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { HOLD_MS } from './hold.js'

export type EncoderCap = 'amber' | 'dark' | 'orange'

interface Props {
  label: string
  /** Primary readout, shown at rest. */
  readout?: string
  /** Secondary readout, shown while shift is held. */
  readout2?: string
  /** Name of the secondary axis, for the tooltip and aria label. */
  label2?: string
  cap?: EncoderCap
  position?: number
  position2?: number
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  selected?: boolean
  onTurn: (delta: number, secondary: boolean) => void
  onPress?: () => void
  onHold?: () => void
  /** Bracket the hold timer, so the screen can show it filling. */
  onHoldStart?: () => void
  onHoldEnd?: () => void
  /** Photographic cap. When set, the whole image rotates instead of a pointer. */
  texture?: string
}

const SWEEP = 280 // degrees, leaving a gap at the bottom like a real knob

export const Encoder = memo(function Encoder({
  label,
  readout,
  readout2,
  label2,
  cap = 'dark',
  position,
  position2,
  size = 'md',
  active = false,
  selected = false,
  onTurn,
  onPress,
  onHold,
  onHoldStart,
  onHoldEnd,
  texture,
}: Props) {
  const dragRef = useRef<{ y: number; moved: boolean; secondary: boolean } | null>(null)
  const holdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** True while a secondary gesture is in flight, so the cap can show it. */
  const [shifted, setShifted] = useState(false)

  const showSecondary = shifted && !!readout2
  const shown = showSecondary ? readout2 : readout
  const angle =
    (showSecondary ? position2 : position) === undefined
      ? 0
      : -SWEEP / 2 + (showSecondary ? position2! : position!) * SWEEP

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { y: e.clientY, moved: false, secondary: e.shiftKey }
      setShifted(e.shiftKey)
      if (onHold) {
        onHoldStart?.()
        holdRef.current = setTimeout(() => {
          // The hold has happened, so the release must not also read as a
          // press — `moved` is the same flag a drag uses to suppress it.
          if (dragRef.current) dragRef.current.moved = true
          onHoldEnd?.()
          onHold()
        }, HOLD_MS)
      }
    },
    [onHold, onHoldStart, onHoldEnd],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dy = drag.y - e.clientY
      // One notch per 6px: fine enough to be controllable, coarse enough not
      // to feel sticky.
      if (Math.abs(dy) < 6) return
      clearTimeout(holdRef.current)
      onHoldEnd?.()
      drag.y = e.clientY
      drag.moved = true
      drag.secondary = e.shiftKey
      setShifted(e.shiftKey)
      onTurn(Math.sign(dy), e.shiftKey)
    },
    [onTurn, onHoldEnd],
  )

  const endDrag = useCallback(() => {
    clearTimeout(holdRef.current)
    onHoldEnd?.()
    const drag = dragRef.current
    dragRef.current = null
    setShifted(false)
    if (drag && !drag.moved) onPress?.()
  }, [onPress, onHoldEnd])

  // A hold in progress must not outlive the knob.
  useEffect(() => () => clearTimeout(holdRef.current), [])

  const title = label2
    ? `${label} — turn: ${label}. Shift+turn: ${label2}. Hold: open.`
    : `${label} — turn to change`

  return (
    <div
      className={`encoder enc-${size}`}
      data-selected={selected}
      data-secondary={showSecondary}
    >
      <button
        className="enc-knob"
        data-cap={cap}
        data-tex={!!texture}
        title={title}
        aria-label={`${label}${shown ? `: ${shown}` : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => {
          setShifted(e.shiftKey)
          onTurn(e.deltaY > 0 ? -1 : 1, e.shiftKey)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onTurn(1, e.shiftKey)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onTurn(-1, e.shiftKey)
          else if (e.key === 'Enter' || e.key === ' ') onPress?.()
          else return
          setShifted(e.shiftKey)
          e.preventDefault()
        }}
        onKeyUp={() => setShifted(false)}
        onBlur={() => setShifted(false)}
      >
        {texture ? (
          <span
            className="enc-cap"
            style={{ backgroundImage: `url(${texture})`, transform: `rotate(${angle}deg)` }}
          />
        ) : (
          <span className="enc-pointer" style={{ transform: `rotate(${angle}deg)` }} />
        )}

      </button>

      <span className="enc-led" data-on={active} />
      {/* Only the silkscreen name, as printed on the hardware. The value lives
          on the screen — a knob with a live readout under it is a web widget. */}
      <span className="enc-label">{showSecondary && label2 ? label2 : label}</span>
    </div>
  )
})
