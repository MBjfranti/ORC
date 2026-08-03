/**
 * The beat machine's data.
 *
 * These are not tests of taste. They guard the properties that make twenty
 * patterns usable as a list — the right count, distinct names, nothing silent,
 * nothing naming a drum the kit does not have — plus the two places the
 * notation could quietly lie: a voice string whose length is not a whole number
 * of bars, and the one cursor that has to run across two different kinds of row
 * without a seam.
 */

import { describe, expect, it } from 'vitest'

import {
  BEATS,
  beatAt,
  beatLabel,
  beatSteps,
  clockAt,
  clockRow,
  CLOCK_ROWS,
  DRUM_VOICES,
  hitsAt,
  METERS,
  meterAt,
  swingOf,
} from './beats.js'

describe('the twenty beats', () => {
  it('has exactly the twenty the manual counts', () => {
    // "Orchid comes with a selection of pre-programmed Beats" (§11.4); the
    // number is research/08's, [OFFICIAL].
    expect(BEATS).toHaveLength(20)
  })

  it('keeps the five documented names at their documented numbers', () => {
    // research/08, [OFFICIAL — partial]. The other fifteen are ours, so only
    // these five are pinned.
    expect(beatLabel(0)).toBe('01 Saint Germain')
    expect(beatLabel(1)).toBe('02 Orchid Bossanova')
    expect(beatLabel(2)).toBe('03 Trap')
    expect(beatLabel(3)).toBe('04 Latin')
    expect(beatLabel(4)).toBe('05 Millionaire')
  })

  it('names them all distinctly', () => {
    expect(new Set(BEATS.map((b) => b.name)).size).toBe(BEATS.length)
  })

  it('clamps rather than wrapping at the ends', () => {
    expect(beatAt(-3)).toBe(BEATS[0])
    expect(beatAt(99)).toBe(BEATS[19])
  })

  it('only names drums the kit actually has', () => {
    // A typo here is silent: the pattern parses, the step passes, and one voice
    // simply never sounds.
    for (const beat of BEATS) {
      for (const voice of Object.keys(beat.voices)) {
        expect(DRUM_VOICES).toContain(voice)
      }
    }
  })

  it('writes every voice in whole bars', () => {
    // The two-bar claves are the reason this matters: a 30-character string
    // against a 16-step bar would drift a step every repeat, which reads as the
    // groove slowly falling apart rather than as a bug.
    for (const beat of BEATS) {
      for (const [voice, pattern] of Object.entries(beat.voices)) {
        expect(`${beat.name}/${voice}: ${pattern.length}`).toBe(
          `${beat.name}/${voice}: ${Math.round(pattern.length / beat.bar) * beat.bar}`,
        )
      }
    }
  })

  it('uses only the four characters the notation defines', () => {
    for (const beat of BEATS) {
      for (const pattern of Object.values(beat.voices)) {
        expect(pattern).toMatch(/^[Xxo.]+$/)
      }
    }
  })

  it('makes a sound on the downbeat of all but the one that means not to', () => {
    // Reggae's one drop is the exception and the whole point of it — nothing on
    // beat one. Everywhere else, a pattern whose first step is silent is far
    // more likely to be a mistake than a choice.
    for (const beat of BEATS) {
      const opens = hitsAt(beat, 0).length > 0
      expect(`${beat.name}: ${opens}`).toBe(`${beat.name}: ${beat.name !== 'One Drop'}`)
    }
  })

  it('gives every beat at least three voices, so they are grooves and not clicks', () => {
    for (const beat of BEATS) {
      expect(Object.keys(beat.voices).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('runs a two-bar figure over a one-bar groove without writing either twice', () => {
    // Orchid Bossanova's rim is a 32-character son clave against a 16-step kick.
    const bossa = BEATS[1]!
    expect(beatSteps(bossa)).toBe(32)
    // The kick reads modulo its own length, so the second bar repeats it…
    expect(hitsAt(bossa, 0).some((h) => h.voice === 'kick')).toBe(true)
    expect(hitsAt(bossa, 16).some((h) => h.voice === 'kick')).toBe(true)
    // …while the clave does not come round until the pattern does.
    expect(hitsAt(bossa, 0).some((h) => h.voice === 'rim')).toBe(true)
    expect(hitsAt(bossa, 16).some((h) => h.voice === 'rim')).toBe(false)
  })

  it('reads velocity off the character, so ghosts stay ghosts', () => {
    const accent = hitsAt(BEATS[0]!, 0).find((h) => h.voice === 'kick')!
    const ghost = hitsAt(BEATS[0]!, 0).find((h) => h.voice === 'shaker')!
    expect(accent.velocity).toBe(1)
    expect(ghost.velocity).toBeLessThan(0.5)
  })
})

describe('swing', () => {
  it('lags the off-steps and leaves the on-steps alone', () => {
    const swung = BEATS.find((b) => b.swing)!
    expect(swingOf(swung, 0)).toBe(0)
    expect(swingOf(swung, 1)).toBeGreaterThan(0)
  })

  it('never swings a pattern that is already triplets', () => {
    // Shuffling a shuffle would push the third triplet into the next beat.
    for (const beat of BEATS) {
      if (beat.step !== '8t' && beat.step !== '16t') continue
      expect(swingOf(beat, 1)).toBe(0)
    }
  })
})

describe('time signatures', () => {
  it('counts clicks and quarter notes separately', () => {
    // Six-eight is six clicks long and three quarter notes long. Collapsing
    // those into one number is how a 6/8 loop comes out twice its length.
    const six = METERS.find((m) => m.label === '6/8')!
    expect(six.beats).toBe(6)
    expect(six.quarters).toBe(3)
    expect(six.unit).toBe('8n')
  })

  it('starts in four-four and clamps at both ends', () => {
    expect(meterAt(0).label).toBe('4/4')
    expect(meterAt(-1)).toBe(METERS[0])
    expect(meterAt(99)).toBe(METERS[METERS.length - 1])
  })
})

describe('the one list', () => {
  it('reaches the beats by scrolling past the signatures', () => {
    // §11.4 describes it as one scroll, so the row indices have to run
    // continuously across both halves with no gap and no overlap.
    expect(CLOCK_ROWS).toBe(METERS.length + BEATS.length)
    expect(clockAt(METERS.length - 1).beat).toBeNull()
    expect(clockAt(METERS.length).beat).toBe(0)
    expect(clockAt(CLOCK_ROWS - 1).beat).toBe(BEATS.length - 1)
  })

  it('round-trips a cursor position through a selection', () => {
    for (let row = 0; row < CLOCK_ROWS; row++) {
      const { meter, beat } = clockAt(row)
      // A beat row does not carry a meter, so the meter it came from stands in
      // — which is exactly what `cycleClock` does with the previous value.
      expect(clockRow(beat === null ? meter : 0, beat)).toBe(row)
    }
  })

  it('clamps at both ends rather than wrapping into the wrong half', () => {
    expect(clockAt(-5)).toEqual({ meter: 0, beat: null })
    expect(clockAt(999).beat).toBe(BEATS.length - 1)
  })
})
