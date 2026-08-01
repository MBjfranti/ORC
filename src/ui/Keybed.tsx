/**
 * The keybed.
 *
 * White keys tile the width; black keys are positioned *over* them, as on a
 * real keyboard — rendering all twelve inline makes a row of equal slabs that
 * reads as an accordion rather than a piano.
 *
 * Each key carries three tiers (research/11-webapp-implications.md §1c):
 *   tier 3  the chord this key would play right now  (tinted band, live)
 *   tier 1  the note name, spelled for the current key  (bold, primary)
 *   tier 2  the keyboard legend  (small, dim, lowercase)
 *
 * Performance matters here: this re-renders on every keypress inside the
 * keydown handler, hence the memo on the chord table and on each key.
 */

import { memo, useMemo, useRef } from 'react'

import { resolveChord } from '../core/resolve.js'
import type { ResolvedChord } from '../core/resolve.js'
import { noteName } from '../core/spelling.js'
import { BLACK_KEYS, rootMap, WHITE_KEYS } from '../input/layout.js'
import type { LegendMap } from '../input/layout.js'
import { chromaticPolicy, usePanel } from '../state/panel.js'
import type { TierMode } from '../state/panel.js'

interface Props {
  legends: LegendMap
  pressed: ReadonlySet<number>
  onPress: (pc: number) => void
  onRelease: (pc: number) => void
}

/**
 * Which white key each black key sits after. C♯ follows C, D♯ follows D, then
 * the gap at E–F, and so on — this is the shape that makes it read as a piano.
 */
const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5]

export function Keybed({ legends, pressed, onPress, onRelease }: Props) {
  const heldTypes = usePanel((s) => s.heldTypes)
  const secretChords = usePanel((s) => s.secretChords)
  const playStyle = usePanel((s) => s.playStyle)
  const heldExtensions = usePanel((s) => s.heldExtensions)
  const keyMode = usePanel((s) => s.keyMode)
  const key = usePanel((s) => s.key)
  const rootLayout = usePanel((s) => s.rootLayout)
  const octave = usePanel((s) => s.octave)
  const voicing = usePanel((s) => s.voicing)
  const tier = usePanel((s) => s.tier)

  /** Deliberately excludes `pressed` — playing must not recompute the table. */
  const table = useMemo(() => {
    const map = rootMap(rootLayout, key)
    const build = (code: string) => {
      const pc = map[code]
      if (pc === undefined) return undefined
      return {
        code,
        pc,
        name: noteName(pc, keyMode ? key : undefined),
        resolved: resolveChord({
          root: pc,
          heldTypes,
          secretChords,
          playStyle,
          extensions: heldExtensions,
          keyMode,
          key,
          chromatic: chromaticPolicy(rootLayout),
          octave,
          voicing,
        }),
      }
    }
    return {
      white: WHITE_KEYS.map(build).filter(Boolean) as NonNullable<ReturnType<typeof build>>[],
      black: BLACK_KEYS.map(build),
    }
  }, [heldTypes, secretChords, playStyle, heldExtensions, keyMode, key, rootLayout, octave, voicing])

  const whiteCount = table.white.length

  return (
    <div className="keybed" role="group" aria-label="Keybed">
      <div className="keybed-white">
        {table.white.map((k) => (
          <Key
            key={k.code}
            pc={k.pc}
            black={false}
            name={k.name}
            tierText={tierText(tier, k.resolved)}
            borrowed={k.resolved?.numeral.includes('/') ?? false}
            chordName={k.resolved?.name}
            legend={legends[k.code] ?? ''}
            pressed={pressed.has(k.pc)}
            onPress={onPress}
            onRelease={onRelease}
          />
        ))}
      </div>

      <div className="keybed-black" aria-hidden={false}>
        {table.black.map((k, i) => {
          if (!k) return null
          const after = BLACK_AFTER_WHITE[i]
          if (after === undefined) return null
          return (
            <div
              key={k.code}
              className="black-slot"
              style={{ left: `${((after + 1) / whiteCount) * 100}%` }}
            >
              <Key
                pc={k.pc}
                black
                name={k.name}
                tierText={tierText(tier, k.resolved)}
                borrowed={k.resolved?.numeral.includes('/') ?? false}
                chordName={k.resolved?.name}
                legend={legends[k.code] ?? ''}
                pressed={pressed.has(k.pc)}
                onPress={onPress}
                onRelease={onRelease}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface KeyProps {
  pc: number
  black: boolean
  name: string
  tierText: string
  borrowed: boolean
  chordName: string | undefined
  legend: string
  pressed: boolean
  onPress: (pc: number) => void
  onRelease: (pc: number) => void
}

/** Memoised so pressing one key re-renders one key, not twelve. */
const Key = memo(function Key({
  pc,
  black,
  name,
  tierText,
  borrowed,
  chordName,
  legend,
  pressed,
  onPress,
  onRelease,
}: KeyProps) {
  /**
   * Whether *this pointer* is what is holding the key down.
   *
   * Two things went wrong without it. `pointerup` only reaches the element the
   * pointer is still over, so releasing the mouse anywhere else left the note
   * sounding; and `pointerleave` fired on `pressed`, which is also true for a
   * key being held on the computer keyboard — so sweeping the mouse across the
   * keybed cut off notes the player's other hand was still holding.
   *
   * Capturing the pointer fixes the first: up and cancel are then guaranteed to
   * come back here. The local flag fixes the second, by distinguishing a key
   * this pointer pressed from one that merely looks pressed.
   */
  const held = useRef(false)

  const letGo = () => {
    if (!held.current) return
    held.current = false
    onRelease(pc)
  }

  return (
    <button
      className={`key ${black ? 'black' : 'white'}`}
      data-pressed={pressed}
      aria-label={`${name}${chordName ? `, plays ${chordName}` : ''}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = true
        onPress(pc)
      }}
      onPointerUp={letGo}
      // Fires when the browser takes the gesture away — a touch turning into a
      // scroll, the OS interrupting. No `pointerup` follows it, so without this
      // the note has nothing left to stop it.
      onPointerCancel={letGo}
    >
      <span className="tier3" data-borrowed={borrowed}>
        {tierText}
      </span>
      <span className="spacer" />
      <span className="note">{name}</span>
      <span className="legend">{legend}</span>
    </button>
  )
})

/**
 * Tier 3 is blank when nothing would sound — an always-populated readout would
 * be lying half the time, and blanking it makes the chord buttons feel
 * consequential.
 */
function tierText(tier: TierMode, resolved: ResolvedChord | undefined): string {
  if (tier === 'off' || !resolved) return ''
  if (tier === 'numeral') return resolved.numeral || '·'
  return resolved.name
}
