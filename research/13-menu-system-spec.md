# 13 — Menu & Options System Spec

**Status:** design spec, not implemented.
**Sources:** `research/90-operation-manual-v4.1.txt` (all 29 pages), the screen
illustrations embedded in `Telepathic Instruments - Orchid Operation Manual.pdf`,
and `research/02-hardware-panel-and-controls.md`.

Citation convention:

- `§n.n` — section of the Operation Manual v4.1.
- `PDF pN` — the screen illustration embedded on page N of the PDF. Every one of
  these was extracted and measured pixel-by-pixel; see
  [§C.0](#c0-how-the-illustrations-were-measured) for the method.
- `[02]` — `research/02-hardware-panel-and-controls.md`.
- **MANUAL SILENT — inferred:** the manual does not say; reasoning follows.

Nothing in this document is invented manual content. Where the manual and the
PDF illustrations disagree, both are reported and the conflict is flagged.

---

## 0. The one fact that reframes everything

The manual's screen illustrations are not decorative mock-ups. They are
**pixel-exact renders of the real framebuffer**, upscaled 5×:

- Every illustration is 640×640 px, purely 1-bit (only values `0` and `255`).
- Every run-length in every image is a multiple of 5.
- Therefore the display is **128 × 128 logical pixels, 1-bit monochrome, square.**

This single measurement invalidates a load-bearing assumption in the current
build, which renders the screen at `aspect-ratio: 2 / 1` with anti-aliased
greyscale text (`src/ui/styles.css:447`). Every layout number in
[§C](#c-screen-graphics) below is given in that 128×128 space, so it can be
implemented as a scaled unit grid rather than guessed with `clamp()`.

---

## A. Menu inventory

**24 menus total**: 1 Options root + 14 Options sub-pages + 9 encoder-level
menus. Sub-sub-pages (MIDI channel pickers, Quantization fractions) are nested
under their parents and not counted separately.

Wording below is the manual's, verbatim. Where an illustration shows a *shorter*
on-screen label than the manual's prose, the on-screen label is authoritative and
the prose form is given in brackets.

### A.1 Options menu (root) — the Options Dial

> "The Options Menu contains a variety of settings that change how Orchid
> operates, as well as system information. To access these options, use the
> Options Dial." (§14)

The menu is **flat**. PDF p20 and PDF p23 both show a single scrolling list with
no group headings and no submenu indicators.

Order, from §14.1–§14.14, with `Exit` prepended (PDF p20 shows `Exit` as the
first row of the list):

| # | Label (on screen) | Kind | Values | Default |
|---|---|---|---|---|
| 1 | `Exit` | action | — | — |
| 2 | `Battery` | info | current battery level (§14.1) | — |
| 3 | `View` | enum | see A.2 | MANUAL SILENT |
| 4 | `Audio Output` | enum | see A.3 | `Auto` (inferred, see A.3) |
| 5 | `MIDI Channels` | submenu | see A.4 | Perf 1 / Bass 2 / Chord 3 (§3.2) |
| 6 | `Play Style` | enum | see A.5 | MANUAL SILENT |
| 7 | `Extension Addition` | enum | see A.6 | MANUAL SILENT |
| 8 | `Single Note Mode` | enum | see A.7 | MANUAL SILENT |
| 9 | `Secret Chords` | enum | see A.8 | MANUAL SILENT |
| 10 | `Quantization` | enum | see A.9 | `None` (inferred — it is listed first) |
| 11 | `Metronome Click` | enum | see A.10 | MANUAL SILENT |
| 12 | `Velocity Sense` | toggle | see A.11 | MANUAL SILENT |
| 13 | `Auto Power Off` | enum | see A.12 | MANUAL SILENT |
| 14 | `Version` | info | firmware version (§14.13) | — |
| 15 | `Upgrade firmware` | action | see A.13 | — |

> **⚠ CONFLICT — Options list order.** PDF p23 shows three consecutive rows:
> `Extension Addition`, `Version`, `Upgrade firmware`, with the cursor on
> `Upgrade firmware` and two *blank* rows below it (so it is the last item).
> That places `Version` immediately after `Extension Addition`, which contradicts
> §14.6 → §14.13. Either the screenshot predates items §14.7–§14.12, or the
> firmware order differs from the manual's section order.
> **Recommendation:** follow the §14 numbering (it is the explicit, numbered
> source) and treat p23 as a stale capture. Flag in code with a comment.

> **⚠ CONFLICT — flat vs. nested.** §14.5's note says
> "*Options > Instrument > Extension Addition*", and `[02]` documents a four-group
> tree (System / Instrument / Bass / Audio and MIDI) for firmware v3.90. But the
> v4.1 §14 body is flat, the §16.2 FAQ cites flat paths
> ("*Options > Velocity Sense*", "*Options > Single Notes*"), and **both**
> illustrations (PDF p20, PDF p23) show an unindented flat list.
> **Recommendation:** implement flat. The v3.90 tree in `[02]` is superseded.
> This is a direct divergence from the current code, which renders the v3.90
> tree as `<Section>` headings (`src/ui/Screen.tsx:529–582`).

Note: `Volumes (Master / Bass / Drums)` appears in the `[02]` v3.90 tree but
**not** anywhere in manual v4.1's §14. It is not part of this spec's Options
inventory.

#### A.2 `View` — §14.2

> "Select different View Modes to customize the display:"

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `React` | "Displays an oscilloscope for a real-time visual representation of the waveform." |
| 2 | `Chord` | "Displays only the current chord being played in large text." |
| 3 | `Keyboard` | "Shows a visual keyboard with highlighted notes being played." |
| 4 | `Chord & Keyboard` | "Displays both the keyboard and the chord name." |
| 5 | `Notes` | "Displays the chord name and the individual notes being played in written format." |
| 6 | `Geek Out` | "Displays maximum information, including the keyboard, chord name, and notes." |

Default: **MANUAL SILENT — inferred:** `Chord`. It is the only mode that shows
nothing but the instrument's core output, and §5.2's tour describes chord
playing with no mention of a keyboard or note list on screen. (Current code
defaults to `geek`, `src/state/panel.ts:372`.)

#### A.3 `Audio Output` — §14.3

> "Customize how audio is routed when an external device is connected:"

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `Auto` | "Automatically detects and adjusts audio output." |
| 2 | `Headphones` | "Outputs only through the headphone jack, disabling speakers." |
| 3 | `Speakers` | "Outputs only through built-in speakers, muting the headphone output." |
| 4 | `Both` | "Plays sound through both speakers and headphone output simultaneously." |

Default: `Auto`. §3.1 states the speakers "will automatically disable when this
is in use (modifiable in Options)" — automatic behaviour is the shipped state.

#### A.4 `MIDI Channels` — §14.4 (submenu)

> "Determine what MIDI channel Orchid sends MIDI note data on:"

| Order | Label | Manual gloss | Default (§3.2) |
|---|---|---|---|
| 1 | `Performance` | "Outputs notes based on Performance Modes (e.g., Arpeggiator, Strum)." | Channel 1 |
| 2 | `Bass` | "Sends bass notes separately on an independent MIDI channel." | Channel 2 |
| 3 | `Chord` | "Outputs played chords, even if a Performance Mode is active." | Channel 3 |

"All three channels can be used at once." Channel range and an off setting:
**MANUAL SILENT — inferred:** 1–16 plus `Off`, since `[02]` records
"assignable or Off" and the current code already implements 1–16 + Off
(`src/ui/Screen.tsx:617–634`).

#### A.5 `Play Style` — §14.5

| Order | Label | Manual gloss (abridged) |
|---|---|---|
| 1 | `Simple` | "Simplified controls… press and hold a Chord Type button before you press a key… You cannot change the chord type… without releasing the key first." |
| 2 | `Advanced` | "…press a key to play a single note, and then press a Chord Type button while the key is still held to trigger the chord." |
| 3 | `Free` | "…behaves just like Advanced Mode, but… chords can be switched or re-triggered repeatedly after releasing either the Chord Type button or Key." |

Default: **MANUAL SILENT — inferred:** `Simple`. It is listed first, and §5.2's
"Getting Started" instructions ("Hold down a Chord Type button… Press a note on
the Keyboard") describe Simple's behaviour as the out-of-box experience.
(Current code defaults to `free`, `src/state/panel.ts:373`.)

#### A.6 `Extension Addition` — §14.6

> "Controls how Chord Extensions behave when added:"

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `Add Note` | "Adds only the additional extension without retriggering the full chord." |
| 2 | `Play Chord` | "Replays the full chord when extensions are added." |

Only meaningful in Advanced and Free Play Styles (§14.5 note). Default:
**MANUAL SILENT — inferred:** `Add Note`, listed first.

#### A.7 `Single Note Mode` — §14.7

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `Split Keyboard` | "Allows splitting the keyboard into different playable zones." |
| 2 | `Full Octave Keyboard` | "Keeps the keyboard as a full playable octave." |

The §16.2 FAQ refers to the same setting as "*Options > Single Notes*" with
values "`Full Octave`" and "`Split Mode`". Also toggled by pressing the Chord
Voicing Dial (§5.5). Default: **MANUAL SILENT — inferred:** `Full Octave
Keyboard` — §16.2 recommends it "for minimal shifts", i.e. it is the
non-surprising behaviour.

#### A.8 `Secret Chords` — §14.8

> "Turning on Secret Chords gives you access to a range of extra spicy chords…
> Select **Simple PlayStyle** in the Secret Chords menu to access these chords
> in Simple Play Style mode only, or **All PlayStyle** to access these chords in
> all Play Style modes."

| Order | Label | Effect |
|---|---|---|
| 1 | `Simple PlayStyle` | Secret Chords in Simple Play Style only |
| 2 | `All PlayStyle` | Secret Chords in every Play Style |

An `Off` value is **not** named in §14.8, but §14.8's framing ("Turning **on**
Secret Chords") implies one, and `[02]` records `Off` as a third value.
**MANUAL SILENT — inferred:** three values, `Off` first. Default `Off`.

The chords themselves (§14.8 table): `Dim+Sus → C⁵`, `Maj+Sus → C+`,
`Min+Sus → Cmᵃᵈᵈ⁴`, `Min+Dim + 6th → Cmᵐ⁶`, `Maj+Dim + 6th → Cᵐ⁶`,
`Maj+Min + Minor 7th → C7#⁹`.

#### A.9 `Quantization` — §14.9

> "Enables automatic rhythmic correction for Loop Mode recordings:"

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `None` | "No quantization." |
| 2 | `Fractions` | "Choose from `1/4`, `1/8`, `1/8t`, `1/16`, `1/16t` or `1/32` to snap notes to the nearest subdivision." |

Note the manual's exact casing: **`1/8t`** and **`1/16t`**, lowercase `t`.
`[02]` writes `1/8T`/`1/16T`; the manual is authoritative.

Whether `Fractions` is a submenu or the six fractions sit inline in the parent
list is **MANUAL SILENT — inferred:** inline. "Choose from…" reads as a value
list, and a 6-item submenu for one setting would be the only two-level branch in
an otherwise flat menu. Implement as a 7-value enum:
`None, 1/4, 1/8, 1/8t, 1/16, 1/16t, 1/32`.

#### A.10 `Metronome Click` — §14.10

> "Select different Metronome Sounds to match your preference."

The manual names **no** individual sounds. **MANUAL SILENT — inferred:** the
current build's `Beep` / `Hi Hat` pair, taken from `[02]`. Do not invent more.

#### A.11 `Velocity Sense` — §14.11

> "Toggle Velocity ON/OFF. When ON, note volume and intensity will respond to
> playing dynamics."

Values `ON` / `OFF` (manual's own capitalisation in §14.11). Default:
**MANUAL SILENT — inferred:** `ON`; §16.2's FAQ answer ("Ensure Velocity
Sensitivity is enabled") treats disabled as the anomaly.

#### A.12 `Auto Power Off` — §14.12

> "You can set your Orchid to Auto Power Off after 10 or 30 minutes of
> inactivity, or set it to Never if you're playing it on a gig."

| Order | Label |
|---|---|
| 1 | `10 minutes` |
| 2 | `30 minutes` |
| 3 | `Never` |

Exact on-screen wording of the first two is **MANUAL SILENT** — the prose says
"after 10 or 30 minutes". Default: **MANUAL SILENT.**
*Not applicable to a web build; render it, disable it, or omit it — see E.7.*

#### A.13 `Upgrade firmware` — §14.14

On-screen label from PDF p23 is lowercase-f `Upgrade firmware`; §14.14's heading
is `Upgrade Firmware` and §14.14 step 4 says "select **Upgrade firmware**". Use
the screen form. Selecting it puts the device into a firmware-receive state; the
manual's §16.1 troubleshooting row mentions the screen can read
`"Ready for Firmware"`. *Not applicable to a web build — see E.7.*

### A.14 Encoder-level menus (outside Options)

#### M1 — Sound Save menu · **Sound Dial, press-and-hold** (§8.4)

> "Long press the Sound Dial to enter the Sound Save menu. Save your Sound as
> the suggested User Sound number or push **Save As** to pick the number you
> want… Long press the Sound Dial then cycle to **Delete** to the currently
> selected User Sound."

| Order | Label | Notes |
|---|---|---|
| 1 | *(suggested slot, e.g. `Save As User Sound 03`)* | exact format MANUAL SILENT |
| 2 | `Save As` | pick the slot number |
| 3 | `Delete` | deletes the currently selected User Sound |

"Your User Sound will now appear in the Sound menu" — user sounds are appended
to the same list the Sound Dial browses (§8.4, `[02]`: "after the factory
sounds").

#### M2 — Performance Modes menu · **Perform Dial, press** (§7.1, PDF p11)

> "Press the Perform Dial to see the available modes. Turn the Perform Dial to
> scroll through the modes. Press the Perform Dial to select a mode. Turn the
> dial again to adjust the selected mode."

Labels from §7.2, cross-checked against PDF p11 which shows five consecutive
rows and gives the **shortened on-screen forms**:

| Order | On-screen (PDF p11) | Manual prose (§7.2) |
|---|---|---|
| 1 | `Strum` | Strum |
| 2 | `Strum 2 Octaves` | Strum 2 Octaves |
| 3 | `Slop` | Slop |
| 4 | `Arpeggiate` | Arpeggiate |
| 5 | `Arp 2 Octaves` | **"Arpeggiator 2 Octaves"** |
| 6 | *(not illustrated)* | Pattern |
| 7 | *(not illustrated)* | Harp |

PDF p11 shows `Strum` carrying a right-aligned value `01` while the cursor sits
on `Slop`. **Inferred:** the right-aligned number is the mode's *amount*, shown
only on the **active** mode's row — so the list distinguishes *cursor* from
*active*. There is no `Off`/`Exit` row visible above `Strum`, and `Strum` is at
the top of the viewport with no blank row above it, so `Strum` is item 1 and the
list has no `Exit`.

> **⚠ CONFLICT.** `[02]` records "*Turn fully left → performance off*", implying
> an off state reachable by turning. Manual v4.1 §7.1–§7.2 names no `Off` mode
> and PDF p11 shows none. **Inferred:** performance-off is reached by turning
> fully left *past* `Strum` (a clamp position), not by a list row. The current
> code models `off` as list item 0 (`src/state/panel.ts:514–519`), which is a
> reasonable equivalent but puts a row on screen the hardware does not show.

Amount units per mode (§7.2): Strum/Strum 2 Oct/Slop = speed or slop level;
Arpeggiate/Arp 2 Oct = a sequence selected by turning, "using 1/8 or 1/16 notes";
Pattern = a pre-determined pattern; Harp = MANUAL SILENT.

**Perform lock** (§7.3) is *not* a menu: "Long-press the Perform Dial to lock the
current performance settings. When performance lock is active, an LED beside the
Perform Dial will illuminate."

#### M3 — FX menu · **FX Dial, press** (§8.2, PDF p12)

> "Push the FX Dial to see the available effects. Turn the FX Dial to choose the
> effect you wish to change. Push the FX Dial to select the effect. Turn the dial
> to adjust the selected effect's intensity."

PDF p12 shows a blank row, then `Exit`, then `Reverb 05` (cursor), `Chorus 02`,
`Delay 01`. So:

| Order | Label | Value column |
|---|---|---|
| 1 | `Exit` | — |
| 2 | `Reverb` | 2-digit amount |
| 3 | `Chorus` | 2-digit amount |
| 4 | `Delay` | 2-digit amount |
| … | remaining §8.1 effects | 2-digit amount |

> **⚠ ORDER CONFLICT.** §8.1 lists the effects as Reverb, Delay, Chorus, Phaser,
> Flanger, Drive, Tremolo, Ensemble, Filter, Drum FX Reverb, Drum FX Saturation.
> PDF p12's *menu* order is Reverb, **Chorus**, **Delay**. **Recommendation:**
> follow PDF p12 for the first three (it is the actual menu) and §8.1 for the
> tail: `Exit, Reverb, Chorus, Delay, Phaser, Flanger, Drive, Tremolo, Ensemble,
> Filter, Drum FX Reverb, Drum FX Saturation`.

Every row carries a live 2-digit amount, unlike the Perform menu. Values shown
are `05`, `02`, `01` — consistent with the instrument's 0–99 scale (§4.2).

Drum FX are reached through this same menu: "Press the FX Dial and scroll to
access Drum FX" (§11.4). **FX lock** (§8.3) is a long-press, with an LED, and is
not a menu row.

The default FX-Dial turn behaviour, before entering the menu: "By default, the
FX Dial will automatically increase and decrease the most prominent effect of
the currently selected sound" (§8.2).

#### M4 — Quick Key Select · **Key Dial, press-and-hold** (§9.2)

> "Long press the Key Dial until '**select key**' and keyboard appears on the
> display. Press the root note of the desired key on the keyboard to select that
> key. For a minor key, hold the minor Chord Type button when pressing the
> keyboard note."

Not a scrolling list — a **prompt screen** showing the literal text `select key`
plus a keyboard graphic. It is dismissed by playing a key.

#### M5 — Bass behaviour menu · **Bass Dial, press-and-hold 1 s** (§10.2)

> "By holding down the Bass Dial for one second, you can access a menu to adjust
> the bass mode behavior:"

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `Chords Only` | "Bass notes play only when chords are played." |
| 2 | `Unison Bass` | "Bass notes match exactly what is played on the keyboard." |
| 3 | `Single Notes` | "Bass notes sound with every keyboard note pressed, while the main synth engine only sounds when a chord is played." |
| 4 | `Solo` | "The bass plays independently without other elements." |

Default: **MANUAL SILENT — inferred:** `Chords Only`, listed first and the
behaviour §10.1 describes as bass-mode-on ("adds the root note of the chord").

> Note the hold duration: **one second** (§10.2), also §11.2/§11.4 for BPM. The
> current build uses 750 ms (`src/ui/hold.ts:24`).

#### M6 — Time Signature + Beats menu · **BPM Dial, press-and-hold 1 s** (§11.2, §11.4)

> "Hold the BPM Dial for one second then scroll to select a time signature."
> (§11.2)
> "Long press the BPM Dial for one second and scroll past the time signatures to
> access Beats." (§11.4)

**One list**, time signatures first, Beats after. Neither the time signatures nor
the beat names are enumerated anywhere in the manual — **MANUAL SILENT.** Do not
invent names; keep whatever the build already ships (`src/core/timeSignature.ts`,
`src/core/beats.ts`) and treat the *ordering* (signatures, then beats, in one
scroll) as the specified part.

Adjacent BPM gestures, all non-menu: press = metronome on/off (§11.2) or
start/stop a Beat (§11.4); press-and-turn = metronome volume (§11.2) or Beat
volume (§11.4); turn = tempo (§11.1), which also retimes a recorded loop (§16.2).

#### M7 — Loop Mode Waiting Room / Sync Mode · **Loop Dial, press or turn** (§12.1, §12.2, PDF p18, PDF p19)

> "Push or turn the Loop Dial to access the Loop Mode Waiting Room. Choose your
> preferred looping method from the available options." (§12.1)
> "Turn the Loop Dial to select your Sync Mode: **Free Mode**… **BPM Mode**:
> Choose from 1 bar, 2 bars, 4 bars, 8 bars, or 16 bars." (§12.2)

PDF p18 and p19 give the on-screen forms — plural `Bars`, capital B:

| Order | On-screen | Manual prose |
|---|---|---|
| 1 | `Free` (MANUAL SILENT — exact label not illustrated) | "Free Mode" |
| 2 | `1 Bar` (inferred singular) | "1 bar" |
| 3 | `2 Bars` (PDF p18) | "2 bars" |
| 4 | `4 Bars` (PDF p18, selected) | "4 bars" |
| 5 | `8 Bars` (PDF p18, PDF p19) | "8 bars" |
| 6 | `16 Bars` (PDF p19, selected) | "16 bars" |

This menu is drawn **inside the segmented progress border** — see
[§C.4](#c4-the-looping-border--the-signature-graphic). Selecting a length
immediately redraws the border with that many segments (4 Bars → 4 segments in
PDF p18; 16 Bars → 16 segments in PDF p19). That is the single most distinctive
graphic in the whole system.

#### M8 — Loop transport menu · while a loop plays (§12.4, §12.5, PDF p18)

> "Select **Pause** or **Play** to pause or resume playback. Select **Clear** to
> clear the loop and return to the Loop Mode Waiting Room. Select **Overdub** to
> continue recording a new layer." (§12.4)
> "If needed, remove the last layer you recorded by selecting **Undo** from the
> menu. If you undo all overdubs back to the original recording, the **Undo**
> option changes to **Clear**, which will erase the loop completely." (§12.5)

PDF p18's second illustration shows exactly three rows: `Overdub`, `Pause`
(cursor), `Clear`.

| Order | Label | Notes |
|---|---|---|
| 1 | `Overdub` | §12.4 |
| 2 | `Pause` / `Play` | one row, label swaps with state (§12.4) |
| 3 | `Undo` → `Clear` | §12.5: `Undo` becomes `Clear` once all overdubs are undone |

Also here: `Rec` is shown on the display during recording (§12.3), and
`Stop` is a selectable state — "Press the Loop Dial on **Stop** to stop recording
in Free Mode" (§12.4) and "Press the Loop Dial on **Stop** to finish overdubbing"
(§12.5).

`Exit` is **not** named for this menu in manual v4.1. `[02]` lists it for the
*hold* menu (M9). **MANUAL SILENT** for the transport menu.

Hard exit: "Long press the Bass Voicing Dial and press the Loop Dial to instantly
stop your Loop and leave Loop Mode" (§12.4).

#### M9 — Save Loop menu · **Loop Dial, press-and-hold** (§12.7)

> "You can save up to 10 Loops on Orchid. Long press the Loop Dial to access the
> Save Loop menu."

| Order | Label | Manual gloss |
|---|---|---|
| 1 | `Save As Loop XX` | "…to save your loop in the next available spot." |
| 2 | `Save As` | "…to select which spot to save your Loop in." |
| 3 | `Load Loop` | "…to retrieve and play your saved Loops." |
| 4 | `Delete Loop` | "…to delete your saved Loops." |
| 5 | `Exit` | not in §12.7; from `[02]` |

`XX` is a literal placeholder in §12.7 for the next free slot number (1–10).

---

## B. Navigation grammar

### B.1 The four gestures

`[02]` states the complete grammar, and every manual section is consistent with
it:

| Gesture | Meaning |
|---|---|
| **Turn** | change a value, or move the cursor when a menu is open |
| **Press** | toggle on/off, **or** open a menu, **or** commit the cursor |
| **Press-and-hold** (1 s) | reveal a menu, **or** lock a setting |
| **Press-and-turn** | a secondary/hidden parameter |

### B.2 Entering a menu

Three distinct entry gestures, and which one an encoder uses is **not uniform** —
this is the part the current build gets wrong most often:

| Encoder | Menu entry | Citation |
|---|---|---|
| Options | press (the dial's only job) | §14, `[02]` |
| Perform | **press** | §7.1 "Press the Perform Dial to see the available modes" |
| FX | **press** | §8.2 "Push the FX Dial to see the available effects" |
| Loop | **press or turn** | §12.1 "Push or turn the Loop Dial" |
| Sound | **hold** | §8.4 "Long press the Sound Dial" |
| Bass | **hold, 1 second** | §10.2 "holding down the Bass Dial for one second" |
| BPM | **hold, 1 second** | §11.2, §11.4 |
| Key | **hold** (quick key select) | §9.2 "Long press the Key Dial until…" |

Encoders whose **hold locks instead of opening**: Perform (§7.3), FX (§8.3).
These two are precisely the two whose menus open on a *press* — the grammar is
consistent per-encoder: an encoder uses press-to-open **or** hold-to-open, never
both, and the free gesture takes the lock.

### B.3 Moving the cursor

> "Turn the Perform Dial to scroll through the modes." (§7.1)
> "Turn the FX Dial to choose the effect you wish to change." (§8.2)
> "…then scroll to select a time signature… scroll past the time signatures to
> access Beats." (§11.2, §11.4)

Turning moves the cursor one row per detent. Direction: clockwise/right = down
the list. **MANUAL SILENT — inferred:** from §11.4's "scroll **past** the time
signatures to access Beats", which describes forward travel through a single
concatenated list.

**Wrap or clamp? → CLAMP.** This is settled by the illustrations, not the prose:

- PDF p12 (FX): a **blank row above `Exit`**. A wrapping list would show the last
  effect there.
- PDF p23 (Options): `Upgrade firmware` under the cursor with **two blank rows
  below it**. A wrapping list would show `Exit` and `Battery`.

So the viewport keeps the cursor pinned at a fixed row and pads with blank rows
at both ends. This is corroborated by `[02]`'s "*Turn fully left → performance
off*", which only makes sense against a hard stop.

**The current build wraps almost everything** (`cycleView`, `cyclePlayStyle`,
`cycleBassMode`, `cycleFxType`, `cycleLoopBars`, `cycleQuantize`, `cycleBeat`,
`cycleKey`, `cycleSecretChords` — all use `(i + delta + n) % n` in
`src/state/panel.ts`). Only `cyclePerformMode` clamps. This inverts the hardware.

### B.4 Committing a selection

> "Press the Perform Dial to select a mode. Turn the dial again to adjust the
> selected mode." (§7.1)
> "Push the FX Dial to select the effect. Turn the dial to adjust the selected
> effect's intensity." (§8.2)

So a menu-bearing encoder is a **two-state machine**:

```
       press ──────────►
BROWSE                    ADJUST
  cursor moves            value changes
       ◄────── press
```

Press in BROWSE commits the row and drops into ADJUST. Press in ADJUST returns
to BROWSE. §8.2 states both halves explicitly; §7.1 states the first half and
implies the second by symmetry. The current build already models this for FX
alone (`fxChoosing`, `src/state/panel.ts:201`) but not for Perform.

### B.5 Backing out and exiting

**`Exit` is a list row, not a gesture.** PDF p20 shows `Exit` as row 1 of the
Options menu; PDF p12 shows `Exit` as row 1 of the FX menu; `[02]` lists `Exit`
as the last row of the Loop hold menu. Selecting it returns to the playing
screen (Options, FX) or the previous level.

**MANUAL SILENT — inferred:** there is no dedicated "back" gesture. On a
nine-encoder instrument with a 1-bit display, `Exit` as a row is the whole
back-navigation story; the manual never describes a press-to-go-back or a
long-press-to-escape. Two supporting facts: §14.14 step 4 says "*Navigate to the
Options menu and select Upgrade firmware*" — navigation is described purely as
list traversal; and §12.4 needs a **two-handed shortcut** (Bass Voicing + Loop)
for the one place a hard exit is wanted, which would be pointless if a simple
back gesture existed.

**Additional inferred exits** (mark as ours, not the manual's):

- Pressing another encoder's menu-entry gesture switches menus. **Inferred** —
  the encoders are independent controls and nothing suggests a modal lock.
- Playing the keyboard does **not** exit a menu. **Inferred** — §9.2's quick key
  select *requires* the keyboard to be live while a prompt is up.

### B.6 Timeout

**MANUAL SILENT.** The manual describes no auto-return from any menu, and
`[02]` records "v3.90 change: chord display now lingers briefly after chord
release", which is about the *playing* screen, not menus.

**Inferred:** menus are **sticky** — they stay until `Exit` is selected or
another menu is opened. But the transient **value readout** (§C.3) *is*
time-limited, because §4.2/§11.2 describe turning a dial and seeing its value,
and the playing screen must obviously come back. Recommended split:

- Menus (M1–M9, Options): no timeout.
- Value glance: ~1200 ms after the last turn, then back to the playing screen.
  **Inferred** — the manual gives no number.

The current build applies its glance timeout logic via `screenTouched` /
`glance` / `pinPage` (`src/state/panel.ts:700–722`), which is directionally
right but conflates the two.

### B.7 Press-and-turn (the secondary axis)

Documented instances, all of them:

| Encoder | Press-and-turn | Citation |
|---|---|---|
| Volume | Bass Volume | §4.2, §10.4 |
| BPM | Beats **or** Metronome volume | §4.2, §11.2, §11.4 |
| Key | Transpose, one semitone at a time | §9.4 |
| Sound | browse by **name** instead of number | §5.1 |

§5.1's Sound case is worded as "Press the Sound Dial **then** rotate", i.e. a
mode change rather than a held gesture; §4.2/§9.4 say "press **and** turn". Treat
both as the same physical gesture.

Everything else the current build hangs off press-and-turn (`dials.ts`
`secondary` axes for Perform amount, FX filter, Bass mode, Options play style,
Voicing octave/split) is **ours, not the manual's**. That is defensible as an
anti-menu-diving affordance (`research/11` §718) but should be labelled as an
extension, not parity.

### B.8 Gesture summary per encoder

| Encoder | Turn | Press | Hold | Press+turn |
|---|---|---|---|---|
| Sound | browse by number (§5.1) | switch to browse-by-name (§5.1) | Sound Save menu (§8.4) | browse by name (§5.1) |
| Perform | mode / amount (§7.1) | **open menu**, then commit (§7.1) | **lock** + LED (§7.3) | — |
| FX | amount (§8.2) | **open menu**, then commit (§8.2) | **lock** + LED (§8.3) | — |
| Key | select key (§9.1) | Key Mode on/off + LED (§9.1) | quick key select prompt (§9.2) | transpose (§9.4) |
| Bass | bass sound (§10.1) | Bass on/off (§10.1) | bass behaviour menu, 1 s (§10.2) | — |
| Loop | **enter Loop Mode** + sync length (§12.1–2) | enter Loop Mode / record / stop (§12.1, §12.3, §12.4) | Save Loop menu (§12.7) | — |
| BPM | tempo (§11.1) | metronome on/off (§11.2) or beat start/stop (§11.4) | time signatures → Beats, 1 s (§11.2, §11.4) | metronome / beat volume (§11.2, §11.4) |
| Options | MANUAL SILENT | open Options menu (§14) | MANUAL SILENT | MANUAL SILENT |
| Volume | master volume 0–99 (§4.2) | show battery % (§4.2) | — | bass volume (§4.2) |
| Chord Voicing | inversion cascade (§5.5) | Split ↔ Octave mode (§5.5) | — | MANUAL SILENT |
| Bass Voicing | bass register (§10.3) | MANUAL SILENT | modifier for Loop hard-exit (§12.4) | MANUAL SILENT |

---

## C. Screen graphics

### C.0 How the illustrations were measured

Every embedded image in the PDF was extracted (`PyMuPDF`) and analysed. All
screen illustrations are **640×640 px, 2-colour** (`{0, 255}` only, no
anti-aliasing). The minimum run length in every row and column of every
illustration is **5 px**, and every feature boundary falls on a multiple of 5.

**⇒ The display is 128 × 128 logical pixels, 1-bit, square (1:1).**

All coordinates below are in that 128×128 space, origin top-left.

Illustration inventory:

| PDF page | What it shows |
|---|---|
| p4 | `42` / `Bass Volume` — value readout with level fill and inverted footer |
| p5 | `20` / `Sound` — plain value readout |
| p11 | Performance Modes menu (5 rows) |
| p12 | FX menu (`Exit`, `Reverb 05`, `Chorus 02`, `Delay 01`) |
| p13 | `05` / `Reverb` — value readout |
| p14 | `C` / `Key` — value readout, glyph fills the frame |
| p15a | `+01` / `Transpose` — inverted footer, no fill |
| p15b | Playing-screen status rail: `C# Major` … `Trans +1` |
| p16 | `120` / `BPM` — value readout |
| p18a | Loop Waiting Room: `2 Bars` / `4 Bars` / `8 Bars`, **4-segment border** |
| p18b | Loop transport: `Overdub` / `Pause` / `Clear`, **2-segment border, ~31 % filled** |
| p19 | Loop Waiting Room: `8 Bars` / `16 Bars`, **16-segment border** |
| p20 | Options menu head (`Exit`, `Battery`, `View`, `Audio Output`, `MIDI Channels`) |
| p23 | Options menu tail (`Extension Addition`, `Version`, `Upgrade firmware`) |

### C.1 The list — the base menu layout

Measured identically on PDF p11, p12, p20 and p23:

```
 y=  0 ┌──────────────────────────────┐  row 0    (24 px)
 y= 24 ├──────────────────────────────┤  row 1    (24 px)
 y= 48 ├██████████████████████████████┤  row 2  ◄ CURSOR — always
 y= 72 ├──────────────────────────────┤  row 3    (24 px)
 y= 96 ├──────────────────────────────┤  row 4    (24 px)
 y=120 └──────────────────────────────┘  8 px dead space
 x=  0                              127
```

| Property | Measured value | Notes |
|---|---|---|
| Rows visible | **5** | |
| Row pitch | **24 px** (18.75 % of height) | text bands measured at y 6–16, 30–40, 54–64, 78–88, 102–112 |
| Cursor row | **index 2** (y 48–71) | fixed; the list scrolls under it |
| Bottom dead space | 8 px (y 120–127) | 5 × 24 = 120 |
| Left text margin | **4 px** | every row, every illustration |
| Right margin (values) | **4 px** (values end x=123) | PDF p11, p12 |
| Cap height | **11 px** (y+6 → y+16 within a row) | so text is 46 % of row pitch |
| Baseline | y+17 within the row | |
| Stroke weight | **1 px** | hairline; see C.6 |

**Selected row** — full-width inversion, *not* a border, dot, arrow or colour
change: a solid white rectangle spanning `x = 0 … 126`, `y = rowTop … rowTop+23`,
with the glyphs knocked out in black. There is no inset, no rounding, no gap.
(PDF p11, p12, p20, p23 — all four.)

**Blank rows at the list ends** replace scroll indicators. There are **no**
arrows, no scrollbar, no ellipsis, no "more" chevron anywhere in any
illustration. The blank slot itself is the affordance.

**Value column** — right-aligned, same size and weight as the label, in the same
row (`Reverb …… 05`). In the FX menu every row carries one (PDF p12); in the
Perform menu only the active mode's row does (PDF p11 — `Strum 01` while the
cursor is on `Slop`). Values are 2-digit zero-padded (`01`, `02`, `05`) —
the instrument's 0–99 scale (§4.2).

**No title bar.** Not one illustration has a header, a section name, or a close
control. The first row of the list *is* the top of the screen. The current
build's `.scr-bar` title strip with an `esc` button (`src/ui/Screen.tsx:118–123`)
has no counterpart on the hardware.

**CSS sketch** (drive everything off one `--px` unit = screen width / 128):

```css
.scr { --px: calc(100% / 128); width: 100%; aspect-ratio: 1 / 1;
       background: #000; color: #fff; overflow: hidden;
       font-family: var(--font-screen); font-variant-numeric: tabular-nums;
       image-rendering: pixelated; }

.scr-list       { --row: calc(var(--px) * 24); position: relative; height: 100%; }
.scr-list-vp    { transform: translateY(calc(var(--row) * (2 - var(--cursor))));
                  transition: transform 90ms steps(3, end); }
.scr-row        { height: var(--row); display: flex; align-items: center;
                  justify-content: space-between;
                  padding: 0 calc(var(--px) * 4);
                  font-size: calc(var(--px) * 15);   /* ≈ 11px cap height */
                  line-height: 1; }
.scr-row[data-sel='true'] { background: #fff; color: #000; }
```

`steps(3, end)` on the scroll: a 1-bit panel cannot draw a sub-pixel offset, so
the row travel must be quantised. **Inferred** — the manual says nothing about
scroll animation; three steps over 90 ms reads as motion without implying
smoothness the panel cannot produce. A zero-duration jump is equally defensible
and is the safer default if in doubt.

### C.2 The playing-screen status rail (PDF p15b)

```
 y=0..10   C# Major                       Trans +1
 y=11..127 (view content)
```

| Property | Measured |
|---|---|
| Position | flush to the top, `y = 0 … 10` |
| Style | **white text on black** — *not* an inverted bar |
| Cap height | 11 px, same as list rows |
| Left | key name, starting at `x = 0`, format `C# Major` (tonic + full mode word) |
| Right | transposition, ending at `x = 123`, format `Trans +1` |

§9.5 confirms placement: "the selected key will be displayed in the top-left
corner… the transposition amount is shown in the top-right corner."

Note the formats: **`C# Major`**, not `Key: C#`; **`Trans +1`**, not `+01`. The
current build renders `Key: C♯` in a white-on-black *inverted bar*
(`src/ui/Screen.tsx:213–221`, `src/ui/styles.css:1205–1213`) — the inversion is
wrong and the labels are wrong.

### C.3 The value readout ("glance")

Shown on PDF p5 (`20`/`Sound`), p13 (`05`/`Reverb`), p14 (`C`/`Key`),
p16 (`120`/`BPM`), p4 (`42`/`Bass Volume`), p15a (`+01`/`Transpose`).

```
 y=  1..108   ██ giant value, horizontally centred, 108 px tall
 y=109..110   (1–2 px gap)
 y=111..126   footer — see below
```

| Property | Measured |
|---|---|
| Value glyph height | **108 px** (84 % of the display) — y 1 → 108 |
| Value alignment | horizontally centred; `C` on p14 spans the full width x 0 → 127 |
| Value stroke | ~5 px |
| Label cap height | **11 px** — the same size as list rows |
| Label position | centred, `y = 114 … 124` |

**Two footer treatments, and the difference is load-bearing:**

| Footer | Illustrations | Style |
|---|---|---|
| Plain | p5 `Sound`, p13 `Reverb`, p14 `Key`, p16 `BPM` | white text on black, y 114–124 |
| **Inverted** | p4 `Bass Volume`, p15a `Transpose` | solid white bar `y = 111 … 126`, full width, black text |

**Inferred:** the inverted footer marks a **press-and-turn (secondary)
parameter**. Bass Volume (§4.2) and Transpose (§9.4) are the manual's two named
press-and-turn readouts; Sound, Reverb, Key and BPM are all plain turns. Two out
of two matches with a clean mechanical explanation. Implement it — it gives the
secondary axis a visual signature the current build lacks entirely.

**The level fill (PDF p4 only).** `42` / `Bass Volume` has a solid white
rectangle spanning the full width from `y = 64` down to `y = 109`, with the
numerals **XOR-inverted** where it overlaps them.

```
fill height = 109 - 64 + 1 = 46 px
field height = 110 px (y 0 … 109)
46 / 110 = 41.8 %   ·   displayed value = 42 / 99 = 42.4 %
```

The fill is the value, rising from the bottom of the numeral field. Nothing else
in the illustration set has it, and it appears on the one readout that is a
bounded 0–99 level. **Apply it to Volume, Bass Volume, Beat/Metronome Volume and
FX amounts; not to Sound, Key, BPM or Transpose.** (Inferred for everything
except Bass Volume, which is measured.)

```css
.scr-value { position: relative; height: 100%; }
.scr-value-fill {                       /* the rising level */
  position: absolute; left: 0; right: 0; bottom: calc(var(--px) * 18);
  height: calc(var(--level) * var(--px) * 110);
  background: #fff; mix-blend-mode: difference;   /* the XOR knock-out */
  transition: height 60ms linear;
}
.scr-value-num  { font-size: calc(var(--px) * 132); line-height: calc(var(--px)*110); }
.scr-value-label{ font-size: calc(var(--px) * 15); }
.scr-value-label[data-secondary='true'] {
  position: absolute; inset: auto 0 calc(var(--px)*1) 0;
  height: calc(var(--px) * 16); background: #fff; color: #000;
}
```

`mix-blend-mode: difference` is the honest way to reproduce a 1-bit XOR: white
over white → black, white over black → white. Exactly what p4 shows.

### C.4 The looping border — the signature graphic

Measured on PDF p18a (4 Bars), p18b (loop playing), p19 (16 Bars).

```
        ▒▒▒▒▒▒▒│▒▒▒▒▒▒▒            outer ring, 17 px thick
        ▒┌─────────────┐▒          rounded outer corners, r ≈ 11
        ▒│             │▒
        ─│   2 Bars    │─          inner panel: 94 × 94 at (17,17)
        ▒│ ▓ 4 Bars ▓  │▒          rounded, r ≈ 6, solid black
        ▒│   8 Bars    │▒
        ▒└─────────────┘▒
        ▒▒▒▒▒▒▒│▒▒▒▒▒▒▒
```

| Property | Measured |
|---|---|
| Ring extent | the whole display, `0 … 126` in both axes |
| Ring thickness | **17 px** (13.3 % of 128) |
| Outer corner radius | ≈ **11 px** (45° arc: ink starts x=11 at y=0, x=1 at y=8) |
| Inner panel | `x, y = 17 … 110`, i.e. **94 × 94** |
| Inner corner radius | ≈ **6 px** |
| Inner panel fill | solid black |
| Unfilled ring texture | **1-px 50 % checkerboard**, phase alternating every row — measured `0101…` / `1010…` on all three |
| Filled ring texture | solid white |
| Segment gaps | **3 px** of black, cutting the full 17 px thickness |

**The segments are bars.** PDF p18a has `4 Bars` selected and gaps at exactly the
four edge midpoints (top y=0 x 62–64; bottom y=126 x 62–64; left x=0 y 62–64;
right x=126 y 62–64) → **4 segments**. PDF p19 has `16 Bars` selected and gaps at
x ≈ 38, 63, 88 on every edge → 4 sub-segments per edge → **16 segments**. PDF
p18b (a playing loop) has gaps only at top-centre and bottom-centre →
**2 segments**, i.e. a 2-bar loop.

**The ring is the progress indicator.** §12.3: "A Ring Progress Indicator on the
screen provides a visual representation of the recording length." §12.6: "The
Ring Progress Indicator around the edge of the display shows your current
position in the loop."

Direction and origin, measured on PDF p18b: solid white begins at `x = 65` on the
top edge (immediately clockwise of the top-centre gap) and runs clockwise through
the top-right corner and down the right edge to `y ≈ 94`, where it reverts to
checkerboard.

```
elapsed perimeter = 64 (top-centre → top-right) + 94 (down the right edge) = 158
total perimeter   = 4 × 128 = 512
158 / 512 = 30.9 %
```

**⇒ The ring starts at 12 o'clock and fills clockwise. Dither = remaining,
solid = elapsed.**

**Implementation.** Two stacked layers plus a mask, all CSS/SVG, no per-frame
React:

1. **Texture layer** — a `repeating-conic-gradient`-free 1-px checkerboard:
   ```css
   .ring-dither {
     background-image:
       linear-gradient(45deg,  #fff 25%, #0000 25% 75%, #fff 75%),
       linear-gradient(45deg,  #fff 25%, #0000 25% 75%, #fff 75%);
     background-size: calc(var(--px)*2) calc(var(--px)*2);
     background-position: 0 0, var(--px) var(--px);
   }
   ```
2. **Progress layer** — solid white, clipped to the elapsed arc. Draw the ring as
   an SVG `rect` with `pathLength="100"`, `stroke-dasharray: 100`, rotated so the
   dash origin is top-centre, and animate `stroke-dashoffset` from 100 → 0 with
   `animation-duration` = the loop's pass length. This is the technique already
   in `LoopRing` (`src/ui/Screen.tsx:149–171`) — keep it, widen the stroke to
   17 px, and make the fill solid rather than a thin line.
3. **Segment gaps** — a second `stroke-dasharray` pass on top in black:
   `stroke-dasharray: calc(100/N - 2.4) 2.4` where `N` = bar count, on a
   `pathLength="100"` rect, so gaps land at every `100/N`.
4. **Corners** — `rx` on the outer rect ≈ `11/128` of the box; the inner panel
   is a separate black `rect` with `rx ≈ 6/128`.

**Timing.** The animation duration is the loop pass length; it is `linear` and it
**must not** ease — the ring is a clock. On pause, `animation-play-state: paused`
(already correct in the current build, `src/ui/styles.css:1544`).

**MANUAL SILENT — inferred:** whether the border also *animates* when no loop is
running (a "marching" idle state). The illustrations are stills and the manual
only ever calls it a *progress* indicator. **Recommendation:** no idle
animation — the border is drawn segmented and unfilled in the Waiting Room
(PDF p18a, PDF p19, both entirely checkerboard), which is a static picture of
"nothing recorded yet". If an idle shimmer is wanted for feel, gate it behind a
setting and label it an extension.

**Scope.** The border appears on **Loop Mode screens only** (p18a, p18b, p19).
The Options, FX and Perform menus (p20, p23, p12, p11) have **no border** — they
are edge-to-edge lists. Do not apply the border globally.

### C.5 The press-and-hold indicator

**MANUAL SILENT.** No illustration shows a hold-progress ring, arc or bar, and
the manual never describes one. The hardware's cue is the *duration itself*
("holding down the Bass Dial for **one second**", §10.2) plus, for the two lock
gestures, an **LED** (§7.3, §8.3).

The current build's `HoldRing` (`src/ui/Screen.tsx:185–196`) is therefore **an
invention** — a good one for a mouse-driven web UI, where there is no tactile
feedback, but it must be labelled as ours. Two spec-level corrections:

1. Hold duration should be **1000 ms**, not 750 ms (§10.2, §11.2, §11.4 all say
   "one second"). `src/ui/hold.ts:24`.
2. It should be drawn in the 1-bit language: a **segmented arc in checkerboard
   dither filling to solid**, matching §C.4's ring, rather than the current
   translucent-black scrim with a rounded anti-aliased stroke
   (`src/ui/styles.css:1402–1439`). `stroke-linecap: butt`, not `round` — a 1-bit
   panel has no round caps.

### C.6 Typography

From the illustrations, the display font is:

- **Single weight, 1-px stroke** for all list rows, labels and the status rail.
  There is no bold. The current build uses `font-weight: 700` in several places
  (`.pg-chord`, `.hl-value`, `.rail-transpose`) — on a 1-bit panel this cannot
  exist.
- **Geometric, condensed, rounded joints.** Round letters (`O`, `C`, `e`, `o`)
  are near-circular; `M` in `MIDI Channels` and `Major` is splayed; the `1` has
  a short angled flag and no foot serif; `4` is open-topped.
- **Two sizes only**: 11 px cap height (rows, labels, status rail) and the
  108 px value glyph. There is no intermediate size and no small-caps.
- **Mixed case**, sentence-style: `Audio Output`, `MIDI Channels`,
  `Upgrade firmware`, `Strum 2 Octaves`. **Not** all-caps and **not**
  letterspaced. The current build applies `text-transform: uppercase` and
  `letter-spacing: 0.24em` to titles, sections and the headline
  (`src/ui/styles.css:473–474, 1113, 1148–1149, 1383–1384, 1445`) — all of that
  is contrary to every illustration.
- **Tabular numerals**, zero-padded to 2 digits (`01`, `05`, `20`, `42`), except
  BPM which is 3 (`120`).

Recommended stack: a pixel/bitmap face rendered with
`-webkit-font-smoothing: none; image-rendering: pixelated` at an integer scale
of the 128-px grid, so glyphs land on logical pixels.

### C.7 Colour

Exactly two colours. Black `#000` background, white `#fff` ink, plus the
checkerboard as the only intermediate value. No greys, no `#ffffff0d` hairlines,
no gradients, no scanline overlay, no `box-shadow`, no `border-radius` on rows.
The current stylesheet uses all of these (`src/ui/styles.css:455–468, 520, 536,
538–539, 634`).

**Inferred:** the physical panel is an OLED, so a faint bloom/glow around lit
pixels is a legitimate skeuomorphic addition (`filter: drop-shadow`) — but it
must be additive light around white pixels, never a grey fill.

---

## D. Gap analysis

Severity: **P0** = the menu system is structurally different; **P1** = visibly
wrong to anyone who has used the hardware; **P2** = detail.

| # | Area | Current behaviour | Manual / illustration behaviour | Sev |
|---|---|---|---|---|
| 1 | **Interaction model** | Pages are **click-target documents**: `<button>` rows, `<select>` dropdowns, action bars, `onClick` per row (`Screen.tsx:292–637`). Menus are navigated with a mouse. | Menus are **cursor lists driven by one encoder**: turn to move, press to commit. No pointer exists on the device. | **P0** |
| 2 | **Display geometry** | `aspect-ratio: 2 / 1` (`styles.css:447`); layout in `rem` + `clamp()` | **128 × 128, 1:1**, laid out on an integer pixel grid (C.0) | **P0** |
| 3 | **Options structure** | Nested, with `<Section>` headings System / Instrument / Bass / Audio and MIDI / This build (`Screen.tsx:529–582`), following `[02]`'s v3.90 tree | **Flat single list**, no headings, `Exit` first (PDF p20, p23; §14 body) | **P0** |
| 4 | **Cursor / scrolling** | Selection scrolls the viewport to keep itself visible; the row can sit anywhere (`List`, `Screen.tsx:689–730`) | Cursor is **pinned at row index 2 of 5**; the list scrolls under it; blank rows pad both ends (C.1) | **P0** |
| 5 | **Wrap vs clamp** | Wraps: `cycleView`, `cyclePlayStyle`, `cycleBassMode`, `cycleFxType`, `cycleLoopBars`, `cycleQuantize`, `cycleBeat`, `cycleKey`, `cycleSecretChords`, `cycleTimeSignature` (`panel.ts`) | **Clamps** — proven by the blank rows in PDF p12 and PDF p23 | **P1** |
| 6 | **`Exit` row** | Absent from every menu; exiting is a title-bar `esc` button (`Screen.tsx:120–122`) | `Exit` is **row 1** of Options (PDF p20) and of FX (PDF p12); there is no chrome | **P1** |
| 7 | **Title bar** | `.scr-bar` with a page title and `esc` button on every open page | **No title bar in any illustration.** The list starts at y=0 | **P1** |
| 8 | **The looping border** | Not implemented. `LoopRing` draws a 1.6-px translucent outline (`Screen.tsx:149–171`, `styles.css:1512–1553`) | **17-px segmented checkerboard ring**, one segment per bar, filling clockwise from 12 o'clock; menus sit in a 94×94 rounded inner panel (C.4) | **P1** |
| 9 | **Status rail** | Inverted white bar, `Key: C♯`, `+01` (`Screen.tsx:213–221`, `styles.css:1205–1213`) | **White text on black**, `C# Major` left, `Trans +1` right (PDF p15b, §9.5) | **P1** |
| 10 | **Secondary-axis signature** | None — the glance looks identical for turn and press-turn (`Headline`, `Screen.tsx:246–257`) | Press-and-turn readouts get an **inverted footer bar** (PDF p4, p15a) | **P1** |
| 11 | **Level fill on value readouts** | None | Volume-type readouts show a **rising white bar that XOR-inverts the numeral**, height = value/99 (PDF p4) | **P1** |
| 12 | **Menu entry gestures** | Uniform-ish: hold opens `page` for Sound/Perform/FX/Key/Bass/Loop/BPM/Options (`dials.ts` `page`), with FX and Options special-cased to press | Per-encoder and **not uniform**: press for Perform/FX/Loop/Options; hold for Sound/Bass/BPM/Key (B.2) | **P1** |
| 13 | **BROWSE ↔ ADJUST** | Modelled for FX only (`fxChoosing`, `panel.ts:201`); Perform's press does nothing | Both Perform (§7.1) and FX (§8.2) are two-state; press commits and drops into adjust | **P1** |
| 14 | **Typography** | `text-transform: uppercase`, `letter-spacing: 0.24em`, `font-weight: 700`, greyscale AA | Mixed case, no letterspacing, **single 1-px weight**, hard 1-bit edges (C.6) | **P1** |
| 15 | **Colour** | Gradients, scanlines, `#ffffff0d` hairlines, `box-shadow`, `border-radius: 4px`, a `--scr-dim` grey, a red `--led` recording state | **Two colours + checkerboard.** Nothing else (C.7) | **P1** |
| 16 | **Hold duration** | 750 ms (`hold.ts:24`) | "one second" (§10.2, §11.2, §11.4) | **P2** |
| 17 | **Hold ring** | Translucent scrim + round-capped anti-aliased arc (`styles.css:1402–1439`) | Not in the manual at all; if kept, must be 1-bit dither→solid with butt caps (C.5) | **P2** |
| 18 | **Perform mode labels** | `Arpeggiator 2 Octaves`-style prose labels via `PERFORM_LABEL` | On-screen form is **`Arp 2 Octaves`** (PDF p11) | **P2** |
| 19 | **FX menu order** | `FX_TYPES` order | PDF p12 shows `Exit, Reverb, Chorus, Delay` — Chorus before Delay, contra §8.1 | **P2** |
| 20 | **View default** | `geek` (`panel.ts:372`) | MANUAL SILENT; `Chord` inferred (A.2) | **P2** |
| 21 | **Play Style default** | `free` (`panel.ts:373`) | MANUAL SILENT; `Simple` inferred (A.5) | **P2** |
| 22 | **Missing Options items** | No `Battery`, `Audio Output`, `Auto Power Off`, `Version`, `Upgrade firmware`; `Exit` absent | All five are §14 items (A.1) | **P2** |
| 23 | **Non-manual Options items** | `Key legends`, `Extended`, `Roots`, `Master/Bass/Drum Volume` rows, MIDI port `<select>` | Not in §14. Fine as extensions — but should be behind `Extended` and visually marked | **P2** |
| 24 | **Quantization labels** | `QUANTIZE_ORDER` casing | §14.9 uses lowercase `t`: `1/8t`, `1/16t` | **P2** |
| 25 | **Loop transport labels** | `● Record` / `Count-in…` / `+ Overdub` / `▶ Play` / `■ Stop` (`Screen.tsx:641–648`) | `Overdub` / `Pause` / `Play` / `Clear` / `Undo` / `Stop` / `Rec` — plain words, no glyphs (§12.3–12.5, PDF p18b) | **P2** |

---

## E. Implementation plan

Ordered so that each step leaves the app working.

### E.1 Add the menu model (new file: `src/core/menu.ts`)

Pure data + pure functions, no React, no zustand. Testable in isolation.

```ts
export type MenuId =
  | 'options' | 'options.view' | 'options.audioOutput' | 'options.midi'
  | 'options.playStyle' | 'options.extensionAddition' | 'options.singleNotes'
  | 'options.secretChords' | 'options.quantization' | 'options.metronomeClick'
  | 'options.velocitySense' | 'options.autoPowerOff'
  | 'sound.save' | 'perform' | 'fx' | 'key.quickSelect' | 'bass.mode'
  | 'bpm.timeAndBeats' | 'loop.sync' | 'loop.transport' | 'loop.save'

export type MenuItem =
  | { kind: 'exit' }
  | { kind: 'action'; label: string; run: (s: PanelState) => void }
  | { kind: 'info';   label: string; read: (s: PanelState) => string }
  | { kind: 'enum';   label: string; read: (s: PanelState) => string
                    ; enter: MenuId }              // opens a value list
  | { kind: 'value';  label: string                // stays in place, shows 0-99
                    ; read: (s: PanelState) => string
                    ; adjust: (s: PanelState, d: number) => void }
  | { kind: 'choice'; label: string; selected: (s: PanelState) => boolean
                    ; pick: (s: PanelState) => void }

export interface MenuDef {
  readonly id: MenuId
  /** Loop menus only; everything else is edge-to-edge. */
  readonly border?: 'loop'
  readonly items: (s: PanelState) => readonly MenuItem[]
}

export const MENUS: Record<MenuId, MenuDef>

/** Cursor motion. CLAMPS — see spec §B.3. */
export function moveCursor(n: number, cursor: number, delta: number): number {
  return Math.max(0, Math.min(n - 1, cursor + delta))
}

/** Which absolute row index sits in each of the 5 visible slots. `null` = blank. */
export function viewport(n: number, cursor: number): Array<number | null> {
  return [-2, -1, 0, 1, 2].map((o) => {
    const i = cursor + o
    return i >= 0 && i < n ? i : null
  })
}
```

`viewport` is the whole of the fixed-cursor / blank-padding behaviour (D#4) in
five lines. Unit-test it against the four illustration cases: FX at cursor 1
(blank, Exit, Reverb, Chorus, Delay), Options at cursor 2, Options at the last
item (Extension Addition, Version, Upgrade firmware, blank, blank), Perform at
cursor 2.

### E.2 Add navigation state (`src/state/panel.ts`)

Replace the `screenPage` / `screenPinned` / `glance` trio with an explicit stack.

```ts
export interface MenuFrame { readonly id: MenuId; cursor: number }

// --- new fields ---
/** Innermost frame last. Empty = the playing screen. */
menuStack: MenuFrame[]
/** BROWSE ↔ ADJUST (§7.1, §8.2). */
menuMode: 'browse' | 'adjust'
/** Remembered cursor per menu, so reopening lands where you left. */
menuCursor: Partial<Record<MenuId, number>>
/** Transient value readout; null when nothing is being turned. */
glanceAxis: { dial: DialId; secondary: boolean; at: number } | null

// --- new actions ---
openMenu:   (id: MenuId) => void        // push; restores menuCursor[id]
closeMenu:  () => void                  // pop one frame
exitMenus:  () => void                  // clear the stack (the `Exit` row)
menuTurn:   (delta: number) => void     // browse → moveCursor; adjust → item.adjust
menuPress:  () => void                  // exit row → exitMenus
                                        // enum row → openMenu(item.enter)
                                        // choice   → pick, then closeMenu
                                        // value    → toggle menuMode
showGlance: (dial: DialId, secondary: boolean) => void
```

Keep `screenPage` as a derived getter during the migration so `Screen.tsx` keeps
compiling; delete it in E.6.

Also in this step: change every `(i + delta + n) % n` in `panel.ts` to
`Math.max(0, Math.min(n - 1, i + delta))` for the settings that appear in menus
(D#5). Leave `cycleKey` wrapping — twelve tonics genuinely are a ring, and the
manual gives no end-stop for it.

### E.3 Route encoder gestures through the menu (`src/ui/dials.ts`)

Replace `page?: ScreenPage` with an explicit entry gesture, so B.2's
non-uniformity is data rather than special cases:

```ts
readonly menu?: { id: MenuId; on: 'press' | 'hold' | 'pressOrTurn' }
```

- Sound `{ id: 'sound.save', on: 'hold' }`
- Perform `{ id: 'perform', on: 'press' }` — and `hold` stays `togglePerformLock`
- FX `{ id: 'fx', on: 'press' }` — `hold` stays `toggleFxLock`
- Key `{ id: 'key.quickSelect', on: 'hold' }`
- Bass `{ id: 'bass.mode', on: 'hold' }`
- Loop `{ id: 'loop.sync', on: 'pressOrTurn' }`
- BPM `{ id: 'bpm.timeAndBeats', on: 'hold' }`
- Options `{ id: 'options', on: 'press' }`
- Volume, Chord Voicing, Bass Voicing: no menu

Then in `Panel.tsx` / wherever `onTurn` is wired: if `menuStack.length > 0` **and**
the turning dial is the one that opened the top frame, call `menuTurn(delta)`
instead of `axis.turn`. Turning a *different* dial adjusts that dial's value and
raises a glance over the menu — **inferred**, but it is the only reading under
which nine independent encoders remain independent.

### E.4 Rewrite the screen renderer (`src/ui/Screen.tsx`)

Delete `Page`, `Row`, `Meter`, `Section`, `List`, `TITLE`, `LOOP_LABEL`, the
`.scr-bar` header and the `pg-actions` / `pg-slots` / `pg-beats` / `pg-midi`
blocks. Replace with three components:

```
<Screen>
  <ScreenHome/>        when menuStack is empty and no glance
  <ScreenGlance/>      when glanceAxis is live      → C.3
  <ScreenMenu/>        when menuStack is non-empty  → C.1
    <LoopBorder/>      only when MENUS[top].border === 'loop' → C.4
</Screen>
```

`ScreenMenu` renders exactly five `<div class="scr-row">`, driven by
`viewport(items.length, cursor)`; a `null` slot renders an empty row. No
`useLayoutEffect` scroll maths — the fixed cursor removes the need for it
(deletes `Screen.tsx:694–713`).

Keep the pointer affordances (clicking a row moves the cursor there and presses)
for web usability, but the *rendering* must not depend on them — no `<button>`
chrome, no hover states.

### E.5 Rewrite the screen stylesheet (`src/ui/styles.css`)

Delete `.screen`'s gradient, scanline, `box-shadow` and `border-radius`
(lines 455–468); delete `.scr-row` hairline borders, `.scr-list button`
backgrounds/radii, `.scr-meter`/`.scr-bar` (lines 514–642); delete `.scr-bar`
title-bar rules (1139–1166); delete `.pg-rail`'s inversion (1205–1213); delete
every `text-transform: uppercase` and `letter-spacing` on screen text
(473–474, 1113, 1148–1149, 1383–1384, 1445); delete every `font-weight: 700` on
screen text (490, 1120, 1223, 1235, 1483, 1556).

Add:

- `.scr { --px: calc(100% / 128); aspect-ratio: 1/1; }` and express **every**
  screen dimension as a multiple of `--px` (C.1).
- `.scr-row[data-sel='true'] { background:#fff; color:#000 }` — full-bleed, no
  radius, no inset.
- `.ring-dither` checkerboard (C.4) and the segmented `stroke-dasharray` ring.
- `.scr-value-fill { mix-blend-mode: difference }` (C.3).
- `.scr-value-label[data-secondary='true']` inverted footer (C.3).

### E.6 Retire the old page system

Delete the `ScreenPage` union from `Screen.tsx:48–59`, `screenPage`,
`screenPinned`, `glance`, `pinPage`, `goHome` from `panel.ts`, and the
`page`/`ScreenPage` import in `dials.ts`. Update `parity.test.ts`.

New tests to add:

- `menu.test.ts` — `viewport()` against the four illustration cases; `moveCursor`
  clamps at both ends.
- `menu.test.ts` — every `MenuId` in `MENUS` is reachable from some encoder
  gesture or from an `enum` item's `enter`.
- `menu.test.ts` — the Options item list matches §14's order exactly.

### E.7 Extensions and non-applicable items

Three Options items have no meaning in a browser. Render them, so the menu is the
right length and the cursor lands where a hardware user expects:

- `Battery` — read `navigator.getBattery()` where available, else show `—`.
- `Auto Power Off` — render the three values; make the setting inert.
- `Upgrade firmware` — render it; selecting it shows the build version string.

Everything the current build adds beyond §14 (`Key legends`, `Extended`, `Roots`,
the volume rows, the MIDI port picker, progression, drum editing) moves to the
**end** of the Options list, after `Upgrade firmware`, gated on `extended`. Do
not interleave them with manual items — a user counting rows to find `Play Style`
must find it where the hardware puts it.

### E.8 Suggested order of work

1. E.1 `src/core/menu.ts` + tests — no UI change, fully verifiable.
2. E.2 state — behind a flag; old pages still render.
3. E.4/E.5 `ScreenMenu` + the 128×128 grid — the visible flip.
4. E.3 gesture routing.
5. E.4 `LoopBorder` — the signature graphic, worth doing on its own.
6. E.6 deletions.
7. E.7 extensions.

---

## Open questions

| Question | Status |
|---|---|
| Options list order: §14 numbering vs. PDF p23 | **CONFLICT** — follow §14, flag in code |
| Flat vs. nested Options | Resolved in favour of flat (PDF p20, p23) over `[02]` v3.90 |
| Is there a menu timeout? | MANUAL SILENT — spec says no timeout for menus, ~1.2 s for the value glance |
| Metronome Click sound names | MANUAL SILENT — keep `Beep` / `Hi Hat` from `[02]` |
| Time signature and Beat names | MANUAL SILENT — keep the current build's |
| Does the border animate at idle? | MANUAL SILENT — spec says no |
| Does the FX menu's value column show every effect or only the active one? | Measured: **every** row (PDF p12). Perform shows only the active row (PDF p11). Reason unknown |
| Exact `Free` / `1 Bar` labels in the loop sync list | Not illustrated; `2/4/8/16 Bars` are |
| Defaults for View, Play Style, Extension Addition, Single Note Mode, Metronome Click, Auto Power Off, Velocity Sense | MANUAL SILENT — inferred values given in §A, all flagged |
