# 16 — Loop, the panel, and what is still open

Running notes on the panel: what is built, what the measurements were, and what
is still open. **All of it is committed** as of `16288a6`.

```
git log --oneline
  16288a6  Build the beat machine, and fix the browse timer it exposed
  5391464  Implement the console's playing screen and chord linger
  ce9fb60  Implement Loop Mode UI, encoder, and CSS-animated ring
  58923bd  Build the encoder panel: Bass, FX, Key, and one gesture grammar
  fadf5d0  Derive the fifty sounds from a real GM timbre table
```

`typecheck clean · 141 tests · build clean`.

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

### Fidelity audit — four gaps, all closed

Checked row by row against §12 and research/13 §M7–M9 after the loop was
reported as "clunky and hard to get out of". It was, and three of the four were
real faults rather than polish:

1. **`Stop` did not exist.** The manual names it twice — "press the Loop Dial on
   **Stop** to stop recording in Free Mode" (§12.4), "…to finish overdubbing"
   (§12.5) — and §M8 flags it as a selectable state. Without it **an overdub
   could not be ended at all**: the menu still offered `Overdub`, and pressing it
   did nothing, because the transport only accepts that from `playing`. You
   layered until you left Loop Mode. Now `Stop` is the only row while a free
   recording or an overdub is running. A bar-locked *recording* is deliberately
   not offered one — §12.4 says "wait for the fixed loop to finish".
2. **Free mode started on the press, not the first note.** §12.3: "In Free mode,
   recording starts **as soon as you play the first note**." The new `armed`
   state waits. Before, however long you took to reach the keys was baked into
   the top of the loop, and it came round early by exactly that much every pass
   with nothing on screen to explain it.
3. **Re-entering Loop Mode with a loop playing landed on the Waiting Room** —
   where the next press calls `arm`, which resets. Leaving with `Esc` and coming
   back therefore *destroyed the loop*, from a screen that gave no hint of it.
   `enterLoop` now goes to the transport when a loop exists.
4. **Entering took two taps and lied in between.** Tapping `6` drew the sync
   rows while `loopScreen` was still null — Loop Mode's list with none of its
   state and no border. §12.1 is "push **or turn** the Loop Dial to access the
   Waiting Room", one gesture. The encoder lost its `list` (Loop Mode renders
   from `loopScreen`, and a second source is how the two came apart) and gained
   a `reach`, which is the keyboard's first tap.

Verified end to end: one tap enters with the ring; Free arms and waits 1.2s
without starting; the first note starts it; `Stop` closes it; `Overdub` →
`Rec`/`Stop` → layers 1→2; `Undo` → 2→1 and the row becomes `Clear`; `Esc`
leaves with the loop still playing; re-entry lands on the transport.

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

### Nothing on the screen times out

Every list and menu now stays until you leave it, and **`Esc` is how you
leave** — it returns to the playing screen.

The earlier reading of research/13 §B.6 split lists into "browses" that expired
after 2.6s and "menus" that did not. It does not survive a long list: the beat
list is twenty-six rows, so it closed while you were still reading it. More
basically, it let the screen change with nobody touching anything, which is the
one thing a panel should not do. `Exit` existing as a list row is the evidence
menus were never meant to time out; the same argument covers the rest.

`screenTouched`, `touchScreen`, the `browse` flag and `BROWSE_MS` are all gone
with it — there is nothing left to re-arm.

**Escape no longer panics unconditionally.** It backs out of whatever is open
and stops there; only with nothing open does it stop the notes. That layering
matters now that Escape is the ordinary way to close a list: dismissing the
Sound list mid-chord must not kill the chord. Verified — a chord ringing at
0.075 RMS was still at 0.070 after the Escape that closed the beat list, and
dropped to 0.005 on the next one.

The **glance** is the one thing still timed (1.2s). It really is feedback: a
number thrown up by a turn, over whatever you were looking at, with nothing to
leave.

## One grid — the three clocks bug

**Tone hands you three times and they are not interchangeable.**
`Transport.seconds` is wall-clock since start; `Transport.ticks` is musical
position and is *what scheduling actually uses*; `context.currentTime` is the
audio clock a synth wants. Seconds and ticks agree only while the tempo never
changes — measured here after ordinary use, they were **1.68 bars apart**.

That was not cosmetic. `Transport.scheduleOnce(cb, t)` takes seconds and
converts to ticks at the *current* tempo, so a value read from
`Transport.seconds` mapped to a tick position well behind where the transport
had reached — the event was already in the past and **never fired**. A
bar-locked loop counted in and then sat in `counting` forever. It only happened
after you had touched the BPM dial, which is what made it look like flakiness.
`arm()` was also passing a transport time straight to `synth.click()`, which
wants audio time.

`engine/clock.ts` now owns the rule: **position is ticks, duration is audio
seconds, and inside a transport callback the `time` you are handed is the bridge
between them.** `barTicks`, `beatTicks`, `stepTicks`, `nextBar`, `atTick`,
`ticksAt`.

Separately, all three sequencers had a *private* grid, each starting whenever
its own button was pressed — the drum pattern counted steps from when you
started it, the metronome counted beats from when you toggled it, and the loop
began wherever your finger landed. So a loop recorded over a beat came back half
a bar against it. All three now derive their position from ticks, anchored at
transport zero.

Verified: armed deliberately mid-bar with seconds/ticks 1.68 bars apart, the
recording began at tick 18432 — **exactly 24 bars from zero, 0ms off the bar
line** — and a sixteen-step pattern reads **step 0** at that instant. Measured
after several passes, so the repeat stays locked and not just the start.

A bar-locked loop's repeat interval is now `bars × barTicks` rather than a
frozen number of seconds, so it follows the tempo instead of drifting out of the
beat when you turn the BPM dial.

## What a layer does and does not carry

Overdub layers record **absolute MIDI notes**, so the voicing you played is
baked in: record a triad, move Chord Voicing, overdub, and you get a genuine
stacked voicing. Verified — layers came back `[60,64,67]` and `[72,76,79]`.
This is the manual's own tip (§12.7): "use Loop Mode in Overdub to record one
note of the chord at a time… letting you experiment with complex chord
voicings".

**Sound is now per-layer too — a deliberate departure from the hardware.** The
Orchid is a note looper: "it records your performance and replays it through the
current sound, which is why changing the sound after recording changes the
playback" (research/08), so on the instrument a loop can only ever be one
timbre. `Layer` carries `sound` and `bassSound`, stamped when the pass *starts
capturing* rather than at commit, so changing preset halfway through a take does
not silently retag what you already played.

The cost is real: sweeping the Sound dial no longer re-voices a finished loop.
Verified both ways — layers came back `[0, 12]`, and moving the live preset from
6 to 41 left the loop's spectral centroid at 28.8 → 28.0.

### The pool, and the latency trap in it

Playback goes to a **pool of synths keyed by preset** (`Synth.poolFor`), wired
into the same filter and FX chain as the live voices. The live path is
untouched: it has to solve the strum problem, where a release can overtake an
attack that has not happened yet, and that ledger is only correct for one synth
at a time. Playback needs none of it — every recorded note's duration is known
when it is scheduled, so it is one `triggerAttackRelease`.

That makes steady-state playback **cheaper than before**: the old path booked
two cancellable `setTimeout`s per note per pass through `noteOn`/`noteOff`.

**The trap:** constructing a `PolySynth` measured **8–12ms on the main thread**,
against a `lookAhead` of **10ms**. Built lazily inside a scheduled playback
callback it would spend the whole scheduling window on construction and hand the
notes over late — a hitch, on the first pass of a new layer, which is the pass
you are listening hardest to.

So it is built twice over, both off the audio path:

- `Looper.stampSounds` warms at the moment capture starts — a full pass of
  headroom before anything plays.
- An idle effect in `App` warms whatever preset you have *settled* on, on a
  400ms delay so scrolling fifty sounds builds nothing.

Measured: record press **1.4ms** pre-warmed, 22ms cold, 85ms on the very first
(module warm-up). Not pre-warming at all would have put 8–12ms of it inside the
audio callback instead.

`pause()` calls `stopPlayback()` rather than `allNotesOff()`, so pausing a loop
does not cut a chord you are holding.

## Levels — measured, in `engine/levels.ts`

The library was **16.3dB apart** end to end (gated), the bass sat **12.9dB**
hotter than the treble, and a beat ran **19.6dB** hotter than a chord. That is
the jumping.

`sounds.ts`'s derived `volume` was never a loudness match and
`derive-sounds.cjs` says so: "the source's `v` is a raw amplitude and tracks
loudness only loosely once FM depth is involved". It could not be — what a
preset sounds like is dominated by envelope sustain, filter cutoff and FM index,
none of which `v` knows about. So the derived number stays (provenance, and
`--check` still verifies it) and the correction lives beside it as a measured
layer.

`scripts/measure-levels.mjs` renders every preset **offline**, through the same
`voiceParams` the instrument plays, and solves for a trim. Two rules earned the
hard way:

- **Gate the loudness.** A plain windowed RMS is dragged down by the silence
  after a short note, so `26 Tiptoe Pizz` asked for **+10.17dB** — and boosted
  by that it did not become level, it became a very loud pluck followed by
  nothing, still measuring 9.4dB down in real playing. Gated the same preset
  asks for **+4.57dB**. If the trims are ever regenerated, check the gate is
  still there.
- **Per-preset trim and section offset are different jobs.** Solving the bass
  against the *treble* target pinned seven of twelve presets at the ±12 rail.
  Flattening each family against its own median keeps trims small — and a large
  one then means a broken preset rather than an artefact of comparing one bass
  note to a four-note chord. Where a family *sits* is one number on its bus:
  `BASS_SECTION_DB`, `DRUM_TRIM`.

Verified in real playing, gated: chord spread **5.3dB** across nine presets,
beat **-0.39dB** against the chords, bass **-1.67dB**. The residual is not zero
and is not meant to be — some is the difference between a 200ms analysis block
and a 43ms one, some is each preset carrying its own reverb and chorus (dry
measured 7.35dB against 7.72dB wet, so FX is not the driver).

**One genuine outlier: `50 Slow Weather` reads ~3.8dB quiet** even held for two
and a half seconds, where the offline harness says it is on target. Not chased
down. Everything else lands within about 2.5dB.

**Re-run the harness after changing any preset's envelope, cutoff or FM index.**
Those are the fields that move loudness, and a stale trim is worse than none
because it looks deliberate.

## Options (encoder 8) — built, and flat

**The menu is flat, and that is a resolved conflict.** research/02 transcribes a
four-branch tree (System / Instrument / Bass / Audio and MIDI) from firmware
**v3.90**. Manual v4.1's §14 is a flat run of numbered settings, its §16.2 FAQ
cites flat paths, and **both illustrations show an unindented list** — PDF p20
captures the head (`Exit`, `Battery`, `View`, `Audio Output`, `MIDI Channels`)
and p23 the tail. research/13 §A.1 calls it: implement flat, v3.90 superseded.
Same precedent as the FX order — the photograph beats the prose.

PDF p23 also disagrees about *order*, putting `Version` straight after
`Extension Addition`; it is missing §14.7–§14.12 entirely and reads as a stale
capture, so the §14 numbering wins.

"Flat" means no *grouping*. It cannot mean values inline: `Extension Addition`
is eighteen characters against a 128px display, so a setting's values open on a
second screen — which is also all p20 and p23 show, labels with nothing beside
them.

Four rows do something. The rest hold their documented place and say `--`, the
same mark the FX rack puts on an effect it does not have:

| Row | State |
|---|---|
| `Quantization` | **built** — it *is* the looper's grid, read through one field rather than mirrored |
| `Metronome Click` | **built** — `Beep` or the kit's own closed hat. Measured as genuinely two sounds: centroid 205 against 418 |
| `Battery` | **built** — read from the browser. A laptop has one, so this is answerable rather than imitated |
| `Version` | **built** — the app's version standing in for §14.13's firmware version |
| `View` | **built** — all six of §14.2 |
| `Play Style` | **built** — Simple / Advanced / Free, see below |
| `Extension Addition` | **built** — `Add Note` or `Play Chord`, scoped to Advanced and Free per §14.6 |
| `Single Note Mode` | **built** — `Split Keyboard` or `Full Octave Keyboard`, see below |
| `Secret Chords` | **built** — the six combinations of §14.8, gated by play style |
| `Velocity Sense` | inert **and will stay so** — a computer keyboard sends no velocity. Nothing to sense until MIDI input exists |
| `Audio Output`, `Auto Power Off`, `Upgrade firmware`, `MIDI Channels` | hardware — speakers vs a headphone jack, a battery timeout, firmware. A tab has none of them |

Quantization previously existed twice: `loopGrid` in the store *and* the Options
row. Removed — the menu row is the only copy.

### Play Style — how the pads and keys interact (§14.5)

Three modes, and they differ in exactly one thing: **when the pads are allowed
to reach a chord that is already sounding.**

| | key alone | pad after key | pad after *releasing* a pad |
|---|---|---|---|
| **Simple** | silent | nothing — chord is latched at the key | nothing |
| **Advanced** | single note | forms the chord | nothing — the chord stands |
| **Free** | single note | forms the chord | switches it, repeatedly |

Verified by spying on what reaches the synth, which is the semantics rather than
a proxy for it:

- Simple, pad-then-key: `48 52 55`; release the pad → nothing (it sustains);
  press `min` → **nothing**. That is "you cannot change the chord type without
  releasing the key first".
- Advanced and Free, key alone: `48`; then the `maj` pad adds `52 55` **without
  retriggering the root** — "press a key to play a single note, and then press a
  Chord Type button while the key is still held".
- After releasing the pad and pressing `min`: Advanced does nothing, Free plays
  `51`. That release is Free's whole stated difference.

**A bare key in Simple is silent, and that is MANUAL SILENT.** §14.5 says only
that you must hold a pad first and never says what a lone key does. Silence is
the reading that makes that sentence literally true; a single note is the
feature §14.5 uses to *distinguish* Advanced, and a default major chord would
invent harmony nobody asked for and make the `maj` pad redundant.

### Extension Addition (§14.6)

`Add Note` adds `62` alone; `Play Chord` replays `48 52 55 62`. `Add Note` is
nearly free — `Player.update` already diffs and starts only what was not
sounding.

**Scoped to extension changes, and that was a bug first.** Written as "retrigger
on any recolour", simply *forming* a chord played it twice — once from the key,
once from the effect that follows the pad — because a type change also reaches
`recolour`. §14.6 says "replays the full chord when **extensions are added**",
so the trigger now compares the extension set against the last one.

### Secret Chords (§14.8)

Six chords that are not extra pads but what two pads mean **held together** —
which is why the normal path cannot reach them: `resolve` takes the most recent
pad and drops the rest, so `Maj + Min` is otherwise just `Min`. Every one is
something the additive triad-plus-extensions model genuinely cannot spell.

Verified through the real play path, in Simple:

| Pads | Sounds | Chord |
|---|---|---|
| `Dim + Sus` | `48 55` | `C5`, a bare fifth |
| `Maj + Sus` | `48 52 56` | `C+` |
| `Min + Sus` | `48 51 53 55` | `Cmadd4` |
| `Maj + Min` + `m7` | `48 52 55 58 63` | `C7♯9` |

The joke in the table is worth keeping: a ♯9 is enharmonically a minor third, so
a chord wanting a major *and* a minor third at once is exactly what `Maj + Min`
should mean.

Matching is **exact** — the table's `None` column is a condition, not a blank.
`Dim + Sus` is a fifth; `Dim + Sus + 9` is a player holding three pads and gets
what they asked for. Gating verified: `Off` gives a plain sus, `Simple
PlayStyle` does nothing while in Free, `All PlayStyle` fires in Free.

### Single Note Mode (§14.7) — and a reading the tests caught

`Full Octave Keyboard` keeps twelve keys in one octave. `Split Keyboard` puts an
octave jump at a point on the keybed.

§5.5 needed disambiguating. Read as an *absolute* instruction — "notes above
that point play an octave higher, and notes below play an octave lower", each
relative to the chosen octave — the keybed spans **35 semitones** with a
two-octave cliff at the seam. Read as a statement about the two halves relative
to *each other*, it spans 23 with a single octave of jump.

research/05 settles it: "effectively gives you **two octaves of range** from one
octave of keys". Two octaves is 23. §5.5's own "jump up or down **an** octave"
is singular, and agrees.

**The first implementation used the absolute reading and the range assertion
failed.** Verified: `C F♯ G` reads `48 54 55` on Full Octave and `48 54 67` on
Split — the seam falls between F♯ and G, one octave wide.

The split *point* is fixed at G. §5.5 calls it "a point that you choose on the
keyboard", but the mechanism for choosing is the Chord Voicing dial's own
position on hardware, and this keyboard has no equivalent free axis —
**MANUAL SILENT for our layout**. The mode is real; the movable point is not
built.

### View modes (§14.2)

All six, composed from three pieces — chord symbol, keyboard, note list —
because the manual's own descriptions compose that way: `Geek Out` is defined as
"maximum information, **including** the keyboard, chord name, and notes", which
is the union of the other three rather than a seventh layout. `viewPieces` in
`core/options.ts` is that mapping, pure and tested, including a test that Geek
Out *stays* the union.

`React` is the oscilloscope. It draws on a canvas from a rAF loop entirely
outside React — a waveform is sixty new frames a second and pushing that through
the store would re-render the panel on every one, the same reason the looping
border is a CSS animation. The analyser is built on first use and only while
that view is showing, so the other five cost nothing.

The keyboard reuses the quick-key-select glyph, lighting **pitch classes** so a
chord voiced across two octaves lights each of its notes once — it shows *which
notes*, not where they sit.

**Verified structurally, not with content.** The mode-to-pieces composition was
checked in the browser and matches §14.2 exactly, and the mapping is unit
tested. What could **not** be checked here is the populated rendering: `sounding`
reaches React through `Instrument.notify()`, which delivers on an animation
frame, and **frames do not run in this environment** — a rAF probe hung for 45
seconds with `document.hasFocus()` reporting true. Trusted input did not wake
it. The chord markup is unchanged from the already-working playing screen and
`noteWithOctave` is tested core, but the lit keys, the note list and the
oscilloscope trace have not been seen.

### The ten loop slots (§12.7) — built, and they persist

`Save As Loop XX` / `Save As` / `Load Loop` / `Delete Loop`, with the three
pickers opening a ten-row slot list on a second screen — the same two-level
shape Options uses, for the same reason: `Save As Loop 01` and a slot list will
not share a 128px row.

**Ten, not more.** research/08 calls this "the single clearest gap for our
webapp… a browser has localStorage, IndexedDB, file export and unlimited slots",
and the temptation is fifty. The count is documented, `Save As Loop XX` names a
two-digit slot, and an instrument with a different number of slots from the one
it models stops being that instrument.

**What a browser adds instead is memory.** The hardware's loops live "in memory
until the device powers off"; these survive a reload. Same interface, longer
memory — verified: saved, reloaded the page, and the slot was still there and
still loadable, with its layer still on preset 6.

Overwriting is deliberate, per research/08: "new loops overwrite an occupied
slot without a separate confirm step". Kept. `Delete` is the considered act; a
confirm on a ten-row list is the kind of safety that makes an instrument tiring.

`Loading warms the pool.` A saved loop's layers carry presets this session may
never have touched, and building one costs 8-12ms against a 10ms lookahead — so
`load` builds them all up front rather than letting the first playback callback
do it. Same trap as `stampSounds`.

Storage is defensive: anything unrecognisable in `localStorage` reads back as an
**empty slot** rather than reaching the looper, and a blocked or full store
degrades to session-only rather than refusing to save. Both are tested.

Verified end to end: save to the next free slot (the row then reads `Save As
Loop 02`), `Save As` into a chosen slot, `Load Loop` restoring a cleared
transport to `playing` with its layer on preset 6, `Delete` emptying a slot, the
cursor returning to the row that opened each picker, and the bank surviving a
reload.

## Still not built

| Thing | Notes |
|---|---|
| The Options settings marked inert above | Play Style is the biggest: it changes how pads and keys interact |
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
