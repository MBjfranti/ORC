/**
 * The Perform encoder.
 *
 * Two behaviours the manual states plainly and the panel did not have:
 * turning fully left is Off, and press-and-hold locks the mode so it survives
 * browsing sounds. See research/06-performance-modes.md §Access.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { PERFORM_MODES } from '../core/performance.js'
import { PRESETS } from '../engine/presets.js'
import { usePanel } from './panel.js'

const s = () => usePanel.getState()

/** A factory sound that arrives with an articulation, and one that doesn't. */
const articulated = PRESETS.findIndex((p) => p.perform && p.perform !== 'off')
const plain = PRESETS.findIndex((p) => !p.perform)

beforeEach(() => {
  usePanel.setState({
    performMode: 'off',
    performAmount: 0.5,
    performLock: false,
    soundIndex: 0,
    userSounds: usePanel.getInitialState().userSounds,
  })
})

describe('turning', () => {
  it('reaches Off by turning fully left, not by wrapping right', () => {
    usePanel.setState({ performMode: 'arp' })
    for (let i = 0; i < 20; i++) s().cyclePerformMode(-1)
    expect(s().performMode).toBe('off')
  })

  /* The bug this replaced: `off` was reachable only by turning *right* past
     Harp, so there was no way to switch performance off by feel. */
  it('does not wrap off the left end into Harp', () => {
    s().cyclePerformMode(-1)
    expect(s().performMode).toBe('off')
  })

  it('stops at the right end rather than returning to Off', () => {
    for (let i = 0; i < 20; i++) s().cyclePerformMode(1)
    expect(s().performMode).toBe(PERFORM_MODES.at(-1))
  })
})

describe('perform lock', () => {
  it('is off by default and toggles', () => {
    expect(usePanel.getInitialState().performLock).toBe(false)
    s().togglePerformLock()
    expect(s().performLock).toBe(true)
  })

  it('sounds carry an articulation, so browsing changes the mode', () => {
    expect(articulated).toBeGreaterThanOrEqual(0)
    s().selectSound(articulated)
    expect(s().performMode).toBe(PRESETS[articulated]!.perform)
  })

  it('a sound without one browses back to Off', () => {
    s().selectSound(articulated)
    s().selectSound(plain)
    expect(s().performMode).toBe('off')
  })

  /** The whole point: pin the articulation, browse the timbre. */
  it('locked, the mode survives browsing sounds', () => {
    usePanel.setState({ performMode: 'pattern', performAmount: 0.9, performLock: true })
    s().selectSound(articulated)
    expect(s().performMode).toBe('pattern')
    expect(s().performAmount).toBe(0.9)
    s().selectSound(plain)
    expect(s().performMode).toBe('pattern')
  })

  it('locked, the sound itself still changes', () => {
    usePanel.setState({ performMode: 'pattern', performLock: true })
    s().selectSound(articulated)
    expect(s().presetIndex).toBe(articulated)
    expect(s().soundIndex).toBe(articulated)
  })

  it('locked, a user sound cannot drag its performance in either', () => {
    usePanel.setState({ performMode: 'harp', performLock: true })
    s().applyUserSound({
      name: 'Test',
      presetIndex: plain,
      cutoff: 0.2,
      fx: usePanel.getInitialState().fxAmounts,
      performMode: 'arp',
      performAmount: 0.1,
    })
    expect(s().performMode).toBe('harp')
    // Everything else about the sound still lands.
    expect(s().userSoundName).toBe('Test')
    expect(s().cutoff).toBe(0.2)
  })
})
