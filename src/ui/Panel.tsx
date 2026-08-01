/**
 * The instrument.
 *
 * A top-down view of the ORC-1: cream shell with speaker grilles, a grey
 * control panel inset, nine encoders along the top beside the screen, the
 * chord-button block and voicing dials below, and the keybed on the right.
 *
 * Layout departs from the hardware in one place, deliberately: the two voicing
 * dials sit with the chord buttons rather than in the top row, because they are
 * the only dials you turn while a chord is sounding.
 */

import { memo } from 'react'

import { usePanel } from '../state/panel.js'
import type { LegendMap } from '../input/layout.js'
import { ChordButtons } from './ChordButtons.js'
import { Encoder } from './Encoder.js'
import { Keybed } from './Keybed.js'
import { Screen } from './Screen.js'
import type { ScreenPage, ScreenProps } from './Screen.js'
import { ALL_DIALS, axisOf, SESSION_DIALS, TOP_DIALS } from './dials.js'
import type { DialSpec } from './dials.js'

interface Props extends Omit<ScreenProps, 'page' | 'chord' | 'notes'> {
  legends: LegendMap
  chord: string
  notes: string
  pressed: ReadonlySet<number>
  onPressKey: (pc: number) => void
  onReleaseKey: (pc: number) => void
}

export const Panel = memo(function Panel(props: Props) {
  const s = usePanel()
  const page = s.screenPage as ScreenPage

  /**
   * The hardware's gesture grammar, kept intact (research/02):
   *
   *   turn         change the value — and glance at its page, which fades back
   *                to home on its own, so you can see what you're changing
   *                without committing to a menu
   *   press        toggle the thing on or off, if it has an on/off; otherwise
   *                pin its page
   *   press & hold pin the page open — the "reveal a menu" gesture
   *
   * Splitting press from hold is the fix that matters: pressing Key used to
   * toggle Key Mode *and* open its page, so there was no way to read the page
   * without changing the setting.
   */
  const renderDial = (dial: DialSpec, size: 'sm' | 'md' | 'lg') => {
    const index = ALL_DIALS.indexOf(dial)
    return (
      <Encoder
        key={dial.id}
        label={dial.primary.label === dial.label ? dial.label : dial.label}
        readout={dial.primary.readout(s)}
        cap={dial.cap}
        size={size}
        {...(dial.primary.position ? { position: dial.primary.position(s) } : {})}
        {...(dial.secondary
          ? {
              readout2: dial.secondary.readout(s),
              label2: dial.secondary.label,
              ...(dial.secondary.position ? { position2: dial.secondary.position(s) } : {}),
            }
          : {})}
        active={dial.active?.(s) ?? false}
        selected={s.dialFocus === index}
        onTurn={(d, secondary) => {
          s.setDialFocus(index)
          const st = usePanel.getState()
          axisOf(dial, secondary).turn(st, d)
          st.setDialAxis(secondary)
          usePanel.getState().glanceValue()
        }}
        onPress={() => {
          s.setDialFocus(index)
          if (dial.press) {
            dial.press(usePanel.getState())
            if (dial.page) usePanel.getState().glance(dial.page)
          } else if (dial.page) {
            usePanel.getState().pinPage(dial.page)
          }
        }}
        onHoldStart={() => s.setHoldingDial(index)}
        onHoldEnd={() => s.setHoldingDial(null)}
        {...(dial.hold || dial.page
          ? {
              onHold: () => {
                s.setDialFocus(index)
                const st = usePanel.getState()
                if (dial.hold) dial.hold(st)
                else st.pinPage(dial.page!)
              },
            }
          : {})}
      />
    )
  }

  return (
    <div className="orc">
      <div className="orc-body">
        {/* Bone-coloured hood: two grille blocks with the maker's mark between. */}
        <div className="orc-hood">
          <Grille />
          <span className="orc-maker">Telepathic Instruments</span>
          <Grille />
        </div>

        {/*
         * The glossy black strip. Four dials, the screen, then five — and the
         * screen is *inside* the strip rather than beside it, which is why the
         * hardware appears to have no display until it lights up.
         */}
        <div className="orc-strip">
          <div className="orc-encoders">
            {TOP_DIALS.slice(0, 4).map((d) => renderDial(d, 'md'))}
          </div>

          <Screen {...props} page={page} />

          <div className="orc-encoders">{TOP_DIALS.slice(4).map((d) => renderDial(d, 'md'))}</div>

          <span className="orc-mark">Orchid</span>
        </div>

        {/* The playing surface — the whole bottom half of the instrument. */}
        <div className="orc-deck">
          <ChordButtons legends={props.legends} />

          <div className="orc-voicing">
            {renderDial(SESSION_DIALS[0]!, 'lg')}
            {/* One label serves both knobs, reading down between them: the
                large one voices the chord, the small one the bass. */}
            <span className="voicing-silk">
              <em>Chord</em>
              <strong>VOICING</strong>
              <em>Bass</em>
            </span>
            {renderDial(SESSION_DIALS[1]!, 'sm')}
          </div>

          <Keybed
            legends={props.legends}
            pressed={props.pressed}
            onPress={props.onPressKey}
            onRelease={props.onReleaseKey}
          />
        </div>
      </div>
    </div>
  )
})

/** A moulded block of speaker slots on the hood. */
function Grille() {
  return (
    <div className="orc-grille" aria-hidden>
      {Array.from({ length: 13 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  )
}
