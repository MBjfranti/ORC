/**
 * Every performance mode, against the summary table in
 * research/06-performance-modes.md §Summary.
 *
 * The column that matters most is **timing source**: Strum, Slop and Harp are a
 * fixed short delay, and the arpeggiators and Pattern are synced to the master
 * BPM. Getting that backwards is inaudible in a screenshot and obvious the
 * moment you change tempo.
 */

import { describe, expect, it } from 'vitest'

import { isCycle, PATTERN_COUNT, performChord, PERFORM_MODES } from './performance.js'
import type { OneShot, PerformMode } from './performance.js'

const TRIAD = [60, 64, 67]
const NINTH = [60, 64, 67, 70, 74]

const shot = (mode: PerformMode, opts = {}) =>
  performChord(TRIAD, mode, { amount: 0.5, ...opts }) as OneShot

describe('timing source', () => {
  /** The three that ride the master clock. */
  const synced: PerformMode[] = ['arp', 'arp2', 'pattern']

  it.each(synced)('%s follows the BPM', (mode) => {
    const slow = performChord(TRIAD, mode, { amount: 0.5, bpm: 60 })
    const fast = performChord(TRIAD, mode, { amount: 0.5, bpm: 120 })
    if (slow.kind !== 'cycle' || fast.kind !== 'cycle') throw new Error('expected cycles')
    // Twice the tempo, half the step.
    expect(fast.stepSeconds).toBeCloseTo(slow.stepSeconds / 2, 6)
  })

  const fixed: PerformMode[] = ['strum', 'strum2', 'slop']

  it.each(fixed)('%s is a fixed delay, not tempo-dependent', (mode) => {
    const at60 = shot(mode, { bpm: 60, random: () => 0.5 })
    const at180 = shot(mode, { bpm: 180, random: () => 0.5 })
    expect(at180.events.map((e) => e.time)).toEqual(at60.events.map((e) => e.time))
  })

  it('keeps every mode in one of the two families', () => {
    for (const mode of PERFORM_MODES) {
      const p = performChord(TRIAD, mode)
      expect(p.kind).toBe(isCycle(mode) ? 'cycle' : 'oneshot')
    }
  })
})

describe('note order and range', () => {
  it('strums low to high', () => {
    const p = shot('strum')
    const times = p.events.map((e) => e.time)
    expect(p.events.map((e) => e.note)).toEqual([...TRIAD].sort((a, b) => a - b))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('spans two octaves for Strum 2 Octaves', () => {
    const p = shot('strum2')
    expect(p.events).toHaveLength(TRIAD.length * 2)
    expect(Math.max(...p.events.map((e) => e.note))).toBe(Math.max(...TRIAD) + 12)
  })

  it('flows up and back down four octaves, on repeat', () => {
    // A single ascending sweep is just a wide strum. What reads as a harp is
    // that it keeps going and comes back.
    const p = performChord(TRIAD, 'harp', { amount: 0.5 })
    if (p.kind !== 'cycle') throw new Error('Harp should flow, not fire once')
    const up = TRIAD.length * 4
    expect(p.steps).toHaveLength(up + up - 2) // turn is exclusive at both ends
    expect(Math.max(...(p.steps as number[]))).toBe(Math.max(...TRIAD) + 36)
    expect(p.sustain).toBe(false)
  })

  it('lets the encoder set the pace of the harp notes', () => {
    const slow = performChord(TRIAD, 'harp', { amount: 0 })
    const fast = performChord(TRIAD, 'harp', { amount: 1 })
    if (slow.kind !== 'cycle' || fast.kind !== 'cycle') throw new Error('expected cycles')
    expect(fast.stepSeconds).toBeLessThan(slow.stepSeconds)
  })

  it('keeps Pattern and Harp legible by clearing each note', () => {
    // A repeating figure whose notes accumulate stops being a figure.
    for (const mode of ['pattern', 'harp'] as PerformMode[]) {
      const p = performChord(TRIAD, mode, { amount: 0.5 })
      if (p.kind === 'cycle') expect(p.sustain).toBe(false)
    }
  })

  it('builds the chord under the arpeggiators', () => {
    for (const mode of ['arp', 'arp2'] as PerformMode[]) {
      const p = performChord(TRIAD, mode, { amount: 0.5 })
      if (p.kind === 'cycle') expect(p.sustain).toBe(true)
    }
  })
})

describe('sequence length', () => {
  it('grows the arpeggio with the chord', () => {
    // The distinctive rule: add an extension and the sequence gets longer, so
    // the rhythm is a consequence of the harmony.
    for (const notes of [TRIAD, [60, 64, 67, 70], NINTH]) {
      const p = performChord(notes, 'arp', { amount: 0.5 })
      if (p.kind === 'cycle') expect(p.steps).toHaveLength(notes.length)
    }
  })

  it('doubles it at two octaves', () => {
    const p = performChord(TRIAD, 'arp2', { amount: 0.5 })
    if (p.kind === 'cycle') expect(p.steps).toHaveLength(TRIAD.length * 2)
  })

  it(`holds Pattern rhythm steady however many notes the chord has`, () => {
    // The direct complement to the arpeggiator.
    const a = performChord(TRIAD, 'pattern', { amount: 0 })
    const b = performChord(NINTH, 'pattern', { amount: 0 })
    if (a.kind !== 'cycle' || b.kind !== 'cycle') throw new Error('expected cycles')
    expect(a.steps).toHaveLength(b.steps.length)
    expect(a.steps.map((s) => s === null)).toEqual(b.steps.map((s) => s === null))
  })

  it('ships the eleven patterns the reviews describe', () => {
    expect(PATTERN_COUNT).toBe(11)
  })

  it('reaches every pattern from the amount dial', () => {
    const seen = new Set<string>()
    for (let a = 0; a <= 1.0001; a += 0.01) {
      const p = performChord(NINTH, 'pattern', { amount: a })
      if (p.kind === 'cycle') seen.add(p.steps.map((s) => s ?? '.').join(','))
    }
    expect(seen.size).toBe(PATTERN_COUNT)
  })
})

describe('slop', () => {
  it('re-randomises on every trigger', () => {
    // "Delivers slightly different timing each time you press a key."
    const once = shot('slop').events.map((e) => e.time).join()
    let n = 0
    const varying = () => [0.9, 0.1, 0.6, 0.3][n++ % 4]!
    const twice = shot('slop', { random: varying }).events.map((e) => e.time).join()
    expect(once).not.toBe(twice)
  })

  it('varies velocity as well as timing', () => {
    const p = shot('slop', { random: (() => { let n = 0; return () => [0.2, 0.8, 0.4, 0.9][n++ % 4]! })() })
    expect(new Set(p.events.map((e) => e.velocity)).size).toBeGreaterThan(1)
  })

  it('never schedules a note before the key went down', () => {
    for (const r of [0, 0.01, 0.5, 1]) {
      const p = shot('slop', { random: () => r })
      expect(p.events.every((e) => e.time >= 0)).toBe(true)
    }
  })
})

describe('off', () => {
  it('strikes the chord as a block', () => {
    const p = performChord(TRIAD, 'off')
    expect(p.kind).toBe('oneshot')
    if (p.kind === 'oneshot') expect(p.events.map((e) => e.time)).toEqual([0, 0, 0])
  })

  it('sits at the far left of the mode list, where turning down reaches it', () => {
    expect(PERFORM_MODES[0]).toBe('off')
  })
})
