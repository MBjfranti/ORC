/**
 * The eight chord-modifier pads.
 *
 * Top row: Chord Types (the base triad). Bottom row: Chord Extensions, which
 * are additive and stackable. See research/03-chord-engine.md.
 *
 * The pads themselves are blank rubber domes, as on the hardware — every label
 * is silkscreened onto the panel around them. Keeping type names above the top
 * row and extension names below the bottom row is what makes the block read as
 * moulded hardware rather than eight web buttons.
 */

import { memo } from 'react'

import { secretChordFor } from '../core/chord.js'
import { secretChordsApply } from '../core/playStyle.js'
import { CHORD_TYPES, EXTENSIONS } from '../core/types.js'
import type { ChordType, Extension } from '../core/types.js'
import { EXTENSION_KEYS, TYPE_KEYS } from '../input/layout.js'
import type { LegendMap } from '../input/layout.js'
import { usePanel } from '../state/panel.js'

const TYPE_LABEL: Record<ChordType, string> = {
  dim: 'Dim',
  min: 'Min',
  maj: 'Maj',
  sus: 'Sus',
}

/**
 * `m7` and `M7` differ only by case, which is how the panel is actually
 * silkscreened. That is only safe because the labels render in their true
 * case — an earlier stylesheet uppercased them and the two became identical,
 * which is why this briefly said "maj7" instead.
 */
const EXT_LABEL: Record<Extension, string> = {
  '6': '6',
  m7: 'm7',
  M7: 'M7',
  '9': '9',
}

const codeForType = (t: ChordType) => Object.keys(TYPE_KEYS).find((c) => TYPE_KEYS[c] === t)!
const codeForExt = (e: Extension) => Object.keys(EXTENSION_KEYS).find((c) => EXTENSION_KEYS[c] === e)!

export const ChordButtons = memo(function ChordButtons({ legends }: { legends: LegendMap }) {
  const heldTypes = usePanel((s) => s.heldTypes)
  const heldExtensions = usePanel((s) => s.heldExtensions)
  const toggleType = usePanel((s) => s.toggleType)
  const toggleExtension = usePanel((s) => s.toggleExtension)
  const secretChords = usePanel((s) => s.secretChords)
  const playStyle = usePanel((s) => s.playStyle)
  // Not `secretChords ? ...` — this became a three-way setting, and the string
  // 'off' is perfectly truthy, so the badge kept appearing after switching
  // secret chords off.
  const secret = secretChordsApply(secretChords, playStyle)
    ? secretChordFor(heldTypes)
    : undefined

  return (
    <div className="pads">
      <div className="pad-silk top">
        {CHORD_TYPES.map((t) => (
          <span key={t}>{TYPE_LABEL[t]}</span>
        ))}
        {secret && <span className="secret-badge">{secret.name}</span>}
      </div>

      <div className="pad-grid">
        {CHORD_TYPES.map((type) => (
          <button
            key={type}
            className="pad"
            data-held={heldTypes.includes(type)}
            data-secret={!!secret}
            aria-label={TYPE_LABEL[type]}
            aria-pressed={heldTypes.includes(type)}
            onPointerDown={(e) => {
              e.preventDefault()
              toggleType(type, true)
            }}
            onPointerUp={() => toggleType(type, false)}
            onPointerLeave={() => heldTypes.includes(type) && toggleType(type, false)}
          />
        ))}
      </div>

      <div className="pad-silk keys">
        {CHORD_TYPES.map((t) => (
          <span key={t}>{legends[codeForType(t)] ?? ''}</span>
        ))}
      </div>

      <div className="pad-grid">
        {EXTENSIONS.map((ext) => (
          <button
            key={ext}
            className="pad"
            data-held={heldExtensions.includes(ext)}
            aria-label={EXT_LABEL[ext]}
            aria-pressed={heldExtensions.includes(ext)}
            onPointerDown={(e) => {
              e.preventDefault()
              toggleExtension(ext, true)
            }}
            onPointerUp={() => toggleExtension(ext, false)}
            onPointerLeave={() => heldExtensions.includes(ext) && toggleExtension(ext, false)}
          />
        ))}
      </div>

      <div className="pad-silk bottom">
        {EXTENSIONS.map((e) => (
          <span key={e}>{EXT_LABEL[e]}</span>
        ))}
      </div>

      <div className="pad-silk keys">
        {EXTENSIONS.map((e) => (
          <span key={e}>{legends[codeForExt(e)] ?? ''}</span>
        ))}
      </div>
    </div>
  )
})
