# 14 — The Sound Library

**Status:** built. `src/engine/sounds.ts` now holds fifty presets whose
waveform, envelope, harmonicity, modulation index and modulation envelope are
derived from a real General MIDI timbre table. The generator that produced them
is kept at `scripts/derive-sounds.cjs` so the derivation can be re-run and
checked rather than taken on trust.

---

## The brief

> "A nice old Rhodes Piano, woodwinds like Fangorn Forest, strings, all the
> panoply of beautiful musical sounds."

Not a synth-preset library. A library of **instruments** — things with a history
and a place, rendered on a small synth. The character comes from the palette
being broad and *musical*, not from exotic synthesis.

## Where the parameters came from

**webaudio-tinysynth** by Tatsuya Shinyagaito (g200kg), specifically its
`program1` table: 128 General MIDI programs as a two-oscillator model. Fifty
were selected and converted. Each preset carries a `// GM nn <name>` comment, so
any value can be read back against the source.

### The licence is Apache-2.0, not MIT

This document previously recorded it as "MIT per the repository". **That was
wrong.** Both `LICENSE` in the repository and the `license` field of the
published package say Apache-2.0. It is still fine to derive from, but Apache-2.0
§4 requires attribution and a copy of the licence, which MIT-style courtesy
attribution would not have satisfied. See `THIRD-PARTY-NOTICES.md` and
`LICENSE-webaudio-tinysynth.txt`.

The general lesson: a licence claimed in prose is not a licence. Check the
package.

## The conversion

Worked out by reading both synths' source rather than by ear. `g:1` on an
oscillator means it modulates the frequency of oscillator 0.

| Ours | Theirs | Why |
|---|---|---|
| `harmonicity` | modulator `t` | Both define modulator frequency as `carrier × ratio`. Copies straight across. |
| `index` | modulator `v` | tinysynth scales the modulator's gain by the carrier frequency, so peak deviation is `v × fc`. Tone multiplies `frequency × modulationIndex` into the same node. Same quantity, different name. |
| `attack` | `a` | Both a linear ramp to peak. |
| `decay`, `release` | `d`, `r` | **Time constants**, kept in the source's units — see below. |
| `sustain` | `s` | A fraction of peak in both. |

Three places where a direct copy would have been wrong:

- **Decay is not a duration.** tinysynth passes `d` to `setTargetAtTime` as a
  time constant. Tone takes a *duration* and derives `ln(D+1)/ln(200)` itself.
  Solving one for the other is exact but explodes — the strings' `d:11` would
  need a decay of about 10²⁵ seconds. So the library stores the source's time
  constants, `synth.ts` converts through `decayFor()`, and the constant is
  capped with the sustain refitted numerically against the source curve over the
  four seconds a chord actually rings for.
- **Modulator sustain can exceed its own peak.** Brass grows brighter as it is
  held (`v:1, s:4`). Tone's envelopes cannot sustain above unity, so the excess
  folds into the index and the sustain clamps, which preserves the *sustained*
  depth exactly — the right trade for an instrument that plays held chords.
- **`w9999` is not a waveform name.** It decodes to a periodic wave of four
  equal-amplitude harmonics — a drawbar organ registration with every drawbar at
  9. Approximated as a filtered sawtooth.

## What is ours, and labelled as ours

tinysynth has **no filter and no effects**, so cutoff, reverb, chorus, delay and
trim are original. The cutoff is derived rather than picked — how far the
timbre's partials actually reach (FM sidebands span `harmonicity × (index+1)`
harmonics, or the carrier's own waveform, whichever is further), evaluated at
middle C, then set half an octave above so that Colour at twelve o'clock is
transparent. The effects and trim are voiced by hand.

## Naming

Evocative, slightly absurd, never technical — the house style Telepathic use
(`Cosmic Day Spa`, `Millionaire`, `Trout`). Names come from **history, the
instrument itself, or how it gets used**. `Tuning Note` is the oboe, because
that is what an orchestra uses it for. `Licorice Stick` is period slang for a
clarinet. `Fagotto` is the bassoon's own name. `Powdered Wig` is the
harpsichord's century. Never `FM Bell 2`; there is a test that fails on exactly
that shape.

Names are kept to sixteen characters, which is what `Plumerai La Tete` — a
genuine published ORC-1 preset — needs, and so is demonstrably within what the
hardware's screen allows.

## Constraints enforced by tests

`src/engine/sounds.test.ts` guards the properties that make a browse list
usable. Any replacement library must keep them:

- Fifty entries, all names distinct, all reachable, clamping rather than wrapping
- No envelope that resolves to silence; attack under 2.5s
- Cutoff inside 400–8000 Hz; arriving effects at most 0.7 wet
- All three engines represented, none a token presence
- No name shaped like a parameter set
- **Decay and release stay time constants** — a value much above 1 is one that
  was pasted in already converted, and would ring for the rest of the session
- Every modulated preset carries a modulation envelope
- The five Lead names survive, and all five actually sustain

## The known error, avoided this time

Telepathic publish five preset names under **Lead** (`research/07`): Lemon, DX
Guitar, Trout, Plumerai La Tete, Cosmic Day Spa. All five were once built here as
plucks or pads. Category is the one documented fact about them. They are now
drawn from the GM *lead* programs, so they sustain by construction rather than by
remembering to.

## Honest status

**Nothing here has been heard.** Synthetic key events cannot unlock an
AudioContext, so every browser check comes back silent. The parameters are
sourced and the conversion is verified by round-trip test, but whether the
library sounds good is unestablished. The FM entries at the bright end —
`Trout` and `Porch Kalimba`, both at index 22 — are the most likely to want a
pass once someone plays them.
