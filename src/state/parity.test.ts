/**
 * The parity gate.
 *
 * Out of the box this is an ORC-1 and nothing else. The features we added
 * because a browser can — a progression sequencer, MIDI export, an editable
 * drum grid, the five extra modes, the re-mapped root layouts — all sit behind
 * one switch, off by default.
 *
 * These tests exist because the gate is easy to *say* you have and easy to
 * leave unwired. Each one drives a store action directly, which is the
 * chokepoint every caller passes through, and asserts the state did not move.
 *
 * See research/11-webapp-implications.md §6.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { usePanel } from './panel.js'

const s = () => usePanel.getState()

function reset(extended: boolean) {
  usePanel.setState({
    extended,
    progArmed: false,
    progStep: 0,
    progression: { steps: [] },
    key: { tonic: 0, tonality: 'major' },
    rootLayout: 'chromatic',
  })
  s().selectBeat(0)
}

describe('parity gate', () => {
  beforeEach(() => reset(false))

  it('is off by default', () => {
    // Not asserted through `reset` — this is the shipped default.
    expect(usePanel.getInitialState().extended).toBe(false)
  })

  describe('locked (hardware only)', () => {
    it('will not arm the progression', () => {
      s().toggleProgArmed()
      expect(s().progArmed).toBe(false)
    })

    it('will not capture a progression step', () => {
      s().captureStep({ root: 0, types: ['maj'], extensions: [], bars: 1 })
      expect(s().progression.steps).toHaveLength(0)
    })

    it('will not edit a beat', () => {
      const before = s().beat
      s().toggleBeatHit('kick', 3)
      s().clearBeat()
      expect(s().beat).toBe(before)
    })

    it('cycles only major and minor', () => {
      const seen = new Set<string>()
      for (let i = 0; i < 8; i++) {
        s().cycleMode(1)
        seen.add(s().key.tonality)
      }
      expect([...seen].sort()).toEqual(['major', 'minor'])
    })

    it('holds the root layout chromatic', () => {
      s().cycleRootLayout(1)
      expect(s().rootLayout).toBe('chromatic')
    })
  })

  describe('unlocked', () => {
    beforeEach(() => reset(true))

    it('arms and captures', () => {
      s().toggleProgArmed()
      expect(s().progArmed).toBe(true)
      s().captureStep({ root: 0, types: ['maj'], extensions: [], bars: 1 })
      expect(s().progression.steps).toHaveLength(1)
    })

    it('edits a beat', () => {
      const before = s().beat
      s().toggleBeatHit('kick', 3)
      expect(s().beat).not.toBe(before)
    })

    it('reaches the extra modes', () => {
      const seen = new Set<string>()
      for (let i = 0; i < 12; i++) {
        s().cycleMode(1)
        seen.add(s().key.tonality)
      }
      expect(seen.size).toBeGreaterThan(2)
    })
  })

  /**
   * Turning Extended off must also put down whatever it alone could pick up —
   * otherwise the instrument sits in a state the hardware has no name for while
   * claiming to be in parity.
   */
  it('surrenders extended state on the way out', () => {
    reset(true)
    s().cycleMode(1)
    s().cycleMode(1)
    s().cycleRootLayout(1)
    s().toggleProgArmed()
    expect(s().progArmed).toBe(true)

    s().toggleExtended()

    expect(s().extended).toBe(false)
    expect(s().progArmed).toBe(false)
    expect(s().rootLayout).toBe('chromatic')
    expect(['major', 'minor']).toContain(s().key.tonality)
  })
})
