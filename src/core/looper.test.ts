/**
 * Recording and quantization.
 *
 * The awkward cases are the ones that matter: a chord held across the loop
 * point, and a note played a hair early that should land *on* the downbeat
 * rather than at the very end of the bar.
 */

import { describe, expect, it } from 'vitest'

import { quantize, Recorder } from './looper.js'
import type { LoopEvent } from './looper.js'

const ev = (over: Partial<LoopEvent> = {}): LoopEvent => ({
  time: 0,
  note: 60,
  velocity: 0.8,
  duration: 0.5,
  stream: 'chord',
  ...over,
})

describe('Recorder', () => {
  it('pairs a note on with its note off', () => {
    const r = new Recorder()
    r.noteOn(0.25, 60, 0.8, 'chord')
    r.noteOff(0.75, 60, 'chord')
    expect(r.finish(2)).toEqual([
      { time: 0.25, note: 60, velocity: 0.8, duration: 0.5, stream: 'chord' },
    ])
  })

  it('closes notes still held when the pass ends', () => {
    // Holding a pad across the loop point is exactly how people play into a
    // looper, so the note must be kept rather than dropped.
    const r = new Recorder()
    r.noteOn(1.5, 64, 0.7, 'chord')
    const events = r.finish(2)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ note: 64, time: 1.5, duration: 0.5 })
  })

  it('keeps chord and bass streams apart', () => {
    const r = new Recorder()
    r.noteOn(0, 60, 0.8, 'chord')
    r.noteOn(0, 36, 0.9, 'bass')
    r.noteOff(0.5, 60, 'chord')
    r.noteOff(1, 36, 'bass')
    const events = r.finish(2)
    expect(events.map((e) => e.stream).sort()).toEqual(['bass', 'chord'])
    expect(events.find((e) => e.stream === 'bass')?.duration).toBe(1)
  })

  it('ignores a release with no matching press', () => {
    const r = new Recorder()
    r.noteOff(0.5, 60, 'chord')
    expect(r.finish(2)).toEqual([])
  })

  it('never records a zero-length note', () => {
    const r = new Recorder()
    r.noteOn(0.5, 60, 0.8, 'chord')
    r.noteOff(0.5, 60, 'chord')
    expect(r.finish(2)[0]!.duration).toBeGreaterThan(0)
  })

  it('clamps a note longer than the loop', () => {
    const r = new Recorder()
    r.noteOn(0, 60, 0.8, 'chord')
    r.noteOff(9, 60, 'chord')
    expect(r.finish(2)[0]!.duration).toBe(2)
  })
})

describe('quantize', () => {
  const bpm = 120 // one beat = 0.5s

  it('leaves everything alone when off', () => {
    const events = [ev({ time: 0.31 })]
    expect(quantize(events, 'off', bpm, 2)[0]!.time).toBe(0.31)
  })

  it('snaps to the nearest gridline', () => {
    // Eighths at 120bpm are 0.25s apart.
    expect(quantize([ev({ time: 0.27 })], '1/8', bpm, 2)[0]!.time).toBeCloseTo(0.25)
    expect(quantize([ev({ time: 0.23 })], '1/8', bpm, 2)[0]!.time).toBeCloseTo(0.25)
  })

  it('wraps a note played just before the downbeat to zero', () => {
    // Played a hair early at the end of a 2s loop. It belongs on the top of the
    // next pass, not stranded at the very end of this one.
    expect(quantize([ev({ time: 1.98 })], '1/4', bpm, 2)[0]!.time).toBe(0)
  })

  it('does not quantize durations', () => {
    // Snapping note lengths turns a legato pad into a stutter.
    const out = quantize([ev({ time: 0.27, duration: 0.31 })], '1/8', bpm, 2)
    expect(out[0]!.duration).toBe(0.31)
  })

  it('returns events in time order', () => {
    const out = quantize([ev({ time: 1.2 }), ev({ time: 0.1 })], '1/16', bpm, 2)
    expect(out[0]!.time).toBeLessThan(out[1]!.time)
  })

  it('handles triplet grids', () => {
    // Eighth-triplets at 120bpm are 1/6s apart.
    expect(quantize([ev({ time: 0.16 })], '1/8t', bpm, 2)[0]!.time).toBeCloseTo(1 / 6, 3)
  })
})
