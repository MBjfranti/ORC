/**
 * A dial.
 *
 * Turned by dragging, not by clicking a track — which means the pointer has to
 * be captured, or the value stops changing the moment you leave the 40-pixel
 * circle you started in. Vertical drag only: a rotary gesture is what a real
 * knob wants, but on a mouse it is fiddly and imprecise, and every hardware
 * emulation that has tried it ends up feeling worse than a straight drag.
 *
 * The readout below is part of the control, not a label for it — a dial with no
 * number is a guess, and every value here means something specific (a note
 * division, a mode name, a level 0–99).
 */

import { memo, useCallback, useRef } from 'react'

interface Props {
  label: string
  /** What the dial reads right now, in the units it actually has. */
  readout: string
  /** 0–1, for the arc. Omit for a dial with no meaningful extent. */
  position?: number
  /** Called with a signed step as the dial is turned. */
  onTurn: (delta: number) => void
  /**
   * How many turn-steps a click sends.
   *
   * A click is the coarse version of the gesture the knob already has, not a
   * second unrelated function: a labelled dial advances one printed position,
   * an encoder jumps a tenth of its range. Callers pass the number of steps
   * that means, because only they know what one step is worth.
   */
  clickSteps?: number
  /**
   * What a click does, when stepping is not it.
   *
   * A labelled dial needs this: turning it clamps at the printed ends, but a
   * click that stops working once you reach the last legend is a dead control.
   * Clicks wrap; drags do not.
   */
  onClick?: (() => void) | undefined
  /** Lit ring, for a dial whose thing is currently on. */
  active?: boolean
  /** How far the pointer travels for one step. Coarse dials want more. */
  sensitivity?: number
  /**
   * Drop the dial's own label and readout.
   *
   * For a dial that sits beside a screen or inside a ring of printed legends —
   * naming it twice is noise, and the screen is the better readout anyway.
   */
  bare?: boolean
  /**
   * The knob cap.
   *
   * `amber` is the hardware's: a black body with a yellow top. Rendered as a
   * filled cap with a pointer cut into it rather than an outline, because that
   * is what a moulded knob looks like from above.
   */
  cap?: 'outline' | 'amber'
}

export const Dial = memo(function Dial({
  label,
  readout,
  position,
  onTurn,
  clickSteps = 1,
  onClick,
  active = false,
  sensitivity = 6,
  bare = false,
  cap = 'outline',
}: Props) {
  const drag = useRef<{ y: number; moved: boolean } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, moved: false }
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      // Accumulate rather than snapping to the pointer: a dial is relative, so
      // it must never jump to an absolute position under the cursor.
      const travel = d.y - e.clientY
      const steps = Math.trunc(travel / sensitivity)
      if (steps === 0) return
      d.y -= steps * sensitivity
      d.moved = true
      onTurn(steps)
    },
    [onTurn, sensitivity],
  )

  const onPointerUp = useCallback(() => {
    const d = drag.current
    drag.current = null
    // A click is a drag that never moved. Resolving it on pointerup rather than
    // pointerdown is what stops the two gestures firing together.
    if (!d || d.moved) return
    if (onClick) onClick()
    else onTurn(clickSteps)
  }, [onTurn, clickSteps, onClick])

  const angle = position === undefined ? undefined : -135 + position * 270

  return (
    <div className="dial" data-active={active} data-bare={bare} data-cap={cap}>
      <div
        className="dial-knob"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={readout}
        aria-valuenow={position === undefined ? undefined : Math.round(position * 100)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault()
            onTurn(1)
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault()
            onTurn(-1)
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (onClick) onClick()
            else onTurn(clickSteps)
          }
        }}
      >
        <svg viewBox="0 0 40 40" aria-hidden>
          {cap === 'amber' && (
            <>
              {/* Body, then the yellow top sitting inside it. */}
              <circle className="dial-body" cx="20" cy="20" r="15" />
              <circle className="dial-cap" cx="20" cy="20" r="11.5" />
            </>
          )}
          {/* The travel the dial can cover, and how much of it is used. 270°
              with the gap at the bottom is the convention every knob follows. */}
          <path className="dial-track" d={ARC} pathLength={100} />
          {position !== undefined && (
            <path
              className="dial-arc"
              d={ARC}
              pathLength={100}
              strokeDasharray={`${Math.max(0, Math.min(1, position)) * 100} 100`}
            />
          )}
          {angle !== undefined && (
            <line
              className="dial-pointer"
              x1="20"
              y1="20"
              x2="20"
              y2="7"
              transform={`rotate(${angle} 20 20)`}
            />
          )}
        </svg>
      </div>

      {!bare && (
        <>
          <span className="dial-label">{label}</span>
          <span className="dial-readout">{readout}</span>
        </>
      )}
    </div>
  )
})

/** 270° of arc, opening at the bottom. */
const ARC = 'M 10.1 29.9 A 14 14 0 1 1 29.9 29.9'
