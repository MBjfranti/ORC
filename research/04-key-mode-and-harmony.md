# 04 — Key Mode & Harmony

## What Key Mode does **[OFFICIAL]**

> "With Key Mode activated on Orchid, any note you play on the keyboard will automatically
> generate a chord that fits within that key."

With Key Mode on, **you don't touch the Chord Type buttons at all.** Press any key, get the
harmonically correct diatonic chord for that scale degree.

> "Once locked, simply press any key on the right-hand keyboard. Orchid will automatically play
> the correct corresponding chord from the selected scale (e.g., in C Major, pressing the D key
> will play a D Minor chord). You do not need to use the Chord Type buttons."

That single confirmed example — **D in C major → D minor** — tells us it's doing standard
diatonic triad harmonization. No exotic mapping.

## Controls **[OFFICIAL]**

| Action | Result |
|--------|--------|
| **Turn Key encoder** | Select key (e.g. C, Am, Bm) |
| **Press Key encoder** | Lock / unlock Key Mode |
| Key active | Key name appears top-left of display + LED lights next to encoder |
| **Long-press Key encoder, then `Min` + `C`** | Quick key select → sets key to C minor |
| v3.90 | Turning Key off shows an explicit "Off" on the display |
| v3.90 | Quick Key select prompt no longer shows an octave number |
| v3.90 | Transpose adjustment no longer accidentally toggles Key |

The quick-key-select gesture is elegant: you *spell* the key using the same chord grammar you
already know (type button + root key) rather than scrolling a list.

## Extensions still work in Key Mode **[OFFICIAL]**

> "Chord Extensions will add notes when chords are played – either when you are using the top
> row of Chord Type buttons, **or when you are playing the keyboard in Key mode.**"

So Key Mode replaces the *type* row, not the *extension* row. Hold `9` and play in C major, and
you get diatonic 9th chords across the whole scale. This is a very strong combination and worth
prioritizing in our build.

## Diatonic triad reference **[DERIVED]**

Standard harmonization. This is what the device is almost certainly doing.

### Major keys — scale degrees

| Degree | I | ii | iii | IV | V | vi | vii° |
|--------|---|----|----|----|---|----|------|
| Quality | Major | minor | minor | Major | Major | minor | diminished |
| Semitones from tonic | 0 | 2 | 4 | 5 | 7 | 9 | 11 |

### Natural minor keys — scale degrees

| Degree | i | ii° | ♭III | iv | v | ♭VI | ♭VII |
|--------|---|-----|------|----|----|-----|------|
| Quality | minor | diminished | Major | minor | minor | Major | Major |
| Semitones from tonic | 0 | 2 | 3 | 5 | 7 | 8 | 10 |

**[UNKNOWN]** Whether Orchid uses natural minor, harmonic minor (making V major), or something
smarter for minor keys. Harmonic minor's major V is far more useful in practice — most chord
tools raise the 7th. Worth testing if we ever get hands on hardware.

### ✅ RESOLVED — we ship all seven modes

Our build takes the "Mode selector" option: **Ionian, Dorian, Phrygian, Lydian, Mixolydian,
Aeolian, Locrian**, cycled with `M`. `major` and `minor` are Ionian and Aeolian under the names
people actually use, so every key that was major or minor still is — natural minor, not harmonic.

Degrees, triad qualities and Roman numerals are all **derived by rotating the major scale**
rather than tabulated per mode. One scale viewed from seven starting points: Dorian's major IV,
Mixolydian's minor v and Locrian's diminished tonic fall out on their own, and the modes cannot
drift out of step with each other. Key signatures follow each mode's relative major, except
Aeolian which keeps its own table so pitch class 3 still spells E♭m rather than D♯m.

### All twelve major keys, fully spelled

| Key | I | ii | iii | IV | V | vi | vii° |
|-----|---|----|-----|----|---|----|------|
| **C** | C | Dm | Em | F | G | Am | B° |
| **G** | G | Am | Bm | C | D | Em | F♯° |
| **D** | D | Em | F♯m | G | A | Bm | C♯° |
| **A** | A | Bm | C♯m | D | E | F♯m | G♯° |
| **E** | E | F♯m | G♯m | A | B | C♯m | D♯° |
| **B** | B | C♯m | D♯m | E | F♯ | G♯m | A♯° |
| **F♯/G♭** | F♯ | G♯m | A♯m | B | C♯ | D♯m | E♯° |
| **D♭** | D♭ | E♭m | Fm | G♭ | A♭ | B♭m | C° |
| **A♭** | A♭ | B♭m | Cm | D♭ | E♭ | Fm | G° |
| **E♭** | E♭ | Fm | Gm | A♭ | B♭ | Cm | D° |
| **B♭** | B♭ | Cm | Dm | E♭ | F | Gm | A° |
| **F** | F | Gm | Am | B♭ | C | Dm | E° |

Note `E♯°` in F♯ major — this is exactly the kind of spelling that produces Orchid's `x`
(double-sharp) display notation in related contexts.

### All twelve natural minor keys, fully spelled

| Key | i | ii° | ♭III | iv | v | ♭VI | ♭VII |
|-----|---|-----|------|----|---|-----|------|
| **Am** | Am | B° | C | Dm | Em | F | G |
| **Em** | Em | F♯° | G | Am | Bm | C | D |
| **Bm** | Bm | C♯° | D | Em | F♯m | G | A |
| **F♯m** | F♯m | G♯° | A | Bm | C♯m | D | E |
| **C♯m** | C♯m | D♯° | E | F♯m | G♯m | A | B |
| **G♯m** | G♯m | A♯° | B | C♯m | D♯m | E | F♯ |
| **E♭m** | E♭m | F° | G♭ | A♭m | B♭m | C♭ | D♭ |
| **B♭m** | B♭m | C° | D♭ | E♭m | Fm | G♭ | A♭ |
| **Fm** | Fm | G° | A♭ | B♭m | Cm | D♭ | E♭ |
| **Cm** | Cm | D° | E♭ | Fm | Gm | A♭ | B♭ |
| **Gm** | Gm | A° | B♭ | Cm | Dm | E♭ | F |
| **Dm** | Dm | E° | F | Gm | Am | B♭ | C |

## The 12-keys-to-7-degrees problem **[DERIVED]**

Here's a real design question the docs don't answer. The keyboard has **12 keys** (a
chromatic octave), but a diatonic key only has **7 degrees**. What happens when you press one
of the 5 non-diatonic keys in Key Mode?

Three plausible behaviors:

1. **Snap** — the black key rounds to the nearest diatonic degree (so C♯ plays either C or Dm).
   Loses 5 keys' worth of expression.
2. **Chromatic/borrowed chords** — non-diatonic keys produce secondary dominants, borrowed
   chords, or tritone subs. Musically the richest option.
3. **Pass-through** — non-diatonic roots get a default quality (usually major).

**[UNKNOWN]** which Orchid does. Reviews describe every key producing "something diatonic to
that key," which hints at option 1 or 3.

> MusicTech: *"Key Lock On: any key you press will give you something diatonic to that key.
> Key Lock Off: play a melody freely and just add chords when you want."*

**Recommendation for our build:** option 2 is the interesting one and would be a genuine
improvement. Map the 5 chromatic keys to useful borrowed harmony (e.g. in C major:
C♯→A7/V-of-ii, D♯→E♭ (♭III), F♯→D7/V-of-V, G♯→A♭ (♭VI), A♯→B♭ (♭VII)). That gives all 12
keys meaning without requiring theory from the user — which is exactly the Orchid's own thesis.

### ✅ RESOLVED — we ship all three, as a switch

Rather than pick one, the build exposes a **Root Layout** control (`/`) with three positions:

| Layout | The 12 keys | Out-of-key roots |
|--------|-------------|------------------|
| **Chromatic** | chromatic octave | secondary dominants and borrowed chords (option 2) |
| **Correct** | chromatic octave | snap to the *nearest* diatonic chord (option 1) |
| **Scale** | **collapses to 7 keys** — `G H J K L ; '` walk the mode | unreachable by construction |

`Scale` is the one that goes past the hardware: the keybed becomes the seven notes of whichever
mode is selected, plus `Enter` closing the octave — `do re mi fa sol la ti do`. Nothing you play
can be out of key, and the layout re-maps itself when you change mode.

Two things learned building it:

- **Snap must pick the nearest degree, not the first one below.** The obvious implementation
  walks the scale downward and takes the first hit, which sends C♯ to B when C is a semitone
  away. There is now a property test asserting snap never moves a root more than one semitone.
- **Giving the black keys the five leftover chromatic notes in Scale layout reads terribly.**
  They interleave with the scale, so C Dorian spells `C D♭ D E E♭ F …` and stops ascending.
  Seven keys in a row is what "the notes of the mode" actually looks like; chromatic colour is
  one switch away.

See also §modes below — Key Mode now covers all seven diatonic modes, not just major and minor.

## Why it matters (their framing) **[OFFICIAL]**

> "It makes creating harmonically pleasing chord progressions effortless, even with no formal
> music theory knowledge. It's a fantastic tool for overcoming creative blocks and exploring
> new musical ideas."

## Out-of-key play

**[PRESS]** With Key Mode off you use the Chord Type buttons directly, which means you can
generate chords freely **in or out of key** — reviewers repeatedly note that this is where the
creative accidents come from. Key Mode is a safety net, not a cage; the ability to turn it off
matters as much as the mode itself.
