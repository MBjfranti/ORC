/**
 * The FX rack.
 *
 * The interesting part is the two-state machine — browse, then adjust — which is
 * quoted verbatim in the manual and is the only control on the instrument that
 * works this way. The rest guards the documented list and its order.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { FX_EXIT_ROW, FX_ROWS, FX_SLOTS, fxLevel, fxSlotAt, prominentFx } from './fx.js'
import { SOUNDS } from './sounds.js'
import { fxAmountOf, usePanel } from '../state/panel.js'

const reset = () =>
  usePanel.setState({
    fxCursor: 1,
    fxAdjusting: false,
    fxLock: false,
    screenList: null,
    reverb: 0.2,
    chorus: 0.2,
    delay: 0.2,
    cutoff: 0.5,
    soundIndex: 0,
  })

describe('the effects list', () => {
  it('follows the photographed menu order, not the prose', () => {
    /*
     * research/13 §M3 flags the conflict: §8.1's prose lists Reverb, Delay,
     * Chorus but the menu photographed on PDF p12 reads Reverb, Chorus, Delay.
     * The picture wins for the first three.
     */
    expect(FX_SLOTS.slice(0, 3).map((f) => f.label)).toEqual(['Reverb', 'Chorus', 'Delay'])
    // …and the prose supplies the tail.
    expect(FX_SLOTS.map((f) => f.label)).toEqual([
      'Reverb',
      'Chorus',
      'Delay',
      'Phaser',
      'Flanger',
      'Drive',
      'Tremolo',
      'Ensemble',
      'Filter',
    ])
  })

  it('puts Exit first, as a row rather than a gesture', () => {
    // PDF p12 and p20 both show it that way; there is no back button.
    expect(FX_EXIT_ROW).toBe(0)
    expect(fxSlotAt(FX_EXIT_ROW)).toBeUndefined()
    expect(FX_ROWS).toBe(FX_SLOTS.length + 1)
    expect(fxSlotAt(1)!.label).toBe('Reverb')
  })

  it('shows two-digit amounts on the instrument 0-99 scale', () => {
    expect(fxLevel(0)).toBe('00')
    expect(fxLevel(1)).toBe('99')
    expect(fxLevel(0.05)).toBe('05') // as PDF p12 shows Reverb
  })
})

describe('the most prominent effect', () => {
  it('is whichever one the preset leans on hardest', () => {
    expect(prominentFx({ reverb: 0.5, chorus: 0.1, delay: 0.1 })).toBe('reverb')
    expect(prominentFx({ reverb: 0.1, chorus: 0.5, delay: 0.1 })).toBe('chorus')
    expect(prominentFx({ reverb: 0.1, chorus: 0.1, delay: 0.5 })).toBe('delay')
  })

  it('always names an effect the rack can actually reach', () => {
    for (const sound of SOUNDS) {
      const id = prominentFx(sound)
      expect(FX_SLOTS.find((f) => f.id === id)?.built).toBe(true)
    }
  })
})

describe('browse and adjust', () => {
  beforeEach(reset)

  it('moves the cursor while browsing and clamps at both ends', () => {
    const s = () => usePanel.getState()
    s().moveFxCursor(-5)
    expect(s().fxCursor).toBe(0) // stops on Exit, no wrap to the bottom
    s().moveFxCursor(99)
    expect(s().fxCursor).toBe(FX_ROWS - 1)
  })

  it('commits a row into adjust, and comes back out', () => {
    const s = () => usePanel.getState()
    usePanel.setState({ screenList: 2, fxCursor: 1 })
    expect(s().fxAdjusting).toBe(false)
    s().pressFx()
    expect(s().fxAdjusting).toBe(true)
    s().pressFx()
    expect(s().fxAdjusting).toBe(false)
  })

  it('turns into a level only once committed', () => {
    const s = () => usePanel.getState()
    usePanel.setState({ screenList: 2, fxCursor: 1, reverb: 0.2 })
    // Browsing: the knob moves the cursor, not the value.
    s().moveFxCursor(1)
    expect(s().reverb).toBeCloseTo(0.2, 5)
    // Adjusting: it moves the value.
    usePanel.setState({ fxCursor: 1 })
    s().pressFx()
    s().nudgeFxSelected(5)
    expect(s().reverb).toBeGreaterThan(0.2)
  })

  it('leaves the menu when Exit is pressed', () => {
    const s = () => usePanel.getState()
    usePanel.setState({ screenList: 2, fxCursor: FX_EXIT_ROW, fxAdjusting: true })
    s().pressFx()
    expect(s().screenList).toBeNull()
    expect(s().fxAdjusting).toBe(false)
  })

  it('refuses to adjust a row we have not built', () => {
    const s = () => usePanel.getState()
    const phaser = FX_SLOTS.findIndex((f) => f.id === 'phaser') + 1
    usePanel.setState({ screenList: 2, fxCursor: phaser })
    s().pressFx()
    // No adjust state to enter, so nothing to leave either.
    expect(s().fxAdjusting).toBe(false)
    s().nudgeFxSelected(5)
    expect(s().reverb).toBeCloseTo(0.2, 5)
  })
})

describe('FX lock', () => {
  beforeEach(reset)

  it('lets a new sound bring its own effects', () => {
    const s = () => usePanel.getState()
    // Find a sound whose reverb differs from sound 01, so the change is visible.
    const target = SOUNDS.findIndex((snd) => Math.abs(snd.reverb - SOUNDS[0]!.reverb) > 0.05)
    expect(target).toBeGreaterThan(0)
    s().setSound(target)
    expect(s().reverb).toBeCloseTo(SOUNDS[target]!.reverb, 5)
    expect(s().chorus).toBeCloseTo(SOUNDS[target]!.chorus, 5)
  })

  it('holds the rack still when locked', () => {
    const s = () => usePanel.getState()
    usePanel.setState({ fxLock: true, reverb: 0.7, chorus: 0.1, delay: 0.05 })
    const target = SOUNDS.findIndex((snd) => Math.abs(snd.reverb - 0.7) > 0.1)
    s().setSound(target)
    expect(s().soundIndex).toBe(target)
    // The rack you built survives the change of sound — the point of the lock.
    expect(s().reverb).toBeCloseTo(0.7, 5)
    expect(s().chorus).toBeCloseTo(0.1, 5)
  })

  it('reads amounts back through the same accessor the menu uses', () => {
    const s = () => usePanel.getState()
    usePanel.setState({ reverb: 0.4, chorus: 0.3, delay: 0.2, cutoff: 0.6 })
    expect(fxAmountOf(s(), 'reverb')).toBeCloseTo(0.4, 5)
    expect(fxAmountOf(s(), 'chorus')).toBeCloseTo(0.3, 5)
    expect(fxAmountOf(s(), 'delay')).toBeCloseTo(0.2, 5)
    expect(fxAmountOf(s(), 'filter')).toBeCloseTo(0.6, 5)
    // Unbuilt slots read as nothing rather than as silence-at-zero.
    expect(fxAmountOf(s(), 'phaser')).toBe(0)
  })
})
