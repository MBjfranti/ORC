import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  allEvents,
  barsToSeconds,
  clearLayers,
  emptyLoop,
  isEmpty,
  layerCount,
  LoopRecorder,
  QUANTIZE_ORDER,
  quantizeEvents,
  undoLayer,
  withLayer,
} from './looper.js'
import type { LoopEvent } from './looper.js'

const ev = (time: number, note = 60, duration = 0.5): LoopEvent => ({
  time,
  note,
  velocity: 0.8,
  duration,
  stream: 'performance',
})

describe('loop length', () => {
  test('bars convert at 4/4', () => {
    expect(barsToSeconds(1, 120)).toBe(2) // 4 beats at 0.5s
    expect(barsToSeconds(4, 120)).toBe(8)
    expect(barsToSeconds(2, 60)).toBe(8)
  })
})

describe('layers', () => {
  test('a fresh loop is empty', () => {
    const loop = emptyLoop(4, 2)
    expect(isEmpty(loop)).toBe(true)
    expect(layerCount(loop)).toBe(0)
  })

  test('overdubs stack', () => {
    let loop = emptyLoop(4, 2)
    loop = withLayer(loop, [ev(0)])
    loop = withLayer(loop, [ev(1)])
    expect(layerCount(loop)).toBe(2)
    expect(allEvents(loop)).toHaveLength(2)
  })

  test('undo peels off one pass at a time', () => {
    let loop = emptyLoop(4, 2)
    loop = withLayer(loop, [ev(0)])
    loop = withLayer(loop, [ev(1)])
    loop = undoLayer(loop)
    expect(layerCount(loop)).toBe(1)
    expect(allEvents(loop).map((e) => e.time)).toEqual([0])
  })

  test('undoing past the last layer leaves an empty loop, not nothing', () => {
    // The length survives, so you can record into it again without re-choosing.
    let loop = withLayer(emptyLoop(4, 2), [ev(0)])
    loop = undoLayer(loop)
    expect(isEmpty(loop)).toBe(true)
    expect(loop.lengthSeconds).toBe(4)
    expect(loop.bars).toBe(2)
  })

  test('empty passes are dropped so undo never no-ops', () => {
    const loop = withLayer(emptyLoop(4, 2), [])
    expect(layerCount(loop)).toBe(0)
  })

  test('clear removes everything but keeps the length', () => {
    const loop = clearLayers(withLayer(emptyLoop(4, 2), [ev(0), ev(1)]))
    expect(isEmpty(loop)).toBe(true)
    expect(loop.lengthSeconds).toBe(4)
  })

  test('events come back in time order across layers', () => {
    let loop = emptyLoop(4, 2)
    loop = withLayer(loop, [ev(3), ev(1)])
    loop = withLayer(loop, [ev(2), ev(0)])
    expect(allEvents(loop).map((e) => e.time)).toEqual([0, 1, 2, 3])
  })
})

describe('quantize', () => {
  test('off leaves timing untouched', () => {
    const events = [ev(0.13), ev(0.47)]
    expect(quantizeEvents(events, 'off', 120, 4).map((e) => e.time)).toEqual([0.13, 0.47])
  })

  test('snaps to the nearest gridline', () => {
    // At 120bpm an eighth is 0.25s.
    const out = quantizeEvents([ev(0.23), ev(0.6)], '1/8', 120, 4)
    expect(out[0]!.time).toBeCloseTo(0.25, 6)
    expect(out[1]!.time).toBeCloseTo(0.5, 6)
  })

  test('a note just before the downbeat wraps to zero, not to the end', () => {
    // Playing a hair early should land on the beat, not at the loop's tail.
    const out = quantizeEvents([ev(3.98)], '1/4', 120, 4)
    expect(out[0]!.time).toBe(0)
  })

  test('durations are never quantized', () => {
    const out = quantizeEvents([ev(0.23, 60, 0.37)], '1/8', 120, 4)
    expect(out[0]!.duration).toBe(0.37)
  })

  test('every grid keeps events inside the loop', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...QUANTIZE_ORDER),
        fc.double({ min: 0, max: 3.99, noNaN: true }),
        (grid, time) => {
          const out = quantizeEvents([ev(time)], grid, 120, 4)
          expect(out[0]!.time).toBeGreaterThanOrEqual(0)
          expect(out[0]!.time).toBeLessThan(4)
        },
      ),
    )
  })
})

describe('recorder', () => {
  test('pairs attacks with releases into durations', () => {
    const r = new LoopRecorder()
    r.noteOn(0.5, 60, 0.8, 'performance')
    r.noteOff(1.25, 60, 'performance')
    const events = r.finish(4)
    expect(events).toHaveLength(1)
    expect(events[0]!.time).toBe(0.5)
    expect(events[0]!.duration).toBeCloseTo(0.75, 6)
  })

  test('notes still held at the end are clamped, not dropped', () => {
    const r = new LoopRecorder()
    r.noteOn(3, 60, 0.8, 'performance')
    const events = r.finish(4)
    expect(events).toHaveLength(1)
    expect(events[0]!.duration).toBeCloseTo(1, 6)
  })

  test('keeps performance and bass apart', () => {
    const r = new LoopRecorder()
    r.noteOn(0, 60, 0.8, 'performance')
    r.noteOn(0, 60, 0.8, 'bass')
    r.noteOff(1, 60, 'bass')
    const events = r.finish(4)
    expect(events).toHaveLength(2)
    expect(new Set(events.map((e) => e.stream))).toEqual(new Set(['performance', 'bass']))
  })

  test('a release with no matching attack is ignored', () => {
    const r = new LoopRecorder()
    r.noteOff(1, 60, 'performance')
    expect(r.finish(4)).toHaveLength(0)
  })

  test('events land in time order and inside the loop', () => {
    const r = new LoopRecorder()
    r.noteOn(2, 62, 0.8, 'performance')
    r.noteOff(2.5, 62, 'performance')
    r.noteOn(0.5, 60, 0.8, 'performance')
    r.noteOff(1, 60, 'performance')
    r.noteOn(9, 64, 0.8, 'performance') // past the end
    r.noteOff(9.5, 64, 'performance')
    const events = r.finish(4)
    expect(events.map((e) => e.note)).toEqual([60, 62])
  })

  test('finishing resets it for the next pass', () => {
    const r = new LoopRecorder()
    r.noteOn(0, 60, 0.8, 'performance')
    r.noteOff(1, 60, 'performance')
    expect(r.finish(4)).toHaveLength(1)
    expect(r.finish(4)).toHaveLength(0)
  })

  test('every recorded note has positive duration', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            on: fc.double({ min: 0, max: 3.9, noNaN: true }),
            len: fc.double({ min: 0, max: 2, noNaN: true }),
            note: fc.integer({ min: 40, max: 90 }),
          }),
          { maxLength: 12 },
        ),
        (notes) => {
          const r = new LoopRecorder()
          notes.forEach((n, i) => {
            r.noteOn(n.on, n.note + i, 0.8, 'performance')
            r.noteOff(n.on + n.len, n.note + i, 'performance')
          })
          for (const e of r.finish(4)) expect(e.duration).toBeGreaterThan(0)
        },
      ),
    )
  })
})
