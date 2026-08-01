import { describe, expect, test } from 'vitest'

import {
  barSeconds,
  DEFAULT_TIME_SIGNATURE,
  quartersPerBar,
  stepsPerBar,
  TIME_SIGNATURES,
  timeSignatureAt,
  timeSignatureLabel,
} from './timeSignature.js'

describe('time signatures', () => {
  test('4/4 is the default and the first in the list', () => {
    expect(timeSignatureLabel(DEFAULT_TIME_SIGNATURE)).toBe('4/4')
    expect(TIME_SIGNATURES[0]).toBe(DEFAULT_TIME_SIGNATURE)
  })

  test('all are labelled as written', () => {
    expect(TIME_SIGNATURES.map(timeSignatureLabel)).toEqual([
      '4/4',
      '3/4',
      '2/4',
      '5/4',
      '6/8',
      '7/8',
    ])
  })

  /*
   * The trap: tempo is quarter notes per minute whatever the meter, so 6/8 is
   * three quarters to the bar and not six. Multiplying by the numerator would
   * make a 6/8 bar twice as long as it should be.
   */
  test('a bar is measured in quarter notes, not in beats', () => {
    expect(quartersPerBar({ beats: 4, unit: 4 })).toBe(4)
    expect(quartersPerBar({ beats: 3, unit: 4 })).toBe(3)
    expect(quartersPerBar({ beats: 6, unit: 8 })).toBe(3)
    expect(quartersPerBar({ beats: 7, unit: 8 })).toBe(3.5)
  })

  test('6/8 and 3/4 are the same length, as they must be', () => {
    expect(barSeconds({ beats: 6, unit: 8 }, 120)).toBe(barSeconds({ beats: 3, unit: 4 }, 120))
  })

  test('a 4/4 bar at 120bpm is two seconds', () => {
    expect(barSeconds({ beats: 4, unit: 4 }, 120)).toBe(2)
  })

  test('the sixteenth grid follows the meter', () => {
    expect(stepsPerBar({ beats: 4, unit: 4 })).toBe(16)
    expect(stepsPerBar({ beats: 3, unit: 4 })).toBe(12)
    expect(stepsPerBar({ beats: 7, unit: 8 })).toBe(14)
  })

  test('the index wraps in both directions', () => {
    expect(timeSignatureAt(0)).toBe(TIME_SIGNATURES[0])
    expect(timeSignatureAt(TIME_SIGNATURES.length)).toBe(TIME_SIGNATURES[0])
    expect(timeSignatureAt(-1)).toBe(TIME_SIGNATURES.at(-1))
  })

  test('every meter gives a positive, finite bar', () => {
    for (const ts of TIME_SIGNATURES) {
      const s = barSeconds(ts, 96)
      expect(s).toBeGreaterThan(0)
      expect(Number.isFinite(s)).toBe(true)
    }
  })
})
