/**
 * MIDI out — the three-channel split, over Web MIDI.
 *
 * research/09 calls this "the most quietly sophisticated thing about the Orchid
 * and the part most worth copying wholesale", and the reason is one sentence:
 *
 * > **Channel 3 is the harmony as data; Channel 1 is the harmony as gesture.**
 *
 * Three simultaneous, semantically different streams:
 *
 * | Stream | Contents |
 * |---|---|
 * | **Performance** | the notes you actually hear — arpeggios, strums, everything the articulation layer produced |
 * | **Bass** | the bass engine's own line |
 * | **Chord** | the raw sustained block chord, *regardless of performance mode* |
 *
 * Record all three and you can re-perform the same progression with a different
 * articulation later, or drive a pad from the block chords while an arpeggio
 * drives a pluck. Each is assignable to any channel 1–16, or Off.
 *
 * ## What a browser can and cannot do
 *
 * Web MIDI can send to any output port the operating system already exposes. It
 * **cannot create one**. So talking to a DAW on the same machine needs a
 * loopback port to exist first — IAC on macOS, `loopMIDI` or similar on
 * Windows, ALSA virtual ports on Linux. There is no way around that from inside
 * a page, and pretending otherwise would produce an app that looks connected
 * and sends into nothing. `ports()` returning empty is the honest signal, and
 * the UI says so.
 *
 * Access is requested **without sysex**, which keeps the permission prompt to
 * the mild one; nothing here needs it.
 *
 * ## Timing
 *
 * Notes are scheduled ahead — a strum spreads over as much as half a second —
 * so they are *sent* ahead too, with a timestamp, rather than fired when the
 * audio happens to reach them. `MIDIOutput.send` takes a `DOMHighResTimeStamp`
 * on `performance.now()`'s clock, while everything upstream is in AudioContext
 * seconds. `at()` is the bridge, and without it every strum would arrive at the
 * DAW as a block chord.
 */

import * as Tone from 'tone'

/** Status bytes. Channel is added in the low nibble. */
const NOTE_ON = 0x90
const NOTE_OFF = 0x80
const ALL_NOTES_OFF = 0x7b
const CONTROL = 0xb0

/**
 * The bytes of a note-on.
 *
 * Pure and exported so the wire format can be tested without a MIDI device —
 * which matters, because it cannot be tested *with* one here and a wrong status
 * nibble is silent rather than loud. Channels are 1–16 to the player and 0–15
 * on the wire, and every data byte is seven bits: a velocity of 1.0 is 127, not
 * 128, and 128 would set the status bit and corrupt the stream.
 */
export function noteOnBytes(channel: number, note: number, velocity: number): number[] {
  return [
    NOTE_ON | ((channel - 1) & 0x0f),
    note & 0x7f,
    Math.round(clamp01(velocity) * 127) & 0x7f,
  ]
}

export function noteOffBytes(channel: number, note: number): number[] {
  return [NOTE_OFF | ((channel - 1) & 0x0f), note & 0x7f, 0]
}

/** All Notes Off on one channel, as a controller message. */
export const allNotesOffBytes = (channel: number): number[] => [
  CONTROL | ((channel - 1) & 0x0f),
  ALL_NOTES_OFF,
  0,
]

export type Stream = 'performance' | 'bass' | 'chord'

/** A channel 1–16, or `null` for Off. */
export type Channel = number | null

export interface MidiPort {
  readonly id: string
  readonly name: string
}

class MidiOut {
  private access: MIDIAccess | undefined
  private port: MIDIOutput | undefined
  private channels: Record<Stream, Channel> = {
    performance: 1,
    bass: 2,
    /*
     * Off, and that is the documented default rather than caution.
     *
     * v3.90: "MIDI channels now have an Off setting" and "**Chord MIDI channel
     * now defaults to Off**" — research/09 reads that as the duplicate-notes
     * problem biting enough users, since the block chord and the performance
     * stream carry the same harmony and land on the same instrument unless you
     * have separated them on purpose.
     */
    chord: null,
  }
  /** Notes believed to be sounding per stream, so a panic can end them. */
  private live: Record<Stream, Set<number>> = {
    performance: new Set(),
    bass: new Set(),
    chord: new Set(),
  }

  private onChange: (() => void) | undefined

  get enabled(): boolean {
    return this.access !== undefined
  }

  get portId(): string | undefined {
    return this.port?.id
  }

  watch(fn: () => void): void {
    this.onChange = fn
  }

  /**
   * Ask for access. Resolves to whether it was granted.
   *
   * Deliberately not called at startup: it raises a permission prompt, and an
   * instrument that asks for hardware access before you have shown any interest
   * in MIDI is an instrument people click "block" on.
   */
  async enable(): Promise<boolean> {
    if (this.access) return true
    if (!navigator.requestMIDIAccess) return false
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
      // Ports come and go while the page is open — plugging in a controller, or
      // starting the loopback driver *after* opening the app, which is the
      // likely order the first time.
      this.access.onstatechange = () => this.onChange?.()
      this.onChange?.()
      return true
    } catch {
      return false
    }
  }

  ports(): MidiPort[] {
    if (!this.access) return []
    return [...this.access.outputs.values()].map((p) => ({ id: p.id, name: p.name ?? p.id }))
  }

  select(id: string | null): void {
    if (this.port) this.panic()
    this.port = id === null ? undefined : this.access?.outputs.get(id)
    this.onChange?.()
  }

  setChannel(stream: Stream, channel: Channel): void {
    if (this.channels[stream] === channel) return
    // Notes already sounding on the old channel would never be released.
    this.endStream(stream)
    this.channels[stream] = channel
  }

  channelOf(stream: Stream): Channel {
    return this.channels[stream]
  }

  /**
   * AudioContext seconds to the clock `MIDIOutput.send` reads.
   *
   * `Tone.now()` is not used: it adds the context's lookahead, which would push
   * every message that much later than the note it belongs to.
   */
  private at(audioTime: number | undefined): number | undefined {
    if (audioTime === undefined) return undefined
    return performance.now() + (audioTime - Tone.getContext().currentTime) * 1000
  }

  noteOn(stream: Stream, note: number, velocity: number, audioTime?: number): void {
    const channel = this.channels[stream]
    if (!this.port || channel === null) return
    this.port.send(noteOnBytes(channel, note, velocity), this.at(audioTime))
    this.live[stream].add(note)
  }

  noteOff(stream: Stream, note: number, audioTime?: number): void {
    const channel = this.channels[stream]
    if (!this.port || channel === null) return
    this.port.send(noteOffBytes(channel, note), this.at(audioTime))
    this.live[stream].delete(note)
  }

  /** End one stream's notes without touching the others. */
  endStream(stream: Stream): void {
    const channel = this.channels[stream]
    if (!this.port || channel === null) {
      this.live[stream].clear()
      return
    }
    for (const note of this.live[stream]) this.port.send(noteOffBytes(channel, note))
    this.live[stream].clear()
  }

  /**
   * Everything off, everywhere.
   *
   * Sends explicit note-offs *and* the All Notes Off controller: the controller
   * alone is politely ignored by a fair amount of software, and a hung note in
   * someone's DAW is the worst thing this module could leave behind.
   */
  panic(): void {
    for (const stream of ['performance', 'bass', 'chord'] as Stream[]) this.endStream(stream)
    if (!this.port) return
    for (let ch = 1; ch <= 16; ch++) this.port.send(allNotesOffBytes(ch))
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Module-level singleton, the same bargain the synth and looper make. */
let instance: MidiOut | undefined

export function getMidi(): MidiOut {
  instance ??= new MidiOut()
  return instance
}

export type { MidiOut }
