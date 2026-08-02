# 14 — The Sound Library

**Status:** direction agreed, not implemented. The current `src/engine/sounds.ts`
holds fifty presets whose parameters are **invented, not sourced** — reasoned
from engine type and never auditioned. This document is what should replace it.

---

## The brief

> "A nice old Rhodes Piano, woodwinds like Fangorn Forest, strings, all the
> panoply of beautiful musical sounds."

Not a synth-preset library. A library of **instruments** — things with a history
and a place, rendered on a small synth. The character comes from the palette
being broad and *musical*, not from exotic synthesis.

## Naming

Evocative, slightly absurd, never technical — the house style Telepathic use
(`Cosmic Day Spa`, `Millionaire`, `Trout`). Names should come from **history,
the instrument itself, or how it gets used**. Never `FM Bell 2`; there is a test
in `sounds.test.ts` that fails on exactly that shape.

| GM identity | Name | Where the name comes from |
|---|---|---|
| Rhodes Piano | `Suitcase '73` | the instrument and its year |
| Harpsichord | `Powdered Wig` | the period |
| Church Organ | `Cold Cathedral` | the room it lives in |
| Pan Flute | `Fangorn Forest` | what it evokes |
| Overdriven Guitar | `Garage Door` | where it gets played |
| Synth Brass | `Miami Exterior` | the era it belongs to |
| String Ensemble | `Rented Tuxedo` | the occasion |
| Ocarina | `Shepherd's Hour` | the use |

## Where the parameters should come from

The current set is invented. Two real sources, in order of preference:

### 1. General MIDI instrument identities — **no licence question**

GM is a published standard: 128 named instruments in eight families. Using the
*identity* (`Rhodes Piano`, `Bassoon`, `Tremolo Strings`) means the parameters
follow from what the instrument physically is, and the eight families give the
browse list its shape — which is what makes turning the dial feel like travel
rather than shuffling.

Families worth covering, given the brief:

- **Pianos and keys** — Rhodes, Wurlitzer, Clav, Celesta
- **Woodwinds** — flute, recorder, pan flute, ocarina, clarinet, bassoon
- **Strings** — solo violin, ensemble, tremolo, pizzicato, harp
- **Brass** — muted trumpet, horn, trombone section
- **Organs** — drawbar, church, reed, accordion
- **Tuned percussion** — vibraphone, marimba, kalimba, music box
- **Voices** — choir aahs, voice oohs
- **Synth leads and pads** — the instrument's own idiom

### 2. `webaudio-tinysynth` (g200kg) — real numbers, as a cross-check

MIT per the repository, though **the licence is not stated in the source file
itself and must be confirmed before shipping derived values.**

Its GM timbre map is a two-oscillator model that maps almost directly onto our
`Sound` shape: `w` waveform, `a/d/s/r` envelope, `g` gain target, `t` tuning
ratio, `f` frequency offset. Verbatim examples:

```js
// GM 5 — Electric Piano 1
[{w:"sine",v:0.35,d:0.7}, {w:"sine",v:3,t:7,f:1,d:1,s:1,g:1,k:-.7}]
// GM 7 — Harpsichord
[{w:"sawtooth",v:0.34,d:2}, {w:"sine",v:8,f:0.1,d:2,s:1,r:2,g:1}]
```

The `t:7` is a genuine 7:1 modulator ratio — the kind of number currently being
guessed. Pulling the full table needs several fetches; only programs 1–8 have
been retrieved verbatim so far.

**Do not build fifty sounds from eight retrieved entries and describe them as
sourced.** That is worse than honestly inventing all fifty, because it launders
the guess. Either pull the whole table or say plainly which values are derived.

## Constraints already enforced by tests

`src/engine/sounds.test.ts` guards the properties that make a browse list
usable, and any replacement library must keep them:

- Fifty entries, all names distinct, all reachable from the dial
- Clamps at both ends rather than wrapping
- No envelope that resolves to silence; attack under 2.5s
- Cutoff inside 400–8000 Hz
- Arriving effects at most 0.7 wet, so every preset is playable untouched
- All three engines represented, none a token presence
- No name shaped like a parameter set

## The known error to avoid repeating

Telepathic publish five preset names under **Lead** (`research/07`): Lemon, DX
Guitar, Trout, Plumerai La Tete, Cosmic Day Spa. All five were originally built
here as plucks or pads. Category is the one documented fact about those five —
check it before inventing around it.

## Honest status

Nothing in the current library has been heard. The parameters are reasoned from
engine type, not auditioned. Expect the FM entries at the strange end of the
list to be harsh, and the whole set to want a pass once it has actually been
played.
