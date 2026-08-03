/**
 * The Options menu, as data.
 *
 * > "The Options Menu contains a variety of settings that change how Orchid
 * > operates, as well as system information. To access these options, use the
 * > Options Dial." — §14
 *
 * ## Flat, not nested — and that is a resolved conflict
 *
 * research/02 transcribes a four-branch tree (System / Instrument / Bass /
 * Audio and MIDI) from firmware **v3.90**. Manual v4.1's §14 is a flat run of
 * numbered settings, its §16.2 FAQ cites flat paths ("Options > Velocity
 * Sense"), and **both illustrations show an unindented list with no group
 * headings** — PDF p20 captures the head (`Exit`, `Battery`, `View`,
 * `Audio Output`, `MIDI Channels`) and p23 the tail. research/13 §A.1 calls it:
 * implement flat, the v3.90 tree is superseded.
 *
 * Same precedent as the FX list, where the photograph beat the prose. A picture
 * of the thing itself outranks a description of it.
 *
 * ## Order
 *
 * §14.1–§14.14 with `Exit` prepended, which is where p20 shows it. PDF p23
 * disagrees — it puts `Version` straight after `Extension Addition` — but that
 * capture is missing §14.7–§14.12 entirely and reads as stale. research/13 §A.1
 * recommends following the numbered sections, so that is what this does.
 *
 * ## Two levels, despite being "flat"
 *
 * Flat means *no grouping*. It cannot mean values shown inline: `Extension
 * Addition` alone is eighteen characters and the display is 128 pixels wide, so
 * a label and a value cannot share a row. Selecting a setting therefore opens
 * its values on a second screen — which is also all p20 and p23 show, labels
 * with no values beside them.
 */

/** Every row of the menu. */
export type OptionId =
  | 'exit'
  | 'battery'
  | 'view'
  | 'audioOutput'
  | 'midiChannels'
  | 'playStyle'
  | 'extensionAddition'
  | 'singleNote'
  | 'secretChords'
  | 'quantization'
  | 'metronomeClick'
  | 'velocitySense'
  | 'autoPowerOff'
  | 'version'
  | 'upgradeFirmware'

export interface OptionRow {
  readonly id: OptionId
  /** As the screen prints it. `Upgrade firmware` is lowercase-f, per PDF p23. */
  readonly label: string
  readonly kind: 'action' | 'info' | 'enum'
  /** The documented values, in the manual's order. */
  readonly values?: readonly string[]
  /**
   * Whether choosing a value here actually does anything.
   *
   * The unbuilt rows keep their documented place and are honest about doing
   * nothing — the same bargain the unbuilt FX slots and the unbuilt knobs make.
   * A menu that quietly disagrees with the manual is worse than one that admits
   * a gap.
   */
  readonly built: boolean
}

export const OPTIONS: readonly OptionRow[] = [
  { id: 'exit', label: 'Exit', kind: 'action', built: true },
  // A browser has a battery too, so this one is real rather than imitated.
  { id: 'battery', label: 'Battery', kind: 'info', built: true },
  {
    id: 'view',
    label: 'View',
    kind: 'enum',
    // §14.2. Only the chord readout exists; the other five are the open item in
    // research/16.
    values: ['React', 'Chord', 'Keyboard', 'Chord & Keyboard', 'Notes', 'Geek Out'],
    built: false,
  },
  // §14.3 — routing between built-in speakers and a headphone jack. A browser
  // has neither to choose between; the OS owns that.
  {
    id: 'audioOutput',
    label: 'Audio Output',
    kind: 'enum',
    values: ['Auto', 'Headphones', 'Speakers', 'Both'],
    built: false,
  },
  // §14.4. Web MIDI could carry this one day; there is no MIDI out yet.
  {
    id: 'midiChannels',
    label: 'MIDI Channels',
    kind: 'enum',
    values: ['Performance', 'Bass', 'Chord'],
    built: false,
  },
  // §14.5 — how the pads and the keys interact. The one Options row that
  // changes how the instrument is *played*; see `engine/instrument.ts`.
  {
    id: 'playStyle',
    label: 'Play Style',
    kind: 'enum',
    values: ['Simple', 'Advanced', 'Free'],
    built: true,
  },
  // §14.6, and only meaningful in Advanced and Free by the manual's own note.
  {
    id: 'extensionAddition',
    label: 'Extension Addition',
    kind: 'enum',
    values: ['Add Note', 'Play Chord'],
    built: true,
  },
  // §14.7. The FAQ calls the same setting `Single Notes` with values
  // `Full Octave` / `Split Mode`; the section heading's wording is used here.
  {
    id: 'singleNote',
    label: 'Single Note Mode',
    kind: 'enum',
    values: ['Split Keyboard', 'Full Octave Keyboard'],
    built: false,
  },
  // §14.8. `Off` is not named in the section but "turning **on** Secret Chords"
  // implies it, and research/02 records it. Inferred, and listed first.
  {
    id: 'secretChords',
    label: 'Secret Chords',
    kind: 'enum',
    values: ['Off', 'Simple PlayStyle', 'All PlayStyle'],
    built: false,
  },
  /*
   * §14.9, and one of the few that is fully built — it drives the looper's
   * quantiser. The manual's own casing is lowercase `t`: `1/8t`, `1/16t`.
   * research/02 writes them capitalised; the manual wins.
   */
  {
    id: 'quantization',
    label: 'Quantization',
    kind: 'enum',
    values: ['None', '1/4', '1/8', '1/8t', '1/16', '1/16t', '1/32'],
    built: true,
  },
  /*
   * §14.10 names no sounds at all. The pair is research/02's, and research/13
   * §A.10 is explicit — "do not invent more". The hi-hat is the kit's own, so
   * the two settings really are two different sounds rather than two labels.
   */
  {
    id: 'metronomeClick',
    label: 'Metronome Click',
    kind: 'enum',
    values: ['Beep', 'Hi Hat'],
    built: true,
  },
  /*
   * §14.11, and inert for a reason worth stating: a computer keyboard sends no
   * velocity. There is nothing for this to sense until MIDI input exists, so
   * switching it would change nothing and claiming otherwise would be a lie.
   */
  {
    id: 'velocitySense',
    label: 'Velocity Sense',
    kind: 'enum',
    values: ['ON', 'OFF'],
    built: false,
  },
  // §14.12 — a battery-powered instrument shutting itself off. A tab does not.
  {
    id: 'autoPowerOff',
    label: 'Auto Power Off',
    kind: 'enum',
    values: ['10 minutes', '30 minutes', 'Never'],
    built: false,
  },
  { id: 'version', label: 'Version', kind: 'info', built: true },
  // §14.14. There is no firmware to receive.
  { id: 'upgradeFirmware', label: 'Upgrade firmware', kind: 'action', built: false },
]

/** `Exit` is row one, as PDF p20 shows it — a row, never a gesture. */
export const OPTIONS_EXIT_ROW = 0

export const optionAt = (row: number): OptionRow | undefined => OPTIONS[row]

export const optionById = (id: OptionId): OptionRow =>
  OPTIONS.find((o) => o.id === id) as OptionRow
