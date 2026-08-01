# 06 — Performance Modes

> **[OFFICIAL]** "Performance Modes are the key to adding movement and life to your chords."

These take the static block chord produced by the chord engine and articulate it rhythmically.
They are, functionally, an **arpeggiator/strummer layer sitting between the chord engine and
the synth engine** — which is exactly how we should architect it.

## Access **[OFFICIAL]**

- **Press** the Perform encoder → mode list.
- **Turn** → select a mode.
- **Turn again** → adjust that mode's parameter (speed, pattern number, etc.).
- **Turn fully left** → off.
- **Press & hold until LED lights** → **lock** the mode so it persists while you audition
  different sounds.

That lock behavior is worth copying: performance style and timbre are orthogonal, and being
able to pin one while browsing the other is a real workflow win.

## The modes **[OFFICIAL]**

### Strum
> "Mimics the strum of a guitar by playing the notes of your chord in a quick, staggered
> succession from low to high."

Low-to-high sequential note onsets with a short inter-note delay. Parameter controls
speed/spread.

**[DERIVED]** Implementation: schedule note *n* at `t0 + n * strumDelay`, typically 5–60 ms.
Down-strum only per the docs; alternating up/down strums are not mentioned. **[UNKNOWN]**
whether direction alternates.

### Strum 2 Octaves
> "Creates a wider, more dramatic effect."

Same, but the strum spans two octaves — i.e. the chord is duplicated an octave up and the strum
runs across the doubled note set.

### Slop
> "Similar to Strum, but introduces slight timing imperfections to humanize the performance,
> making it sound less robotic."

**[PRESS]** MusicTech adds: *"delivers slightly different timing each time you press a key."*

**[DERIVED]** Randomized per-note timing offsets, re-randomized on every trigger. Likely also
slight velocity variation. This is the "human feel" mode. A small amount of jitter
(±10–40 ms, non-uniform) does a lot of work here.

### Arpeggiator
> "Breaks your chord into a sequence of individual notes played one after another. **The more
> notes in your chord (including extensions), the longer the arpeggio sequence will be.**
> All timing is synced to the master BPM."

Two crucial mechanics:
1. **Sequence length = number of notes in the chord.** Add a 9th, and the arp gets longer.
   The rhythm is therefore a *consequence* of the harmony, not independent of it.
2. **BPM-synced**, unlike Strum which is a fixed short delay.

### Arpeggiator 2 Octaves
Same, spanning two octaves — doubles the sequence length.

### Pattern
> "Plays the notes of your chord in a variety of pre-determined rhythmic sequences. **Unlike the
> arpeggiator, the rhythm stays consistent even if you change the number of notes in the chord.**"

This is the direct complement to the Arpeggiator: fixed rhythmic grid, variable note content.
The parameter selects which pattern.

**[PRESS]** MusicRadar refers to **"11 different trigger patterns"** — so roughly a dozen
preset rhythms. **[UNKNOWN]** the specific patterns; firmware updates have added more over time.

### Harp
> "Creates a fast, sweeping cascade of notes up through multiple octaves, perfect for dramatic
> flourishes."

Essentially a very fast, multi-octave arpeggio/glissando gesture. **[PRESS]** MusicRadar
describes it as "harp glissandi."

## Summary table

| Mode | Timing source | Note order | Range | Sequence length |
|------|---------------|------------|-------|-----------------|
| Strum | Fixed short delay | Low → high | 1 octave | = chord notes |
| Strum 2 Octaves | Fixed short delay | Low → high | 2 octaves | = chord notes × 2 |
| Slop | Fixed + randomized jitter | Low → high | 1 octave | = chord notes |
| Arpeggiator | **BPM-synced** | Sequential | 1 octave | **= chord notes (variable)** |
| Arpeggiator 2 Oct | **BPM-synced** | Sequential | 2 octaves | = chord notes × 2 |
| Pattern | **BPM-synced** | Per pattern | — | **Fixed (~11 patterns)** |
| Harp | Fast sweep | Ascending cascade | Multi-octave | = chord notes × octaves |

## Interaction with the rest of the instrument

- **Performance modes affect what goes out MIDI Channel 1** ("Performed notes… like Arpeggios,
  Strums, and Voicing dial melodies"). The raw block chord goes out **Channel 3** unchanged.
  See [09](09-midi-implementation.md). This separation is architecturally important: the
  performance layer is a *transformation*, and both sides of it are observable.
- **Voicing dial movements are themselves treated as performance** — turning the dial while a
  chord sounds generates a melody, and that melody lands on Channel 1. The voicing dial is an
  instrument, not just a setting.
- **Arp/Pattern sync to master BPM**, shared with the Beat machine and the Looper.
- **[COMMUNITY/OFFICIAL]** Performance modes do **not** apply to notes received over MIDI In —
  external MIDI triggers the raw synth engine only.

## Design notes for our build **[DERIVED]**

1. Model this as a **scheduler that consumes a chord event and emits timed note events.** Keep
   it pure and testable; the sound engine just plays what it's handed.
2. Web Audio's `AudioContext.currentTime` is the right clock. Do **not** drive strums or arps
   from `setInterval` — schedule ahead with a lookahead loop (~25 ms tick, ~100 ms schedule
   window) or timing will audibly fall apart.
3. The Arp's "length follows harmony" rule is the most distinctive behavior here and costs
   nothing to implement. Prioritize it.
4. `Slop` needs *musical* randomness — bias the jitter (notes usually slightly late, rarely
   early) rather than symmetric uniform noise.
