import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  BEATS,
  clearHits,
  DRUM_VOICES,
  isEdited,
  setSwing,
  stepSeconds,
  swingOffset,
  toggleHit,
  voicesAt,
} from './beats.js'

describe('patterns', () => {
  test('every beat has a unique id and a name', () => {
    expect(new Set(BEATS.map((b) => b.id)).size).toBe(BEATS.length)
    for (const b of BEATS) expect(b.name.length).toBeGreaterThan(0)
  })

  test('every hit lands on a real step', () => {
    for (const beat of BEATS) {
      for (const voice of DRUM_VOICES) {
        for (const step of beat.hits[voice] ?? []) {
          expect(step).toBeGreaterThanOrEqual(0)
          expect(step).toBeLessThan(beat.steps)
        }
      }
    }
  })

  test('no voice fires twice on the same step', () => {
    for (const beat of BEATS) {
      for (const voice of DRUM_VOICES) {
        const steps = beat.hits[voice] ?? []
        expect(new Set(steps).size).toBe(steps.length)
      }
    }
  })

  test('every beat actually plays something', () => {
    for (const beat of BEATS) {
      const total = DRUM_VOICES.reduce((n, v) => n + (beat.hits[v]?.length ?? 0), 0)
      expect(total).toBeGreaterThan(2)
    }
  })

  test('every beat has a downbeat to lock onto', () => {
    for (const beat of BEATS) {
      expect(voicesAt(beat, 0).length).toBeGreaterThan(0)
    }
  })
})

describe('lookup', () => {
  const beat = BEATS[0]!

  test('reads the voices on a step', () => {
    expect(voicesAt(beat, 0)).toContain('kick')
    expect(voicesAt(beat, 4)).toContain('snare')
  })

  test('wraps past the end of the bar', () => {
    expect(voicesAt(beat, 16)).toEqual(voicesAt(beat, 0))
    expect(voicesAt(beat, 33)).toEqual(voicesAt(beat, 1))
  })

  test('handles negative steps', () => {
    expect(voicesAt(beat, -16)).toEqual(voicesAt(beat, 0))
  })
})

describe('swing', () => {
  test('delays off-beats only, so the pulse stays put', () => {
    const swung = BEATS.find((b) => b.swing > 0)!
    expect(swingOffset(swung, 0)).toBe(0)
    expect(swingOffset(swung, 2)).toBe(0)
    expect(swingOffset(swung, 1)).toBeGreaterThan(0)
    expect(swingOffset(swung, 3)).toBeGreaterThan(0)
  })

  test('straight patterns never shift', () => {
    const straight = BEATS.find((b) => b.swing === 0)!
    for (let i = 0; i < 16; i++) expect(swingOffset(straight, i)).toBe(0)
  })

  test('never pushes a step past the next one', () => {
    for (const beat of BEATS) {
      for (let i = 0; i < beat.steps; i++) {
        expect(swingOffset(beat, i)).toBeLessThan(1)
      }
    }
  })
})

describe('editing', () => {
  const beat = BEATS[0]!

  test('toggling adds and removes a hit', () => {
    const added = toggleHit(beat, 'tom', 5)
    expect(added.hits.tom).toContain(5)
    expect(toggleHit(added, 'tom', 5).hits.tom).not.toContain(5)
  })

  test('hits stay sorted', () => {
    let edited = clearHits(beat)
    for (const step of [9, 2, 14, 0]) edited = toggleHit(edited, 'kick', step)
    expect(edited.hits.kick).toEqual([0, 2, 9, 14])
  })

  test('editing never mutates the factory pattern', () => {
    const before = JSON.stringify(beat)
    toggleHit(beat, 'kick', 3)
    clearHits(beat)
    setSwing(beat, 0.5)
    expect(JSON.stringify(beat)).toBe(before)
  })

  test('an edited pattern is marked, so you know it is no longer the preset', () => {
    expect(isEdited(beat)).toBe(false)
    const edited = toggleHit(beat, 'kick', 3)
    expect(isEdited(edited)).toBe(true)
    expect(edited.name.startsWith(beat.name)).toBe(true)
  })

  test('the mark is applied once, not once per edit', () => {
    let edited = toggleHit(beat, 'kick', 3)
    edited = toggleHit(edited, 'snare', 5)
    edited = toggleHit(edited, 'hat', 7)
    expect(edited.name.match(/\*/g)).toHaveLength(1)
  })

  test('clearing empties every voice but keeps the grid', () => {
    const cleared = clearHits(beat)
    expect(DRUM_VOICES.every((v) => (cleared.hits[v] ?? []).length === 0)).toBe(true)
    expect(cleared.steps).toBe(beat.steps)
    expect(cleared.swing).toBe(beat.swing)
  })

  test('swing is clamped to something musical', () => {
    expect(setSwing(beat, -1).swing).toBe(0)
    expect(setSwing(beat, 5).swing).toBe(0.6)
  })

  test('toggling wraps out-of-range steps into the bar', () => {
    expect(toggleHit(beat, 'tom', 16).hits.tom).toEqual([0])
    expect(toggleHit(beat, 'tom', -1).hits.tom).toEqual([15])
  })
})

describe('timing', () => {
  test('sixteenths at 120bpm are 125ms', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 6)
  })

  test('a full bar is four beats', () => {
    fc.assert(
      fc.property(fc.integer({ min: 40, max: 220 }), (bpm) => {
        expect(stepSeconds(bpm) * 16).toBeCloseTo((60 / bpm) * 4, 6)
      }),
    )
  })
})
