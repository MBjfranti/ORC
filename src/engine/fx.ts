/**
 * The effects rack.
 *
 * ## What the manual says
 *
 * > "Push the FX Dial to see the available effects. Turn the FX Dial to choose
 * > the effect you wish to change. Push the FX Dial to select the effect. Turn
 * > the dial to adjust the selected effect's intensity." — §8.2
 *
 * So the FX encoder is a **two-state machine**, and this is the only control on
 * the instrument that is (research/13 §B.4):
 *
 *     BROWSE  ──press──►  ADJUST
 *     cursor moves        value changes
 *             ◄──press──
 *
 * Before you ever open the menu the dial still does something: "By default, the
 * FX Dial will automatically increase and decrease **the most prominent effect
 * of the currently selected sound**" (§8.2). That is a macro — a sound arrives
 * with a character, and the knob leans on whatever that character is without
 * you having to know which effect it was.
 *
 * A **hold locks** the rack rather than opening anything (§8.3), with an LED.
 * FX and Perform are the two encoders whose menus open on a *press*, and they
 * are exactly the two whose hold is a lock — the grammar is consistent
 * per-encoder: press-to-open **or** hold-to-open, never both, and the free
 * gesture takes the lock (research/13 §B.2).
 *
 * ## The order, and the conflict in it
 *
 * §8.1 lists the effects as Reverb, **Delay, Chorus**, Phaser, Flanger, Drive,
 * Tremolo, Ensemble, Filter, Drum FX Reverb, Drum FX Saturation. But the actual
 * menu photographed on PDF p12 reads `Exit`, `Reverb 05`, **`Chorus 02`**,
 * **`Delay 01`** — the middle two swapped. research/13 resolves it in favour of
 * the photograph for the first three and the prose for the tail, on the grounds
 * that one of them is a picture of the thing itself.
 */

/** Every effect the hardware lists, in menu order. */
export type FxId =
  | 'reverb'
  | 'chorus'
  | 'delay'
  | 'phaser'
  | 'flanger'
  | 'drive'
  | 'tremolo'
  | 'ensemble'
  | 'filter'

export interface FxSlot {
  readonly id: FxId
  readonly label: string
  /**
   * Whether we actually have this effect.
   *
   * The unbuilt ones stay on the list and show `--` instead of a value, the
   * same bargain the unbuilt knobs on the panel make: the row holds its
   * documented place and is honest about doing nothing, which beats a menu
   * that quietly disagrees with the manual.
   */
  readonly built: boolean
}

export const FX_SLOTS: readonly FxSlot[] = [
  { id: 'reverb', label: 'Reverb', built: true },
  { id: 'chorus', label: 'Chorus', built: true },
  { id: 'delay', label: 'Delay', built: true },
  { id: 'phaser', label: 'Phaser', built: false },
  { id: 'flanger', label: 'Flanger', built: false },
  { id: 'drive', label: 'Drive', built: false },
  { id: 'tremolo', label: 'Tremolo', built: false },
  { id: 'ensemble', label: 'Ensemble', built: false },
  // The filter is listed with the effects but is a control in its own right on
  // the hardware — "plus a dedicated filter cutoff control" (research/07).
  { id: 'filter', label: 'Filter', built: true },
]

/**
 * `Exit` is row one of the menu and a **list row, not a gesture** — PDF p20 and
 * p12 both show it that way (research/13 §B.5). There is no back button on this
 * instrument; you leave a menu by choosing to.
 */
export const FX_EXIT_ROW = 0

/** How many rows the FX menu has, `Exit` included. */
export const FX_ROWS = FX_SLOTS.length + 1

/** The slot a cursor row points at, or `undefined` on `Exit`. */
export const fxSlotAt = (row: number): FxSlot | undefined => FX_SLOTS[row - 1]

/** `05` — the two-digit amount every row of the menu carries. */
export const fxLevel = (amount: number) => String(Math.round(amount * 99)).padStart(2, '0')

/**
 * Which effect a sound leans on hardest.
 *
 * What the dial reaches for before you open the menu. Only the three a preset
 * actually carries are candidates — the library gives every sound a reverb,
 * chorus and delay level, and the loudest of those *is* the sound's character.
 */
export function prominentFx(sound: {
  reverb: number
  chorus: number
  delay: number
}): 'reverb' | 'chorus' | 'delay' {
  if (sound.chorus > sound.reverb && sound.chorus >= sound.delay) return 'chorus'
  if (sound.delay > sound.reverb && sound.delay > sound.chorus) return 'delay'
  return 'reverb'
}
