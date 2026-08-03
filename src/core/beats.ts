/**
 * The beat machine's patterns, and the meters the metronome counts in.
 *
 * Pure data: a pattern is a grid of characters, so it can be read, diffed and
 * tested without a sound card. `engine/drums.ts` owns the kit that plays them.
 *
 * ## What the hardware documents
 *
 * > "Long press the BPM Dial for one second and **scroll past the time
 * > signatures** to access Beats. Press the BPM Dial to start or stop a Beat.
 * > Turn the BPM Dial to change the tempo of Beats. Press and turn the BPM Dial
 * > to adjust the volume of the Beat." — §11.4
 *
 * That is one list, not two: time signatures first, then the twenty beats. So
 * the dial's press addresses *whichever row you last landed on* — "the
 * Metronome **or** Beats can be toggled on/off by pressing the BPM Dial"
 * (§12.6). One switch, two things it can be pointed at.
 *
 * ## Where the names come from
 *
 * Five are documented, in order, and they are the first five here:
 * `01 Saint Germain`, `02 Orchid Bossanova`, `03 Trap`, `04 Latin`,
 * `05 Millionaire` (research/08, **[OFFICIAL — partial]**). The remaining
 * fifteen are **[UNKNOWN]** and the names below are **ours**, chosen to say
 * plainly what the pattern is rather than to guess at Telepathic's.
 *
 * The *patterns* are ours throughout — no framebuffer or audio of the hardware's
 * beats exists in the research, so even the five documented names are matched to
 * the style the name implies and nothing more. Press coverage says the set spans
 * "trap, disco, Latin, bossa nova — a broad, songwriter-friendly spread rather
 * than a techno-focused set", which is what the twenty aim at.
 *
 * ## The notation
 *
 * One string per voice, one character per step:
 *
 *     X  accent      x  normal      o  ghost      .  rest
 *
 * A string's length is the pattern's length, so a two-bar clave is simply
 * thirty-two characters against a sixteen-character kick — they are read modulo
 * their own length, which is how a two-bar figure sits over a one-bar groove
 * without either being written out twice.
 */

/** The kit, and the only voices a pattern may name. */
export type DrumVoice =
  | 'kick'
  | 'snare'
  | 'rim'
  | 'clap'
  | 'hat'
  | 'open'
  | 'ride'
  | 'tom'
  | 'shaker'

export const DRUM_VOICES: readonly DrumVoice[] = [
  'kick',
  'snare',
  'rim',
  'clap',
  'hat',
  'open',
  'ride',
  'tom',
  'shaker',
]

/**
 * How long one step is.
 *
 * Tone's own notation, because it is what the transport takes — and because a
 * shuffle really is a triplet grid rather than a straight one with an offset
 * bolted on. Swing is for the grooves that lean; `8t` is for the ones that
 * *are* triplets.
 */
export type Subdivision = '16n' | '8n' | '8t' | '16t'

export interface Beat {
  readonly name: string
  /** How long one character lasts. */
  readonly step: Subdivision
  /** Steps in one bar — 16 sixteenths in four-four, 12 in three-four. */
  readonly bar: number
  /**
   * How far the off-steps lag, as a fraction of a step.
   *
   * Local to the beat machine rather than `Transport.swing`, which is global
   * and would drag the looper's quantisation along with it.
   */
  readonly swing?: number
  readonly voices: Partial<Record<DrumVoice, string>>
}

/** Velocity per character. Ghosts are the difference between a groove and a grid. */
const VELOCITY: Record<string, number> = { X: 1, x: 0.78, o: 0.42 }

export interface Hit {
  readonly voice: DrumVoice
  readonly velocity: number
}

/**
 * The twenty.
 *
 * Ordered so the documented five keep their documented numbers, and the rest
 * run from the most familiar to the most particular.
 */
export const BEATS: readonly Beat[] = [
  {
    // [OFFICIAL name] — St Germain is nu-jazz house, so: four on the floor, a
    // clap on the backbeat, hats on the offbeat eighths and a shaker carrying
    // the sixteenths. The lean is what makes it that rather than techno.
    name: 'Saint Germain',
    step: '16n',
    bar: 16,
    swing: 0.16,
    voices: {
      kick: 'X...x...X...x...',
      clap: '....X.......X...',
      hat: '..x...x...x...x.',
      open: '..............o.',
      shaker: 'oxoxoxoxoxoxoxox',
      rim: '.......o.....o..',
    },
  },
  {
    // [OFFICIAL name]. The surdo on 1, the & of 2, 3 and the & of 4; the rim
    // playing a two-bar 3-2 son clave over it, which is why that string is
    // twice as long as the others.
    name: 'Orchid Bossanova',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X.....x.X.....x.',
      rim: 'x..x..x.............x...x.......',
      shaker: 'x.x.x.x.x.x.x.x.',
      snare: '..o.......o.....',
    },
  },
  {
    // [OFFICIAL name]. Half-time: the snare waits for beat three, the kick
    // slides off the grid, and the hats do the work with rolls into the bar.
    name: 'Trap',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X.....x...X.....',
      snare: '........X.......',
      hat: 'x.x.xxx.x.x.xxxx',
      open: '..............o.',
    },
  },
  {
    // [OFFICIAL name]. Songo-leaning: clave on the rim, toms answering, and a
    // kick that never lands squarely on the backbeat.
    name: 'Latin',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'x..x..x...x..x..',
      rim: '....x...x.......x..x..x.........',
      tom: '..o...o...o...o.',
      shaker: 'x.x.x.x.x.x.x.x.',
      snare: '..o......o..o...',
    },
  },
  {
    // [OFFICIAL name], [UNKNOWN style]. Read as disco, which is the corner of
    // the spread the press names that nothing else here covers: closed hat on
    // the quarters, open on every &, clap riding the backbeat.
    name: 'Millionaire',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X...x...X...x...',
      snare: '....X.......X...',
      hat: 'x...x...x...x...',
      open: '..o...o...o...o.',
      shaker: '.x.x.x.x.x.x.x.x',
    },
  },

  // --- ours, from here down -------------------------------------------------

  {
    name: 'Boom Bap',
    step: '16n',
    bar: 16,
    swing: 0.2,
    voices: {
      kick: 'X..x..x...x.x...',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    name: 'Half Time',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X.....x.........',
      snare: '........X.......',
      hat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    name: 'Four Floor',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X...X...X...X...',
      clap: '....x.......x...',
      hat: '..x...x...x...x.',
      open: '......o.......o.',
    },
  },
  {
    name: 'Boogie',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X...x..xX...x...',
      snare: '....X.......X...',
      hat: 'xoxoxoxoxoxoxoxo',
    },
  },
  {
    name: 'Motown',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X..x....x..x....',
      snare: '....X.......X...',
      clap: '....o.......o...',
      shaker: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    name: 'Ballad',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X.......x.......',
      snare: '....X.......X...',
      hat: 'x...x...x...x...',
    },
  },
  {
    // Three-four, so twelve steps rather than sixteen. The meter of the beat
    // and the meter of the metronome are separate settings on purpose: a beat
    // carries its own, and the time signature above it counts the click.
    name: 'Waltz',
    step: '16n',
    bar: 12,
    voices: {
      kick: 'X...........',
      snare: '....x...x...',
      hat: 'x.x.x.x.x.x.',
    },
  },
  {
    // A real triplet grid: three steps to the beat, twelve to the bar.
    name: 'Shuffle',
    step: '8t',
    bar: 12,
    voices: {
      kick: 'X.....X.....',
      snare: '...X.....X..',
      hat: 'x.xx.xx.xx.x',
    },
  },
  {
    // Reggae's one drop: nothing on beat one at all, which is the whole point
    // and the thing that makes it feel like it is falling forward.
    name: 'One Drop',
    step: '16n',
    bar: 16,
    voices: {
      kick: '........X.......',
      snare: '........X.......',
      rim: '....o.......o...',
      hat: '..x...x...x...x.',
    },
  },
  {
    name: 'Afrobeat',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X..x..X...x..x..',
      snare: '....o..x....o.x.',
      hat: 'xoxoxoxoxoxoxoxo',
      rim: '..o...o.....o...',
    },
  },
  {
    name: 'Funk Break',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X..x..x.....x...',
      snare: '....X..o.X..X..o',
      hat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    name: 'Two Step',
    step: '16n',
    bar: 16,
    swing: 0.22,
    voices: {
      kick: 'X.........x.....',
      snare: '....X......X....',
      hat: '..x.x.x.x.x.x.x.',
      shaker: 'oxoxoxoxoxoxoxox',
    },
  },
  {
    name: 'Techno',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X...X...X...X...',
      clap: '....o.......o...',
      hat: '..x...x...x...x.',
      shaker: 'xoxoxoxoxoxoxoxo',
    },
  },
  {
    name: 'Rock',
    step: '16n',
    bar: 16,
    voices: {
      kick: 'X.......x.......',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    /*
     * The ride carries it — spang-a-lang on a triplet grid, kick feathered
     * underneath rather than played, hat closing on the backbeat.
     *
     * The accents land on **two and four**, which is the whole character of a
     * jazz ride and not decoration: written flat it came out seven decibels
     * below every other beat here, so switching to it read as the machine
     * dropping out rather than as brushes.
     */
    name: 'Brush Jazz',
    step: '8t',
    bar: 12,
    voices: {
      ride: 'x..X.xx..X.x',
      kick: 'o.....o.....',
      hat: '...x.....x..',
      rim: '.........o..',
    },
  },
]

/** `01 Saint Germain` — numbered as the display numbers them. */
export const beatLabel = (index: number): string =>
  `${String(index + 1).padStart(2, '0')} ${BEATS[index]?.name ?? ''}`

/** Clamped, like every other list on the panel: the ends stop rather than wrap. */
export const beatAt = (index: number): Beat =>
  BEATS[Math.max(0, Math.min(BEATS.length - 1, index))]!

/**
 * How many steps before a pattern repeats.
 *
 * The longest voice, rounded up to a whole bar — a two-bar clave over a one-bar
 * kick makes the whole thing two bars long, and the shorter voices simply come
 * round twice.
 */
export function beatSteps(beat: Beat): number {
  const longest = Math.max(beat.bar, ...Object.values(beat.voices).map((s) => s.length))
  return Math.ceil(longest / beat.bar) * beat.bar
}

/** What sounds on a given step. Each voice reads its own string modulo its own length. */
export function hitsAt(beat: Beat, step: number): Hit[] {
  const hits: Hit[] = []
  for (const voice of DRUM_VOICES) {
    const pattern = beat.voices[voice]
    if (!pattern) continue
    const velocity = VELOCITY[pattern[((step % pattern.length) + pattern.length) % pattern.length]!]
    if (velocity !== undefined) hits.push({ voice, velocity })
  }
  return hits
}

/**
 * How far this step is pushed late, as a fraction of a step.
 *
 * Only the odd steps move, and only on a straight grid — swinging a triplet
 * pattern would be swinging something that already swings.
 */
export function swingOf(beat: Beat, step: number): number {
  if (!beat.swing || beat.step === '8t' || beat.step === '16t') return 0
  return step % 2 === 1 ? beat.swing : 0
}

// ---------------------------------------------------------------------------
// Time signatures
// ---------------------------------------------------------------------------

/**
 * What the click counts.
 *
 * > "Hold the BPM Dial for one second then scroll to select a time signature."
 * > — §11.2
 *
 * **Which** signatures is MANUAL SILENT — the manual never lists them. These
 * six are ours: the four that cover almost everything a songwriter writes, plus
 * two odd meters, because a chord instrument with no arranger is exactly the
 * place you would want to count seven.
 *
 * `quarters` is what the looper needs and `beats` is what the click needs, and
 * they are not the same number: six-eight is six clicks long and three quarter
 * notes long. Keeping both here is what stops a 6/8 loop coming out twice the
 * length it should be.
 */
export interface Meter {
  readonly label: string
  /** Clicks in a bar. */
  readonly beats: number
  /** What one click is worth. */
  readonly unit: '4n' | '8n'
  /** Quarter notes in a bar — the looper's unit. */
  readonly quarters: number
}

export const METERS: readonly Meter[] = [
  { label: '4/4', beats: 4, unit: '4n', quarters: 4 },
  { label: '3/4', beats: 3, unit: '4n', quarters: 3 },
  { label: '2/4', beats: 2, unit: '4n', quarters: 2 },
  { label: '6/8', beats: 6, unit: '8n', quarters: 3 },
  { label: '5/4', beats: 5, unit: '4n', quarters: 5 },
  { label: '7/8', beats: 7, unit: '8n', quarters: 3.5 },
]

export const meterAt = (index: number): Meter =>
  METERS[Math.max(0, Math.min(METERS.length - 1, index))]!

/**
 * The BPM dial's one list: signatures, then beats.
 *
 * A single index runs across both, because §11.4 describes it as one scroll —
 * you reach the beats by going *past* the signatures. `null` is the click.
 */
export const CLOCK_ROWS = METERS.length + BEATS.length

/** Where the cursor sits, given what is selected. */
export const clockRow = (meter: number, beat: number | null): number =>
  beat === null ? meter : METERS.length + beat

/** What a row selects: a signature (and so the click), or a beat. */
export function clockAt(row: number): { meter: number; beat: number | null } {
  const at = Math.max(0, Math.min(CLOCK_ROWS - 1, row))
  return at < METERS.length
    ? { meter: at, beat: null }
    : { meter: -1, beat: at - METERS.length }
}
