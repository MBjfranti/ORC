# 10 — Sound Palette & Chord Vocabulary

The user's brief specifically asked for *"the types of chords and sounds it creates."* This file
answers that directly — the musical character of the instrument, rather than its mechanics.

---

## Part 1 — The chord vocabulary

### The full reachable set

From 4 chord types × 16 extension subsets, per root. Below is every combination that lands on a
recognized chord, with the ones you'd actually reach for marked ★. **[DERIVED]** from the
documented additive model in [03](03-chord-engine.md).

#### From **Maj** (0, 4, 7)

| Extensions | Chord | Semitones | Character |
|-----------|-------|-----------|-----------|
| — | ★ **Major** | 0 4 7 | Bright, stable, resolved |
| 6 | ★ **6** | 0 4 7 9 | Vintage pop, 50s, warm and sweet |
| m7 | ★ **7** (dominant) | 0 4 7 10 | Bluesy, wants to resolve, funk/soul |
| M7 | ★ **maj7** | 0 4 7 11 | Dreamy, floating, bossa/neo-soul |
| 9 | ★ **add9** | 0 4 7 14 | Open, modern, shimmering — no 7th |
| 6 + 9 | ★ **6/9** | 0 4 7 9 14 | Lush, Steely Dan, unresolved-but-happy |
| m7 + 9 | ★ **9** | 0 4 7 10 14 | Funk. Straight-up funk |
| M7 + 9 | ★ **maj9** | 0 4 7 11 14 | Peak neo-soul / Tame Impala territory |
| 6 + m7 | **13** (shell) | 0 4 7 9 10 | Dominant with a 13th |
| 6 + M7 | maj7(add13) | 0 4 7 9 11 | Dense, ambiguous |
| m7 + M7 | **crunch** | 0 4 7 10 11 | Both 7ths — a deliberate semitone clash |
| 6 + m7 + 9 | ★ **13** | 0 4 7 9 10 14 | Full dominant 13 |
| 6 + M7 + 9 | maj13 | 0 4 7 9 11 14 | Lush and very dense |
| m7 + M7 + 9 | *"JAZZ"* | — | Screen gives up |
| 6 + m7 + M7 | *"???"* | — | Screen gives up |
| all four | *"WTF?"* | 0 4 7 9 10 11 14 | Seven notes. Chaos. |

#### From **Min** (0, 3, 7)

| Extensions | Chord | Semitones | Character |
|-----------|-------|-----------|-----------|
| — | ★ **minor** | 0 3 7 | Sad, serious, the workhorse |
| 6 | ★ **m6** | 0 3 7 9 | Melancholy but bright — very cinematic |
| m7 | ★ **m7** | 0 3 7 10 | Smooth, soulful, the most-used jazz chord |
| M7 | ★ **m(maj7)** | 0 3 7 11 | Sinister, Bond-theme, Hitchcock |
| 9 | **m(add9)** | 0 3 7 14 | Wistful, spacious |
| m7 + 9 | ★ **m9** | 0 3 7 10 14 | Gorgeous. Neo-soul, house, R&B |
| 6 + 9 | m6/9 | 0 3 7 9 14 | Dorian, sophisticated |
| M7 + 9 | m(maj9) | 0 3 7 11 14 | Beautiful and unsettling |
| 6 + m7 | m13 (shell) | 0 3 7 9 10 | Dorian-flavored |
| 6 + m7 + 9 | ★ **m13** | 0 3 7 9 10 14 | Full, floaty, Dorian |

#### From **Dim** (0, 3, 6)

| Extensions | Chord | Semitones | Character |
|-----------|-------|-----------|-----------|
| — | ★ **diminished** | 0 3 6 | Tense, unstable, transitional |
| 6 | ★ **dim7** | 0 3 6 9 | Fully symmetric — the classic passing chord |
| m7 | ★ **m7♭5** (half-dim) | 0 3 6 10 | The ii of a minor ii-V-i. Essential |
| M7 | dim(maj7) | 0 3 6 11 | Very strange, very tense |
| 9 | dim(add9) | 0 3 6 14 | Rare, eerie |
| m7 + 9 | **m9♭5** | 0 3 6 10 14 | Lush half-diminished |

Note the accident that works: **Dim + 6 = dim7**, because the "6th" (9 semitones) *is* the
diminished 7th enharmonically. The additive model gets a genuinely important chord for free.

#### From **Sus** (0, 5, 7 assumed sus4)

| Extensions | Chord | Semitones | Character |
|-----------|-------|-----------|-----------|
| — | ★ **sus4** | 0 5 7 | Suspended, unresolved, open |
| 9 | ★ **sus2/9** | 0 5 7 14 | Very open, ambient, quartal-ish |
| m7 | ★ **7sus4** | 0 5 7 10 | The gospel/house chord |
| M7 | maj7sus4 | 0 5 7 11 | Floating, Lydian-adjacent |
| 6 | 6sus4 | 0 5 7 9 | Airy, folk |
| m7 + 9 | ★ **9sus4** | 0 5 7 10 14 | Peak deep-house / 70s soul |

### What this vocabulary is *good at*

Mapping the reachable set against genre, the Orchid is unmistakably tuned for:

- **Neo-soul / R&B** — maj9, m9, m11-ish stacks, 6/9. The extension row is basically a
  neo-soul chord kit.
- **Psychedelic pop** (unsurprisingly) — maj7, add9, sus, and out-of-key chromatic moves.
- **Bossa nova / jazz-lite** — maj7, m7, m7♭5, dim7, 13.
- **Deep house / garage** — 9sus4, m9, 7sus4.
- **Lo-fi / bedroom pop** — everything above, played slowly on a Rhodes patch.

### What it's *bad* at (or can't reach)

**[DERIVED]** Notable absences from the documented four-type / four-extension grid:

| Missing | Why it matters |
|---------|----------------|
| **Augmented** (0 4 8) | A basic triad quality. Presumably a Secret Chord. |
| **♭9, ♯9, ♯11, ♭13** | All altered dominant tension. No Hendrix chord (7♯9), no altered V. |
| **11 / sus2-and-4 stacks** | Quartal harmony is only approachable sideways |
| **Power chords / open 5ths** | No explicit no-3rd option |
| **Slash chords / explicit bass inversions** | The bass always takes the root; you can't easily specify C/E |
| **Polychords, upper-structure triads** | Out of reach by design |

The last one is the most interesting for us. **The bass plays the root of the chord**, and while
the Bass Voicing dial moves it around, there's no documented "put this specific note in the
bass" control. Slash chords are the single most requested thing in every chord tool, and adding
them would be a meaningful improvement.

### Progression behavior

Two things shape how progressions actually *sound* on this instrument:

1. **Automatic voice leading** between chord changes (see [05](05-voicing-engine-and-inversions.md))
   — the engine minimizes note movement, so progressions sound smooth and connected without
   the user knowing what an inversion is. This is a large part of why "anything you play sounds
   good."
2. **Key Mode** constrains you to seven diatonic chords, which makes accidental wrong notes
   nearly impossible. Turn it off and the same 12 keys give you 12 chromatic roots — instant
   modal interchange and borrowed chords, which is where the "happy accidents" come from.

---

## Part 2 — The sonic palette

### Engine character **[OFFICIAL + DERIVED]**

| Engine | Typical sounds | Web Audio approach |
|--------|----------------|--------------------|
| **Polyphonic subtractive (VA)** | Warm pads, brass stabs, string ensembles, organs, plucks, resonant leads, sub bass | Multiple `OscillatorNode`s (saw/square/tri/pulse) → `BiquadFilterNode` (lowpass, resonant) → `GainNode` ADSR. Add slight detune + drift for warmth. |
| **FM** | DX-style electric pianos, bells, glassy keys, metallic plucks, bass with attack bite | Oscillator-modulating-oscillator-frequency chains; 2–4 operator setups cover most classic DX tones. |
| **Vintage EP / reed** | Rhodes, Wurlitzer, tine pianos | FM (2-op) is genuinely how a Rhodes is best synthesized — bell-like attack transient over a sine body. |

**[PRESS]** Reviewers describe the palette as *"analog-sounding retro synths,"* *"organs, pads,
and sparkly arpeggios."* The overall aesthetic is **warm, slightly lo-fi, 70s-adjacent** — not
clinical, not aggressive, not modern EDM. Nothing in the reported preset list suggests
supersaws, screaming leads, or hard digital textures.

### The naming aesthetic **[OFFICIAL]**

`Lemon` · `DX Guitar` · `Trout` · `Plumerai La Tete` · `Cosmic Day Spa` · `PBass` · `ORC808` ·
`Fifth Organ Bass` · `Meadow Bass` · `Rezdist Bass` · `Saint Germain` · `Orchid Bossanova` ·
`Millionaire`

Evocative, playful, occasionally nonsensical, never technical. This is a real design decision:
naming a patch "Cosmic Day Spa" instead of "Pad 07" tells the user what it *feels* like and sets
the instrument's tone as a toy for ideas rather than an engineering tool. **Cheap to copy, high
impact.** We should name our presets like this.

### Effects palette **[PRESS/OFFICIAL]**

Reverb · Chorus · Delay · Flanger · Phaser · Overdrive, plus a filter cutoff macro.

This set is squarely **psychedelic/vintage**: chorus and phaser are 70s–80s signatures,
overdrive adds grit rather than distortion, delay for space. No bitcrusher, no granular, no
convolution weirdness. All six map directly to Web Audio primitives —
`ConvolverNode` (reverb), `DelayNode` + LFO (chorus/flanger/phaser via `WaveShaperNode`-free
allpass chains), `WaveShaperNode` (overdrive), `BiquadFilterNode` (cutoff).

### Rhythmic palette **[OFFICIAL/PRESS]**

20 beats spanning **trap, disco, Latin, bossa nova**, and whatever `Saint Germain` and
`Millionaire` turn out to be. Broadly: **songwriter-friendly grooves**, not club tools.

### Overall sonic thesis

Put together — warm retro engines, vintage FX, neo-soul chord vocabulary, gentle grooves,
automatic voice leading — the Orchid is engineered to produce **pleasant, harmonically rich,
slightly nostalgic music with almost no input.** It is very hard to make it sound bad, and
correspondingly hard to make it sound aggressive or modern.

That's the target we're aiming at. Whether we widen it (altered dominants, harder sounds,
slash chords) is a product decision, not a technical one — but we should make it knowingly.
