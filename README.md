# ORC-1

A browser chord instrument: hold a chord shape with your left hand, press one key with your
right, and it plays a full voiced chord.

Inspired by the Telepathic Instruments Orchid ORC-1. Research corpus in [`research/`](research/).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 71 tests
npm run typecheck
npm run build
```

## Playing it

```
   ┌─ CHORD TYPES ─┐         ┌───── BLACK KEYS ─────┐
   Q    W    E    R    T     Y    U    I    O    P    [
  Dim  Min  Maj  Sus   ·    C#   D#    ·   F#   G#   A#
   ┌─ EXTENSIONS ──┐    ┌────────── WHITE KEYS ──────────┐  ┌ 8ve ┐
   A    S    D    F    G    H    J    K    L    ;    '        ⏎
   6    m7  maj7  9    C    D    E    F    G    A    B        C
```

Hold a chord type with your left hand, press one key with your right. Everything is editable
while the chord sounds — change the quality, move the root, add or remove extensions, walk the
voicing, browse sounds. The chord follows.

| Key | Action |
|-----|--------|
| `-` `=` | Voicing down / up |
| `,` `.` | Previous / next sound |
| `Z` `X` | Performance mode / its parameter |
| `` ` `` | Key Mode on / off |
| `C` `M` | Tonic / mode (Ionian … Locrian) |
| `/` | Root layout — Chromatic · Correct · Scale |
| `V` | Octave |
| `B` `N` | Bass on-off (Shift: mode) / bass voicing |
| `]` | Tier-3 display — chord → numeral → off |
| `Space` | Latch |
| `Esc` | Panic — all notes off |

Shift reverses any of the cycling keys.

**Root layouts.** `Chromatic` gives all twelve keys, with out-of-key roots producing secondary
dominants and borrowed chords. `Correct` snaps them to the nearest diatonic chord. `Scale`
collapses the keybed to the seven notes of the mode, so `G H J K L ; '` walks the scale and
nothing you play can be wrong.

Bindings use `event.code`, so the physical layout holds on AZERTY, QWERTZ and Dvorak. On
Chromium the printed legends re-label themselves to match your actual keycaps.

## Architecture

The rule everything follows: **`src/core/` is pure and has zero dependencies.** No React, no
Tone.js, no DOM. It takes state and returns data, and it is where all the interesting logic lives.

```
src/
├── core/       chord · spelling · key · voicing · bass · performance · resolve
│               (pure, zero dependencies, 127 tests)
├── engine/     Tone.js sink behind a narrow SynthEngine interface,
│               plus the arp scheduler and Web MIDI out
├── input/      event.code layout maps + Keyboard Map API legends
├── state/      Zustand — panel state only, never audio state
└── ui/         React components, each memoised off the play path
```

If a file in `core/` ever imports React or Tone, something has gone wrong.

Two rules the audio path depends on: notes are scheduled with `Tone.immediate()` before any
React work happens, and no component re-renders on a keypress unless it has to. Both are
measurable — keypress to scheduled note is ~0.1 ms, main thread blocked ~5 ms.

## Parity, and the Extended switch

Out of the box this is an ORC-1 and nothing else. Everything the hardware does is on by
default; everything we added *because it runs in a browser* sits behind one switch —
**Options → Extended**, off by default.

**Hardware parity (always on):** chord engine (4 types × 4 stackable extensions), enharmonic
spelling, the voicing dial, Key Mode in major and minor, live editing of a sounding chord, the
three play styles, seven performance modes, the bass engine with four modes, the FX rack, three
synth engines with 15 presets, user sound slots, the looper, the beat machine's factory
patterns, secret chords, the five View modes, latch, panic, three-channel MIDI out.

**Extended only:** the chord-progression editor, MIDI file export, editing the drum grid, the
five modes beyond major and minor, and the Correct and Scale root layouts.

The gate lives in the store rather than the UI, because a store action is the one chokepoint
every caller passes through — see `src/state/parity.test.ts`. Turning Extended off also puts
down anything only it could pick up, so the instrument is never left in a state the real one
has no name for.

See [`research/11-webapp-implications.md`](research/11-webapp-implications.md) §5 for the
parity matrix and §6 for why each Extended feature exists.
