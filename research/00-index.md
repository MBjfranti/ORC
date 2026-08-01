# ORC-1 Research Corpus — Index

Research compiled **2026-07-31** on the **Telepathic Instruments Orchid ORC-1**, as background
for building a browser-based (keyboard + MIDI) reinterpretation.

## Purpose

This corpus documents *what the hardware actually does*, in enough mechanical detail to
re-implement or deliberately diverge from it. Our webapp does not have to copy the Orchid —
but every design decision we make should be a decision, not an accident of ignorance.

## Reading order

| # | File | What's in it |
|---|------|--------------|
| 01 | [overview-and-history.md](01-overview-and-history.md) | What the ORC-1 is, who made it, launch timeline, price, reception, criticisms |
| 02 | [hardware-panel-and-controls.md](02-hardware-panel-and-controls.md) | Physical layout, every encoder, the four interaction gestures, display modes, options menu tree, I/O |
| 03 | [chord-engine.md](03-chord-engine.md) | Chord Types, Chord Extensions, combination rules, Play Styles, Secret Chords, display notation |
| 04 | [key-mode-and-harmony.md](04-key-mode-and-harmony.md) | Key Mode, diatonic mapping, quick-key select, full reference tables for all keys |
| 05 | [voicing-engine-and-inversions.md](05-voicing-engine-and-inversions.md) | The Voicing Dials, inversion logic, Split vs Octave mode, bass voicing |
| 06 | [performance-modes.md](06-performance-modes.md) | Strum, Slop, Arpeggiator, Pattern, Harp — timing, behavior, parameters |
| 07 | [sound-engines-fx-and-presets.md](07-sound-engines-fx-and-presets.md) | Three synth engines, 60 presets, 30 user slots, FX rack, filter, bass engine |
| 08 | [looper-and-beats.md](08-looper-and-beats.md) | Loop mode, overdub, undo/clear, quantization, 10 save slots, the beat machine |
| 09 | [midi-implementation.md](09-midi-implementation.md) | The three-channel MIDI split, DAW routing, MIDI-in behavior, known bugs |
| 10 | [sound-palette-and-chord-vocabulary.md](10-sound-palette-and-chord-vocabulary.md) | The *musical* character: what chords and sonics this thing actually produces |
| 11 | [webapp-implications.md](11-webapp-implications.md) | Our build: keyboard mapping, dial grammar, panel legends, spacebar, parity matrix, open questions |
| 12 | [tech-stack.md](12-tech-stack.md) | React + TypeScript + Tone.js + Vite — architecture, React audio traps, build order |
| 99 | [sources.md](99-sources.md) | Every source used, with reliability notes |

## Confidence conventions used throughout

Each factual claim is tagged where it matters:

- **[OFFICIAL]** — from Telepathic Instruments' own manual, help center, product page, or firmware notes. High confidence.
- **[PRESS]** — from a review or news article. Generally reliable, occasionally imprecise.
- **[COMMUNITY]** — user-reported (forums, Discord findings quoted in official docs). Treat as provisional.
- **[DERIVED]** — standard music theory or engineering inference *I* added because the docs don't state it. Not a claim about the hardware.
- **[UNKNOWN]** — explicitly flagged gap. Don't guess in code; make it a design decision.

## Top-line summary for the impatient

The Orchid is a **one-finger chord instrument**. You hold a chord-shape button with your left
hand, press a single key with your right, and it plays a full voiced chord. Everything else —
extensions, inversions, arps, strums, bass, key-lock — is a layer on top of that one gesture.

The four ideas worth stealing:

1. **Left hand = quality, right hand = root.** Chord *type* and chord *root* are separate physical axes.
2. **Extensions are additive and stackable**, not a preset list. Maj + m7 + 9 is a gesture, not a menu item.
3. **A continuous "voicing" control** that walks inversions one note at a time — voice leading as a knob, not a theory exercise.
4. **Harmony, performance, and bass are three separate output streams**, independently routable.

The one idea worth *not* stealing: the hardware's menu-diving. A webapp has screen space; use it.
