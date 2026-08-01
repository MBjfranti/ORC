/**
 * MIDI output — the three-stream split.
 *
 * The hardware's smartest design decision: performance, bass and the raw block
 * chord go out on three separate, simultaneous channels. Channel 3 is the
 * harmony as *data*; channel 1 is the harmony as *gesture*. Record both and you
 * can re-perform the same progression with a different articulation later, or
 * send block chords to a pad while the arpeggio drives a pluck.
 *
 * See research/09-midi-implementation.md.
 */

import type { MidiNote } from '../core/types.js'

export type Stream = 'performance' | 'bass' | 'chord'

export const STREAMS: readonly Stream[] = ['performance', 'bass', 'chord'] as const

export const STREAM_LABEL: Record<Stream, string> = {
  performance: 'Performance',
  bass: 'Bass',
  chord: 'Chord',
}

/** Channel 1-16, or `null` for off. */
export type ChannelAssignment = number | null

/**
 * Defaults follow the hardware's v3.90 firmware, including the Chord channel
 * being **off**. Sending all three by default produces overlapping duplicate
 * notes in every DAW that defaults to omni input, which is the single most
 * common complaint about the real thing.
 */
export const DEFAULT_CHANNELS: Record<Stream, ChannelAssignment> = {
  performance: 1,
  bass: 2,
  chord: null,
}

const NOTE_ON = 0x90
const NOTE_OFF = 0x80
const CC = 0xb0
const ALL_NOTES_OFF = 123

export interface MidiPort {
  readonly id: string
  readonly name: string
}

export class MidiOut {
  private access: MIDIAccess | undefined
  private port: MIDIOutput | undefined
  private channels: Record<Stream, ChannelAssignment> = { ...DEFAULT_CHANNELS }
  /** Notes we have turned on, so panic can turn exactly those off again. */
  private sounding = new Map<Stream, Set<MidiNote>>()

  /** Web MIDI is Chromium + Firefox only; Safari has no support. */
  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  }

  get enabled(): boolean {
    return this.port !== undefined
  }

  get portName(): string | undefined {
    return this.port?.name ?? undefined
  }

  /**
   * Request access and list outputs. Returns an empty list rather than throwing
   * when unsupported or denied — MIDI is strictly additive here, and everything
   * must keep working without it.
   */
  async init(): Promise<MidiPort[]> {
    if (!MidiOut.supported) return []
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
      return this.ports()
    } catch {
      return []
    }
  }

  ports(): MidiPort[] {
    if (!this.access) return []
    return [...this.access.outputs.values()].map((o) => ({ id: o.id, name: o.name ?? o.id }))
  }

  select(id: string | undefined): void {
    this.allNotesOff()
    this.port = id && this.access ? this.access.outputs.get(id) : undefined
  }

  setChannel(stream: Stream, channel: ChannelAssignment): void {
    this.streamNotes(stream).forEach((n) => this.noteOff(stream, n))
    this.channels[stream] = channel
  }

  getChannel(stream: Stream): ChannelAssignment {
    return this.channels[stream]
  }

  /**
   * @param at optional AudioContext-relative time in seconds, and `now` the
   *   context's current time. Converted to the MIDI clock so arpeggios stay
   *   tight instead of being flushed on the next event-loop turn.
   */
  noteOn(stream: Stream, note: MidiNote, velocity = 0.8, at?: number, now?: number): void {
    const ch = this.channels[stream]
    if (!this.port || ch === null) return

    const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)))
    this.send([NOTE_ON | (ch - 1), note & 0x7f, vel], at, now)
    this.streamNotes(stream).add(note)
  }

  noteOff(stream: Stream, note: MidiNote, at?: number, now?: number): void {
    const ch = this.channels[stream]
    if (!this.port || ch === null) return

    this.send([NOTE_OFF | (ch - 1), note & 0x7f, 0], at, now)
    this.streamNotes(stream).delete(note)
  }

  /** Release everything we started, then belt-and-braces an All Notes Off. */
  allNotesOff(): void {
    if (!this.port) return
    for (const stream of STREAMS) {
      for (const note of [...this.streamNotes(stream)]) this.noteOff(stream, note)
      const ch = this.channels[stream]
      if (ch !== null) this.send([CC | (ch - 1), ALL_NOTES_OFF, 0])
    }
  }

  private send(data: number[], at?: number, now?: number): void {
    if (!this.port) return
    // Web MIDI timestamps are performance.now() milliseconds; Tone deals in
    // AudioContext seconds. Translate rather than dropping the schedule.
    const delayMs = at !== undefined && now !== undefined ? Math.max(0, (at - now) * 1000) : 0
    this.port.send(data, performance.now() + delayMs)
  }

  private streamNotes(stream: Stream): Set<MidiNote> {
    let set = this.sounding.get(stream)
    if (!set) {
      set = new Set()
      this.sounding.set(stream, set)
    }
    return set
  }
}
