/**
 * Measure how loud every preset actually is, and solve for a trim.
 *
 * Run it in the browser console with the dev server up:
 *
 *     const m = await import('/scripts/measure-levels.mjs')
 *     await m.run()
 *
 * It prints a table and returns the arrays to paste into `engine/levels.ts`.
 *
 * ## Why offline
 *
 * Fifty presets measured in real time is fifty seconds of waiting and fifty
 * chances for a scheduling hiccup to land in the number. `Tone.Offline` renders
 * deterministically and faster than real time, so the same preset measures the
 * same value every run — which is the only way a trim table can be checked
 * against a later change rather than merely regenerated.
 *
 * ## What it measures
 *
 * A four-note chord, held, through the preset's own filter — that is what this
 * instrument plays, and a single note through no filter would rank the library
 * in a different order.
 *
 * Loudness is **gated**, after the fashion of EBU R128, and the gate is the
 * whole point. A plain RMS over a fixed window is dragged down by whatever
 * silence follows the note, so a pizzicato — all of whose energy is in its
 * first two hundred milliseconds — measures far quieter than a pad holding the
 * same chord. Normalising on that number then boosts the pizzicato by ten
 * decibels, and what you hear is not a matched instrument but a *very* loud
 * pluck followed by nothing. Measured that way here, the first pass left the
 * pizzicato still 9.4dB down in real playing while its attack had grown
 * savage.
 *
 * So the signal is cut into short blocks, blocks far below the loud ones are
 * discarded, and the rest are averaged. That measures the *note* rather than
 * the note plus the silence after it, which is what the ear is doing when it
 * decides two sounds are equally loud.
 *
 * Peak normalisation is the opposite mistake and is not used: it makes
 * percussive patches quiet and pads loud.
 *
 * The render deliberately stops at the chord's own FX-free voice. Reverb,
 * chorus and delay are global and player-controlled; folding them in would
 * calibrate the library to one setting of knobs the player is about to move.
 */

const CHORD = [48, 52, 55, 59]
/** When the chord is struck, and when it is let go. */
const ATTACK_AT = 0.05
const RELEASE_AT = 1.05
const RENDER = 2.0
/** The window the RMS is taken over — attack and body, before the release. */
const WINDOW = [ATTACK_AT, RELEASE_AT]

/** Beyond this, a preset is not quiet — it is broken, and hiding it is worse. */
const TRIM_LIMIT = 12

const midiToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12)
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9))
const r2 = (x) => Math.round(x * 100) / 100

/** Block length and hop for the gated measure, in seconds. */
const BLOCK = 0.2
const HOP = 0.1
/** Blocks this far below the loudest are silence or tail, and are discarded. */
const GATE_DB = 12

/**
 * Gated loudness over the whole render, in dB.
 *
 * The relative gate is what separates "this note is quiet" from "this note is
 * over". Without it every measurement is really a measurement of how long the
 * sound lasts.
 */
function gatedLoudness(buffer) {
  const data = buffer.getChannelData(0)
  const rate = buffer.sampleRate
  const block = Math.floor(BLOCK * rate)
  const hop = Math.floor(HOP * rate)

  const blocks = []
  for (let start = 0; start + block <= data.length; start += hop) {
    let sum = 0
    for (let i = start; i < start + block; i++) sum += data[i] * data[i]
    blocks.push(sum / block)
  }
  if (blocks.length === 0) return -Infinity

  const loudest = Math.max(...blocks)
  if (loudest <= 0) return -Infinity
  const floor = loudest * Math.pow(10, -GATE_DB / 10)
  const kept = blocks.filter((b) => b >= floor)
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length
  return 10 * Math.log10(mean)
}

function peakOf(buffer) {
  const data = buffer.getChannelData(0)
  let p = 0
  for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]))
  return p
}

/** Render one treble preset in isolation, exactly as the instrument voices it. */
async function renderSound(Tone, sounds, index) {
  const sound = sounds.soundAt(index)
  const buffer = await Tone.Offline(() => {
    const filter = new Tone.Filter({
      frequency: sound.cutoff,
      type: 'lowpass',
      rolloff: -24,
      Q: 0.8,
    }).toDestination()
    const synth =
      sound.engine === 'sub' ? new Tone.PolySynth(Tone.Synth) : new Tone.PolySynth(Tone.FMSynth)
    synth.connect(filter)
    // The one definition, shared with the synth — see `voiceParams`.
    synth.set(sounds.voiceParams(sound, 0))
    for (const n of CHORD) {
      synth.triggerAttack(midiToFreq(n), ATTACK_AT, 0.8)
      synth.triggerRelease(midiToFreq(n), RELEASE_AT)
    }
  }, RENDER)
  return buffer
}

/** The bass is monophonic and lives an octave and a half down. */
async function renderBass(Tone, bass, index) {
  const sound = bass.bassAt(index)
  const buffer = await Tone.Offline(() => {
    const synth = new Tone.MonoSynth({
      oscillator: { type: sound.wave },
      envelope: {
        attack: sound.attack,
        decay: sound.decay,
        sustain: sound.sustain,
        release: sound.release,
      },
      filter: { Q: sound.q, type: 'lowpass', rolloff: -24 },
      filterEnvelope: {
        attack: sound.filterAttack,
        decay: sound.filterDecay,
        sustain: sound.filterSustain,
        release: sound.release,
        baseFrequency: sound.base,
        octaves: sound.octaves,
      },
      volume: sound.volume,
    }).toDestination()
    synth.triggerAttack(midiToFreq(40), ATTACK_AT, 0.85)
    synth.triggerRelease(RELEASE_AT)
  }, RENDER)
  return buffer
}

/** Median, because one silent outlier should not drag the whole target. */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function run(toneUrl) {
  const resource = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
  const pick = (re) => resource.filter((n) => re.test(n)).sort((a, b) => b.length - a.length)[0]
  const Tone = await import(toneUrl ?? pick(/deps\/tone\.js\?v=/))
  const sounds = await import(pick(/src\/engine\/sounds\.ts/))
  const bass = await import(pick(/src\/engine\/bass\.ts/))

  const treble = []
  for (let i = 0; i < sounds.SOUNDS.length; i++) {
    const buf = await renderSound(Tone, sounds, i)
    treble.push({
      i,
      name: sounds.soundLabel(i),
      rms: gatedLoudness(buf),
      peak: db(peakOf(buf)),
    })
  }

  const low = []
  for (let i = 0; i < bass.BASS_SOUNDS.length; i++) {
    const buf = await renderBass(Tone, bass, i)
    low.push({
      i,
      name: bass.bassLabel(i),
      rms: gatedLoudness(buf),
      peak: db(peakOf(buf)),
    })
  }

  /*
   * Two jobs, two numbers — the distinction a mixer makes between a channel
   * trim and a section fader, and getting it wrong is why the bass first came
   * out pinned at the clamp on seven of twelve presets.
   *
   * **Per-preset trim** flattens a family against *its own* median, so no
   * preset jumps out when you scroll past it. Those corrections are small by
   * construction, and a large one is then a genuine signal that something is
   * wrong with that preset rather than an artefact of comparing a lone bass
   * note against a four-note chord.
   *
   * **Section offset** places one family against another. That is a mix
   * decision, it belongs on the bus rather than smeared across twelve presets,
   * and it is the thing the player's own Bass Volume then moves.
   */
  const target = r2(median(treble.map((t) => t.rms)))
  const bassTarget = r2(median(low.map((t) => t.rms)))

  const solve = (rows, to) =>
    rows.map((r) => {
      const want = to - r.rms
      const clamped = Math.max(-TRIM_LIMIT, Math.min(TRIM_LIMIT, want))
      return { ...r, trim: r2(clamped), railed: Math.abs(want - clamped) > 0.01 }
    })

  const trebleTrim = solve(treble, target)
  const bassTrim = solve(low, bassTarget)

  const spread = (rows, key) => r2(Math.max(...rows.map((r) => r[key])) - Math.min(...rows.map((r) => r[key])))

  return {
    target,
    bassTarget,
    // What the bass bus has to be scaled by to sit level with the chords. The
    // player's Bass Volume then works either side of that, instead of spending
    // its first third of travel undoing a mistake.
    BASS_SECTION_DB: r2(target - bassTarget),
    bassSpreadBefore: spread(low, 'rms'),
    // The number that matters: how far apart the library was, and how far
    // apart it is once trimmed.
    spreadBefore: spread(treble, 'rms'),
    spreadAfter: r2(
      Math.max(...trebleTrim.map((r) => r.rms + r.trim)) -
        Math.min(...trebleTrim.map((r) => r.rms + r.trim)),
    ),
    railed: trebleTrim.filter((r) => r.railed).map((r) => `${r.name} (${r2(target - r.rms)}dB)`),
    SOUND_TRIM: trebleTrim.map((r) => r.trim),
    BASS_TRIM: bassTrim.map((r) => r.trim),
    detail: trebleTrim.map((r) => ({ name: r.name, rms: r2(r.rms), trim: r.trim })),
    bassDetail: bassTrim.map((r) => ({ name: r.name, rms: r2(r.rms), trim: r.trim })),
  }
}
