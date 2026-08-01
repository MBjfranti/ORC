import { describe, expect, test } from 'vitest'

import {
  allowsLiveEdit,
  carriesTypeToNextRoot,
  EXTENSION_ADDITIONS,
  PLAY_STYLES,
  PLAY_STYLE_LABEL,
  SECRET_CHORD_MODES,
  secretChordsApply,
} from './playStyle.js'

describe('play styles', () => {
  test('all three are labelled', () => {
    for (const style of PLAY_STYLES) expect(PLAY_STYLE_LABEL[style]).toBeTruthy()
  })

  test('only Simple forbids editing a sounding chord', () => {
    expect(allowsLiveEdit('simple')).toBe(false)
    expect(allowsLiveEdit('advanced')).toBe(true)
    expect(allowsLiveEdit('free')).toBe(true)
  })

  test('only Free carries the quality to the next root', () => {
    expect(carriesTypeToNextRoot('simple')).toBe(false)
    expect(carriesTypeToNextRoot('advanced')).toBe(false)
    expect(carriesTypeToNextRoot('free')).toBe(true)
  })

  test('the styles form a strict ladder of permissiveness', () => {
    // Each style allows everything the one before it does, and at least one
    // thing more — that is what makes the setting a single dial rather than a
    // pair of unrelated switches.
    const permissions = PLAY_STYLES.map((s) => [allowsLiveEdit(s), carriesTypeToNextRoot(s)])
    for (let i = 1; i < permissions.length; i++) {
      const prev = permissions[i - 1]!
      const cur = permissions[i]!
      for (let p = 0; p < prev.length; p++) {
        if (prev[p]) expect(cur[p]).toBe(true)
      }
      expect(cur.filter(Boolean).length).toBeGreaterThan(prev.filter(Boolean).length)
    }
  })

  test('both extension-addition behaviours exist', () => {
    expect(EXTENSION_ADDITIONS).toEqual(['add', 'chord'])
  })
})

/**
 * Secret Chords is a three-way setting on the hardware, not a toggle, and its
 * default deliberately restricts it to Simple. In Advanced and Free, holding
 * two type buttons is how you roll from one quality to another — firing a
 * secret chord there would fight the player.
 */
describe('secret chords', () => {
  test('the three documented settings exist', () => {
    expect(SECRET_CHORD_MODES).toEqual(['simple', 'all', 'off'])
  })

  test('off means off, in every play style', () => {
    for (const style of PLAY_STYLES) {
      expect(secretChordsApply('off', style)).toBe(false)
    }
  })

  test('all means every play style', () => {
    for (const style of PLAY_STYLES) {
      expect(secretChordsApply('all', style)).toBe(true)
    }
  })

  test('the default fires in Simple only', () => {
    expect(secretChordsApply('simple', 'simple')).toBe(true)
    expect(secretChordsApply('simple', 'advanced')).toBe(false)
    expect(secretChordsApply('simple', 'free')).toBe(false)
  })

  /* The styles that permit live edits are exactly the ones the default
     excludes — that is the reason the default exists, so tie the two
     together rather than restating the list. */
  test('the default excludes precisely the live-edit styles', () => {
    for (const style of PLAY_STYLES) {
      expect(secretChordsApply('simple', style)).toBe(!allowsLiveEdit(style))
    }
  })
})
