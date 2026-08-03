# 16 — Loop, the panel, and what is still open

Written mid-session, before compacting. Everything below `58923bd` is committed;
**everything in this document is not**. Seven files are dirty.

---

## Commit first

```
git log --oneline
  58923bd  Build the encoder panel: Bass, FX, Key, and one gesture grammar
  fadf5d0  Derive the fifty sounds from a real GM timbre table
```

Uncommitted: the Loop encoder, the looping border, BPM's tempo and metronome,
the playing screen, and the browse-list timeout. `typecheck clean · 123 tests ·
build clean` as of writing.

## The ring — resolved, but read the history

**Fixed and verified.** Frozen at 90° the sweep covers twelve o'clock round to
three and nothing else; at 270° it covers three quarters with the top-left still
dithered. It starts at twelve, runs clockwise, and completes.

The history matters, because two different mechanisms have been through here and
the first one is a trap:

1. **`stroke-dasharray` on the ring path.** The dash origin was measured — with
   a 6% dash and no offset — landing on the **left edge midpoint**, three
   quarters of the way round, even though `getPointAtLength(0)` reports the
   path's start as `64,9` (top-centre) and `getPointAtLength(0.25)` reports
   `120,64`, so the parameterisation itself is clockwise from twelve. The dash
   origin and the path origin disagreed by 25% and I never found out why. A
   `DASH_ORIGIN = -25` compensated for it.
2. **That compensation then ate the final quarter.** Shifting a dash window
   along an *open* path runs it off the end instead of wrapping, so the sweep
   could only ever cover 75%. This is the "not showing the fourth quarter"
   report.
3. **Now: a conic sweep** (`.ring-sweep`, `--sweep` angle, `@property`). A conic
   gradient starts at twelve o'clock and runs clockwise by definition, so there
   is no origin to discover. Frozen at 270° it rendered correctly — white
   through right, bottom and left, dither remaining in the top-left quadrant.

**The mask was then removed.** The two-layer `mask-composite` padding trick was
not applying, so the sweep painted as a full square. It does not need one: the
inner black panel already punches the hole and the outer `border-radius` clips
the outside, so the band is simply what is left between them. Verified rendering
as a band.

A conic gradient sweeps by *angle* where §C.4 measured *perimeter*. On a square
those differ; at the one point p18b pins down they read 30.9% and 32%, which is
inside the measurement's own width. Noted so it is not rediscovered as a bug.

## What was built this session

### Loop (encoder 6)

Three screens, all from research/08 and research/13 §M7–M9:

- **Waiting Room** — `Free`, `1 Bar` … `16 Bars`. Turning redraws the border
  with that many segments, which is how you see the length before recording.
- **Transport** — `Overdub` / `Pause`·`Play` / `Undo`→`Clear`, exactly PDF p18's
  second illustration. `Undo` becomes `Clear` once the overdubs are off, and
  `Clear` returns to the Waiting Room (§12.5).
- **Save** — `Save As Loop XX` / `Save As` / `Load Loop` / `Delete Loop` /
  `Exit`. Only `Exit` acts; **the ten slots are not built**.

### The looping border

Measured throughout (§C.4): 17px ring, inner panel 94×94 at (17,17), outer
corners r≈11, 3px gaps cutting the full thickness, dither for remaining and
solid for elapsed.

**The gaps are radial ticks, not dash gaps.** A dash gap is measured along the
centreline, and at a corner the outer edge has radius 11 against the
centreline's 2.5 — so a 3px gap ballooned into a 13px wedge at every corner,
which is exactly where gaps land past four bars. They are now 3×17 rects rotated
to face along the ring. **The rotation was 90° out at first**, laying them along
the band instead of across it; the user spotted it.

### Exits — was genuinely broken

`Exit` in the Save menu returned to the Waiting Room instead of leaving Loop
Mode, so there was no way out except the two-handed shortcut, which was not in
the hint text. Now:

- `Exit` row — pauses and leaves. The loop survives: "stays in memory… pressing
  Loop again restarts it".
- `Esc` — leaves, loop keeps its state.
- `\` — the hard exit: stops and clears, per §12.4.

### Metronome

`BPM` press toggles it (§11.2), lamp shows it, quarter-note repeat on the
transport so it follows tempo and is never captured. The count-in clicks four
beats with the first accented. A countdown `4 3 2 1` shows on screen while
counting — **ours, MANUAL SILENT**, because a silent bar with nothing moving
reads as a hang.

### The playing screen

§C.2, measured on p15b: status rail flush to the top, white on black *not* an
inverted bar, key name top-left as `C# Major`, transposition top-right as
`Trans +1`. Chord below, lingering ~1.4s after release (v3.90 behaviour).

### Menus vs browses

research/13 §B.6 keeps menus sticky and lets value readouts expire. Sound, Bass
and Key are **browses** — they return to the playing screen ~2.6s after you stop
turning. The FX rack, bass modes and loop menus are **menus** and stay until you
leave them. `Exit` existing as a list row is the evidence menus were never meant
to time out.

## Still not built

| Thing | Notes |
|---|---|
| Loop's 10 save slots | research/08 calls this "the clearest gap for our webapp" — a browser has localStorage and unlimited slots |
| Options (encoder 8) | full tree transcribed in research/02 |
| Phaser, Flanger, Drive, Tremolo, Ensemble | rows exist showing `--`; Tone has three of them |
| Chord Voicing press → Split ↔ Octave | needs split-mode state |
| Bass Voicing | placed, does nothing; needs its own voicing state |
| The other four View modes | notes list, waveform, keyboard, Geek Out |

## The beat machine (built)

`core/beats.ts` holds twenty patterns and six time signatures; `engine/drums.ts`
holds a nine-voice synthesised kit and the scheduler. The BPM dial's hold opens
**one** list — signatures, then beats — because §11.4 describes reaching the
beats by scrolling *past* the signatures, and its press starts whichever the
cursor is on ("the Metronome **or** Beats", §12.6).

**No open-source patterns were used, and none were available.** Every
"open-source drum pattern" repo traces to René-Pierre Bardet's *200 Drum Machine
Patterns* (Hal Leonard, in print) — a LICENSE on a transcription cannot grant
rights the transcriber never had. The genuinely open datasets (WaivOps,
CC BY 4.0) are WAV corpora, and we synthesise. Five names are [OFFICIAL]; the
other fifteen and **all twenty patterns** are ours.

Three faults found by measuring, not by reading:

- **The ride was silent.** `MetalSynth extends Monophonic`, so its
  `triggerAttackRelease` is `(note, duration, time, velocity)` — not
  `NoiseSynth`'s three-argument form. Written with three, the duration landed in
  `note` and tuned the cymbal to 0.4 Hz. **TypeScript cannot catch this**:
  `Frequency` and `Time` both accept a number, so every argument slid one place
  and still typechecked. Worth checking the other voices against their base
  classes if any are added.
- **The kit was unbalanced** — snare 3× below the kick, shaker 20× below. Each
  voice was played alone on the quarters and measured at the master output; the
  per-voice trims in `build()` come from that, not from taste.
- **Turning did not re-arm the browse timer.** `turnEncoder` keyed off
  `encoder.browse`, and BPM is not flagged browse — its own list is the tempo.
  So the 26-row list closed 2.6s in, every time, because the list is longer than
  the timer. Now keyed off what is *open*, via `isBrowse`.

`02 Orchid Bossanova` does not fit a row at full width — 224px in a 221px row,
before any value column. Long labels now condense (`data-long`, scaleX 0.9)
rather than clipping, which is why the beat list has no value column at all: it
cost 34px of every row to show one bit you can hear.

## Traps worth not rediscovering

- **rAF does not run in a background tab.** `Instrument.notify()` delivers on a
  frame, so nothing reaches React and the screen looks broken. Focus the tab
  before testing anything that reads a chord.
- **`setTimeout` is throttled to ~1/sec in an unfocused tab.** A "65ms" double
  tap arrived 2002ms apart, which looked exactly like a broken gesture. Dispatch
  synchronously, or focus first.
- **Backticks inside a `node -e` string run as shell commands.** Twice. Use a
  script file, or the Edit tool.
- **This repo is mixed CRLF/LF.** Scripted edits that assert on `\r\n` fail on
  LF files and vice versa. Assert *all* patterns before writing any of them —
  that pattern has caught three bad edits this session.
- **Vite's dev server serves the same module at two URLs.** After any HMR update
  the app holds `/src/state/panel.ts?t=1785721483813` while a plain
  `import('/src/state/panel.ts')` gets a *second instance* — a second zustand
  store, a second Tone context, a second synth singleton. Everything looks
  right and nothing is connected. When driving the running app from the
  console, pick the URL out of `performance.getEntriesByType('resource')`
  rather than typing the path. The same applies to `tone` itself, which lives
  at `/node_modules/.vite/deps/tone.js?v=<hash>`.
- **A tap on the master output must be built after `synth.prepare()`.** `prepare`
  calls `Tone.setContext`, so an analyser made before it hangs off a context
  nobody plays into and reads a confident, meaningless zero.
- **`transform: scaleX()` does not rescue clipped text.** `overflow: hidden`
  cuts in the element's own coordinate space, before the transform — so the text
  is cut first and the already-cut box is then scaled. The element needs its
  natural width (`flex: none; overflow: visible`) and the *parent* must clip.
