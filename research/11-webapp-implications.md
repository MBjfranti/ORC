# 11 — Implications for the Webapp

Research-derived notes for our build. **[DERIVED]** throughout unless marked otherwise —
this file is analysis and recommendation, not documentation of the hardware.

Specifics of our design are still open; this is input to that conversation, not a decision log.

---

## 1. Keyboard mapping — **DECIDED**

The Orchid's entire ergonomic premise is **left hand holds a quality, right hand picks a root,
simultaneously.** A computer keyboard handles this fine — it's two key regions and simple chording.

### The layout

```
   ┌─ CHORD TYPES ─┐         ┌───── BLACK KEYS ─────┐
   Q    W    E    R    T     Y    U    I    O    P    [    ]
  Dim  Min  Maj  Sus   ·    C#   D#    ·   F#   G#   A#
   ┌─ EXTENSIONS ──┐    ┌────────── WHITE KEYS ──────────┐
   A    S    D    F    G    H    J    K    L    ;    '
   6    m7   M7   9    C    D    E    F    G    A    B
```

**Left hand:** `Q W E R` = Dim / Min / Maj / Sus · `A S D F` = 6 / m7 / M7 / 9
**Right hand:** `G H J K L ; '` = C D E F G A B · `Y U O P [` = C# D# F# G# A#

### Why it works

This is a **physically accurate piano keyboard**, not just a convenient set of bindings. On an
ANSI board the home row is offset **+0.25u** to the right of the top row (Tab is 1.5u wide,
Caps is 1.75u), so every black key lands precisely between its two white keys:

| Key | Center | Sits between | Result |
|-----|--------|--------------|--------|
| `Y` | 7.00u | `G` 6.25 / `H` 7.25 | **C#** ✓ |
| `U` | 8.00u | `H` 7.25 / `J` 8.25 | **D#** ✓ |
| `I` | 9.00u | `J` 8.25 / `K` 9.25 | *E–F gap — correctly unused* ✓ |
| `O` | 10.00u | `K` 9.25 / `L` 10.25 | **F#** ✓ |
| `P` | 11.00u | `L` 10.25 / `;` 11.25 | **G#** ✓ |
| `[` | 12.00u | `;` 11.25 / `'` 12.25 | **A#** ✓ |

The E–F and B–C gaps fall in the right places, and `T` / `I` drop out naturally as the two
"missing" black keys. Exactly 12 roots — the same one-octave span as the hardware.

**No collisions.** Left hand occupies the left half of rows 2–3; right hand occupies the right
half. `T`, `I`, `]` and the entire bottom row (`Z X C V B N M , . /`) remain free.

### ⚠️ Implementation note: use `event.code`, never `event.key`

`;`, `'` and `[` move on non-US layouts (AZERTY, QWERTZ, Dvorak). Bind to **physical position**:

```js
// White keys
'KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'   // C D E F G A B
// Black keys
'KeyY','KeyU','KeyO','KeyP','BracketLeft'                // C# D# F# G# A#
// Chord types
'KeyQ','KeyW','KeyE','KeyR'
// Extensions
'KeyA','KeyS','KeyD','KeyF'
```

`event.code` reports the physical key regardless of layout, so a French user still gets a piano
under their fingers. This matters more than it sounds — it's the difference between "works
everywhere" and "works on my machine."

## 1b. Dial navigation — **DECIDED**

> **Superseded in part, 2026-07-31.** Every shortcut that bypassed the encoder row has been
> removed. The keyboard is now the twelve root keys, the eight chord-modifier keys, and four
> gestures: `1`–`9` select a dial (`0` returns to the playing display), `← →` roll between
> dials, `↑ ↓` turn one (Shift = press-and-turn), `Enter` presses it (Shift = press-and-hold).
> **Holding an arrow turns through several stops**, as a real encoder does, rather than one
> stop per tap. Latch, voicing nudges, tier cycling, preset browsing, the progression transport
> and save-sound are gone — each was a second, undocumented way to reach something the dials
> already cover. The spacebar design in §1d is not built.

Rather than binding every parameter to its own key, the dials use **focus + adjust**, which is
exactly the hardware's grammar: nine encoders, pick one, turn it.

Two axes, two symbol families — **horizontal symbols move sideways along the dial row,
magnitude symbols turn the selected dial.** Self-documenting; needs no legend.

| Gesture | Primary | Alias | Hardware equivalent |
|---------|---------|-------|---------------------|
| **Jump directly to dial 1–10** | `1` … `0` | click | Reaching straight for a known encoder |
| **Previous / next dial** | `<` `>` *(the `,` `.` keys)* | `←` `→`, `Shift+Tab` `Tab` | Feeling along the row |
| **Decrease / increase · prev / next value** | `-` `+` *(the `-` `=` keys)* | `↓` `↑`, mouse wheel | **Turn** the encoder |
| **Toggle on/off** | `Enter` | click | **Press** the encoder |
| **Open menu / lock setting** | `Shift+Enter` | long-press | **Press & hold** |
| **Secondary parameter** | `Shift` + `-`/`+` | `Shift`+wheel | **Press & turn** |
| **Fine adjust** | `Alt` + `-`/`+` | — | — (better than hardware) |
| **Jump to min/max** | `Home` / `End` | — | — |

### Direct access: `1`–`0`

Browsing and jumping are different needs, and both are worth having — same pattern as browser
tabs (`Cmd+1..9` jumps, `Cmd+Shift+[/]` browses). The number row maps cleanly onto the hardware's
encoder count:

| Key | Dial | Key | Dial |
|-----|------|-----|------|
| `1` | Sound | `6` | Loop |
| `2` | Perform | `7` | BPM |
| `3` | FX | `8` | Chord Voicing |
| `4` | Key | `9` | Bass Voicing |
| `5` | Bass | `0` | Volume |

*(Order provisional — should match the on-screen left-to-right layout, whatever we settle on.)*

Ergonomically this splits well: `1`–`5` sit above `Q W E R T` for the left hand, `7`–`0` above
`Y U I O P` for the right. Neither hand leaves its zone.

**Requirement: print the number on each dial.** Handled by the panel-legend system in §1c — direct
access is only useful if it's learnable, and unlabeled numeric shortcuts are invisible features.

**⚠️ Conflict to watch:** the looper has **10 save slots** ([08](08-looper-and-beats.md)), which
will also want `1`–`0`. Resolve contextually — bare `1`–`0` selects a dial; once the Loop menu is
open, `1`–`0` picks a slot. Same for the 30 user sound slots. Decide this *before* building the
menu system, not after.

### Bind unshifted physical keys

`<` and `>` are *printed on* the `,` and `.` keycaps, so bind `Comma` / `Period` and accept them
**with or without Shift**. The user thinks "angle brackets"; their fingers press nothing extra.

This matters for two reasons:
1. **Shift is already carrying meaning** — `Shift+Enter` is press-and-hold, `Shift + -/+` is
   press-and-turn. Requiring Shift for dial selection too invites collisions and ambiguity.
2. **Ergonomics.** `,` (9.75u) and `.` (10.75u) sit one row directly below `J` (8.25u) and
   `K` (9.25u) — the right hand drops a finger without leaving its playing position. Compare
   `-`/`=` at 11.5/12.5u, which is a genuine pinky stretch. Selection gets the easy keys;
   adjustment gets the reach. That's the right way round *only* because the semantics demand
   it — see below.

### ⚠️ Rejected: held-`Tab` as a modifier

An earlier proposal was "hold `Tab` while pressing `-`/`+` to move between dials." **Don't build
this.**

- **Physically awkward.** `Tab` is far-left pinky, `-`/`=` is far-right pinky. You'd contort both
  hands to perform *selection* — the action you do least often.
- **Undiscoverable.** Held-key modal states are the least findable pattern in UI. Nobody stumbles
  onto them and nobody remembers them a week later.
- **Redundant.** Plain `Tab` already does exactly this, natively and accessibly.

Modal held-key states earn their place only when you're out of keys. We are nowhere near out of keys.

`+`/`-` behaves contextually, matching the hardware:
- **Continuous** dials (voicing, filter, BPM, volumes, FX amount) → increment/decrement
- **Enumerated** dials (sound, perform mode, key, play style, beat) → step through the list

### Build them as real controls, don't hijack `Tab`

The correct implementation is **not** `preventDefault()` on Tab and a hand-rolled focus manager.
Make each dial a genuine focusable element:

```html
<div role="slider" tabindex="0"
     aria-label="Chord Voicing"
     aria-valuenow="3" aria-valuemin="-24" aria-valuemax="24"
     aria-valuetext="1st inversion, C4">
```

Then Tab / Shift+Tab traverse them **natively, for free**. We keep full keyboard accessibility and
screen-reader support instead of breaking it, and we write less code. Hijacking Tab is the version
of this idea that fights the browser; real controls are the version that gets the same result for
free.

`<`/`>` and the arrow aliases are then a thin handler that calls `.focus()` on the adjacent dial —
maybe fifteen lines. Everything is deliberately **redundant**: four ways to change dial, four ways
to change value, all consistent. Different users reach for different idioms (a producer grabs the
mouse wheel, a keyboardist stays on `-`/`+`, a screen-reader user tabs), and supporting all of
them costs nearly nothing once the controls are real.

**One deviation from pure slider semantics:** a `role="slider"` conventionally consumes all four
arrows for value. We're using `←`/`→` for *navigation* and `↑`/`↓` for *value* — the mixer-strip
pattern. It's well understood and worth the deviation, but describe it in `aria-keyshortcuts` and
in the on-screen help rather than leaving it implicit.

### Consequences of this decision

- **`-` / `=` are no longer free for octave shift.** Good — **octave just becomes a dial** in the
  tab ring. Fewer special cases, more consistency with the hardware.
- **Bind the physical codes `Minus` and `Equal`**, and accept `NumpadSubtract`/`NumpadAdd`. On US
  layouts `+` is `Shift+=`, so requiring a literal `+` would force a needless Shift on every
  increment. Accept the unshifted key.
- **Default focus should be the Chord Voicing dial.** It's the signature control and the one you
  most want to move mid-chord, so it should be under `+`/`-` the moment the app loads. Conveniently
  `-` and `=` sit directly above `[` and `]` — right where the right pinky already rests for A#.
  Small stretch, not a hand relocation.
- **The focus ring is now load-bearing.** If the user can't instantly see which dial `+`/`-` will
  hit, the whole scheme collapses. This needs a strong, unmissable focus treatment — the hardware
  lights an LED next to a locked encoder, and we need at least that much clarity.
- **Keep the on-screen piano and chord buttons out of the primary tab ring.** Otherwise you tab
  through 20 note keys to reach the next dial. The QWERTY mapping in §1 *is* the keyboard path to
  notes, so the on-screen keys don't need to be tab-reachable — pointer plus the physical mapping
  covers it.

### Remaining direct bindings

A few things stay on dedicated keys because they're needed instantly, mid-performance:

| Function | Binding | Rationale |
|----------|---------|-----------|
| **Latch / hold** | `Space` | See §1d — the highest-value key gets the highest-value action |
| **Panic (all notes off)** | `Esc` | Must always work, from any focus |
| **Mouse wheel over any dial** | scroll | The closest thing a computer has to a rotary encoder — worth supporting alongside `+`/`-` |

Still free after all of the above: `T`, `I`, `]`, `\`, `Z X C V B N M /`, and `PgUp`/`PgDn`.
(`,` and `.` now select dials; `1`–`0` jump to them.)

### Must-handle edge cases

- **Ignore `event.repeat`** — OS key-autorepeat will otherwise retrigger notes continuously.
- **`preventDefault()`** on `Space`, `'` (Firefox quick-find), and `/` (quick-find). **Not `Tab`** —
  see §1b; we want native focus traversal.
- **`window.blur` → flush every sounding note.** Alt-tab mid-chord is a guaranteed stuck note,
  and per [09](09-midi-implementation.md) this will be our most common bug class.
- **N-key rollover.** Many cheap/laptop keyboards ghost past ~3–6 simultaneous keys. Our worst
  realistic case is 1 type + 3 extensions + 1 root = **5 keys**, which is right at the limit.
  Worth surfacing a warning if we detect dropped keys, and worth making the on-screen UI a
  fully equivalent input path.
- **Caps Lock / modifier state** must not alter bindings (another reason for `event.code`).

## 1c. Key legends — **DECIDED**

Every control carries its keyboard binding as a small **silkscreen/UV-print style legend**, set
directly below (or on) the control — exactly how a hardware synth panel prints its legends.

```
        ╭───────╮
        │   ◉   │         ┌──────┐  ┌──────┐        ▁▁▁▁  ▁▁▁▁
        ╰───────╯         │ MAJ  │  │  M7  │        │ C │  │ D │
         VOICING          └──────┘  └──────┘        └───┘  └───┘
        ⌜8⌟ ⌜- +⌟           ⌜ E ⌟     ⌜ D ⌟          ⌜ G ⌟  ⌜ H ⌟
```

This is doing real work, not decoration:

- **It's the aesthetic.** Panel legends are the visual grammar of hardware instruments, and
  [10](10-sound-palette-and-chord-vocabulary.md) establishes that the Orchid's identity is
  chunky, retro, tactile. Legends reinforce "instrument," not "web form."
- **It replaces the help screen.** The dial numbers, the note mapping, and the chord buttons all
  become self-documenting. A user learns the keyboard by playing with the mouse.
- **It solves the invisible-shortcut problem** flagged in §1b — numeric dial access is worthless
  if nobody knows it exists.

### ⚠️ The legend must match the user's actual keycaps

We bind `event.code` (physical position) so the layout works everywhere — see §1. But that
creates a trap: on **AZERTY**, the physical `KeyQ` position has **`A`** printed on the keycap. A
French user would see us print "Q" under the Dim button and have to press the key marked "A."
The legend would be actively lying.

Fix with the **Keyboard Map API**:

```js
const map = await navigator.keyboard.getLayoutMap()
map.get('KeyQ')   // 'q' on QWERTY · 'a' on AZERTY · ',' on Dvorak
```

Resolve every legend through this at startup, and re-resolve on `layoutchange`. Chromium-only
(Chrome/Edge/Opera); Firefox and Safari need a static US fallback table. Either way the *binding*
is unchanged — only the printed label adapts. This is a small amount of work that makes the
instrument correct for a large fraction of non-US users, and it's much harder to retrofit than
to build in.

### The root keys carry three tiers

Each of the 12 note keys shows the **resulting chord** in a band at the top, the **note name in
bold** as its primary identity, and the **keyboard letter** subordinate beneath it:

```
      ┌────┐  ┌────┐          ← tier 3  resulting chord  (tinted band, live)
      │ A7 │  │ B♭ │
      ├────┤  ├────┤          ← tier 1  note name        (BOLD, primary)
      │ C# │  │ D# │
      │ y  │  │ u  │          ← tier 2  keyboard legend  (small, dim, lowercase)
      └────┘  └────┘
       black keys

 ┌──────┐┌──────┐┌──────┐
 │  C   ││  Dm  ││  Em  │     ← tier 3
 ├──────┤├──────┤├──────┤
 │      ││      ││      │
 │  C   ││  D   ││  E   │     ← tier 1
 │  g   ││  h   ││  j   │     ← tier 2
 └──────┘└──────┘└──────┘
       white keys
```

Three details that make this more than cosmetic:

1. **The note name must respect the current key's spelling.** [03](03-chord-engine.md) records
   that the Orchid deliberately spells enharmonics correctly — it prints `Fx` (F double-sharp)
   rather than `G` to stay theoretically honest within a key signature. Our key legends should do
   the same: the same physical key reads **`C#`** in D major and **`D♭`** in A♭ major. Static
   `C#/D♭` labels are the lazy version and give up a real quality signal for nothing. The spelling
   logic already has to exist for the chord-name display, so this is reuse, not new work.

2. **Placement follows a real keyboard.** Labels sit at the *bottom* of white keys, where fingers
   and the black keys don't cover them. Black keys are shorter and darker — their legends need
   their own contrast treatment, not the white-key styling scaled down.

3. **A third tier shows the chord each key will produce.** See below — **DECIDED**.

### Tier 3: the live chord readout

Tier 3 shows **the chord that key would play right now**, given current state. This turns the
keybed into a live chart of available harmony — the Orchid's entire pedagogical pitch, made visible.

**It's live, not just a Key Mode feature.** Tier 3 reflects whatever would happen if you pressed
the key this instant:

| Current state | Tier 3 shows |
|---------------|--------------|
| Key Mode on (C major) | The diatonic chord — `C` `Dm` `Em` `F` `G` `Am` `B°` |
| Key Mode off, holding `Maj` | `C` `D` `E` `F` … |
| Key Mode off, holding `Min`+`m7` | `Cm7` `Dm7` `Em7` … |
| Key Mode on **and** holding `9` | Diatonic 9th chords — `Cadd9` `Dm9` `Em9` … |
| Nothing held, Key Mode off | **Blank** — don't imply a chord that won't happen |

That last row matters. An always-populated tier 3 would be lying half the time; blanking it is
honest and also makes the chord buttons feel consequential, since the whole keybed lights up with
names the moment you hold one.

### The tier-3 switch — **DECIDED**

A **3-position slide switch sits immediately right of the keybed**, choosing what tier 3 displays:

```
   … ┌──────┐┌──────┐          ╭───────────────╮
     │  Am  ││  B°  │          │  ▐▌           │  ─ CHORD
     ├──────┤├──────┤          │               │  ─ NUM
     │  A   ││  B   │          │               │  ─ OFF
     │  ;   ││  '   │          ╰───────────────╯
     └──────┘└──────┘               ⌜ ] ⌟
```

| Position | Tier 3 shows | For |
|----------|--------------|-----|
| **CHORD** *(default)* | `C` `Dm` `Em` `F` `G` `Am` `B°` | Everyone — what you're about to play |
| **NUM** | `I` `ii` `iii` `IV` `V` `vi` `vii°` | Learning why it works; transposable thinking |
| **OFF** | *nothing* | Clean panel, performance, screenshots |

`NUM` is the quietly valuable one. The Orchid's pitch is *bypassing* theory — but showing degrees
passively **teaches** it. You learn that the sad one is `vi` and that `V` wants to resolve, without
anyone explaining it. That's a real differentiator, and it's nearly free once chord naming exists.

**Details:**
- **Bind to `]`.** It sits at the right end of the black-key row — physically right of the keys,
  matching where the switch sits on screen. Press to cycle. Legend printed beneath it per §1c.
- **`OFF` goes at an end, not the middle**, so the two useful modes are adjacent and one step apart.
- **Keep it out of the `1`–`0` dial set.** Those ten are the hardware-equivalent encoders; this is
  a view preference. Still clickable and Tab-reachable.
- **Persist to localStorage.** A view preference should survive reload.
- This is our equivalent of the hardware's `Options → View` (5 display modes, see
  [02](02-hardware-panel-and-controls.md)) — but surfaced on the panel instead of buried in a menu,
  which is the §6 principle applied.

**Design the keybed around the labels, don't inherit piano proportions and then fight them.**
Black keys on a real piano are far too narrow for `F#m7♭5`. We're not bound by that — a stylised
keybed with chunkier black keys suits the retro-toy aesthetic in
[10](10-sound-palette-and-chord-vocabulary.md) *and* solves the space problem. Decide the label
budget first, then draw the keys.

Two supporting rules:
- **Abbreviate consistently** — `°` for diminished, `ø` for half-diminished, superscript
  extensions. Define the abbreviation table once, in the same module as the chord-naming logic.
- **If a name still won't fit, truncate the tier — never the note name.** Tier 1 is the key's
  identity and must always be legible.

### Design constraints

- **Visually subordinate.** Real panel legends are secondary to the control's own name — smaller,
  lower contrast, often a different ink. The legend should be readable when sought and quiet when
  not. Condensed or monospace, uppercase, generous letter-spacing.
- **Always visible.** Don't hide them behind a toggle or an "advanced" mode — hiding them
  recreates the exact problem they solve. A hardware panel can't hide its silkscreen. (A "clean"
  mode for screenshots is fine as an escape hatch.)
- **Mirror into `aria-keyshortcuts`** so the legend exists for screen-reader users too.
- **Distinguish legend from label.** The chord button says `MAJ`; the legend says `E`. The note key
  says `C#`; the legend says `y`. These must never be confusable — different size, weight, case and
  colour. Lowercase for key legends against uppercase labels is a cheap, effective separator, and
  it reads as "keyboard key" rather than "note."
- **One rule everywhere.** Dials, chord buttons and note keys all use the same two-tier treatment:
  bold primary identity, dim subordinate legend. Consistency is what makes it read as a panel
  rather than as scattered hints.

## 1d. The spacebar — assignable, default `LATCH` — **DECIDED**

Space is the best key on the keyboard: thumb-operated, enormous, hit blind, both hands stay put.
It gets the highest-value **in-the-moment performance action** — and *which* action is set by a
selector on the panel, exactly like the assignable footswitch/pedal function on a hardware synth.

### The selector

| Setting | Space does | For |
|---------|-----------|-----|
| **LATCH** *(default)* | Freeze the sounding chord; press again to release | Exploring a chord hands-free |
| **SUSTAIN** | Momentary — notes ring while held | Conventional keyboard feel |
| **LOOP** | Cycle record → overdub → stop | Building a loop without leaving the keys |
| **TAP** | Tap tempo | Setting BPM by feel |
| **BEAT** | Start/stop the drum pattern | Jamming against a groove |

### Changing the assignment from the keys

**`Ctrl+Space` cycles the selector to the next function**, so you never leave the keybed to
reassign it. The panel selector visibly moves as you cycle, and the legend printed on the
on-screen spacebar updates with it — so there's no hidden state: you *see* what your thumb now does.

`Shift+Ctrl+Space` cycles backwards.

**⚠️ Bind `Shift+Space` as the primary and treat `Ctrl+Space` as an alias.** `Ctrl+Space` is
claimed by the OS on macOS (Select Previous Input Source) and by IMEs on Windows — it's
intercepted *before* the browser ever sees it, so it will silently fail for a meaningful slice of
users. `Shift+Space` is free everywhere, and Shift is already our established secondary modifier
from §1b (`Shift`+`±` = press-and-turn, `Shift+Enter` = press-and-hold). Register both; let
whichever survives win.

### The rule that makes this safe

**Every function keeps its own permanent dedicated key.** The selector doesn't *move* a function
onto Space — it makes Space an **alias** for whichever one you reach for most.

This matters because it removes the only real objection. If Space were the sole route to these
actions, its meaning would be hidden state and you'd have to check the panel to know what your
thumb does. As an alias, nothing is ever unreachable, nothing is hidden, and the legend under each
dedicated key still tells the truth. Space just becomes a big comfortable shortcut to your
personal favourite.

We're nowhere near short of keys — `T`, `I`, `\`, `Z X C V B N M /`, `PgUp`/`PgDn` are all free —
so there's no reason to make anything exclusive to Space.

Two supporting details:
- **Print the current assignment on the on-screen spacebar**, per the §1c legend system. The
  selector's state should be readable without hunting for the selector.
- **Persist to localStorage** alongside the tier-3 switch.

### Why `LATCH` is the right default

This instrument has a problem no normal keyboard has: **both hands are pinned.** Left hand holds
chord type and extensions; right hand holds the root. While a chord sounds you cannot reach the
Voicing dial — the signature control ([05](05-voicing-engine-and-inversions.md)) — or change
sound, or touch FX.

`LATCH` releases both hands. Freeze the chord, and now `-`/`+` walks the voicing, `1`–`0` jumps
between dials, and you can browse sounds against held harmony.

That's not a convenience, it's **the core interaction loop**: play a chord → freeze it → explore
it. It's also the killer demo — latch a chord with the Arpeggiator running, then walk the Voicing
dial and hear the arp reshape itself in real time ([06](06-performance-modes.md): arp length
follows the chord's note count).

### Latch behavior

- **Toggle, not momentary.** Press to freeze, press again to release. Momentary would still pin
  the thumb; toggle frees the whole instrument.
- **Unmistakable indicator.** Lit LED-style state on the panel plus the held chord's name in the
  display. Toggles that hide their state cause stuck notes and confusion.
- **`Esc` always clears it**, from any focus, no exceptions.
- **Playing a new chord replaces the latched one** — no need to unlatch first. Latch is
  *sustain-until-told-otherwise*, not a lock.
- **Released by mode changes** (Play Style, Key Mode) since the held chord may no longer be
  meaningful — but survives dial changes, which is the entire point.

### What about transport?

Every DAW user's reflex is Space = play/stop. Two things make that survivable: **BEAT** and
**LOOP** are both available on the selector for anyone who wants it, and transport is already
covered by the dial grammar — `Enter` on a focused Loop or BPM dial starts and stops it, exactly
matching the hardware ([02](02-hardware-panel-and-controls.md)). This is an instrument, not a DAW;
the Orchid has no transport bar, it has a Loop encoder and a BPM encoder.

## 2. Velocity: the thing a computer keyboard cannot do

The Orchid is velocity-sensitive [OFFICIAL]. A QWERTY keyboard sends binary events. Options:

1. Fixed velocity (~90) — simplest, sounds flat
2. **Slight randomization** (±10) — cheap, meaningfully more human, recommended default
3. Derive from key-repeat timing / how fast successive notes arrive
4. Mouse-Y or a UI slider as a velocity macro
5. **Full velocity from MIDI input** — when a real controller is attached, use it

Recommendation: 2 by default, 5 when MIDI is connected, 4 as an optional "expression" control.

## 3. Architecture — mirror the hardware's separation

The MIDI-In findings in [09](09-midi-implementation.md) reveal the hardware's internal
structure, and it's a good structure:

```
  input (QWERTY | on-screen | MIDI In)
        │
        ▼
  ┌─────────────────┐
  │  CHORD ENGINE   │  root + type + extensions + key mode  →  Set<pitch>
  └─────────────────┘         (pure, testable, no audio)
        │
        ▼
  ┌─────────────────┐
  │ VOICING ENGINE  │  inversion window + voice leading  →  ordered Set<midiNote>
  └─────────────────┘         (pure, testable, no audio)
        │
        ▼
  ┌─────────────────┐
  │ PERFORMANCE     │  strum/slop/arp/pattern/harp  →  timed NoteEvent[]
  └─────────────────┘         (pure scheduler, clock-driven)
        │
        ├──────────────► SYNTH ENGINE (Web Audio)
        ├──────────────► MIDI OUT ch1 (performance) / ch2 (bass) / ch3 (chord)
        └──────────────► LOOPER / RECORDER
```

Keep the first three stages **pure functions over data**. They're the interesting part, they're
fully unit-testable, and they're where all our differentiation lives. Audio is a sink.

## 4. Timing

- Use `AudioContext.currentTime` as the master clock. Never `setInterval` for musical events.
- Standard lookahead scheduler: a ~25 ms `setInterval` tick that schedules everything falling in
  the next ~100 ms. This is essential for strums, arps and the looper.
- Consider `AudioWorklet` if we need sample-accurate loop boundaries; probably overkill for v1.
- One master BPM driving arp, pattern, beats, loop length and quantization — same as hardware.

## 1b-2. Encoder gesture map — audited against the manual

Every axis below is either quoted from [02](02-hardware-panel-and-controls.md) or marked as
ours. Audited 2026-07-31; three axes were wrong and were corrected.

| Encoder | Turn | Press + turn | Press | Press & hold |
|---|---|---|---|---|
| Sound | browse by number ✅ | browse by name ✅ | — | list + Save as a User Sound ✅ |
| Perform | mode, Off at hard left ✅ | that mode's parameter ✅ | mode list ✅ | **Perform Lock** ✅ |
| FX | selected effect's amount | filter cutoff ✅ | next effect | FX list ✅ |
| Key | key, as `C` / `Bm` ✅ | mode | Key Mode on/off ✅ | Key page + quick select ✅ |
| Bass | **bass sound** ✅ | bass behaviour ✅ | Bass on/off ✅ | Bass page ✅ |
| Loop | sync length ✅ | — | **start recording** ✅ | Save / Load / Delete ✅ |
| BPM | tempo ✅ | Beat Volume ✅ | beat off ✅ | Beat list ✅ |
| Options | View | Play Style | **enter the menu** ✅ | Options menu ✅ |
| Volume | master ✅ | Bass Volume ✅ | — | — |
| Chord Voicing | voicing ✅ | octave, or split point ✅ | **Split / Octave** ✅ | — |
| Bass Voicing | bass voicing ✅ | — | — | — |

✅ = the manual states this behaviour explicitly. Unmarked cells are ours, filling a gesture
the public docs leave undefined.

### What the audit corrected

Pass one, on placement:

- **Loop → press-and-turn was Quantize.** Quantization is an *Instrument* menu item, not a
  Loop-encoder function. Moved.
- **BPM → press-and-turn was beat selection.** The manual: *"Press & hold while turning → Beat
  Volume (0–99)."* Beat browsing is a press-and-hold menu.
- **Volume → press-and-turn was drum volume.** The manual: *"→ Bass Volume (0–99)."*

Pass two, dial by dial, on behaviour:

- **Perform turned in a ring, so Off was reachable only by turning *right* past Harp.** The
  manual says "turn fully left → off". It clamps now, and `off` is the first entry.
- **Perform Lock did not exist.** "Press & hold until the LED lights" pins the performance
  setting while you browse sounds. For that to protect anything, sounds had to *carry* an
  articulation — so factory presets gained an optional `perform`, as they have on the device.
  The encoder's LED now means *locked*, which is what the manual attaches it to, rather than
  "a mode is running".
- **FX had no gesture for choosing the effect** — `cycleFxType` existed in the store with no
  caller. It is on the press. The LED lights for *any* engaged effect, not just the selected
  one, which otherwise went dark while an audible reverb was still up.
- **Key showed the tonic alone**, so C major and C minor both displayed as `C`. The manual
  quotes the readout as `Bm` and `C`; keys are written that way and now display that way.
  Quick key select (hold Key, then a root, with Min held for minor) is implemented against
  the pinned Key page.
- **Bass turned through behaviours.** On the device it browses *bass sounds* — the bass has its
  own list with its own numbering (04–12 on the product page, while leads run into the 60s).
  Nine bass sounds now exist and the encoder browses them; behaviour moved to press-and-turn
  and the hold menu, where the manual puts it.
- **Loop had no press.** "Press → start recording (1-bar count-in in BPM mode)." The looper is
  an audio object and cannot live in the store, so the store holds the *action*, registered by
  App.
- **Options' press cycled Secret Chords** — a menu item, and an arbitrary thing to hang off the
  press of a dial called Options. It enters the menu.
- **Chord Voicing had no press, so Split mode did not exist.** See below.

### Split vs Octave mode

`splitShift` in `src/core/split.ts`, 8 tests including four properties.

The manual's wording is ambiguous: *"notes above that point play an octave higher, and notes
below play an octave lower"* describes screen positions, and read literally as pitch it leaves
a two-octave hole in the middle of the keyboard. The stated *purpose* is unambiguous — a wrap
point that "keeps low roots low and high melodies high" — so that is what was built: **keys
below the split point rise an octave.** With the split at G, playing G A B C D walks
G5 B5 C6 … continuously ascending, with the dominant below the tonic rather than a seventh
above it.

Anchoring it that way round rather than dropping everything from the split upward (same shape,
opposite sign) is what makes a split at C behave exactly like Octave mode. A first attempt used
the other sign and a property test caught it immediately — at pivot C every key satisfied
`pc >= pivot`, so the whole keyboard dropped an octave.

### The Sound encoder, in full

Built out to the manual, 2026-07-31:

- **Turn browses by number; press-and-turn browses by name.** These are two genuinely different
  traversals of one list, not one list with two labels — which is what it was before. Walking by
  name from "Meadow" reaches "Millionaire", then "Orchid Bossanova"; walking by number reaches
  "Cosmic Day Spa". `src/engine/soundList.ts`, 16 tests.
- **User sounds appear after the factory sounds**, in both orders, marked `∗`, continuing the
  numbering rather than restarting. Turning far enough reaches them — previously the encoder
  could only ever see the factory presets, because the user slots were React state the dial
  definition could not read.
- **Press and hold → the list, with "Save as a User Sound"** at the top. A user sound is the
  whole chain — patch, filter, FX, performance setting — exactly as the manual describes it.
- Saved sounds are **named after where they came from** ("Trout 2"), disambiguated so saving
  twice never produces two identical entries.

### Display conventions

The panel has **one numeric scale: 0–99**. The manual quotes both Beat Volume and Bass Volume
that way, and nothing on the device is expressed as a percentage or in decibels. Every readout
now follows it — FX amounts, volumes, swing. Decibels stay inside the audio graph.

The display itself is a **2:1 module**. It had drifted to 3.7:1, nearly twice as wide as it
should be, which is why Geek Out kept overflowing it and had to be laid out sideways. At the
correct ratio the three rows stack, as they do on the device.

### Corrected against the Operation Manual v4.1

The support articles are a summary; the manual is the specification. Reading it overturned
several things that had been inferred:

- **The chord language.** §6.4 states the rule outright — "we don't do fancy stuff like turn a
  '6' into a '13'. What you play is what you get." A lookup table here named `6+m7` as `13`,
  `6+9` as `6/9`, `m7+9` as `9` and `dim+m7` as `ø7`. It is plain concatenation in print order,
  which reproduces the manual's entire notation plate from four glyphs. Also `Csus` not
  `Csus4`, `Cdim` not `C°`, and overload is **3 → JAZZ, 4 → WTF** — not a random pick among
  three labels, one of which (`???`) appears in no version of the manual.
- **The display's own layout**, from the screen mock-ups: an inverted white status bar with
  black text; a value glance that is an enormous number over a small label; extensions raised
  and small at the top right of the chord.
- **Transposition** (§9.4) is the Key encoder's press-and-turn. That axis held the mode, which
  was a guess — the mode is part of the key the plain turn selects.
- **The FX dial is modal** (§8.2): by default it rides the *most prominent effect of the current
  sound*; press shows the list, turn chooses, press selects, turn adjusts. It also has its own
  **FX Lock** (§8.3) with an LED, exactly parallel to Perform Lock.
- **Ten effects, not six.** Tremolo and Ensemble were missing; the six-effect list came from a
  press review. The two **Drum FX** — Reverb and Saturation — share the same list ("press the
  FX Dial and scroll to access Drum FX", §11.4) but sit on the beat bus, not the chord chain.
- **The Ring Progress Indicator** (§12.6) — the loop's position, traced around the edge of the
  display. `LoopSnapshot` had carried a `position` "for the progress ring" since the looper was
  written and nothing ever drew it. Driven by a CSS animation of the pass length rather than by
  mirroring the looper into React every frame: the loop is periodic and its length is known, so
  the animation tracks it exactly at no render cost.
- **"Rec" on the display** while recording (§12.3), and **Pause/Play** during playback (§12.4),
  which the looper had no state for at all.
- **Time signatures** (§11.2) — 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, first in the BPM encoder's hold
  menu with the Beats below them. `barsToSeconds` carried a comment reading "Assumes 4/4 — the
  only meter the instrument offers"; it is now meter-aware, as are the metronome's downbeat
  accent and the count-in. The trap worth a test: tempo is quarter notes per minute whatever
  the meter, so a 6/8 bar is *three* quarters and comes out the same length as 3/4 —
  multiplying by the numerator would make it twice as long.
- **The Loop Mode "Waiting Room"** (§12.1) — the staging state where you choose a sync method,
  which is what an empty Loop page always was, now named and offering the choice directly.
- **Bass Voicing + Loop** (§12.4) — the hard exit. A two-hand gesture, so it exists for the
  pointer only: the keyboard focuses one dial at a time and cannot express a chord of two.
- **The metronome is not a Beat.** §11.2 gives it its own on/off on the BPM press, running
  whether or not a pattern plays. The press reads in context: it stops a running Beat, and
  otherwise starts the click.
- **Six View modes, not five** (§14.2), and the oscilloscope is called **React**. `Chord &
  Keyboard` did not exist here, and `Notes` shows the chord name as well as the notes.
- **Out-of-scale roots in Key Mode** are documented after all (§9.3): nearest scale note, played
  *suspended* — "press C♯ while in the key of C and Orchid will play a Csus". This file
  previously recorded the behaviour as undocumented and shipped a borrowed-chord policy as the
  default; that policy is ours and now rides with the Extended-only Scale layout.

### Real functionality still missing

## 5. Feature parity matrix

| Feature | Hardware | Our priority | Notes |
|---------|----------|--------------|-------|
| 4 chord types × 4 stackable extensions | ✅ | **P0** | The core. Non-negotiable |
| Root from single key | ✅ | **P0** | |
| Voicing dial / inversion window | ✅ | **P0** | The signature feature |
| Key Mode (diatonic auto-chords) | ✅ | **P0** | |
| Play Styles (Simple/Advanced/Free) | ✅ | **P1** | Simple + Free covers most value |
| Automatic voice leading between chords | ✅ | **P1** | Big "sounds good automatically" win |
| Strum / Slop / Arp / Pattern / Harp | ✅ | **P1** | Arp-length-follows-harmony is the distinctive bit |
| Bass engine + modes + separate voicing | ✅ | **P1** | Solo mode especially |
| 3-channel MIDI out | ✅ | **P1** | High value to producers, low cost |
| Split vs Octave keyboard mode | ✅ | **P2** | Less critical — we can show more octaves on screen |
| Looper + overdub + undo | ✅ | **P2** | |
| Beat machine | ✅ | **P2** | Needs samples; adds asset weight |
| FX rack (6 effects + filter) | ✅ | **P2** | All map cleanly to Web Audio |
| Preset sounds | 60 | **P1** | Need ~15–25 good ones, not 60 |
| User sound slots | 30 | **P2** | localStorage/IndexedDB — trivially better than hardware |
| Secret chords | ✅ (undocumented) | **P2** | Define our own; see below |
| Geek Out / note display | ✅ | **P0** | On a real screen this is free and should always be on |

### 5a. How the split is enforced

Everything in §6 below is real, built, and **off by default**, behind `panel.extended`
(Options → Extended). The guard sits on the store actions rather than in the components:
`captureStep`, `toggleProgArmed`, `toggleBeatHit`, `clearBeat`, `cycleMode` and
`cycleRootLayout` each check the flag, so no UI path or keybinding can reach past it.
Turning it off also resets whatever only it could set — the mode back to major/minor, the
root layout back to chromatic, the progression disarmed. Covered by `src/state/parity.test.ts`.

## 6. Where we should deliberately beat the hardware

Ranked by value-per-effort:

1. **Always-visible state.** The #1 criticism is menu-diving. Every setting the hardware hides
   behind press-and-hold should be visible and directly clickable. This is free for us.
2. **A real progression editor.** The hardware's biggest functional gap
   ([08](08-looper-and-beats.md)): no chord sequencer, no arrangement. A grid where you write a
   progression, loop it, edit individual chords, and export MIDI would be genuinely more useful
   than the Orchid — and it's the natural thing a webapp does well.
3. **MIDI file export.** Obvious, expected, and the hardware can't do it at all.
4. **Unlimited persistent storage.** 10 loop slots and 30 user sounds become "as many as you want."
5. **Chord naming/display always correct** — including the enharmonic `x` double-sharp handling
   [OFFICIAL], which is a nice quality signal. And *without* their `Maj7 = C7` documentation error.
6. **Modes beyond major/minor.** Key Mode could offer Dorian, Lydian, Mixolydian, Phrygian,
   harmonic minor. Same UI, much wider harmonic reach.
7. **Meaningful chromatic keys in Key Mode.** See [04](04-key-mode-and-harmony.md) §12-keys
   problem — map the 5 non-diatonic keys to secondary dominants and borrowed chords instead of
   snapping them. This makes all 12 keys useful without requiring theory.
8. **Slash chords / bass note override.** The most-missed thing in the hardware's vocabulary
   (see [10](10-sound-palette-and-chord-vocabulary.md)).
9. **MIDI In driving the chord engine.** The hardware can't; a single incoming note becoming a
   full chord makes any MIDI controller into an Orchid.
10. **MIDI clock in/out** — trivially available via Web MIDI, possibly absent on hardware.
11. **Shareable state in the URL.** A chord progression as a link. Very webapp, impossible on hardware.

## 7. Where we should deliberately *not* over-engineer

- **Don't build a deep synth editor.** Telepathic split that into a separate paid product for a
  reason. Constraint is the feature; a filter cutoff + FX amount + preset list is enough.
- **Don't build a DAW.** The instrument's whole thesis is "capture the idea, finish elsewhere."
  Export MIDI and get out of the way.
- **Don't add 60 presets.** 15–25 excellent, well-named ones beat 60 mediocre ones, and every
  preset is maintenance.

## 8. Our own "Secret Chords"

The hardware's are undocumented [UNKNOWN]. Rather than reverse-engineer them, define ours —
triggered by holding **two chord-type buttons at once**:

| Combo | Chord | Semitones |
|-------|-------|-----------|
| Maj + Dim | **Augmented** | 0 4 8 |
| Maj + Min | **Power chord** (no 3rd) | 0 7 |
| Min + Sus | **Quartal stack** | 0 5 10 |
| Maj + Sus | **add4** | 0 4 5 7 |
| Dim + Sus | **♭5 / tritone** | 0 6 |
| Min + Dim | **minor ♭6** | 0 3 8 |
| Maj + Min + 9 | **7♯9** (Hendrix) | 0 4 7 10 15 |
| all four | **cluster** | 0 1 2 3 |

Keep them discoverable but also documented in a help panel — the hardware's mistake is that
"secret" ended up meaning "nobody knows."

## 9. Visual design direction

**[PRESS]** The hardware's identity is *retro-futurist, chunky, toy-like, warm* — big tactile
buttons, a small character display, translucent limited editions, playful preset names, and
a screen that literally prints `WTF?` when you overload it.

The design brief writes itself: **an instrument that looks like it wants to be played, not
configured.** Chunky hit targets, a real character-display readout, visible LEDs for locked
states, and the same refusal to take itself too seriously. Avoid the flat grey "audio plugin"
look — that's the aesthetic Telepathic deliberately rejected.

## 10. Open questions to resolve before/while building

These come from genuine gaps in the research, not indecision:

0. ~~Keyboard layout~~ — **decided**, see §1. ~~Dial navigation~~ — **decided**, see §1b.
1. Is `Sus` sus4 or sus2? (Suggest: sus4 default, sus2 via secret combo or setting)
2. What do the 5 chromatic keys do in Key Mode? (Suggest: secondary dominants/borrowed — our call)
3. Natural or harmonic minor for minor keys? (Suggest: expose modes; default natural + major V)
4. How aggressive should automatic voice leading be, and should it be defeatable?
5. Do we implement Split/Octave mode, or just show 2–3 octaves on screen and skip the concept?
6. Strum direction — down only (as documented) or alternating?
7. Do we sample real drums (asset weight) or synthesize the beat machine?
8. MIDI-out channel defaults — copy v3.90 (chord channel Off) or send all three?

None of these block starting. All of them are cheap to change if we keep the chord/voicing/
performance layers pure.
