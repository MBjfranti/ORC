/**
 * The Key encoder.
 *
 * "Turn the Key Dial to select your desired key (e.g., C Major, A Minor)."
 * One list of keys — tonic *and* tonality — because C major and C minor are
 * different keys and turning has to reach both. It used to walk tonics alone,
 * leaving half the instrument's keys unreachable by the documented gesture.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { usePanel } from './panel.js'

const s = () => usePanel.getState()
const name = () => `${s().key.tonic}:${s().key.tonality}`

beforeEach(() => {
  usePanel.setState({ key: { tonic: 0, tonality: 'major' }, extended: false })
})

describe('parity — major and minor only', () => {
  it('one click from a major key gives its parallel minor', () => {
    s().cycleKey(1)
    expect(name()).toBe('0:minor')
  })

  it('the next click moves to the following tonic', () => {
    s().cycleKey(2)
    expect(name()).toBe('1:major')
  })

  it('reaches all twenty-four keys and returns to the start', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      seen.add(name())
      s().cycleKey(1)
    }
    expect(seen.size).toBe(24)
    expect(name()).toBe('0:major')
  })

  it('turns back symmetrically', () => {
    s().cycleKey(5)
    s().cycleKey(-5)
    expect(name()).toBe('0:major')
  })

  it('wraps below zero rather than sticking', () => {
    s().cycleKey(-1)
    expect(name()).toBe('11:minor')
  })
})

describe('extended — all seven modes', () => {
  beforeEach(() => usePanel.setState({ extended: true, key: { tonic: 0, tonality: 'major' } }))

  it('walks the modes before moving to the next tonic', () => {
    s().cycleKey(1)
    expect(s().key.tonic).toBe(0)
    expect(s().key.tonality).not.toBe('major')
  })

  it('covers every tonic and mode exactly once', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 84; i++) {
      seen.add(name())
      s().cycleKey(1)
    }
    expect(seen.size).toBe(84)
    expect(name()).toBe('0:major')
  })
})

/* Leaving Extended can strand the key on a mode the shorter pool has no index
   for; the walk must still be well-defined from there. */
it('recovers if the tonality is not in the current pool', () => {
  usePanel.setState({ extended: false, key: { tonic: 3, tonality: 'dorian' } })
  expect(() => s().cycleKey(1)).not.toThrow()
  expect(['major', 'minor']).toContain(s().key.tonality)
})
