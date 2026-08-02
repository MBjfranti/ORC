// Derive our fifty presets from webaudio-tinysynth's GM timbre table.
//
// This is kept in the repo so that "derived from the GM table" is a claim you
// can check rather than one you have to take on trust. It is not part of the
// build; it produced `src/engine/sounds.ts` once and exists to reproduce it.
//
//   npm pack webaudio-tinysynth && tar -xzf webaudio-tinysynth-*.tgz
//   node scripts/derive-sounds.js           package/webaudio-tinysynth.js
//   node scripts/derive-sounds.js --check   package/webaudio-tinysynth.js
//
// Without `--check` it emits the SOUNDS array body. With it, a readable table
// of what each preset became, including how well each envelope fits its source
// curve and which ones hit the time-constant cap.
//
// Emits the SOUNDS array body on stdout. Sourced from the table: waveform,
// envelope, harmonicity, modulation index, modulation envelope. Ours: cutoff,
// effects, trim — tinysynth has no filter and no effects at all.
//
// Decay and release are stored as the source's *time constants*, unconverted,
// so every number here can be read straight off the source table. synth.ts does
// the conversion into Tone's units in one place.
const fs = require('fs')

const args = process.argv.slice(2)
const check = args.includes('--check')
const srcPath = args.find((a) => !a.startsWith('--')) || 'webaudio-tinysynth.js'
const src = fs.readFileSync(srcPath, 'utf8')

function literal(key) {
  const start = src.indexOf(key + ':[')
  let i = src.indexOf('[', start)
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '[') depth++
    else if (src[j] === ']') {
      depth--
      if (depth === 0) return src.slice(i, j + 1)
    }
  }
}

const NAMES = eval(literal('program')).map((p) => p.name)
const PROGS = eval(literal('program1'))
const defp = { g: 0, w: 'sine', t: 1, f: 0, v: 0.5, a: 0, h: 0.01, d: 0.01, s: 0, r: 0.05, p: 1, q: 1, k: 0 }
const fill = (o) => Object.assign({}, defp, o)

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const r2 = (n) => Math.round(n * 100) / 100
const r3 = (n) => Math.round(n * 1000) / 1000

// --- envelope conversion ---------------------------------------------------
//
// Both synths decay by exponential approach, so the shapes match; only the
// parameterisation differs. tinysynth passes its `d` straight to
// setTargetAtTime as a time constant. Tone takes a *duration* D and derives
// tau = ln(D+1)/ln(200), so D = 200^tau - 1.
//
// That conversion is exact but explodes: the strings' d:11 would need a decay
// of 1e25 seconds. So tau is capped, and the sustain is then fitted to recover
// what the cap loses over the four seconds a chord actually rings for.

const TAU_MAX = 0.8 // -> a decay of 68s, i.e. a very slow tail
const REL_MAX = 0.3 // -> a release of 3.9s; longer holds voices open too long
const toneDecay = (tau) => Math.pow(200, tau) - 1

/** Source level as a fraction of peak, t seconds after the attack ends. */
function tiny(t, h, d, s) {
  if (t < h) return 1
  if (d <= 0) return s
  return s + (1 - s) * Math.exp(-(t - h) / d)
}

/** Tone's level as a fraction of peak, for decay duration D and sustain S. */
function tone(t, D, S) {
  if (t >= D) return S
  const tau = Math.log(D + 1) / Math.log(200)
  const knee = D * 0.9
  const at = (x) => S + (1 - S) * Math.exp(-x / tau)
  if (t < knee) return at(t)
  const v = at(knee) // last 10% is a linear run-in to S
  return v + ((S - v) * (t - knee)) / (D - knee)
}

const HORIZON = 4
const grid = Array.from({ length: 160 }, (_, i) => (i * HORIZON) / 159)

/**
 * Keep the source time constant (capped), and fit only the sustain. Where the
 * cap does not bite this reproduces the source curve outright.
 */
function fitSustain(h, d, s, cap) {
  const tau = clamp(d, 0.005, cap)
  const D = toneDecay(tau)
  const target = grid.map((t) => tiny(t, h, d, s))
  let best = { S: s, err: Infinity }
  for (let si = 0; si <= 200; si++) {
    const S = si / 200
    let err = 0
    for (let k = 0; k < grid.length; k++) {
      const e = tone(grid[k], D, S) - target[k]
      err += e * e
    }
    if (err < best.err) best = { S, err }
  }
  return { tau: r3(tau), sustain: r2(best.S), err: best.err, capped: d > cap }
}

// --- the selection ---------------------------------------------------------
//
// [GM program, name, engine, [reverb, chorus, delay]]
// The effects are ours, set so each preset arrives playable without touching a
// knob.
const PICK = [
  // keys
  [5, "Suitcase '73", 'ep', [0.26, 0.22, 0]],
  [6, 'Millionaire', 'ep', [0.22, 0.16, 0.1]],
  [1, 'Parlour Upright', 'ep', [0.2, 0.06, 0]],
  [4, 'Saloon Tuesday', 'ep', [0.16, 0.3, 0]],
  [7, 'Powdered Wig', 'ep', [0.24, 0.04, 0]],
  [8, 'Funk Cabinet', 'ep', [0.12, 0.2, 0.08]],
  // mallets and bells
  [12, 'Hotel Lobby', 'fm', [0.3, 0.34, 0.06]],
  [11, 'Wind-Up Lullaby', 'fm', [0.34, 0.06, 0.12]],
  [13, 'Rosewood Rain', 'fm', [0.24, 0.08, 0.1]],
  [9, 'Sugarplum', 'fm', [0.32, 0.1, 0.14]],
  [109, 'Porch Kalimba', 'fm', [0.28, 0.05, 0.1]],
  [15, 'Bell Tower', 'fm', [0.42, 0.08, 0.16]],
  // organs
  [17, 'Drawbars Out', 'sub', [0.18, 0.26, 0]],
  [19, 'Roadhouse Organ', 'sub', [0.2, 0.4, 0]],
  [20, 'Cold Cathedral', 'sub', [0.56, 0.12, 0]],
  [22, 'Accordion Cafe', 'fm', [0.18, 0.42, 0]],
  [23, 'Boxcar Harp', 'fm', [0.24, 0.3, 0.12]],
  // plucked
  [25, 'Nylon Courtyard', 'fm', [0.26, 0.08, 0]],
  [28, 'Surf Motel', 'fm', [0.3, 0.24, 0.22]],
  [30, 'Garage Door', 'fm', [0.16, 0.12, 0.08]],
  [105, 'Raga Hour', 'fm', [0.34, 0.1, 0.14]],
  [47, 'Gilded Harp', 'fm', [0.4, 0.14, 0.1]],
  // strings
  [41, 'First Chair', 'fm', [0.34, 0.16, 0]],
  [43, 'Bow and Rosin', 'fm', [0.36, 0.12, 0]],
  [45, 'Tremolo Fog', 'fm', [0.44, 0.2, 0]],
  [46, 'Tiptoe Pizz', 'fm', [0.28, 0.06, 0.12]],
  [49, 'Rented Tuxedo', 'sub', [0.44, 0.38, 0]],
  [51, 'Cheap Strings', 'sub', [0.36, 0.5, 0.06]],
  // winds
  [74, 'Silver Breath', 'fm', [0.34, 0.14, 0.08]],
  [76, 'Fangorn Forest', 'fm', [0.46, 0.18, 0.2]],
  [80, "Shepherd's Hour", 'fm', [0.4, 0.1, 0.16]],
  [72, 'Licorice Stick', 'fm', [0.26, 0.12, 0]],
  [71, 'Fagotto', 'fm', [0.28, 0.08, 0]],
  [69, 'Tuning Note', 'fm', [0.24, 0.06, 0]],
  [78, 'Wandering Monk', 'fm', [0.48, 0.1, 0.24]],
  // brass
  [57, 'Reveille', 'fm', [0.22, 0.08, 0.06]],
  [60, 'Harmon Mute', 'fm', [0.3, 0.1, 0.14]],
  [61, 'Hunting Horn', 'fm', [0.38, 0.12, 0]],
  [62, 'Miami Exterior', 'fm', [0.2, 0.24, 0.1]],
  // voices
  [53, 'Vaulted Choir', 'fm', [0.5, 0.3, 0]],
  [54, 'Streetlight Ooh', 'fm', [0.42, 0.26, 0.08]],
  // leads — the five Telepathic publish under Lead (research/07)
  [82, 'Lemon', 'fm', [0.2, 0.18, 0.22]],
  [85, 'DX Guitar', 'fm', [0.18, 0.24, 0.16]],
  [84, 'Trout', 'fm', [0.26, 0.14, 0.26]],
  [86, 'Plumerai La Tete', 'fm', [0.28, 0.3, 0.2]],
  [83, 'Cosmic Day Spa', 'fm', [0.44, 0.46, 0.18]],
  [87, 'Fifth Ghost', 'sub', [0.32, 0.28, 0.34]],
  // pads
  [90, 'Wool', 'fm', [0.4, 0.3, 0.06]],
  [92, 'Tape Choir', 'fm', [0.46, 0.5, 0.1]],
  [96, 'Slow Weather', 'fm', [0.52, 0.44, 0.12]],
]

// tinysynth has no filter, so the cutoff is ours — but it is derived rather
// than picked: how far the timbre's partials actually reach, measured in
// harmonics of the note and evaluated at middle C.
const C4 = 261.63
const WAVE_HARMONICS = { sine: 3, triangle: 6, w9999: 4, square: 12, sawtooth: 16 }
const WAVE_MAP = { sine: 'sine', triangle: 'triangle', square: 'square', sawtooth: 'sawtooth', w9999: 'sawtooth' }

const out = []
const seen = new Set()

for (const [gm, name, engine, fx] of PICK) {
  if (seen.has(gm)) throw new Error('duplicate GM ' + gm)
  seen.add(gm)
  if (name.length > 20) throw new Error('name too long: ' + name)

  const osc = PROGS[gm - 1].map(fill)
  const carrier = osc.find((o) => o.g === 0)
  const mod = osc.find((o) => o.g === 1)
  if (engine === 'sub' && mod) throw new Error(gm + ' is FM, not additive')
  if (engine !== 'sub' && !mod) throw new Error(gm + ' has no modulator')

  const env = fitSustain(carrier.h, carrier.d, carrier.s, TAU_MAX)
  const attack = Math.max(carrier.a, 0.002)
  const release = r3(clamp(carrier.r, 0.02, REL_MAX))

  let harmonicity = null, index = null, modEnv = null, modAttack = null, modRelease = null
  if (mod) {
    harmonicity = mod.t
    if (harmonicity <= 0) throw new Error(gm + ' has harmonicity 0')
    // Tone's sustain is a fraction of the peak, but tinysynth lets a modulator
    // sustain *above* its peak — brass grows brighter as it is held. Fold the
    // excess into the index so the sustained depth, which is what a held chord
    // sounds like, comes out exact.
    const excess = Math.max(1, mod.s)
    index = r2(mod.v * excess)
    modEnv = fitSustain(mod.h, mod.d, clamp(mod.s / excess, 0, 1), TAU_MAX)
    modAttack = r3(Math.max(mod.a, 0.001))
    modRelease = r3(clamp(mod.r, 0.02, REL_MAX))
  }

  // FM sidebands reach harm*(index+1) harmonics, but the carrier is not always
  // a sine — a square-wave harmonica is bright before the modulator does
  // anything — so take whichever reaches further.
  //
  // The filter then sits half an octave *above* that reach rather than on it:
  // Colour is centred on this value, so at twelve o'clock the patch should
  // sound as designed, with the knob shaping it in either direction.
  const harmonics = mod
    ? Math.max(WAVE_HARMONICS[carrier.w], harmonicity * (index + 1))
    : WAVE_HARMONICS[carrier.w]
  const cutoff = Math.round(clamp(C4 * harmonics * 1.5, 500, 8000) / 50) * 50

  // The source's `v` is a raw amplitude and tracks loudness only loosely once
  // FM depth is involved, so it is half-weighted and kept on a short leash: a
  // browse list you have to ride the level knob through is a broken one.
  const base = engine === 'sub' ? -15 : engine === 'ep' ? -14 : -17
  const volume = r2(clamp(base + 10 * Math.log10(carrier.v / 0.4), -21, -12))

  out.push({
    gm, gmName: NAMES[gm - 1], name, engine,
    wave: engine === 'sub' ? WAVE_MAP[carrier.w] : null,
    srcWave: carrier.w, srcDecay: carrier.d, srcRelease: carrier.r,
    cutoff, attack: r3(attack),
    decay: env.tau, sustain: env.sustain, release,
    harmonicity: harmonicity === null ? null : r2(harmonicity), index,
    modAttack,
    modDecay: modEnv && modEnv.tau, modSustain: modEnv && modEnv.sustain, modRelease,
    fx, volume, err: env.err, capped: env.capped,
  })
}

if (out.length !== 50) throw new Error('expected 50, got ' + out.length)

if (check) {
  for (const s of out) {
    console.log(
      `${String(s.gm).padStart(3)} ${s.gmName.padEnd(24)} -> ${s.name.padEnd(17)} ${s.engine} ` +
        `cut${String(s.cutoff).padStart(5)} a${s.attack} d${s.decay}${s.capped ? '!' : ' '} s${s.sustain} r${s.release}` +
        (s.harmonicity ? `  h${s.harmonicity} i${s.index} | md${s.modDecay} ms${s.modSustain}` : `  ${s.wave} (${s.srcWave})`) +
        `  ${s.volume}dB  fit=${s.err.toFixed(3)}`,
    )
  }
  const worst = out.slice().sort((a, b) => b.err - a.err).slice(0, 6)
  console.error('\nworst fits:', worst.map((w) => `${w.name} ${w.err.toFixed(2)}`).join(', '))
  console.error('capped (source tail longer than we can express):', out.filter((s) => s.capped).length)
  const byEngine = {}
  for (const s of out) byEngine[s.engine] = (byEngine[s.engine] || 0) + 1
  console.error('engines:', JSON.stringify(byEngine))
  console.error('decay range:', Math.min(...out.map((s) => s.decay)), '..', Math.max(...out.map((s) => s.decay)))
} else {
  const q = (s) => `'${s.replace(/'/g, "\\'")}'`
  for (const s of out) {
    const tail = `[${s.fx.join(', ')}], ${s.volume}), // GM ${s.gm} ${s.gmName}`
    if (s.engine === 'sub') {
      console.log(
        `  sub(${q(s.name)}, '${s.wave}', ${s.cutoff}, ` +
          `[${s.attack}, ${s.decay}, ${s.sustain}, ${s.release}], ${tail}`,
      )
    } else {
      console.log(
        `  ${s.engine}(${q(s.name)}, ${s.harmonicity}, ${s.index}, ${s.cutoff}, ` +
          `[${s.attack}, ${s.decay}, ${s.sustain}, ${s.release}], ` +
          `[${s.modAttack}, ${s.modDecay}, ${s.modSustain}, ${s.modRelease}], ${tail}`,
      )
    }
  }
}
