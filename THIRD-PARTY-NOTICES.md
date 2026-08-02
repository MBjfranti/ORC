# Third-party notices

## webaudio-tinysynth

The sound library in [`src/engine/sounds.ts`](src/engine/sounds.ts) is derived from the
General MIDI timbre table in **webaudio-tinysynth**.

- Copyright © Tatsuya Shinyagaito (g200kg)
- Licensed under the Apache License, Version 2.0
- Source: <https://github.com/g200kg/webaudio-tinysynth>
- Full licence text: [`LICENSE-webaudio-tinysynth.txt`](LICENSE-webaudio-tinysynth.txt)

### What was taken, and what was changed

No code was copied. What was taken is **parameter data**: for fifty of the 128 General MIDI
programs in the project's `program1` table, the oscillator waveform, amplitude envelope,
modulator frequency ratio, modulation depth and modulator envelope. Each preset names the GM
program it came from in a trailing comment, so any value can be read back against the source.

Those values were transformed rather than transcribed, because the two synths are parameterised
differently:

- **Modulation depth.** tinysynth scales a modulator's gain by the carrier frequency, so its `v`
  is a peak deviation ratio. Tone.js multiplies `frequency × modulationIndex` into the same
  node. The two are the same quantity, so `v` becomes `index` directly, and the modulator's `t`
  becomes `harmonicity`.
- **Envelopes.** tinysynth passes its `d` and `r` to `setTargetAtTime` as time constants. Tone
  takes a duration and derives `ln(D+1) / ln(200)` internally. The library keeps the source's
  time constants so its numbers stay checkable, and converts in one place in `synth.ts`.
- **Sustain above unity.** tinysynth lets a modulator sustain above its own peak — brass grows
  brighter as it is held. Tone's envelopes cannot, so the excess is folded into the index and
  the sustain clamped, which preserves the sustained depth exactly.
- **Long tails.** A time constant of 11 seconds cannot be expressed in Tone's units at all
  (it would need a decay of ~10²⁵). Those are capped, and the sustain refitted numerically
  against the source curve over the four seconds a chord actually rings for.

Filter cutoff, effects and output trim are **not** from tinysynth, which has neither a filter
nor any effects. Those are original.
