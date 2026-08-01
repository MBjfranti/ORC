# 01 — Overview & History

## What it is

The **Orchid ORC-1** is a portable digital chord-generating synthesizer built around a
"Chord Logic" system: you play a *single* key and the instrument generates a full, voiced
chord around it. It is marketed as an **"Ideas Machine"** — a songwriting/sketching tool
rather than a performance synth or a sound-design platform. **[OFFICIAL]**

Core identity in one sentence: *a 12-key, 16-voice polyphonic chord instrument that trades
deep editability for immediacy.*

## Who made it

Telepathic Instruments (Telepathic LLC), co-founded by:

- **Kevin Parker** (Tame Impala)
- Ignacio Germade
- Charl Laubscher
- Chris Adams
- Sophie Parker
- Tom Cosm

**[PRESS]** The concept began over a decade ago as Parker's personal songwriting tool. It
existed as an **Ableton Max for Live rack** before becoming dedicated hardware — worth noting,
because it means the chord logic was originally software and is therefore reproducible in
software. The first ~4,000 owners form a beta community called **"The Garden."**

## Launch timeline

| Date | Event |
|------|-------|
| Dec 2024 | **Drop 1** — 1,000 units, sold out in ~3 minutes |
| May 2025 | **Drop 2** — 3,000 units, sold out in minutes |
| Oct 10, 2025 | **Drop 3** — official worldwide general release |
| Firmware v3.04 | Mar 2025 |
| Firmware v3.21 | May 2025 |
| Firmware v3.32 | Jul 2025 |
| Firmware v3.60 | Sep 2025 |
| Firmware v3.63 | Oct 2025 |
| Firmware v3.84 | Feb 2026 |
| **Firmware v3.90** | **Apr 17, 2026 — current at time of research** |

**[PRESS/OFFICIAL]** The product is still explicitly described as being in beta-ish, rapidly
iterating territory; the manual itself was published as a work in progress. Firmware adds
sounds, patterns, and behavioral changes regularly.

## Price & variants

- **Orchid ORC-1**: $699 USD list, commonly $649 USD. **[OFFICIAL]**
- **Orchid ORC-1 with Case** and **Clear Orchid: Arctic** (limited edition, translucent) variants exist.
- **Pistil plugin**: $99 USD standalone, ~$50 when bundled with hardware. **[OFFICIAL]**

## Physical specs **[OFFICIAL]**

| Spec | Value |
|------|-------|
| Dimensions | 305 × 190 × 50 mm |
| Weight | 1.8 kg |
| Keyboard | 12 keys, one octave, velocity-sensitive |
| Polyphony | 16 voices |
| Synth engines | 3 (subtractive/virtual analog, FM, vintage electric piano/reed) |
| Onboard sounds | 60 factory + 30 user slots |
| Beats | 20 pre-programmed drum patterns |
| Speakers | 2 × integrated stereo |
| Power | Rechargeable internal battery + USB-C |
| Outputs | 3.5 mm stereo (TRS), 5-pin DIN MIDI Out, USB-C (MIDI + power) |
| In the box | Quickstart Guide, Manuscript Notebook |

Note: **no audio over USB.** USB-C carries MIDI and power only; audio must leave via the
3.5 mm jack. **[OFFICIAL]**

## Reception — what reviewers praised

- **The workflow.** Near-universally described as the point of the instrument: fast, fun,
  genuinely rut-breaking. MusicRadar called it *"an inspiring ideas machine that trades
  technical theory for intuitive workflow."* **[PRESS]**
- **Harmonic reach without theory.** Users get to 9ths, sus chords, and complex extensions
  without knowing what they are.
- **Voicing dial** repeatedly singled out as the standout feature — voice leading made tactile.
- **Portability + battery + speakers** — a real "couch instrument."
- Used on records by Kid Cudi, Don Toliver, Janelle Monáe, Diplo, Fred Again, Ryan Tedder,
  Logic, Gracie Abrams. **[PRESS]**

## Reception — the criticisms (these are our opportunities)

1. **Price vs. function.** $650–800 for something an iPad + Scaler 2 approximates. This is the
   single most repeated complaint. *A free webapp sidesteps it entirely.*
2. **Menu diving.** "Really too much menu-diving / multi-key-push for my creative productivity
   mind." Nine encoders with press / turn / press-hold / press-and-turn semantics is a lot of
   hidden state behind a tiny screen. *A webapp has a real screen — surface everything.*
3. **No deep sound editing.** Presets are essentially fixed; you get filter + FX + performance
   on top. Deliberate, but limiting.
4. **No persistent song structure.** The looper is a scratchpad (10 slots), not an arranger.
   No chord-progression sequencer as such.
5. **Single octave keyboard**, not meant for two-handed playing.
6. **No MIDI clock** reported by at least one reviewer — sync to external gear is limited. **[PRESS]**
7. **Speakers struggle with bass.**
8. **Onboard sounds are sketches, not finished production sounds.** (Which is why Pistil exists.)
9. Availability/backorder problems throughout its life.

## Companion software: Pistil **[OFFICIAL]**

- The Orchid's synth engine as a VST/AU/standalone plugin.
- Three synth engines exposed with 4 oscillators, LFOs, envelopes, filters.
- **70 presets** drawn from Kevin Parker's Orchid collection (more than the hardware's 60).
- FX rack: reverb, chorus, delay.
- Two-way sync with hardware: design sounds in the plugin, push them to the device.
- macOS 13+ / Windows 10 64-bit; Ableton, Logic, Cubase, FL Studio (Pro Tools coming).

**Design implication:** Telepathic themselves split the product into *chord logic* (hardware)
and *sound engine* (plugin). Those are cleanly separable concerns — a good hint for our
architecture too.
