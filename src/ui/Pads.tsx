/**
 * The eight modifier pads: four triads above, four added notes below.
 *
 * Momentary, not toggles — you hold a pad and play a key, which is the
 * instrument's core gesture. That makes the pointer handling load-bearing, so
 * see `Pad` below for why it captures.
 */

import { memo, useRef } from 'react'

import { CHORD_TYPES, EXTENSIONS } from '../core/types.js'
import type { ChordType, Extension } from '../core/types.js'
import { EXTENSION_KEYS, TYPE_KEYS } from '../input/layout.js'
import type { Legends } from '../input/layout.js'
import { usePanel } from '../state/panel.js'

const TYPE_LABEL: Record<ChordType, string> = {
  dim: 'dim',
  min: 'min',
  maj: 'maj',
  sus: 'sus',
}

/**
 * `m7` and `M7` differ only by case, which is how chord symbols are written.
 * That is only safe because they render in their true case — uppercasing them
 * in CSS would make the two identical.
 */
const EXT_LABEL: Record<Extension, string> = { '6': '6', m7: 'm7', M7: 'M7', '9': '9' }

const codeFor = <T extends string>(map: Record<string, T>, value: T) =>
  Object.keys(map).find((c) => map[c] === value)!

export const Pads = memo(function Pads({ legends }: { legends: Legends }) {
  const heldTypes = usePanel((s) => s.heldTypes)
  const heldExtensions = usePanel((s) => s.heldExtensions)
  const setHeldType = usePanel((s) => s.setHeldType)
  const setHeldExtension = usePanel((s) => s.setHeldExtension)

  return (
    <div className="pads">
      <div className="pad-row">
        {CHORD_TYPES.map((type) => (
          <Pad
            key={type}
            label={TYPE_LABEL[type]}
            legend={legends[codeFor(TYPE_KEYS, type)] ?? ''}
            held={heldTypes.includes(type)}
            onHold={(down) => setHeldType(type, down)}
          />
        ))}
      </div>

      <div className="pad-row is-extensions">
        {EXTENSIONS.map((ext) => (
          <Pad
            key={ext}
            label={EXT_LABEL[ext]}
            legend={legends[codeFor(EXTENSION_KEYS, ext)] ?? ''}
            held={heldExtensions.includes(ext)}
            onHold={(down) => setHeldExtension(ext, down)}
          />
        ))}
      </div>
    </div>
  )
})

/**
 * One pad, held for exactly as long as the pointer holds it.
 *
 * Two failure modes make this more than an `onMouseDown`. `pointerup` is
 * delivered to whatever the pointer is over, so lifting the mouse anywhere else
 * would never release the pad and the instrument would stay in that chord for
 * good. And releasing on shared held state would mean sweeping the mouse across
 * the panel lets go of a pad the player is holding on the keyboard.
 *
 * Capturing the pointer fixes the first — up and cancel then come back here
 * wherever they happen — and the local flag fixes the second, by distinguishing
 * a pad this pointer pressed from one that merely looks pressed.
 */
function Pad({
  label,
  legend,
  held,
  onHold,
}: {
  label: string
  legend: string
  held: boolean
  onHold: (down: boolean) => void
}) {
  const mine = useRef(false)

  const letGo = () => {
    if (!mine.current) return
    mine.current = false
    onHold(false)
  }

  return (
    <button
      type="button"
      className="pad"
      data-held={held}
      aria-pressed={held}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        mine.current = true
        onHold(true)
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
    >
      <span className="pad-label">{label}</span>
      <span className="pad-legend">{legend}</span>
    </button>
  )
}
