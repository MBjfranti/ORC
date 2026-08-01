import { describe, expect, test } from 'vitest'
import { Midi } from '@tonejs/midi'

import { canExport, loopToMidi } from './midiExport.js'
import { emptyLoop, withLayer } from '../core/looper.js'
import type { LoopEvent } from '../core/looper.js'

const note = (
  time: number,
  midi: number,
  stream: LoopEvent['stream'] = 'performance',
  duration = 0.5,
): LoopEvent => ({ time, note: midi, velocity: 0.8, duration, stream })

/** Round-trip through the parser — the only honest check on written bytes. */
const parse = (loop: Parameters<typeof loopToMidi>[0], bpm = 120) =>
  new Midi(loopToMidi(loop, { bpm }))

describe('export', () => {
  test('writes the notes that were played', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60), note(1, 64), note(2, 67)])
    const out = parse(loop)
    const track = out.tracks.find((t) => t.name === 'Performance')!
    expect(track.notes.map((n) => n.midi)).toEqual([60, 64, 67])
    expect(track.notes.map((n) => n.time)).toEqual([0, 1, 2])
  })

  test('carries the tempo', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60)])
    expect(parse(loop, 96).header.tempos[0]!.bpm).toBeCloseTo(96, 3)
  })

  test('splits performance and bass onto separate tracks', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60), note(0, 36, 'bass')])
    const out = parse(loop)
    const names = out.tracks.map((t) => t.name)
    expect(names).toContain('Performance')
    expect(names).toContain('Bass')
    expect(out.tracks.find((t) => t.name === 'Bass')!.notes.map((n) => n.midi)).toEqual([36])
  })

  test('omits a track for a stream that was never played', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60)])
    expect(parse(loop).tracks.map((t) => t.name)).toEqual(['Performance'])
  })

  test('merges overdub layers into one timeline', () => {
    let loop = withLayer(emptyLoop(4, 2), [note(0, 60)])
    loop = withLayer(loop, [note(1, 64)])
    loop = withLayer(loop, [note(2, 67)])
    expect(parse(loop).tracks[0]!.notes).toHaveLength(3)
  })

  test('preserves note durations', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60, 'performance', 1.75)])
    expect(parse(loop).tracks[0]!.notes[0]!.duration).toBeCloseTo(1.75, 3)
  })

  test('marks the loop boundary with All Notes Off', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60, 'performance', 0.25)])
    const cc = parse(loop).tracks[0]!.controlChanges[123]
    expect(cc?.[0]?.time).toBeCloseTo(4, 3)
  })

  test('KNOWN LIMITATION: the file ends at the last note, not the loop end', () => {
    // Documented rather than hidden. @tonejs/midi derives length from notes
    // only, so a phrase that stops early exports short and will not tile in a
    // DAW without extending the region. Padding with an inaudible note would
    // fix the length at the cost of a phantom note in the piano roll.
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60, 'performance', 0.25)])
    const parsed = parse(loop)
    expect(parsed.duration).toBeCloseTo(0.25, 2)
    expect(parsed.duration).toBeLessThan(loop.lengthSeconds)
  })

  test('produces bytes a parser accepts', () => {
    const loop = withLayer(emptyLoop(4, 2), [note(0, 60), note(0, 36, 'bass')])
    const bytes = loopToMidi(loop, { bpm: 120, name: 'Test' })
    expect(bytes.length).toBeGreaterThan(20)
    expect(() => new Midi(bytes)).not.toThrow()
  })

  test('an empty loop still writes a valid file', () => {
    expect(() => new Midi(loopToMidi(emptyLoop(4, 2), { bpm: 120 }))).not.toThrow()
  })
})

describe('canExport', () => {
  test('needs an actual note', () => {
    expect(canExport(undefined)).toBe(false)
    expect(canExport(emptyLoop(4, 2))).toBe(false)
    expect(canExport(withLayer(emptyLoop(4, 2), []))).toBe(false)
    expect(canExport(withLayer(emptyLoop(4, 2), [note(0, 60)]))).toBe(true)
  })
})
