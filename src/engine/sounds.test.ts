/**
 * The library.
 *
 * These are not deep tests of taste — they guard the properties that make a
 * browse list usable: fifty of them, all distinct, all reachable, none silently
 * misconfigured in a way that would produce silence or a blown filter.
 */

import { describe, expect, it } from 'vitest'

import { decayFor, soundAt, soundLabel, soundNumber, SOUNDS } from './sounds.js'

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

  it('keeps decay and release as time constants, not durations', () => {
    // These are the source table's units, and the difference is a factor of
    // fifty: a decay of 0.7 becomes 39.8 in Tone's units. Anything much above
    // 1 here is a value that was pasted in already converted, which would ring
    // for the rest of the session.
    for (const sound of SOUNDS) {
      expect(sound.decay).toBeLessThanOrEqual(0.8)
      expect(sound.release).toBeLessThanOrEqual(0.3)
      expect(sound.sustain).toBeGreaterThanOrEqual(0)
      expect(sound.sustain).toBeLessThanOrEqual(1)
    }
  })

  it('gives every modulated sound a modulation envelope', () => {
    // Without it the modulator sits at one depth for the life of the note, and
    // a vibraphone and a brass section come out the same brightness. This is
    // what makes a struck sound struck.
    for (const sound of SOUNDS) {
      if (sound.engine === 'sub') continue
      expect(sound.modAttack).toBeDefined()
      expect(sound.modDecay).toBeLessThanOrEqual(0.8)
      expect(sound.modRelease).toBeLessThanOrEqual(0.3)
      expect(sound.modSustain).toBeGreaterThanOrEqual(0)
      expect(sound.modSustain).toBeLessThanOrEqual(1)
    }
  })

  it('converts time constants into the envelope Tone actually wants', () => {
    // Tone derives tau = ln(D+1)/ln(200) from the duration it is given, so a
    // correct conversion is the one that comes back out as the constant we put
    // in. This is the single seam between the library's units and Tone's; if
    // it drifts, every envelope in the instrument is wrong at once.
    const tauOf = (d: number) => Math.log(d + 1) / Math.log(200)
    for (const tau of [0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 0.8]) {
      expect(tauOf(decayFor(tau))).toBeCloseTo(tau, 6)
    }
    // Familiar landmarks, so a bad edit is visible rather than merely different.
    expect(decayFor(0.05)).toBeCloseTo(0.303, 3) // a short release
    expect(decayFor(0.7)).toBeCloseTo(39.8, 1) // a Rhodes
    expect(decayFor(5)).toBe(120) // capped, not scheduled a century out
  })

  it('converts every preset to a decay Tone can schedule', () => {
    for (const sound of SOUNDS) {
      for (const tau of [sound.decay, sound.release, sound.modDecay, sound.modRelease]) {
        if (tau === undefined) continue
        const d = decayFor(tau)
        expect(Number.isFinite(d)).toBe(true)
        expect(d).toBeGreaterThan(0)
        expect(d).toBeLessThanOrEqual(120)
      }
    }
  })

  it('keeps the five names Telepathic publish under Lead', () => {
    // research/07. Their category is the one documented fact about them, and
    // an earlier library got it wrong by building all five as plucks and pads.
    for (const name of ['Lemon', 'DX Guitar', 'Trout', 'Plumerai La Tete', 'Cosmic Day Spa']) {
      const sound = SOUNDS.find((s) => s.name === name)
      expect(sound, `${name} is missing`).toBeDefined()
      // A lead sustains and sings rather than being struck and gone.
      expect(sound!.sustain, `${name} does not sustain`).toBeGreaterThan(0.25)
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
