# 03 — The Chord Engine

This is the heart of the instrument and the part we most need to get right.

## The core gesture **[OFFICIAL]**

> "To play a chord on Orchid, hold down a chord modifier of your choice, and press a single
> note on the keyboard to play the corresponding chord. How about C major? Hold the Maj chord
> modifier, and press C on the keyboard."

**Left hand selects chord quality. Right hand selects root. One key = one chord.**

That's it. Everything below is elaboration.

## The eight buttons

### Top row — CHORD TYPES (the base triad)

| Button | Chord | Intervals from root **[DERIVED]** | Example on C |
|--------|-------|-----------------------------------|--------------|
| **Dim** | Diminished | 0, 3, 6 | C – E♭ – G♭ |
| **Min** | Minor | 0, 3, 7 | C – E♭ – G |
| **Maj** | Major | 0, 4, 7 | C – E – G |
| **Sus** | Suspended | 0, 5, 7 (sus4) *or* 0, 2, 7 (sus2) | C – F – G |

**[UNKNOWN]** Whether Orchid's `Sus` is sus4, sus2, or context-dependent is not stated in the
public docs. Sus4 is the conventional default and the safer assumption. *Design decision for
us: we could expose both, or make Sus4/Sus2 a setting.*

### Bottom row — CHORD EXTENSIONS (added notes)

| Button | Adds | Interval **[DERIVED]** | Notes |
|--------|------|------------------------|-------|
| **6** | Major 6th | +9 semitones | The "6th" |
| **m7** | Minor 7th | +10 semitones | Dominant/minor 7th flavor |
| **M7** | Major 7th | +11 semitones | The "major 7th" |
| **9** | 9th | +14 semitones (= 2 + octave) | Usually implies the 7th too, but here it's additive |

**[OFFICIAL]** Key rules for extensions:

- Extensions **only work while playing a chord.** You cannot play an extension by itself.
- Extensions are **additive and stackable** — hold multiple at once.
- Extensions apply **both** when using Chord Type buttons *and* when playing in Key Mode.
- Order of operation: hold the Chord Type button + one or more Extension buttons **before**
  pressing the keyboard note.

> "Each Chord Extension adds new layers to the base chord, expanding harmonic possibilities.
> Try adding multiple extensions at once for complex chord voicings. **Watch out for too much
> Jazz.**"

That last line is the design philosophy in a nutshell — the instrument does not stop you from
making a mess, it just warns you affectionately.

### ⚠️ Documentation error worth knowing

The official "Chord Extensions Explained" article says:

> "Hold Maj and M7 buttons, then press C to play a CMaj7 chord (also notated as C7)."

**CMaj7 is not C7.** CMaj7 = C-E-G-B; C7 = C-E-G-B♭ (which would be Maj + m7). Their own docs
conflate the notation. Don't propagate this error into our UI — label things correctly.

## Combination matrix **[DERIVED]**

The 4 types × 16 extension combinations (2⁴ subsets) = **64 base chord shapes per root**,
× 12 roots = **768 addressable chords**, before Secret Chords, before inversions, before Key Mode.

Common and musically useful combinations:

| Type + Extensions | Resulting chord | Notes on C |
|-------------------|-----------------|------------|
| Maj | C major | C E G |
| Min | C minor | C E♭ G |
| Dim | C diminished | C E♭ G♭ |
| Sus | C sus4 | C F G |
| Maj + 6 | C6 | C E G A |
| Min + 6 | Cm6 | C E♭ G A |
| Maj + m7 | **C7** (dominant) | C E G B♭ |
| Maj + M7 | **Cmaj7** | C E G B |
| Min + m7 | **Cm7** | C E♭ G B♭ |
| Min + M7 | Cm(maj7) | C E♭ G B |
| Dim + m7 | **Cm7♭5** (half-dim) | C E♭ G♭ B♭ |
| Dim + 6 | **Cdim7** (fully dim — 6 = 𝄫7) | C E♭ G♭ A |
| Sus + m7 | C7sus4 | C F G B♭ |
| Maj + 9 | Cadd9 | C E G D |
| Maj + m7 + 9 | **C9** | C E G B♭ D |
| Maj + M7 + 9 | **Cmaj9** | C E G B D |
| Min + m7 + 9 | **Cm9** | C E♭ G B♭ D |
| Maj + 6 + 9 | **C6/9** | C E G A D |
| Sus + m7 + 9 | C9sus4 | C F G B♭ D |
| Maj + 6 + m7 + M7 + 9 | *"JAZZ" / "WTF?"* | everything at once |

Note how `Dim + 6` produces a proper **diminished 7th** (the 6th is enharmonically the
double-flat 7th) — a happy accident of the additive model that's musically correct.

## Play Styles **[OFFICIAL]**

`Options → Instrument → Play Style`. This changes *when* the chord-type button has to be held
relative to the key press. It matters a lot for feel and it's directly relevant to our keyboard
mapping.

### Simple
- You **must press and hold** a Chord Type button **before** the key.
- The chord sustains as long as you hold the key, **even if you release the chord-type button**.
- You **cannot** change chord type without releasing the key first.
- Most predictable; best for beginners.

### Advanced
- You can press a key to play a **single note**, then press a Chord Type button **while the key
  is still held** to turn it into a chord.
- Enables "melody first, harmonize second" playing.

### Free
- Behaves like Advanced, **plus** chords can be switched or re-triggered repeatedly after
  releasing either the Chord Type button *or* the key.
- Most dynamic, most chaotic.

### Extension Addition (Advanced & Free only) **[OFFICIAL]**
`Options → Instrument → Extension Addition`:

- **Add Note** — only the new extension note(s) trigger; existing chord notes keep sustaining.
- **Play Chord** — the entire chord re-triggers with the extension included.

This is a subtle but important expressive distinction: *layering* vs. *restating*.

## Secret Chords **[OFFICIAL, under-documented]**

`Options → Instrument → Secret Chords` — settings: **Simple Play Style only** / **All Play
Styles** / **Off**.

> "When this setting is enabled, certain combinations of the Chord Type and/or Extension
> buttons will create additional chords beyond the Orchid's standard Dim, Min, Maj, and Sus
> ones."

**[UNKNOWN] — the actual combination → chord mapping is not published anywhere I could find.**
It is not in the help center (all 43 Orchid articles enumerated), not in the firmware release
notes, and not in any review. It appears to be deliberately undocumented ("secret") and
discovered by users in the Discord.

**[DERIVED]** The obvious candidates for what multi-*type* button presses would produce:

| Combination | Plausible chord |
|-------------|-----------------|
| Maj + Min | Augmented, or minor-major ambiguity |
| Maj + Dim | Augmented (0,4,8) |
| Min + Dim | Diminished variants |
| Maj + Sus | add4 / sus2 |
| Min + Sus | m(add4) |
| Dim + Sus | ♭5 sus / quartal |
| Maj + Min + Sus + Dim | Cluster / quartal stack |

Since the docs say Dim/Min/Maj/Sus are the "standard" four and secret chords go *beyond* them,
pressing **two type buttons at once** is almost certainly the mechanism. Treat this as a design
opportunity rather than a spec to match: **we can define our own secret chords** (augmented,
quartal, 7♯9 "Hendrix", ♭9, ♯11, 13, power chord, tritone-sub) and *document* them, or keep them
as discoverable easter eggs.

## Display notation quirks **[OFFICIAL]**

- **`JAZZ` / `???` / `WTF?`** — when three or more extensions are stacked, the resulting chord
  is too complex to notate in the available screen space, so the device prints one of these
  joke placeholders instead. Switch to **Geek Out** view to see the literal notes.
- **`x`** — a **double sharp** (e.g. `Fx` = F𝄪 = G natural). Used to stay theoretically correct
  within certain key signatures rather than spelling enharmonically.

Both are worth stealing. The `JAZZ`/`WTF?` gag is a huge part of the instrument's personality,
and correct enharmonic spelling is a genuine sign of a well-built chord engine.

## Single Notes behavior **[OFFICIAL]**

`Options → Instrument → Single Notes` — the keyboard can either stay within **one octave** or
be **split across two octaves**. Also toggled by clicking the Chord Voicing dial. See
[05](05-voicing-engine-and-inversions.md) for Split vs Octave mode.

Related: with Bass set to **"Bass single notes,"** pressing a key alone plays only a bass note,
and the treble engine only sounds when you play a chord. As of v3.90, when Bass is *off*,
single-notes mode plays the treble chord rather than silence.
