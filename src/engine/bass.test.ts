/**
 * The bass engine.
 *
 * Two things worth guarding: the documented preset names stay at the numbers
 * the hardware puts them at, and the four bass modes route to the engines they
 * are documented to route to.
 */

import { describe, expect, it } from 'vitest'

import {
  BASS_MODE_LABEL,
  BASS_MODES,
  BASS_SOUNDS,
  bassAt,
  bassLabel,
  bassNumber,
  bassRouting,
  routeKeypress,
} from './bass.js'
import { SOUNDS } from './sounds.js'

describe('the bass sound list', () => {
  it('is numbered independently of the treble list', () => {
    // research/07: the documented bass names run 04–12 while the treble list
    // runs into the 60s, which is how we know they are separate spaces.
    expect(BASS_SOUNDS.length).toBe(12)
    expect(bassNumber(0)).toBe('01')
    expect(bassNumber(11)).toBe('12')
    expect(BASS_SOUNDS.length).not.toBe(SOUNDS.length)
  })

  it('keeps the documented presets at their documented numbers', () => {
    // research/07 §Known presets. These five are observed hardware, so their
    // positions are facts rather than choices.
    const documented: Record<number, string> = {
      4: 'PBass',
      6: 'ORC808',
      9: 'Fifth Organ Bass',
      10: 'Meadow Bass',
      12: 'Rezdist Bass',
    }
    for (const [number, name] of Object.entries(documented)) {
      expect(bassLabel(Number(number) - 1)).toBe(`${bassNumber(Number(number) - 1)} ${name}`)
    }
  })

  it('gives every sound its own name', () => {
    expect(new Set(BASS_SOUNDS.map((b) => b.name)).size).toBe(BASS_SOUNDS.length)
  })

  it('clamps rather than wrapping at the ends', () => {
    expect(bassAt(-3)).toBe(BASS_SOUNDS[0])
    expect(bassAt(99)).toBe(BASS_SOUNDS[11])
  })

  it('keeps every bass audible and low', () => {
    for (const b of BASS_SOUNDS) {
      expect(b.release).toBeGreaterThan(0)
      expect(b.decay + b.sustain).toBeGreaterThan(0)
      // These are plain seconds, not the treble library's time constants. A
      // decay of 40 here would be a value pasted across from `sounds.ts`.
      expect(b.decay).toBeLessThanOrEqual(4)
      expect(b.release).toBeLessThanOrEqual(4)
      expect(b.attack).toBeLessThan(0.2)
      // A bass that starts above the stave is not a bass.
      expect(b.base).toBeGreaterThanOrEqual(40)
      expect(b.base).toBeLessThanOrEqual(200)
      expect(b.octaves).toBeGreaterThan(0)
      expect(b.q).toBeGreaterThan(0)
    }
  })
})

describe('bass modes', () => {
  it('labels all four as the hardware menu words them', () => {
    expect(BASS_MODES).toHaveLength(4)
    for (const mode of BASS_MODES) expect(BASS_MODE_LABEL[mode]).toBeTruthy()
    expect(BASS_MODE_LABEL.chords).toBe('With chords only')
    expect(BASS_MODE_LABEL.single).toBe('Bass single notes')
  })

  it('routes a chord the way each mode is documented to', () => {
    expect(bassRouting('chords', true)).toEqual({ treble: true, bass: true })
    expect(bassRouting('unison', true)).toEqual({ treble: true, bass: true })
    expect(bassRouting('single', true)).toEqual({ treble: true, bass: true })
    // Solo mutes the treble "even when playing chords" — research/07.
    expect(bassRouting('solo', true)).toEqual({ treble: false, bass: true })
  })

  it('routes a single key the way each mode is documented to', () => {
    // "Bass plays the root only when you play a chord."
    expect(bassRouting('chords', false)).toEqual({ treble: true, bass: false })
    // "Bass and treble play in unison when playing single notes."
    expect(bassRouting('unison', false)).toEqual({ treble: true, bass: true })
    // "Single-key presses play only bass."
    expect(bassRouting('single', false)).toEqual({ treble: false, bass: true })
    expect(bassRouting('solo', false)).toEqual({ treble: false, bass: true })
  })

  it('plays the treble when the bass engine is switched off', () => {
    // research/03: "As of v3.90, when Bass is *off*, single-notes mode plays
    // the treble chord rather than silence."
    for (const mode of BASS_MODES) {
      for (const isChord of [true, false]) {
        expect(routeKeypress(false, mode, isChord)).toEqual({ treble: true, bass: false })
      }
    }
  })

  it('is the two modes that would otherwise go silent', () => {
    // Naming the actual hazard: these two mute the treble, so without the
    // switched-off guard above they would mute the instrument outright.
    expect(bassRouting('solo', true).treble).toBe(false)
    expect(bassRouting('single', false).treble).toBe(false)
    expect(routeKeypress(false, 'solo', true).treble).toBe(true)
    expect(routeKeypress(false, 'single', false).treble).toBe(true)
  })

  it('defers to the mode table whenever the bass is on', () => {
    for (const mode of BASS_MODES) {
      for (const isChord of [true, false]) {
        expect(routeKeypress(true, mode, isChord)).toEqual(bassRouting(mode, isChord))
      }
    }
  })

  it('never silences both engines', () => {
    // Whatever the mode, a keypress has to make a sound. This is the property
    // that matters: the rest of the table is taste, this one is a bug.
    for (const mode of BASS_MODES) {
      for (const isChord of [true, false]) {
        const r = bassRouting(mode, isChord)
        expect(r.treble || r.bass, `${mode} / ${isChord ? 'chord' : 'single'}`).toBe(true)
      }
    }
  })
})
