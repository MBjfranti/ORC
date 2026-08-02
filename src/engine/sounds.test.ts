/**
 * The library.
 *
 * These are not deep tests of taste — they guard the properties that make a
 * browse list usable: fifty of them, all distinct, all reachable, none silently
 * misconfigured in a way that would produce silence or a blown filter.
 */

import { describe, expect, it } from 'vitest'

import { soundAt, soundLabel, soundNumber, SOUNDS } from './sounds.js'

describe('the sound library', () => {
  it('holds fifty numbered sounds', () => {
    expect(SOUNDS).toHaveLength(50)
  })

  it('gives every sound its own name', () => {
    expect(new Set(SOUNDS.map((s) => s.name)).size).toBe(SOUNDS.length)
  })

  it('numbers them 01 to 50', () => {
    expect(soundNumber(0)).toBe('01')
    expect(soundNumber(49)).toBe('50')
    expect(soundLabel(0)).toBe(`01 ${SOUNDS[0]!.name}`)
  })

  it('names nothing like a parameter set', () => {
    // The naming is the character. `FM Bell 2` is exactly what this instrument
    // is not, and it is an easy thing to let slip back in.
    for (const sound of SOUNDS) {
      expect(sound.name).not.toMatch(/\b(pad|lead|bass|bell|synth|fm|saw)\s*\d+$/i)
      expect(sound.name.length).toBeLessThanOrEqual(20)
    }
  })

  it('clamps rather than wrapping at the ends', () => {
    // The browse list has ends you can find by turning, so reaching past one
    // must stop rather than teleport to the far side.
    expect(soundAt(-5)).toBe(SOUNDS[0])
    expect(soundAt(999)).toBe(SOUNDS[49])
  })

  it('keeps every envelope audible', () => {
    for (const sound of SOUNDS) {
      // A zero release clicks; a zero sustain with a long decay is a pluck, but
      // both at zero is silence, and that is only ever a typo.
      expect(sound.release).toBeGreaterThan(0)
      expect(sound.decay + sound.sustain).toBeGreaterThan(0)
      expect(sound.attack).toBeLessThan(2.5)
    }
  })

  it('keeps every cutoff inside the audible range', () => {
    for (const sound of SOUNDS) {
      expect(sound.cutoff).toBeGreaterThanOrEqual(400)
      expect(sound.cutoff).toBeLessThanOrEqual(8000)
    }
  })

  it('keeps the arriving effects subtle enough to play through', () => {
    for (const sound of SOUNDS) {
      for (const wet of [sound.reverb, sound.chorus, sound.delay]) {
        expect(wet).toBeGreaterThanOrEqual(0)
        expect(wet).toBeLessThanOrEqual(0.7)
      }
    }
  })

  it('spreads across all three engines', () => {
    const engines = new Set(SOUNDS.map((s) => s.engine))
    expect(engines).toEqual(new Set(['sub', 'fm', 'ep']))
    // No engine should be a token presence — the library is the point.
    for (const engine of engines) {
      expect(SOUNDS.filter((s) => s.engine === engine).length).toBeGreaterThan(4)
    }
  })

  it('gives every subtractive sound a waveform and every FM one a ratio', () => {
    for (const sound of SOUNDS) {
      if (sound.engine === 'sub') expect(sound.wave).toBeDefined()
      else expect(sound.harmonicity).toBeGreaterThan(0)
    }
  })
})
