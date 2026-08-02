# 15 — Handover

State of the build at the end of the session that rebuilt it. Read this before
picking the work back up.

---

## Commit first

Everything below `0e8b542` is committed; **everything since is not**, and it is
a lot: the whole console rework, the 1-bit screen, the sound library, the
looper, and roughly a dozen performance-mode fixes. Commit before starting
anything new.

```
git log --oneline
  0e8b542  Rebuild from the research, and take the play path off React
  dd42cb5  Fix stuck notes and asymmetric note start/stop
  d31429c  Initial commit
```

## Verified working

`85 tests`, typecheck and build clean. Verified at runtime in the browser:

- **Chord engine** — `maj + m7` on G gives G7; voicing +1/+3 walks the inversion
  and comes home an octave up in three clicks.
- **Key encoder** — 84 keys on one scroll, ordered majors → minors → modes, so
  scrolling past `B` lands on `Cm`.
- **Sound list** — cursor pinned at row 2, list scrolls under it, blank rows pad
  the ends, clamps rather than wraps.
- **Looper** — records a 4-bar pass, closes itself, reports `1 layer · 4 bars`,
  ring advances 14% per 1.4s on a 10s loop.

## Never heard

**No audio in this build has been listened to.** Synthetic key events do not
unlock an `AudioContext`, so every browser check comes back silent. Everything
sonic is verified by test and by reasoning only:

- All fifty sounds — parameters reasoned from engine type, never auditioned.
  Expect the FM entries at the strange end to be harsh.
- The performance modes after the last round of fixes.
- Whether Strum, Slop and Block are now audibly distinct (they were identical
  until the clock-resolution fix; that is unconfirmed by ear).

## Loose ends

| Thing | Where |
|---|---|
| Long sound names clip on the 128px screen | `ScreenList`, `styles.css` |
| Sound encoder press/hold not built — tap = browse by name, hold = save menu | `research/07`, `13 §A.14 M1` |
| Voicing has no home since `-`/`=` went to the encoder row; `[` is also a root key | `App.tsx` keydown |
| Only the Sound encoder exists; the rest are hidden behind `SHOW` flags | `Console.tsx` |
| Readouts hidden behind `SHOW_READOUTS` | `App.tsx` |
| Perform Lock (hold to pin the mode while browsing sounds) never implemented | `research/06` |
| Bass tracks the octave setting, not the voiced chord — gap widens at extreme voicings | `instrument.ts` |
| Sound library needs real parameters | `research/14` |

## Two traps that cost real time

**Scripted edits failed silently, four times.** The pattern that bites: a python
script mutates the string, then asserts a *later* pattern, then writes. When the
second assert throws, the whole write is lost — and the next script runs against
the original file and appears to succeed. One of those made a fix look applied
when it was not, and it was reported as done. Either assert everything up front,
or edit these files directly.

Also seen: an unterminated doc comment swallowing the rest of a TypeScript
interface, and JSX comments wrapped inside `{cond && ( … )}`, which is invalid.

**HMR leaves duplicate module instances.** After a long dev session, importing a
module in the console gives a *different* instance from the one the app is
running. Reading `usePanel` that way showed `heldTypes: []` while the DOM showed
the pad lit — and a wrapped `synth.noteOn` never fired, because it wrapped a
synth the app does not use. Diagnostics went badly wrong twice before this was
spotted.

**Diagnose from the DOM, or hard-reload first.** The DOM is the app's own state
and cannot lie about which module produced it.

## Architecture worth not undoing

- `src/core` is pure — theory, no audio, no React, no browser. Keep it that way.
- The play path does **not** go through React. `keydown → Instrument.press() →
  synth`, synchronously, no hooks and no store writes; React is told on the next
  frame via `useSyncExternalStore` and skips the render if the snapshot is
  unchanged. Key-to-synth is ~2ms; first note 1.4ms.
- The audio graph is built at **page load**, not on the unlocking gesture —
  `Tone.Reverb` renders its impulse response at construction and that was the
  first-note delay.
- `Tone.Context` needs `updateInterval: 0.005`. The 50ms default is coarser than
  a strum, and collapses Strum, Slop and Block into the same thing.
- The transport must be started in `prepare()`, before awaiting the reverb. A
  stopped transport means `Tone.Loop` never ticks, silently.
