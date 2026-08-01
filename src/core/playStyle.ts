/**
 * Play Styles.
 *
 * The three settings differ in one thing: **when you are allowed to change a
 * chord that is already sounding**. Everything else about them follows.
 *
 *   Simple    hold a type, then press a key. The chord is fixed once struck —
 *             it sustains even after you let go of the button, but you cannot
 *             change its quality without releasing the key first.
 *
 *   Advanced  press a key for a bare note, then add a type to harmonise it.
 *             Edits land on the sounding chord. The quality does not follow you
 *             to the next key.
 *
 *   Free      as Advanced, and the quality *carries* — hold Maj, play D, let go
 *             of Maj, reach for F, and you get F major.
 *
 * See research/03-chord-engine.md §Play Styles.
 */

export type PlayStyle = 'simple' | 'advanced' | 'free'

export const PLAY_STYLES: readonly PlayStyle[] = ['simple', 'advanced', 'free']

export const PLAY_STYLE_LABEL: Record<PlayStyle, string> = {
  simple: 'Simple',
  advanced: 'Advanced',
  free: 'Free',
}

/**
 * What happens when an extension is added to a chord already sounding.
 *
 * `add`   only the new note is struck; the rest keeps ringing, so the chord
 *         swells. Smooth, and the default.
 * `chord` the whole chord re-triggers, so the extension arrives as a fresh
 *         articulation rather than a swell.
 *
 * Only meaningful in Advanced and Free — Simple does not permit live edits.
 */
export type ExtensionAddition = 'add' | 'chord'

export const EXTENSION_ADDITIONS: readonly ExtensionAddition[] = ['add', 'chord']

export const EXTENSION_ADDITION_LABEL: Record<ExtensionAddition, string> = {
  add: 'Add note',
  chord: 'Play chord',
}

/** Whether a sounding chord may be re-coloured in place. */
export function allowsLiveEdit(style: PlayStyle): boolean {
  return style !== 'simple'
}

/**
 * Whether the chord quality carries from one root to the next.
 *
 * Only Free does this. In Simple and Advanced a new key with no button held is
 * a bare note, which is what makes them feel more deliberate.
 */
export function carriesTypeToNextRoot(style: PlayStyle): boolean {
  return style === 'free'
}

/**
 * Secret Chords, as the hardware states it.
 *
 * Options → Instrument → Secret Chords is a *three-way* setting, not a
 * toggle: `Simple only | All Play Styles | Off`. The default matters —
 * holding two type buttons in Advanced or Free is how you roll from one
 * quality to another, so firing a secret chord there would fight the player.
 * Restricting them to Simple, where a chord is fixed the moment it is struck,
 * is why the hardware ships that way.
 *
 * See research/02-hardware-panel-and-controls.md §Options menu tree.
 */
export type SecretChordMode = 'simple' | 'all' | 'off'

export const SECRET_CHORD_MODES: readonly SecretChordMode[] = ['simple', 'all', 'off']

export const SECRET_CHORD_LABEL: Record<SecretChordMode, string> = {
  simple: 'Simple only',
  all: 'All play styles',
  off: 'Off',
}

/** Whether a two-button combination should reach for a Secret Chord. */
export function secretChordsApply(mode: SecretChordMode, style: PlayStyle): boolean {
  if (mode === 'off') return false
  return mode === 'all' || style === 'simple'
}
