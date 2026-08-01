# 05 — The Voicing Engine & Inversions

Telepathic call this a **"patent-pending chord voicing engine"** with **"Voicing Dials™."**
It's the feature reviewers single out most, and it's the hardest part to get right.

## What it does **[OFFICIAL]**

> "The Voicing Dial is a tool for adding harmonic variety by changing the inversion of a chord.
> While it can feel 'magical' or random at first, it follows a consistent logic."
>
> "In simple terms, turning the Voicing Dial rearranges the notes of the chord you are playing.
> It primarily works by taking the lowest note of the current chord and moving it up an octave,
> or taking the highest note and moving it down an octave."

So the fundamental operation is **rotate-and-transpose**: the classic inversion cycle.

## Inversion primer, as they explain it **[OFFICIAL]**

For a C major triad (C–E–G):

| Position | Notes |
|----------|-------|
| Root position | C – E – G |
| 1st inversion | E – G – C |
| 2nd inversion | G – C – E |

Turn the dial up → bottom note jumps an octave to the top. Turn down → top note drops an octave
to the bottom. Repeat forever; the chord climbs or descends the keyboard while staying the same
chord.

## The two behaviors of one dial **[OFFICIAL]**

The Chord Voicing dial does two related things at once:

1. **Range extension.** "The Chord Voicing dial on Orchid expands the range of the keyboard well
   beyond a single octave. Turn the Chord Voicing dial to move up and down the full range of the
   keyboard." — a 12-key keyboard that reaches the full MIDI range.
2. **Live inversion.** "Turning the Chord Voicing dial **while playing a chord** creates
   different inversions of the chord by taking the lowest note currently being played in the
   chord and moving it up an octave to the top, and vice versa."

So it's not a "transpose" knob and not an "inversion" knob — it's a single continuous
**position-on-the-keyboard** control, and inversions fall out of moving through that space one
note at a time. That's the actual insight, and it's why they call it voice leading made tactile.

## The deliberate weirdness **[OFFICIAL]**

> "However, the starting point isn't always the root note and the number of 'clicks' between
> each inversion changes depending on how many notes are in the chord. **This is intentional
> and designed to encourage exploration and happy accidents.**"

Read that carefully — it's the key to the whole design:

- A **triad** cycles back to a root-position chord every **3** clicks.
- A **7th chord** every **4** clicks.
- A **9th chord** every **5** clicks.
- Add extensions mid-turn, and your position in the cycle no longer means what it did.

The dial has no absolute "root position" home. It's a **relative, stateful** control operating
on whatever note set is currently sounding. This produces genuinely unpredictable-but-musical
results — which the manufacturer frames as a feature, not a bug.

**[DERIVED]** For implementation, the cleanest model is:

```
state: voicingIndex ∈ ℤ  (unbounded, signed)

given chordPitchClasses (sorted, n notes) and a base octave:
  1. build the infinite ascending stack:  note[k] = pitch[k mod n] + 12*floor(k/n)
  2. the sounding chord = window of n consecutive notes starting at index voicingIndex
  3. turning the dial ±1 slides the window by one note
```

That single formula reproduces both described behaviors: sliding the window inverts the chord
*and* walks it up/down the keyboard, and the "clicks per cycle" naturally equals `n`.

## Split mode vs Octave mode **[OFFICIAL]**

**Press the Chord Voicing dial** to toggle:

- **Split mode** — "places the octave jump at the point displayed on the screen. Notes above
  that point play an octave higher, and notes below play an octave lower."
  → The 12-key keyboard is split at a movable pivot; effectively gives you two octaves of range
  from one octave of keys, with the split point under your control.
- **Octave mode** — "the entire keyboard will stay within the octave that you choose."
  → All 12 keys stay in one register; the dial chooses which.

This is also exposed as `Options → Instrument → Single Notes` (one octave vs split across two).

Split mode is a genuinely clever solution to the single-octave problem: instead of an octave
button that shifts everything, you get a **wrap point** that keeps low roots low and high
melodies high.

## Bass Voicing dial **[OFFICIAL]**

A **second, independent** voicing dial for the bass engine. Same concept applied to the bass
line so you can walk the bass separately from the chord.

> **[PRESS]** "Two dedicated voicing controls for lead and bass let you walk through inversions
> one note at a time, turning voice leading into something tactile rather than theoretical."

The Bass Voicing dial also serves as a shortcut modifier: **Bass Voicing + Loop** hard-exits
loop mode.

## Automatic voice leading between chords **[PRESS]**

> Noisegate: the internal logic handles *"chord inversions, note transitions, and directional
> movement when changing chords"* — automatically choosing whether notes move up or down
> between chord changes.

This is separate from the manual dial. When you change chords, the engine picks an inversion of
the new chord that minimizes movement from the previous one — standard voice-leading
optimization. **[UNKNOWN]** how aggressive it is, and whether it can be disabled.

**[DERIVED]** Standard implementation: for each candidate inversion of the target chord,
compute total absolute semitone distance from the previous chord's notes; pick the minimum.
Optionally weight the bass note to keep root movement audible.

## Firmware changes affecting voicing (v3.90) **[OFFICIAL]**

- Lower default Voicing
- More accurate Voicing octave numbers
- Voicing octave indicators now match MIDI output

That second and third item imply earlier firmware had the *displayed* octave disagreeing with
the *transmitted* MIDI octave — a good reminder to keep display state and audio/MIDI state
derived from one source of truth in our build.

## Debugging aid **[OFFICIAL]**

> "Tip: Use the **Geek Out** view mode (Options > View) to see the exact notes being played as
> you turn the dial."

We should have the equivalent permanently visible — a live note readout. On hardware it's a
mode you switch into; in a browser it's just... a panel.
