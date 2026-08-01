# 12 — Tech Stack

**Decided:** React + TypeScript, Tone.js, Vite.

Everything here follows from one rule established in [11](11-webapp-implications.md) §3:

> **The chord engine, voicing engine and performance scheduler are pure functions over data.**
> No audio. No DOM. No React. They take state and emit `NoteEvent[]`.

React and Tone.js only ever touch the **sink** layer. That keeps the interesting 20% of the
codebase — the part that actually *is* the Orchid — dependency-free, trivially testable, and
portable if we ever change our minds about either.

---

## The stack

| Concern | Choice | Notes |
|---------|--------|-------|
| **Build** | Vite + `@vitejs/plugin-react` | |
| **Language** | TypeScript, `strict: true` | The chord model wants discriminated unions |
| **UI** | React 19 | |
| **Panel state** | Zustand | Small, unopinionated, easy to keep *out* of the audio path |
| **Audio** | Tone.js | Sink layer only, behind a narrow interface |
| **MIDI I/O** | Raw Web MIDI API | ~30 lines; a wrapper would add more than it saves |
| **MIDI export** | `@tonejs/midi` | Pairs naturally with Tone |
| **Prefs** | `localStorage` | Tier-3 switch, spacebar assignment, MIDI channels |
| **Loops & user sounds** | IndexedDB via `idb` | Structured, will outgrow localStorage |
| **Testing** | Vitest + `fast-check` | Property tests over the pure core |
| **Styling** | Plain CSS + custom properties | Panel aesthetic needs precise control; custom props make LED/focus states trivial |
| **Dials** | Hand-built SVG | No knob library — see below |
| **Drums** | Synthesized (808-style) | Zero assets, on-brand (`ORC808` is a real preset name) |
| **Fonts** | Self-hosted condensed + mono | For §1c silkscreen legends |

**Deliberately not using:** any UI kit, any knob/dial library, Tailwind, any music-theory library.
The theory *is* the product — see §"Why no theory library" below.

---

## Project shape

```
src/
├── core/                    ← ZERO dependencies. Pure. Fully unit-tested.
│   ├── chord.ts             ── types + extensions → pitch classes
│   ├── key.ts               ── diatonic mapping, modes, chromatic borrowing
│   ├── spelling.ts          ── enharmonic naming (C# vs D♭, the `x` double-sharp)
│   ├── voicing.ts           ── the inversion window + voice leading
│   ├── performance.ts       ── strum/slop/arp/pattern/harp → NoteEvent[]
│   └── types.ts
│
├── engine/                  ← The sink. Tone.js lives ONLY here.
│   ├── SynthEngine.ts       ── interface: noteOn / noteOff / setParam
│   ├── ToneEngine.ts        ── implementation
│   ├── effects.ts           ── the six FX chain
│   ├── drums.ts             ── synthesized 808 kit
│   ├── scheduler.ts         ── lookahead loop on Tone.Transport
│   └── midi.ts              ── Web MIDI: 3-channel out, MIDI in
│
├── state/                   ← Zustand. Panel state ONLY. Never notes.
│   ├── panel.ts             ── dial values, focus, switches
│   └── prefs.ts             ── persisted settings
│
├── input/
│   ├── keyboard.ts          ── event.code map, §1 layout
│   └── layout.ts            ── Keyboard Map API legend resolution (§1c)
│
├── ui/
│   ├── Dial.tsx             ── SVG, role="slider", §1b grammar
│   ├── Keybed.tsx           ── 3-tier keys (§1c)
│   ├── ChordButtons.tsx
│   ├── Display.tsx          ── chord readout / Geek Out
│   └── Legend.tsx           ── the silkscreen label primitive
│
└── App.tsx
```

The `core/` boundary is the whole design. If a file in `core/` ever imports React or Tone,
something has gone wrong.

---

## React: the four traps

React is the right call for ecosystem and familiarity, but it is genuinely dangerous in an audio
app. All four of these are avoidable if you know them up front.

### 1. Audio state must never live in React

Which notes are sounding, the scheduler's position, the voice allocator — none of it belongs in
`useState`. It lives in the engine, held by `useRef`. React renders a *mirror* of it, updated on
`requestAnimationFrame`, and is always allowed to be a frame behind.

```ts
// ✅ engine owns truth; React observes
const engineRef = useRef<SynthEngine>()
const [display, setDisplay] = useState<Snapshot>(EMPTY)

useEffect(() => {
  let raf: number
  const tick = () => {
    setDisplay(engineRef.current!.snapshot())  // cheap, throttled to 60fps
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}, [])
```

If a note-on ever triggers a React render, latency becomes unpredictable and the instrument
will feel mushy. Renders are for pixels.

### 2. StrictMode double-mounts effects in dev

React 19 StrictMode intentionally runs effects twice in development. Naively that creates **two
AudioContexts and two Tone graphs** — you get doubled notes, phasing, and a confusing debugging
session. Guard initialisation with a module-level singleton, not an effect-local flag.

### 3. AudioContext needs a user gesture

Browsers suspend audio until the user interacts. Call `await Tone.start()` from a real click/keypress
handler — and design for it: a splash state that says "click to start," or start on the first
chord button press. Don't attempt it on mount; it will silently fail.

### 4. Bind keyboard listeners once, on `window`

Not per-component, not re-bound on every state change. One effect with `[]` deps, reading current
state through a ref. Otherwise you'll leak handlers, re-bind on every dial turn, and drop keys.

Also required, per [11](11-webapp-implications.md) §1: ignore `event.repeat`, and flush all notes
on `window.blur`.

---

## Tone.js: what it gives us and what it doesn't

### Maps cleanly onto our three engines

| Our engine | Tone primitive |
|-----------|----------------|
| Polyphonic subtractive / VA | `PolySynth(Synth)` with filter + filter envelope |
| FM | `PolySynth(FMSynth)` |
| Vintage EP / reed | `PolySynth(FMSynth)` — 2-op FM *is* how a Rhodes is best synthesised |

`maxPolyphony: 16` matches the hardware ([01](01-overview-and-history.md)).

### The six effects — one gap

| FX | Tone | Notes |
|----|------|-------|
| Reverb | `Tone.Reverb` | Generated IR; adequate, replaceable with `Convolver` + real IR later |
| Chorus | `Tone.Chorus` | ✅ |
| Delay | `Tone.FeedbackDelay` | ✅ — the hardware's v3.90 notes mention "smoother delays with reduced pops," so watch parameter ramping |
| Phaser | `Tone.Phaser` | ✅ — hardware had a "runaway at maximum settings" bug; clamp feedback |
| Overdrive | `Tone.Distortion` | ✅ |
| **Flanger** | **none** | ⚠️ Build it: short `Delay` (1–10ms) + LFO on delay time + feedback. ~20 lines |

### Transport is our master clock

One `Tone.Transport` BPM drives the arpeggiator, Pattern mode, the beat machine, loop bar lengths
and loop quantization — exactly as the hardware shares one tempo ([08](08-looper-and-beats.md)).

Use `Tone.Draw.schedule()` to sync *visual* events (LED flashes, key highlights) to audio time.
Never drive visuals from the scheduler directly.

### Keep it behind an interface anyway

```ts
export interface SynthEngine {
  noteOn(note: number, velocity: number, at: number): void
  noteOff(note: number, at: number): void
  setParam(param: ParamId, value: number): void
  allNotesOff(): void          // panic — Esc, blur, mode change
  snapshot(): Snapshot         // for the UI mirror
}
```

Costs one thin file. Buys the option to rewrite any individual engine in raw Web Audio later
without touching anything else.

---

## Testing: where the value is

The pure core is where bugs are both likely and cheap to catch. Property-based tests fit unusually
well here:

```ts
test('inversion preserves pitch classes', () => {
  fc.assert(fc.property(arbChord(), fc.integer(), (chord, n) => {
    const voiced = applyVoicing(chord, n)
    expect(pitchClasses(voiced)).toEqual(pitchClasses(chord))
  }))
})

test('voicing cycles with period = note count', () => {
  fc.assert(fc.property(arbChord(), (chord) => {
    const n = chord.notes.length
    expect(applyVoicing(chord, n)).toEqual(transposeOctave(applyVoicing(chord, 0)))
  }))
})
```

That second one directly encodes the documented hardware behavior from
[05](05-voicing-engine-and-inversions.md) — "the number of clicks between each inversion changes
depending on how many notes are in the chord."

Also worth locking down with tests: the full diatonic tables in
[04](04-key-mode-and-harmony.md), and the enharmonic spelling rules (`E♯°` in F♯ major, `Fx`
double-sharps) from [03](03-chord-engine.md).

**Don't** chase coverage in `ui/` or `engine/`. Test the core hard; smoke-test the rest.

---

## Why no music-theory library

Tonal.js and friends are competent, but the chord/voicing/spelling logic **is the product**. It's
a few hundred lines of well-understood theory, it's the part we most need to control precisely
(the additive-extension model in [03](03-chord-engine.md) is not how normal chord libraries
think), and it's the part most worth having fully tested. Importing it would trade our
differentiator for a dependency.

The tables in [03](03-chord-engine.md), [04](04-key-mode-and-harmony.md) and
[10](10-sound-palette-and-chord-vocabulary.md) are effectively the spec — much of `core/` is
transcription from those files.

---

## Deployment

Static build. Vercel / Netlify / Cloudflare Pages all fine.

**Two constraints:**
- **Web MIDI requires a secure context** — HTTPS or `localhost`. This bites the first time you
  test on a phone over a local IP address.
- **Web MIDI is not universal.** Chrome/Edge ✅, Firefox ✅ (permission prompt), **Safari ❌**.
  Design MIDI as strictly *additive*: everything works without it. Feature-detect
  `navigator.requestMIDIAccess` and hide the MIDI panel rather than erroring.
  **[VERIFY]** Safari's status before launch — this is from recall, not a live check.

Same caveat applies to the **Keyboard Map API** (§1c legend localisation): Chromium-only, with a
static US fallback table everywhere else.

---

## Dependencies, complete

Verified against npm on 2026-07-31 and installed:

```jsonc
{
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "tone": "^15.1.22",
    "zustand": "^5.0.14",
    "@tonejs/midi": "^2.0.28",
    "idb": "^8.0.3"
  },
  "devDependencies": {
    "typescript": "^7.0.2",     // the native port; `latest` as of this date
    "vite": "^8.2.0",
    "@vitejs/plugin-react": "^6.0.5",
    "vitest": "^4.1.10",
    "fast-check": "^4.9.0"
  }
}
```

Six runtime dependencies. That's the point — the weight is in `core/`, which has none.

My earlier guesses in this file (Vite 6, Vitest 2, fast-check 3, TS 5) were all a major version
or more behind. 114 packages installed in total.

---

## Suggested build order

Follows the dependency graph, and gets to a playable instrument fast:

1. `core/chord.ts` + `core/spelling.ts` + tests — **no UI at all.** Prove the chord model first.
2. `core/voicing.ts` + property tests.
3. Minimal `ToneEngine` + one subtractive preset. **First sound.**
4. `input/keyboard.ts` with the §1 layout. **First playable chord.**
5. `ui/Keybed.tsx` with all three tiers (§1c) — the app starts teaching itself.
6. `core/key.ts` — Key Mode.
7. `ui/Dial.tsx` + the §1b focus grammar.
8. `core/performance.ts` — strum, then arp.
9. MIDI out, three channels.
10. Everything else: FX, bass engine, looper, beats, presets.

Steps 1–4 are the risky, defining work and they need no design system, no dials, no polish.
If the chord engine and the keyboard mapping feel right, the rest is execution.
