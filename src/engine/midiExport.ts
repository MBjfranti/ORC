/**
 * Export a loop as a Standard MIDI File.
 *
 * This is what makes the looper more than a toy: the instrument's whole thesis
 * is "capture the idea, finish it elsewhere", and until now ideas could not
 * leave the browser. The hardware can't do this at all — it has no storage and
 * no file system, only a MIDI cable.
 *
 * Performance and bass go to **separate tracks**, mirroring the three-stream
 * split the instrument uses everywhere else, so a DAW can assign them to
 * different instruments without any untangling.
 */

import { Midi } from '@tonejs/midi'

import { allEvents } from '../core/looper.js'
import type { Loop, LoopStream } from '../core/looper.js'
import type { Progression, ProgressionStep } from '../core/progression.js'
import type { MidiNote } from '../core/types.js'

export interface ExportOptions {
  readonly bpm: number
  readonly name?: string
}

const TRACK_NAME: Record<LoopStream, string> = {
  performance: 'Performance',
  bass: 'Bass',
}

/** MIDI channel per stream, matching the live output's defaults. */
const TRACK_CHANNEL: Record<LoopStream, number> = {
  performance: 0,
  bass: 1,
}

/**
 * Render a loop to Standard MIDI File bytes.
 *
 * Exports a single pass.
 *
 * **Known limitation:** the file ends at the last note, not at the loop
 * boundary. A two-bar loop whose final chord releases on beat 3 imports as
 * three beats long, so it will not tile correctly if you loop it in a DAW
 * without first extending the region to the bar.
 *
 * `@tonejs/midi` derives track length purely from note events — control changes
 * do not extend it and it exposes no end-of-track control (verified against
 * v2). Padding with an inaudible note would fix the length but put a phantom
 * note in everyone's piano roll, which is a worse trade. The All Notes Off
 * written at the boundary below at least marks where the loop ends for anything
 * that reads the event stream.
 */
export function loopToMidi(loop: Loop, opts: ExportOptions): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(opts.bpm)
  if (opts.name) midi.header.name = opts.name

  const events = allEvents(loop)
  const streams: LoopStream[] = ['performance', 'bass']

  for (const stream of streams) {
    const forStream = events.filter((e) => e.stream === stream)
    if (forStream.length === 0) continue

    const track = midi.addTrack()
    track.name = TRACK_NAME[stream]
    track.channel = TRACK_CHANNEL[stream]

    for (const e of forStream) {
      track.addNote({
        midi: e.note,
        time: e.time,
        duration: Math.max(0.01, e.duration),
        velocity: Math.max(0.01, Math.min(1, e.velocity)),
      })
    }
  }

  // All Notes Off at the loop boundary — marks where the pass ends for anything
  // reading the event stream, and stops a sustained final chord hanging.
  if (midi.tracks.length > 0) {
    midi.tracks[0]!.addCC({ number: 0x7b, value: 0, time: loop.lengthSeconds })
  }

  return midi.toArray()
}

/**
 * Render a progression to Standard MIDI File bytes.
 *
 * Unlike a loop — which is a recording of notes — a progression is a list of
 * chord *intentions*, so it has to be resolved into notes here, through the
 * same engine the instrument plays it with. That means the export reflects the
 * key, voicing and octave you currently have set, exactly as you last heard it.
 *
 * Chords are written as sustained blocks, not performed: the arpeggiator is a
 * playback choice, and a DAW is a better place to decide that than a file.
 */
export function progressionToMidi(
  progression: Progression,
  resolve: (step: ProgressionStep) => readonly MidiNote[],
  opts: ExportOptions,
): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(opts.bpm)
  if (opts.name) midi.header.name = opts.name

  const track = midi.addTrack()
  track.name = 'Progression'
  track.channel = 0

  const secondsPerBar = (60 / opts.bpm) * 4
  let time = 0

  for (const step of progression.steps) {
    const duration = step.bars * secondsPerBar
    for (const note of resolve(step)) {
      // A hair short of the full bar so adjacent chords don't overlap into a
      // smear when a DAW plays them back on one instrument.
      track.addNote({ midi: note, time, duration: duration * 0.98, velocity: 0.8 })
    }
    time += duration
  }

  return midi.toArray()
}

/** True when there is anything worth exporting. */
export function canExport(loop: Loop | undefined): loop is Loop {
  return !!loop && allEvents(loop).length > 0
}

/**
 * Hand the file to the browser.
 *
 * Object URLs hold their blob alive until revoked, so a session of repeated
 * exports would otherwise leak the lot.
 */
export function downloadMidi(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.mid') ? filename : `${filename}.mid`
  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}
