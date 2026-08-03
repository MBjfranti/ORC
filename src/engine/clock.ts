/**
 * The master clock, in the one unit that is actually authoritative.
 *
 * ## Three clocks, and why that was a bug
 *
 * Tone hands you three different times and they are not interchangeable:
 *
 *   **`Transport.seconds`** — wall-clock time since the transport started.
 *   **`Transport.ticks`** — *musical* position. This is what scheduling uses.
 *   **`context.currentTime`** — the audio clock, which is what a synth wants.
 *
 * Seconds and ticks agree only while the tempo never changes. Turn the BPM dial
 * once and they part company for good: after a couple of minutes of ordinary
 * use this app measured **1.5 bars** of divergence between them.
 *
 * That mattered because `Transport.scheduleOnce(cb, t)` takes `t` in *seconds*
 * and converts it to ticks at the current tempo. Handing it a value read from
 * `Transport.seconds` therefore produced a tick position well behind where the
 * transport had actually reached — so the event was already in the past and
 * **never fired**. The symptom was a bar-locked loop that counted in and then
 * sat in `counting` forever, and it appeared only after you had touched the
 * tempo, which is what made it look like flakiness rather than arithmetic.
 *
 * The rule this module exists to enforce:
 *
 *   - **Position** — where something sits on the musical grid — is *ticks*.
 *     Schedule with `atTick`, read a callback's position with `ticksAt`.
 *   - **Duration** — how long something lasted — is audio seconds.
 *   - Never schedule from `Transport.seconds`, and never hand a transport time
 *     to a synth. Inside a transport callback the `time` you are given is
 *     already audio time; that is the bridge between the two.
 *
 * Anchoring everything to tick zero is also what makes the beat, the metronome
 * and the loop share a bar line, rather than each keeping a private grid that
 * started whenever its button was pressed.
 */

import * as Tone from 'tone'

import type { Beat, Meter } from '../core/beats.js'

/** Ticks per quarter note — Tone's resolution, 192 by default. */
const ppq = (): number => Tone.getTransport().PPQ

/**
 * Ticks in one bar.
 *
 * Off `quarters`, not `beats`: six-eight is six beats but three quarter notes
 * long, and the grid is measured in quarters. Every meter we offer lands on a
 * whole number here, seven-eight included (192 × 3.5 = 672).
 */
export const barTicks = (meter: Meter): number => ppq() * meter.quarters

/** Ticks between two clicks of the metronome. */
export const beatTicks = (meter: Meter): number => barTicks(meter) / meter.beats

/** How many quarter notes one step of a pattern lasts. */
const STEP_QUARTERS: Record<Beat['step'], number> = {
  '16n': 1 / 4,
  '8n': 1 / 2,
  '8t': 1 / 3,
  '16t': 1 / 6,
}

/** Ticks in one step of a beat's grid. Whole numbers for every subdivision. */
export const stepTicks = (beat: Beat): number => ppq() * STEP_QUARTERS[beat.step]

/**
 * The tick position of the next bar line.
 *
 * `lead` keeps a press landing a hair before a boundary from scheduling the
 * whole count-in into the past — a tick is far less than any gesture, and
 * without it the bar you meant to start on is the bar you miss.
 */
export function nextBar(meter: Meter, lead = 1): number {
  const bar = barTicks(meter)
  return Math.ceil((Tone.getTransport().ticks + lead) / bar) * bar
}

/**
 * An absolute tick position, in Tone's own notation.
 *
 * The `i` suffix is what stops the value being reinterpreted through the
 * current tempo on the way in — which is the whole failure this module exists
 * to prevent.
 */
export const atTick = (ticks: number): string => `${Math.round(ticks)}i`

/** Where the transport was, musically, at an audio-clock time. */
export const ticksAt = (time: number): number => Tone.getTransport().getTicksAtTime(time)

/** A duration in seconds, as a count of ticks at the current tempo. */
export const secondsToTicks = (seconds: number): number =>
  (seconds / (60 / Tone.getTransport().bpm.value)) * ppq()
