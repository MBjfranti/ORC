/**
 * The list, as the hardware draws it.
 *
 * Measured from the framebuffer dumps in the manual (research/13 §C.1), and the
 * surprising part is the cursor: it is **welded to row index 2** and the list
 * scrolls underneath it. That is the opposite of how a scrolling list normally
 * works, and it is what makes the blank rows in the illustrations meaningful —
 * one screenshot shows an empty slot above the first entry, another shows two
 * below the last. A wrapping list could draw neither, which is also how we know
 * the list clamps.
 *
 * The selection is a full-width inversion: a solid white rectangle with the
 * glyphs knocked out in black. No inset, no rounding, no arrow, no tint — on a
 * 1-bit panel there is nothing else it could be.
 */

import { memo } from 'react'

/** Rows the display shows at once: 5 × 24px on a 128px panel. */
export const VISIBLE_ROWS = 5

/** The slot the cursor never leaves. */
export const CURSOR_ROW = 2

/**
 * Which item index sits in each of the five slots — `null` where the list has
 * run out. This is the whole of the fixed-cursor behaviour.
 */
export function viewport(count: number, cursor: number): (number | null)[] {
  return [-2, -1, 0, 1, 2].map((offset) => {
    const i = cursor + offset
    return i >= 0 && i < count ? i : null
  })
}

export interface Row {
  /** Left-hand text. Numbers are part of it, as the panel prints them. */
  readonly label: string
  /** Right-aligned column, for lists that carry a value. */
  readonly value?: string | undefined
  /**
   * The value is being *edited*, not merely shown.
   *
   * FX is a two-state control — turning either moves the cursor or changes the
   * number, and the manual never says how the screen distinguishes them. It
   * has to: otherwise both states look identical until you turn something, and
   * guessing wrong moves the cursor when you meant to set a level.
   *
   * Drawn as a knocked-out chip on the value alone, inside the row's own
   * inversion. **Inferred** — but the display already uses inversion to mark a
   * secondary axis on the press-and-turn readouts (research/13 §C.3), so it is
   * borrowing the panel's own vocabulary rather than inventing one.
   */
  readonly editing?: boolean | undefined
}

export const ScreenList = memo(function ScreenList({
  rows,
  cursor,
}: {
  rows: readonly Row[]
  cursor: number
}) {
  const slots = viewport(rows.length, cursor)

  return (
    <div className="scr-list" role="listbox" aria-activedescendant={`row-${cursor}`}>
      {slots.map((index, slot) => {
        // A blank slot is the list running out. There is no scrollbar, no arrow
        // and no ellipsis anywhere on this panel — the empty row *is* the
        // affordance that says "this is the end".
        if (index === null) return <div key={slot} className="scr-row" aria-hidden />

        const row = rows[index]!
        return (
          <div
            key={slot}
            id={`row-${index}`}
            className="scr-row"
            role="option"
            aria-selected={slot === CURSOR_ROW}
            data-sel={slot === CURSOR_ROW}
          >
            <span className="scr-row-label">{row.label}</span>
            {row.value && (
              <span className="scr-row-value" data-editing={row.editing === true}>
                {row.value}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
})
