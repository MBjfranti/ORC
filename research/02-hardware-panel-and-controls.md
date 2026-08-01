# 02 — Hardware Panel & Controls

## Layout, left to right

```
┌──────────────────────────────────────────────────────────────────────┐
│  [ display ]        ○ ○ ○ ○ ○ ○ ○ ○ ○   (rotary encoders)           │
│                                                                      │
│  ┌────┬────┬────┬────┐                                               │
│  │Dim │Min │Maj │Sus │   ← CHORD TYPES (top row)                     │
│  ├────┼────┼────┼────┤     ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓  ← 12 keys       │
│  │ 6  │ m7 │ M7 │ 9  │   ← CHORD EXTENSIONS (bottom row)            │
│  └────┴────┴────┴────┘                                               │
└──────────────────────────────────────────────────────────────────────┘
```

**[OFFICIAL]** Eight large chord-modifier buttons on the left in two rows of four; a
12-key velocity-sensitive single-octave keyboard on the right; a row of rotary encoders and
a small display across the top.

## The four interaction gestures **[OFFICIAL]**

This is the whole control grammar of the instrument. Every encoder supports some subset:

| Gesture | Meaning |
|---------|---------|
| **Press** | Toggle something on/off |
| **Turn** | Change a value |
| **Press & hold** | Reveal a menu, *or* lock a setting |
| **Press & turn together** | Access a secondary/hidden setting |

That last two are the source of the "menu diving" criticism — a lot of function is hidden
behind held gestures with no persistent visual affordance.

## The encoders

Telepathic states **nine rotary encoders** across the front panel, grouped as:
*Sound, Perform, FX, Key, Bass, Loop, BPM, and Voicing (×2)*. **[OFFICIAL]**

The manual additionally refers to a **Volume dial** and an **Options dial** by name. Whether
those are two of the nine, or additional controls, is not stated unambiguously in the public
docs. **[UNKNOWN]** — doesn't matter for our build, but don't cite a hard count.

### Sound encoder **[OFFICIAL]**
- **Turn** — browse sounds by number.
- **Press, then turn** — browse sounds by *name*.
- **Press & hold** → menu including **"Save as a User Sound."**
- User sounds appear in the list *after* the factory sounds.

### Perform encoder **[OFFICIAL]**
- **Press** → reveals the list of performance settings (Strum, Slop, Arp, Pattern, Harp…).
- **Turn** → select mode; turn again → adjust that mode's parameter (speed, pattern number).
- **Turn fully left** → performance off.
- **Press & hold until the LED lights** → **locks** the performance setting. Now scrolling
  through sounds keeps the same performance mode applied. This is a genuinely smart idea:
  *decouple "how it plays" from "what it sounds like."*

### FX encoder
- Controls the effects layer (reverb, chorus, delay, flanger, phaser, overdrive) and filter
  cutoff. Detail in [07](07-sound-engines-fx-and-presets.md). The public docs are thin here. **[UNKNOWN]** — exact per-FX parameter mapping.

### Key encoder **[OFFICIAL]**
- **Press** → enable/disable Key Mode.
- **Turn** → select key (e.g. `Bm`, `C`).
- When active: key name shows top-left of the display + an LED next to the encoder.
- **Press & hold, then press a keyboard key (with a chord-type button)** → quick key select.
  e.g. hold Key, then `Min + C` → sets key to C minor.
- v3.90: turning Key off now shows an explicit "Off" on the display.

### Bass encoder (orange) **[OFFICIAL]**
- **Press** → enable/disable the bass engine.
- **Turn** → change the bass sound (same browsing behavior as Sound).
- **Press & hold** → bass behavior menu: *With chords only / Unison / Bass single notes / Solo*.
- Also reachable at Options → Bass in v3.90+.

### Chord Voicing dial **[OFFICIAL]**
- **Turn** → move up/down the full keyboard range; while a chord sounds, walks inversions.
- **Press** → toggle **Split** vs **Octave** mode.
- Full detail in [05](05-voicing-engine-and-inversions.md).

### Bass Voicing dial **[OFFICIAL]**
- Independent inversion/register control for the bass line.
- Also acts as a shortcut modifier: **Bass Voicing + Loop** = hard-exit loop mode.

### Loop encoder **[OFFICIAL]**
- **Press or turn** → enter Loop Mode.
- **Turn** → choose sync mode / length (1, 2, 4, 8, 16 bars, or Free).
- **Press** → start recording (1-bar count-in in BPM mode).
- **Press & hold** → Save / Save as / Load / Delete / Exit.
- Detail in [08](08-looper-and-beats.md).

### BPM encoder **[OFFICIAL]**
- **Turn** → tempo.
- **Press & hold** → list of pre-programmed **Beats**; turn to browse, press to select.
- **Press** (while a beat plays) → beat off.
- **Press & hold while turning** → **Beat Volume** (0–99).

### Volume dial **[OFFICIAL]**
- **Turn** → master volume.
- **Press & hold while turning** → **Bass Volume** (0–99).
- All volumes also live at Options → Volumes (Master / Bass / Drums) as of v3.90.

### Options dial **[OFFICIAL]**
- Enters the Options menu (full tree below).

## Display

**[OFFICIAL]** Small screen showing chord notation, key, and menu state. Five **View modes**
(Options → System → View):

1. Simple chord notation
2. List of notes
3. Reactive waveform
4. Visual keyboard
5. **"Geek Out"** — chord + notes + keyboard all at once (community favorite)

Display quirks documented in [03](03-chord-engine.md): `JAZZ` / `???` / `WTF?` placeholders
for over-complex chords, and `x` for double-sharps.

v3.90 change: chord display now lingers briefly after chord release.

## Options menu tree (firmware v3.90) **[OFFICIAL]**

```
OPTIONS
├── System
│   ├── View ............... Chord notation | Notes list | Waveform | Keyboard | Geek Out
│   ├── Battery ............ current level
│   ├── Auto Power Off ..... 10 min | 30 min | Never
│   └── Version ............ firmware version
│
├── Instrument
│   ├── Play Style ......... Simple | Advanced | Free
│   ├── Secret Chords ...... Simple only | All Play Styles | Off
│   ├── Single Notes ....... one octave | split across two octaves
│   │                        (also toggled by clicking the Chord Voicing dial)
│   ├── Extension Addition . Add Note | Play Chord
│   ├── Quantization ....... 1/4 | 1/8 | 1/8T | 1/16 | 1/16T | 1/32
│   └── Velocity Sense ..... On | Off   (not all presets are velocity-sensitive)
│
├── Bass
│   └── Bass plays: ........ With chords only | Unison | Bass single notes | Solo
│
└── Audio and MIDI
    ├── Audio Output ....... Auto | Headphones only | Speakers only | Both
    ├── MIDI Channels ...... Performed notes / raw Chords / Bass — assignable or Off
    ├── Volumes ............ Master | Bass | Drums
    └── Metronome Click .... Beep | Hi Hat
```

**Auto audio output** detects whether the headphone jack is in use and enables/disables the
speakers accordingly — nice touch.

## I/O **[OFFICIAL]**

| Port | Notes |
|------|-------|
| **USB-C** | MIDI + power. **No audio.** On boot with USB attached, a "Select USB Mode" menu appears — choose **"Enable USB MIDI."** |
| **5-pin DIN MIDI Out** | Standard DIN. *Not* 3.5 mm TRS — connecting to TRS-MIDI gear (Arturia etc.) needs the right Type A/B adapter. |
| **3.5 mm stereo out** | TRS stereo. Must be broken out to two mono 1/4" inputs for clean recording; summing to mono causes phasing. |
| **Speakers** | 2 × stereo, built in. |

No audio input, no CV, no sustain-pedal jack documented. **[UNKNOWN]** — sustain pedal support.
