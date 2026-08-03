/**
 * The MIDI wire format.
 *
 * These exist because the alternative is trusting it. A wrong status nibble or
 * a data byte with its top bit set does not raise anything — it produces
 * silence, or notes on a channel nobody is listening to, and the only way to
 * find out is to open a DAW.
 */

import { describe, expect, it } from 'vitest'

import { allNotesOffBytes, noteOffBytes, noteOnBytes } from './midi.js'
import { CHANNEL_VALUES, channelFromRow, rowFromChannel } from '../core/options.js'

describe('note messages', () => {
  it('puts the channel in the low nibble, counting from zero on the wire', () => {
    // Channel 1 to a player is channel 0 on the wire.
    expect(noteOnBytes(1, 60, 1)[0]).toBe(0x90)
    expect(noteOnBytes(16, 60, 1)[0]).toBe(0x9f)
    expect(noteOffBytes(1, 60)[0]).toBe(0x80)
    expect(noteOffBytes(16, 60)[0]).toBe(0x8f)
  })

  it('scales velocity to seven bits, not eight', () => {
    // 127 is full. 128 would set the status bit and corrupt the stream.
    expect(noteOnBytes(1, 60, 1)[2]).toBe(127)
    expect(noteOnBytes(1, 60, 0.5)[2]).toBe(64)
    expect(noteOnBytes(1, 60, 0)[2]).toBe(0)
  })

  it('clamps a velocity outside 0..1 rather than wrapping it', () => {
    // A hot patch can hand us more than 1.0; wrapping would make the loudest
    // note the quietest.
    expect(noteOnBytes(1, 60, 3)[2]).toBe(127)
    expect(noteOnBytes(1, 60, -2)[2]).toBe(0)
  })

  it('keeps every data byte inside seven bits', () => {
    for (const bytes of [noteOnBytes(1, 200, 1), noteOffBytes(1, 200), allNotesOffBytes(1)]) {
      expect(bytes[1]! & 0x80).toBe(0)
      expect(bytes[2]! & 0x80).toBe(0)
    }
  })

  it('sends note-off as a real note-off, not a zero-velocity note-on', () => {
    // Both are legal and some gear only honours one. The explicit form is the
    // one that cannot be misread.
    expect(noteOffBytes(3, 64)).toEqual([0x82, 64, 0])
  })

  it('addresses All Notes Off as a controller on the right channel', () => {
    expect(allNotesOffBytes(1)).toEqual([0xb0, 0x7b, 0])
    expect(allNotesOffBytes(10)).toEqual([0xb9, 0x7b, 0])
  })
})

describe('channel assignment', () => {
  it('offers Off and the sixteen channels', () => {
    // research/02 records "assignable or Off"; v3.90 added the Off setting.
    expect(CHANNEL_VALUES).toHaveLength(17)
    expect(CHANNEL_VALUES[0]).toBe('Off')
    expect(CHANNEL_VALUES[1]).toBe('01')
    expect(CHANNEL_VALUES[16]).toBe('16')
  })

  it('maps a menu row to a channel and back', () => {
    expect(channelFromRow(0)).toBeNull()
    expect(channelFromRow(1)).toBe(1)
    expect(channelFromRow(16)).toBe(16)
    for (const channel of [null, 1, 9, 16]) {
      expect(channelFromRow(rowFromChannel(channel))).toBe(channel)
    }
  })
})
