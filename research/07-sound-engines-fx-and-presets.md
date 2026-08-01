# 07 — Sound Engines, FX & Presets

## The three engines **[OFFICIAL]**

| Engine | Description | Character |
|--------|-------------|-----------|
| **Polyphonic subtractive** | Virtual analog | Pads, brass, strings, classic synth chords |
| **FM** | Frequency modulation | Bells, DX-style electric pianos, metallic/glassy tones, plucks |
| **Vintage EP / reed piano** | Electric piano emulation | Rhodes/Wurlitzer-adjacent keys |

**16-voice polyphony.** **[OFFICIAL]**

These are the same three engines exposed in the **Pistil** plugin, where each is described as
having **4 oscillators, LFOs, envelopes and filters**. **[OFFICIAL]** So the underlying engine
is a reasonably conventional 4-osc subtractive/FM hybrid — nothing exotic. That's good news for
reimplementation: standard Web Audio oscillators + filters + envelopes get you most of the way.

## Presets **[OFFICIAL]**

- **60 factory sounds** on the hardware (Pistil ships **70**, including 10 exclusives added in
  its v1.0).
- **30 user sound slots.**
- Kevin Parker designed the factory sounds using the engine that became Pistil.
- **Sounds are not deeply editable on the hardware** — this is deliberate. You get filter
  cutoff, FX, and performance settings on top of a fixed patch. Deep editing lives in Pistil.

### Browsing **[OFFICIAL]**
- **Turn** the Sound encoder → browse **by number**.
- **Press then turn** → browse **by name**.
- User sounds appear after the factory sounds in the list.

### Saving a user sound **[OFFICIAL]**
> "If you've been experimenting with FX or performance settings and want to save what you've
> found, press and hold the Sound encoder and select **Save as a User Sound**. This might be a
> particular delay sound, phaser amount, or filter cutoff."

So a **user sound = factory patch + FX state + performance setting + filter position.** It's a
snapshot of the whole signal chain, not a synthesis patch. Important distinction for our data model.

> "Save that combination of a sound patch, effects, performance, and filter in one of the 30
> user sound slots to ensure the vibe never gets away from you."

## Known preset names **[OFFICIAL — partial]**

The full 60-name list is **not published**. **[UNKNOWN]** These are the ones Telepathic show
on the product page:

**Lead**
| # | Name |
|---|------|
| 62 | Lemon |
| 64 | DX Guitar |
| 67 | Trout |
| 68 | Plumerai La Tete |
| 70 | Cosmic Day Spa |

**Bass**
| # | Name |
|---|------|
| 04 | PBass |
| 06 | ORC808 |
| 09 | Fifth Organ Bass |
| 10 | Meadow Bass |
| 12 | Rezdist Bass |

**Drums / Beats**
| # | Name |
|---|------|
| 01 | Saint Germain |
| 02 | Orchid Bossanova |
| 03 | Trap |
| 04 | Latin |
| 05 | Millionaire |

Note the lead numbers run into the 60s–70s while bass runs 04–12 — suggesting **separate
numbering spaces** for the treble sound list and the bass sound list, and that the treble list
has grown past 60 with firmware additions (v3.90 added 10 new sounds).

The naming style is worth absorbing: evocative, slightly absurd, non-technical
("Cosmic Day Spa," "Millionaire," "Trout"). Not "Pad 3" or "FM Bell 2." This is a big part of
why the instrument feels playful, and it costs us nothing to do the same.

## Effects **[PRESS/OFFICIAL]**

Six onboard effects reported by MusicTech:

1. **Reverb**
2. **Chorus**
3. **Delay**
4. **Flanger**
5. **Phaser**
6. **Overdrive**

Plus a dedicated **filter cutoff** control. **[OFFICIAL]** Pistil's FX rack is listed as
reverb + chorus + delay, so the hardware appears to carry a larger FX set than the plugin.

**[UNKNOWN]** How FX are selected and how many run simultaneously — whether it's one FX slot at
a time on the FX encoder, or a fixed chain with a single macro control. The "press and turn"
gesture grammar suggests one encoder cycling FX type with turn-to-set-amount.

Firmware v3.90 FX-related fixes **[OFFICIAL]**:
- "Smoother delays with reduced pops"
- "Phaser avoids runaway at maximum settings"
- Pistil v1.0 shipped a "rebuilt delay engine"

Also present: **Drum FX** — "new rhythmic controls for the beat engine." **[PRESS]**

## The bass engine **[OFFICIAL]**

A **separate, monophonic bass synth** with its own sound list, its own voicing dial, its own
volume, and its own MIDI channel.

### Bass modes (`Options → Bass`, or press-and-hold the Bass encoder)

| Mode | Behavior |
|------|----------|
| **With chords only** | Bass plays the root only when you play a chord |
| **Unison** | Bass and treble play in unison when playing single notes |
| **Bass single notes** | Single-key presses play **only** bass; treble engine sounds only for chords |
| **Solo** | **Mutes the treble engine entirely**, even when playing chords — lets you play a bassline on its own |

**[PRESS]** MusicRadar describes it as an "independent monophonic bass synth" with Follow and
Solo modes. Solo mode is the one that turns the Orchid into a bass instrument: "activate solo
mode if you want to take the bassline for a walk."

### Bass details
- Bass plays the **root note of the current chord** by default. **[OFFICIAL]**
- **Turn** the orange Bass encoder to change bass sound; **press** to enable/disable.
- **Bass volume:** press and hold the main Volume dial while turning (0–99).
- v3.90: when Bass is off, "bass single notes" mode now plays the treble chord instead of silence.
- **[PRESS]** The built-in speakers "struggle with these lower sounds" — a physical limitation
  we obviously don't inherit.

## Velocity **[OFFICIAL]**

`Options → Instrument → Velocity Sense`: **On** (louder with harder presses) or **Off** (all
notes equal volume).

> "Note: **Not all preset sounds are currently velocity-sensitive**"

Relevant to us — a computer keyboard has **no velocity at all**. See
[11](11-webapp-implications.md) for how to handle that.

## Audio output routing **[OFFICIAL]**

`Options → Audio and MIDI → Audio Output`: **Auto** (detects headphone jack, switches speakers)
/ **Headphones only** / **Speakers only** / **Both**.
