import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  addStep,
  emptyProgression,
  isEmpty,
  isStepBoundary,
  MAX_BARS_PER_STEP,
  MAX_STEPS,
  moveStep,
  removeStep,
  replaceStep,
  setStepBars,
  stepAtBar,
  stepStarts,
  totalBars,
} from './progression.js'
import type { Progression, ProgressionStep } from './progression.js'

const step = (root: number, bars = 1): ProgressionStep => ({
  root,
  types: ['maj'],
  extensions: [],
  bars,
})

const build = (...steps: ProgressionStep[]): Progression =>
  steps.reduce((p, s) => addStep(p, s), emptyProgression())

describe('editing', () => {
  test('starts empty', () => {
    expect(isEmpty(emptyProgression())).toBe(true)
    expect(totalBars(emptyProgression())).toBe(0)
  })

  test('appends steps', () => {
    const p = build(step(0), step(5), step(7))
    expect(p.steps.map((s) => s.root)).toEqual([0, 5, 7])
    expect(totalBars(p)).toBe(3)
  })

  test('replaces a step in place', () => {
    const p = replaceStep(build(step(0), step(5)), 1, step(7))
    expect(p.steps.map((s) => s.root)).toEqual([0, 7])
  })

  test('removes a step', () => {
    expect(removeStep(build(step(0), step(5), step(7)), 1).steps.map((s) => s.root)).toEqual([0, 7])
  })

  test('reorders', () => {
    const p = build(step(0), step(5), step(7))
    expect(moveStep(p, 2, 0).steps.map((s) => s.root)).toEqual([7, 0, 5])
    expect(moveStep(p, 0, 2).steps.map((s) => s.root)).toEqual([5, 7, 0])
  })

  test('out-of-range edits are ignored rather than throwing', () => {
    const p = build(step(0))
    expect(replaceStep(p, 9, step(3))).toBe(p)
    expect(removeStep(p, -1)).toBe(p)
    expect(moveStep(p, 9, 0)).toBe(p)
    expect(setStepBars(p, 9, 4)).toBe(p)
  })

  test('bar counts are clamped to something playable', () => {
    expect(addStep(emptyProgression(), step(0, 0)).steps[0]!.bars).toBe(1)
    expect(addStep(emptyProgression(), step(0, 99)).steps[0]!.bars).toBe(MAX_BARS_PER_STEP)
    expect(addStep(emptyProgression(), step(0, 2.6)).steps[0]!.bars).toBe(3)
  })

  test('refuses to grow past the cap', () => {
    let p = emptyProgression()
    for (let i = 0; i < MAX_STEPS + 5; i++) p = addStep(p, step(i % 12))
    expect(p.steps).toHaveLength(MAX_STEPS)
  })

  test('edits never mutate the original', () => {
    const p = build(step(0), step(5))
    const before = JSON.stringify(p)
    addStep(p, step(7))
    removeStep(p, 0)
    moveStep(p, 0, 1)
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe('timing', () => {
  test('step start bars accumulate', () => {
    expect(stepStarts(build(step(0, 2), step(5, 1), step(7, 4)))).toEqual([0, 2, 3])
  })

  test('finds the step sounding on each bar', () => {
    const p = build(step(0, 2), step(5, 1), step(7, 1)) // 4 bars total
    expect([0, 1, 2, 3].map((b) => stepAtBar(p, b))).toEqual([0, 0, 1, 2])
  })

  test('wraps forever', () => {
    const p = build(step(0, 2), step(5, 1), step(7, 1))
    expect([4, 5, 6, 7].map((b) => stepAtBar(p, b))).toEqual([0, 0, 1, 2])
    expect(stepAtBar(p, 400)).toBe(stepAtBar(p, 0))
  })

  test('handles bars before zero', () => {
    const p = build(step(0, 2), step(5, 2))
    expect(stepAtBar(p, -1)).toBe(1)
    expect(stepAtBar(p, -4)).toBe(0)
  })

  test('an empty progression reports no step instead of throwing', () => {
    // Playback polls this every bar; empty is an ordinary state.
    expect(stepAtBar(emptyProgression(), 0)).toBe(-1)
    expect(isStepBoundary(emptyProgression(), 0)).toBe(false)
  })

  test('boundaries are where chords re-trigger', () => {
    const p = build(step(0, 2), step(5, 1)) // starts at bars 0 and 2
    expect([0, 1, 2].map((b) => isStepBoundary(p, b))).toEqual([true, false, true])
    expect(isStepBoundary(p, 3)).toBe(true) // wraps to bar 0
  })
})

describe('properties', () => {
  const arbStep = fc.record({
    root: fc.integer({ min: 0, max: 11 }),
    types: fc.constant(['maj'] as const),
    extensions: fc.constant([]),
    bars: fc.integer({ min: 1, max: MAX_BARS_PER_STEP }),
  })
  const arbProgression = fc
    .array(arbStep, { minLength: 1, maxLength: 8 })
    .map((steps) => steps.reduce((p, s) => addStep(p, s as ProgressionStep), emptyProgression()))

  test('every bar maps to a real step', () => {
    fc.assert(
      fc.property(arbProgression, fc.integer({ min: -200, max: 200 }), (p, bar) => {
        const i = stepAtBar(p, bar)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(p.steps.length)
      }),
    )
  })

  test('each step occupies exactly its own bars', () => {
    fc.assert(
      fc.property(arbProgression, (p) => {
        const counts = new Map<number, number>()
        for (let bar = 0; bar < totalBars(p); bar++) {
          const i = stepAtBar(p, bar)
          counts.set(i, (counts.get(i) ?? 0) + 1)
        }
        p.steps.forEach((s, i) => expect(counts.get(i)).toBe(s.bars))
      }),
    )
  })

  test('reordering preserves the set of chords and the total length', () => {
    fc.assert(
      fc.property(
        arbProgression,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        (p, from, to) => {
          const moved = moveStep(p, from % p.steps.length, to % p.steps.length)
          expect(moved.steps).toHaveLength(p.steps.length)
          expect(totalBars(moved)).toBe(totalBars(p))
          expect([...moved.steps].sort().length).toBe([...p.steps].sort().length)
        },
      ),
    )
  })
})
