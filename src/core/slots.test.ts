/**
 * The ten loop slots (§12.7).
 *
 * The interesting parts are the two that can go wrong quietly: which slot
 * `Save As Loop XX` picks, and what happens when storage hands back something
 * that is not a loop.
 */

import { describe, expect, it } from 'vitest'

import { emptySlots, isLoop, nextFree, parseSlots, presetsIn, SLOT_COUNT, slotLabel, slotSummary } from './slots.js'
import type { Loop } from './looper.js'

const loop = (bars: number | null, sounds: number[] = [0]): Loop => ({
  bars,
  lengthSeconds: bars === null ? 3.25 : bars * 2.5,
  layers: sounds.map((sound) => ({ events: [], sound, bassSound: 3 })),
})

describe('the bank', () => {
  it('has the ten the manual documents', () => {
    expect(SLOT_COUNT).toBe(10)
    expect(emptySlots()).toHaveLength(10)
  })

  it('numbers them one-based and zero-padded, as §12.7 writes them', () => {
    expect(slotLabel(0)).toBe('Loop 01')
    expect(slotLabel(9)).toBe('Loop 10')
  })
})

describe('next available spot', () => {
  it('takes the first empty slot', () => {
    const slots = [loop(4), null, loop(2), ...emptySlots().slice(3)]
    expect(nextFree(slots)).toBe(1)
  })

  it('takes the first slot when every one is full', () => {
    // §12.7 does not say what happens with no spot available. Falling back to
    // the first is at least consistent with overwrite-without-confirm, and the
    // row prints the number so it is never a surprise.
    const full = Array.from({ length: SLOT_COUNT }, () => loop(4))
    expect(nextFree(full)).toBe(0)
  })

  it('starts at the top of an empty bank', () => {
    expect(nextFree(emptySlots())).toBe(0)
  })
})

describe('what a slot shows', () => {
  it('marks an empty slot the way the rest of the panel does', () => {
    expect(slotSummary(null)).toBe('--')
  })

  it('shows the bar count a player chose', () => {
    expect(slotSummary(loop(1))).toBe('1 Bar')
    expect(slotSummary(loop(4))).toBe('4 Bars')
  })

  it('shows a free loop’s length, since it has no bars', () => {
    expect(slotSummary(loop(null))).toBe('3.3s')
  })
})

describe('reading storage back', () => {
  it('accepts a real loop', () => {
    expect(isLoop(loop(4))).toBe(true)
  })

  it('rejects anything that is not one', () => {
    // Storage can hold an older build's shape, a half-written value, or
    // whatever someone typed into devtools. None of it may reach the looper.
    expect(isLoop(null)).toBe(false)
    expect(isLoop('a loop, honest')).toBe(false)
    expect(isLoop({ bars: 4 })).toBe(false)
    expect(isLoop({ bars: 4, lengthSeconds: 10, layers: 'nope' })).toBe(false)
    // A layer without its preset is pre-per-layer-sound data.
    expect(isLoop({ bars: 4, lengthSeconds: 10, layers: [{ events: [] }] })).toBe(false)
    // NaN would poison every time calculation downstream.
    expect(isLoop({ bars: 4, lengthSeconds: NaN, layers: [] })).toBe(false)
  })

  it('replaces a bad slot with an empty one rather than failing the bank', () => {
    const parsed = parseSlots([loop(4), 'rubbish', null, { bars: 2 }])
    expect(parsed).toHaveLength(10)
    expect(parsed[0]).not.toBeNull()
    expect(parsed[1]).toBeNull()
    expect(parsed[3]).toBeNull()
  })

  it('gives an empty bank for anything that is not a list', () => {
    expect(parseSlots(undefined)).toEqual(emptySlots())
    expect(parseSlots({ nope: true })).toEqual(emptySlots())
  })

  it('pads a short bank out to ten', () => {
    expect(parseSlots([loop(4)])).toHaveLength(10)
  })
})

describe('presets a loop needs', () => {
  it('lists each one once, so loading warms them and no more', () => {
    // Loading builds these before playback — 8-12ms each against a 10ms
    // lookahead, so building a duplicate is a hitch for nothing.
    expect(presetsIn(loop(4, [7, 7, 2]))).toEqual({ sounds: [7, 2], basses: [3] })
  })
})
