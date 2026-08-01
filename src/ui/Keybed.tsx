/**
 * The keybed.
 *
 * White keys tile the width; black keys sit *over* them, as on a real
 * keyboard — rendering all twelve inline makes a row of equal slabs that reads
 * as an accordion rather than a piano.
 *
 * Each key carries the chord it would play right now, which is the whole point:
 * you can read the harmony off the keyboard before committing to it, and the
 * labels change live as you hold pads or turn the key.
 */

import { memo, useMemo, useRef } from 'react'

import { resolveChord } from '../core/resolve.js'
import { noteName } from '../core/spelling.js'
import type { PitchClass } from '../core/types.js'
import { BLACK_AFTER, BLACK_KEYS, rootMap, WHITE_KEYS } from '../input/layout.js'
import type { Legends } from '../input/layout.js'
import { usePanel } from '../state/panel.js'

interface Props {
  legends: Legends
  pressed: PitchClass | undefined
  onPress: (pc: PitchClass) => void
  onRelease: (pc: PitchClass) => void
}

export const Keybed = memo(function Keybed({ legends, pressed, onPress, onRelease }: Props) {
  const heldTypes = usePanel((s) => s.heldTypes)
  const heldExtensions = usePanel((s) => s.heldExtensions)
  const keyMode = usePanel((s) => s.keyMode)
  const key = usePanel((s) => s.key)
  const chromatic = usePanel((s) => s.chromatic)
  const rootMode = usePanel((s) => s.rootMode)
  const octave = usePanel((s) => s.octave)
  const voicing = usePanel((s) => s.voicing)

  /** Deliberately excludes `pressed` — playing must not recompute the table. */
  const table = useMemo(() => {
    const map = rootMap(rootMode, key)
    const build = (code: string) => {
      const pc = map[code]
      if (pc === undefined) return undefined
      const resolved = resolveChord({
        root: pc,
        types: heldTypes,
        extensions: heldExtensions,
        keyMode,
        key,
        chromatic,
        octave,
        voicing,
      })
      return {
        code,
        pc,
        name: noteName(pc, keyMode ? key : undefined),
        chord: resolved ? resolved.root + resolved.base + resolved.sup : '',
        borrowed: resolved?.borrowed ?? false,
      }
    }
    return {
      white: WHITE_KEYS.map(build).filter(Boolean) as NonNullable<ReturnType<typeof build>>[],
      black: BLACK_KEYS.map(build),
    }
  }, [heldTypes, heldExtensions, keyMode, key, chromatic, rootMode, octave, voicing])

  const whiteCount = table.white.length

  return (
    <div className="keybed" role="group" aria-label="Keybed">
      <div className="keybed-white">
        {table.white.map((k) => (
          <Key
            key={k.code}
            {...k}
            black={false}
            legend={legends[k.code] ?? ''}
            pressed={pressed === k.pc}
            onPress={onPress}
            onRelease={onRelease}
          />
        ))}
      </div>

      <div className="keybed-black">
        {table.black.map((k, i) => {
          if (!k) return null
          const after = BLACK_AFTER[i]
          if (after === undefined) return null
          return (
            <div
              key={k.code}
              className="black-slot"
              style={{ left: `${((after + 1) / whiteCount) * 100}%` }}
            >
              <Key
                {...k}
                black
                legend={legends[k.code] ?? ''}
                pressed={pressed === k.pc}
                onPress={onPress}
                onRelease={onRelease}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
})

interface KeyProps {
  pc: PitchClass
  black: boolean
  name: string
  chord: string
  borrowed: boolean
  legend: string
  pressed: boolean
  onPress: (pc: PitchClass) => void
  onRelease: (pc: PitchClass) => void
}

/** Memoised so pressing one key re-renders one key, not twelve. */
const Key = memo(function Key({
  pc,
  black,
  name,
  chord,
  borrowed,
  legend,
  pressed,
  onPress,
  onRelease,
}: KeyProps) {
  /**
   * Whether *this pointer* is holding the key down.
   *
   * `pointerup` only reaches the element the pointer is still over, so
   * releasing the mouse anywhere else would leave the note sounding. Capturing
   * guarantees up and cancel come back here; the flag stops a key that merely
   * looks pressed — because the computer keyboard is holding it — from being
   * released by a mouse passing over.
   */
  const mine = useRef(false)

  const letGo = () => {
    if (!mine.current) return
    mine.current = false
    onRelease(pc)
  }

  return (
    <button
      type="button"
      className={`key ${black ? 'is-black' : 'is-white'}`}
      data-pressed={pressed}
      aria-label={`${name}${chord ? `, plays ${chord}` : ''}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        mine.current = true
        onPress(pc)
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
    >
      <span className="key-chord" data-borrowed={borrowed}>
        {chord}
      </span>
      <span className="key-name">{name}</span>
      <span className="key-legend">{legend}</span>
    </button>
  )
})
