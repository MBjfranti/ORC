# 08 — Looper & Beat Machine

## Loop Mode **[OFFICIAL]**

> "Orchid's looper is a powerful tool for building up ideas on the fly."

It is a **note/MIDI looper**, not an audio looper — it records your performance and replays it
through the current sound, which is why changing the sound after recording changes the playback.

### Full workflow

| Step | Action |
|------|--------|
| **Enter** | Push or turn the Loop dial |
| **Set length** | Turn the Loop dial to select a sync mode |
| **Record** | Press the Loop dial to start |
| **Count-in** | 1 bar (BPM mode only) |
| **Overdub** | Select Overdub from the menu to add a layer; select Stop when done |
| **Undo** | Removes the most recently recorded layer |
| **Clear** | After all overdubs are undone, Undo becomes Clear — erases the base layer |
| **Save** | Press & hold Loop dial → Save / Save as → pick a slot |
| **Load** | Press & hold Loop dial → Load Loop → pick slot (e.g. "Loop 01") |
| **Delete** | Press & hold Loop dial → Delete |
| **Exit (official)** | Press & hold Loop dial 2 s → Loop Menu → "Exit" |
| **Exit (shortcut)** | **Bass Voicing + Loop** — immediate, but **unsaved loop is lost** |

### Loop lengths **[OFFICIAL]**

- **BPM mode** — fixed lengths synced to master BPM: **1, 2, 4, 8, or 16 bars**
- **Free mode** — any length; recording stops when you tell it to

### Storage **[OFFICIAL]**

- **10 save slots.**
- New loops **overwrite** an occupied slot without a separate confirm step — worth designing
  around.
- After exiting via the official method, the loop stays in memory until the device powers off,
  so pressing Loop again restarts it.

### Quantization **[OFFICIAL]**

`Options → Instrument → Quantization`: **1/4, 1/8, 1/8 triplet, 1/16, 1/16 triplet, 1/32.**
Applies to loops. (No "off" option is listed — **[UNKNOWN]** whether quantization can be
disabled entirely.)

### Metronome **[OFFICIAL]**

`Options → Audio and MIDI → Metronome Click`: **Beep** or **Hi Hat.**

v3.90 behavior: *"Metronome sounds during Loop record count-in, then plays the Beat if
selected"* — i.e. the click hands off to the drum pattern once recording starts. Also
*"improved metronome handling when hard-exiting Loop"* and *"more robust Loop tracking."*

## What the looper is *not* **[PRESS]**

Reviewers are consistent and blunt about this:

> MusicRadar: a "phrase looper" that "functions as a simple notepad for one-off ideas rather
> than complex multi-section composition."
>
> MusicTech: "cannot store loops permanently" *(written before/around the 10-slot save feature —
> saving does now exist, so treat this as dated)*.
>
> MusicRadar: the device focuses on "working in the moment" with no persistent save
> functionality beyond the active looper session.

There is **no song arranger, no chord-progression sequencer, no pattern chaining.** The Orchid
captures an idea; you finish it elsewhere (which is what the three-channel MIDI split is for).

**This is the single clearest gap for our webapp.** A browser app has localStorage,
IndexedDB, file export and unlimited slots. A proper progression editor — write a chord
sequence, loop it, edit individual chords, export MIDI — would be a real improvement rather
than an imitation. See [11](11-webapp-implications.md).

## Beat machine **[OFFICIAL]**

- **20 pre-programmed drum patterns.**
- **Press & hold the BPM encoder** → beat list. Scroll, press to select.
- **Turn the BPM encoder** while a beat plays → change tempo.
- **Press the BPM encoder** again → beat off.
- **Press & hold BPM while turning** → **Beat Volume** (0–99). Also at Options → Volumes → Drums.

Known beat names **[OFFICIAL — partial]**: `01 Saint Germain`, `02 Orchid Bossanova`,
`03 Trap`, `04 Latin`, `05 Millionaire`. **[UNKNOWN]** the remaining 15.

**[PRESS]** Styles span trap, disco, Latin, bossa nova — a broad, songwriter-friendly spread
rather than a techno-focused set.

**[PRESS]** Firmware added **"Drum FX"** with new rhythmic controls for the beat engine.

## Master clock **[DERIVED]**

One BPM value drives: the beat machine, the arpeggiator, Pattern mode, loop bar lengths, and
loop quantization. There is no separate per-function tempo.

**[PRESS]** At least one reviewer reports **no MIDI clock output** — meaning the Orchid can't
sync external gear to its tempo, or follow theirs. If accurate, that's a notable limitation and
one we'd trivially beat in a webapp (Web MIDI clock send/receive is straightforward).
**[UNKNOWN]** — worth verifying against current firmware before we cite it as fact.
