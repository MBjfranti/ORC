/**
 * The screen.
 *
 * Everything that used to be a wall of chips now lives here as pages. Pressing
 * an encoder brings up its page; the home page is what you see while playing.
 *
 * The rule for every page: show what you're changing and nothing else. The
 * panel's job is to stay quiet until you reach for something.
 */

import { memo, useLayoutEffect, useRef } from 'react'

import { BEATS } from '../core/beats.js'
import { BASS_MODES, BASS_MODE_LABEL } from '../core/bass.js'
import {
  sameTimeSignature,
  TIME_SIGNATURES,
  timeSignatureLabel,
} from '../core/timeSignature.js'
import { BASS_PRESETS } from '../engine/bassPresets.js'
import { barsLabel, LOOP_BARS } from '../core/looper.js'
import { performAmountLabel, PERFORM_LABEL, PERFORM_MODES } from '../core/performance.js'
import {
  EXTENSION_ADDITION_LABEL,
  PLAY_STYLE_LABEL,
  PLAY_STYLES,
  SECRET_CHORD_LABEL,
} from '../core/playStyle.js'
import { noteName } from '../core/spelling.js'
import { SINGLE_NOTES_LABEL } from '../core/split.js'
import { MODES, MODE_LABEL, MODE_SUFFIX } from '../core/types.js'
import type { PitchClass } from '../core/types.js'
import { FX_LABEL, FX_TYPES } from '../engine/SynthEngine.js'
import { PRESETS } from '../engine/presets.js'
import { freeSlot, soundAt, soundLabel, soundList } from '../engine/soundList.js'
import type { LoopSnapshot } from '../engine/LoopPlayer.js'
import type { ProgressionSnapshot } from '../engine/ProgressionPlayer.js'
import { MidiOut, STREAMS, STREAM_LABEL } from '../engine/midi.js'
import type { MidiPort } from '../engine/midi.js'
import { ROOT_LAYOUT_LABEL } from '../input/layout.js'
import { usePanel, VIEW_LABEL } from '../state/panel.js'
import type { LoopSlots } from '../state/storage.js'
import { DrumGrid } from './DrumGrid.js'
import { axisOf, dialAt } from './dials.js'
import { ScreenHome } from './ScreenHome.js'
import { ProgressionStrip } from './ProgressionStrip.js'

export type ScreenPage =
  | 'home'
  | 'sound'
  | 'perform'
  | 'fx'
  | 'key'
  | 'bass'
  | 'loop'
  | 'bpm'
  | 'options'
  /** Not a page — the one-line value readout shown while a dial turns. */
  | 'value'

export interface ScreenProps {
  page: ScreenPage
  chord: string
  /** The superscript half of the chord name, e.g. `M7` in `Cᴹ⁷`. */
  chordExt: string
  notes: string
  /** Sounding MIDI notes, for the keyboard and note-list views. */
  midiNotes: readonly number[]
  loop: LoopSnapshot
  prog: ProgressionSnapshot
  slots: LoopSlots
  slot: number
  playhead: number
  midi: MidiOut
  midiPorts: MidiPort[]
  midiPort: string
  onMidiPort: (id: string) => void
  onLoopAction: () => void
  onLoopUndo: () => void
  onLoopClear: () => void
  onLoopPause: () => void
  onSlot: (i: number) => void
  onSlotSave: () => void
  onSlotLoad: () => void
  onSlotDelete: () => void
  onExportLoop: () => void
  onProgToggle: () => void
  onExportProg: () => void
}

/**
 * The screen — the instrument's only information surface.
 *
 * Everything renders here, at a fixed size and place: the chord you're playing,
 * the value you're turning, and the deeper pages. Nothing floats over the
 * panel, because a web panel hovering above a photo of hardware is neither
 * physical nor diegetic — it just breaks the illusion.
 *
 * Three states, in increasing depth:
 *
 *   home      what you're playing
 *   glance    one line: the value you just turned. Fades back to home.
 *   page      the full section, opened by holding a dial. Scrolls internally,
 *             so the screen never changes size and the keys never move.
 */
export const Screen = memo(function Screen(props: ScreenProps) {
  const pinned = usePanel((st) => st.screenPinned)
  const goHome = usePanel((st) => st.goHome)
  const holdingDial = usePanel((st) => st.holdingDial)
  const open = pinned && props.page !== 'home'

  return (
    <div className="screen" data-page={props.page} data-open={open}>
      <LoopRing loop={props.loop} />
      {holdingDial !== null && <HoldRing index={holdingDial} />}
      {open ? (
        <>
          <div className="scr-bar">
            <span>{TITLE[props.page]}</span>
            <button onClick={goHome} aria-label="Close">
              esc
            </button>
          </div>
          <div className="scr-body">
            <Page {...props} />
          </div>
        </>
      ) : props.page === 'home' ? (
        <Home {...props} />
      ) : (
        <Headline />
      )}
    </div>
  )
})

/**
 * The loop's position, drawn around the edge of the display.
 *
 * "The Ring Progress Indicator around the edge of the display shows your
 * current position in the loop, making it easier to time new recordings"
 * (§12.6). The snapshot has carried a `position` for the ring since the
 * looper was written; nothing ever drew it.
 *
 * A rectangle rather than a circle, because it traces the screen's border.
 * Stroked via `pathLength`, so the dash maths is in percent and does not care
 * about the element's real dimensions.
 */
function LoopRing({ loop }: { loop: LoopSnapshot }) {
  if (loop.state === 'empty' || loop.lengthSeconds <= 0) return null
  const recording = loop.state === 'recording' || loop.state === 'overdubbing'
  const paused = loop.state === 'paused'

  return (
    <svg className="scr-loop-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <rect
        /* Remounts when the pass length or the state changes, which is what
           restarts the animation in step with the loop. */
        key={`${loop.state}:${loop.lengthSeconds}`}
        x="0.6"
        y="0.6"
        width="98.8"
        height="98.8"
        pathLength={100}
        data-recording={recording}
        data-paused={paused}
        style={{ animationDuration: `${loop.lengthSeconds}s` }}
      />
    </svg>
  )
}

/**
 * The press-and-hold ring.
 *
 * A press cannot act on the way down — it has to wait to learn whether it is
 * a hold — so this is the only thing telling you the wait is deliberate. It
 * lives on the screen rather than around the knob it belongs to: the knobs
 * are already circles, and a ring drawn on one reads as part of the knob
 * rather than as progress.
 *
 * The fill is a CSS animation timed to match the hold timer, so no state
 * changes per frame; the whole gesture costs two renders.
 */
function HoldRing({ index }: { index: number }) {
  const dial = dialAt(index)
  return (
    <div className="scr-hold" aria-hidden>
      <svg viewBox="0 0 44 44" focusable="false">
        <circle className="scr-hold-track" cx="22" cy="22" r="19" pathLength={100} />
        <circle className="scr-hold-fill" cx="22" cy="22" r="19" pathLength={100} />
      </svg>
      <span>{dial.label}</span>
    </div>
  )
}

/**
 * The playing display.
 *
 * A persistent status rail plus whichever View mode is selected. The manual is
 * explicit that Key Mode's key stays on screen — "your selected key will
 * display on the screen, and an LED will show next to the Key encoder" — so
 * on/off lives on the LEDs and the value lives here.
 */
function Home(p: ScreenProps) {
  const s = usePanel()
  return (
    <div className="pg-play">
      {/* Inverted, as on the device: a white bar with black text across the
          top. Key on the left, transposition on the right. */}
      <div className="pg-rail">
        <span className="rail-key">
          {s.keyMode ? `Key: ${noteName(s.key.tonic, s.key)}${MODE_SUFFIX[s.key.tonality]}` : ''}
        </span>
        <span className="rail-right">
          {s.transpose !== 0 && (
            <span className="rail-transpose">
              {s.transpose > 0 ? '+' : '−'}
              {String(Math.abs(s.transpose)).padStart(2, '0')}
            </span>
          )}
          {(p.loop.state === 'recording' || p.loop.state === 'overdubbing') && (
            <span className="rail-rec">Rec</span>
          )}
          {p.loop.state === 'counting' && <span className="rail-flag">…</span>}
          {s.performMode !== 'off' && <span className="rail-flag">▸</span>}
          {s.latched && <span className="rail-flag">L</span>}
        </span>
      </div>
      <ScreenHome chord={p.chord} chordExt={p.chordExt} notes={p.midiNotes} />
    </div>
  )
}

/**
 * One line: what you're turning, and where it now sits.
 *
 * Driven by the *axis*, not the page — that is what the hardware shows: "the
 * display will change to show 'Bass Volume' or 'Beat Volume' with its current
 * level (0-99)". The per-page table this replaced could not express that. It
 * had no idea which of a dial's two axes your hand was on, so press-turning
 * FX for the filter displayed the reverb amount; and dials with no page at
 * all — Volume, Bass Voicing — changed in total silence.
 */
function Headline() {
  const s = usePanel()
  const dial = dialAt(s.dialFocus)
  const axis = axisOf(dial, s.dialAxis)

  return (
    <div className="pg-headline">
      <span className="hl-value">{axis.readout(s)}</span>
      <span className="hl-title">{axis.label}</span>
    </div>
  )
}

const TITLE: Record<ScreenPage, string> = {
  home: '',
  sound: 'Sound',
  perform: 'Perform',
  fx: 'FX',
  key: 'Key',
  bass: 'Bass',
  loop: 'Loop',
  bpm: 'Tempo & Beat',
  options: 'Options',
  value: '',
}

function Page(p: ScreenProps) {
  const s = usePanel()

  switch (p.page) {
    case 'home':
    // 'value' is a glance, never pinned, so it has no page body of its own.
    case 'value':
      return <Home {...p} />

    /*
     * The Sound page is the encoder's press-and-hold menu: the whole list,
     * factory sounds then user sounds, plus "Save as a User Sound".
     *
     * A user sound is a snapshot of the entire chain — patch, filter, FX and
     * performance setting — not a synthesis patch, which is why saving is
     * offered here rather than in some editor. Marked with ∗ in the list.
     */
    case 'sound':
      return (
        <>
          <div className="pg-actions">
            <button onClick={() => s.saveUserSound()} disabled={freeSlot(s.userSounds) < 0}>
              Save as a User Sound
            </button>
          </div>
          <List
            items={soundList(s.userSounds).map((entry) => ({
              key: entry.index,
              label: soundLabel(entry) + (entry.user ? '  ∗' : ''),
              selected: entry.index === s.soundIndex,
              onSelect: () => s.selectSound(entry.index),
            }))}
          />
        </>
      )

    case 'perform':
      return (
        <>
          <List
            items={PERFORM_MODES.map((m) => ({
              key: m,
              label: PERFORM_LABEL[m],
              selected: m === s.performMode,
              onSelect: () => usePanel.setState({ performMode: m }),
            }))}
          />
          <Row label="Amount" value={performAmountLabel(s.performMode, s.performAmount) || '—'} />
          <Row
            label="Lock"
            value={s.performLock ? 'On' : 'Off'}
            onClick={() => s.togglePerformLock()}
          />
        </>
      )

    case 'fx':
      return (
        <>
          <Row label="FX Lock" value={s.fxLock ? 'On' : 'Off'} onClick={() => s.toggleFxLock()} />
          <Meter label="Filter" value={s.cutoff} centred />
          <List
            items={FX_TYPES.map((t) => ({
              key: t,
              label: FX_LABEL[t],
              value: scrUnit(s.fxAmounts[t] ?? 0),
              selected: t === s.fxType,
              onSelect: () => usePanel.setState({ fxType: t }),
            }))}
          />
        </>
      )

    case 'key':
      return (
        <>
          <Row label="Key Mode" value={s.keyMode ? 'On' : 'Off'} onClick={() => s.toggleKeyMode()} />
          <Row
            label="Tonic"
            value={noteName(s.key.tonic, s.key)}
            onClick={() => s.cycleKey(1)}
          />
          <List
            items={MODES.map((m) => ({
              key: m,
              label: MODE_LABEL[m],
              selected: m === s.key.tonality,
              onSelect: () => usePanel.setState({ key: { ...s.key, tonality: m }, latched: false }),
            }))}
          />
          <Row
            label="Roots"
            value={ROOT_LAYOUT_LABEL[s.rootLayout]}
            onClick={() => s.cycleRootLayout(1)}
          />
        </>
      )

    case 'bass':
      return (
        <>
          <Row label="Bass" value={s.bassOn ? 'On' : 'Off'} onClick={() => s.toggleBass()} />
          <Section>Bass plays</Section>
          <List
            items={BASS_MODES.map((m) => ({
              key: m,
              label: BASS_MODE_LABEL[m],
              selected: m === s.bassMode,
              onSelect: () => usePanel.setState({ bassMode: m }),
            }))}
          />
          <Section>Sound</Section>
          <List
            items={BASS_PRESETS.map((p, i) => ({
              key: p.id,
              label: `${String(p.id).padStart(2, '0')}  ${p.name}`,
              selected: i === s.bassPresetIndex,
              onSelect: () => usePanel.setState({ bassPresetIndex: i }),
            }))}
          />
          <Row label="Voicing" value={String(s.bassVoicing)} />
        </>
      )

    case 'loop':
      return (
        <>
          {/* "Push or turn the Loop Dial to access the Loop Mode Waiting
              Room. Choose your preferred looping method." That staging state
              is exactly an empty loop page, so it says so. */}
          {p.loop.state === 'empty' && (
            <>
              <Section>Waiting Room</Section>
              <div className="pg-beats">
                {LOOP_BARS.map((b) => (
                  <button
                    key={String(b)}
                    data-sel={b === s.loopBars}
                    onClick={() => usePanel.setState({ loopBars: b })}
                  >
                    {b === null ? 'Free' : `${b}`}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="pg-actions">
            <button data-on={p.loop.state !== 'empty'} onClick={p.onLoopAction}>
              {LOOP_LABEL[p.loop.state]}
            </button>
            <button
              onClick={p.onLoopPause}
              disabled={p.loop.state !== 'playing' && p.loop.state !== 'paused'}
            >
              {p.loop.state === 'paused' ? 'Play' : 'Pause'}
            </button>
            <button onClick={p.onLoopUndo} disabled={p.loop.layers === 0}>
              Undo
            </button>
            <button onClick={p.onLoopClear} disabled={p.loop.state === 'empty'}>
              Clear
            </button>
            {s.extended && (
              <button onClick={p.onExportLoop} disabled={p.loop.layers === 0}>
                Export
              </button>
            )}
          </div>
          <Row label="Length" value={barsLabel(s.loopBars)} onClick={() => s.cycleLoopBars(1)} />
          <Row label="Layers" value={String(p.loop.layers)} />
          <div className="pg-slots">
            {p.slots.map((x, i) => (
              <button key={i} data-on={x !== null} data-sel={i === p.slot} onClick={() => p.onSlot(i)}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="pg-actions">
            <button onClick={p.onSlotSave} disabled={p.loop.layers === 0}>
              Save
            </button>
            <button onClick={p.onSlotLoad} disabled={!p.slots[p.slot]}>
              Load
            </button>
            <button onClick={p.onSlotDelete} disabled={!p.slots[p.slot]}>
              Delete
            </button>
            {/* "Select Exit" — §12.2's way out of Loop Mode, which leaves the
                loop in memory rather than clearing it. */}
            <button onClick={() => s.goHome()}>Exit</button>
          </div>
          {s.extended && (
            <ProgressionStrip view={p.prog} onToggle={p.onProgToggle} onExport={p.onExportProg} />
          )}
        </>
      )

    case 'bpm':
      return (
        <>
          <Row label="Tempo" value={`${s.bpm} bpm`} />
          <Row
            label="Metronome"
            value={s.metronomeOn ? 'On' : 'Off'}
            onClick={() => s.toggleMetronome()}
          />

          {/* "Hold the BPM Dial then scroll to select a time signature", and
              "scroll past the time signatures to access Beats" — one list. */}
          <Section>Time Signature</Section>
          <div className="pg-beats">
            {TIME_SIGNATURES.map((ts) => (
              <button
                key={timeSignatureLabel(ts)}
                data-sel={sameTimeSignature(ts, s.timeSignature)}
                onClick={() => s.setTimeSignature(ts)}
              >
                {timeSignatureLabel(ts)}
              </button>
            ))}
          </div>

          <Section>Beats</Section>
          <Row label="Beat" value={s.beatOn ? s.beat.name : 'Off'} onClick={() => s.toggleBeat()} />
          <div className="pg-beats">
            {BEATS.map((x, i) => (
              <button key={x.id} data-sel={i === s.beatIndex} onClick={() => s.selectBeat(i)}>
                {x.name}
              </button>
            ))}
          </div>
          <DrumGrid
            beat={s.beat}
            playhead={p.playhead}
            running={s.beatOn}
            onToggle={s.extended ? (v, step) => s.toggleBeatHit(v, step) : undefined}
          />
          {s.extended && (
            <div className="pg-actions">
              <button onClick={() => s.clearBeat()}>Clear</button>
              <button onClick={() => s.resetBeat()}>Reset</button>
            </div>
          )}
        </>
      )

    /*
     * The Options page follows the firmware's own menu tree — System,
     * Instrument, Bass, Audio and MIDI — so anyone who knows the hardware
     * finds a setting where they expect it. Items the real menu does not
     * have are grouped last, under their own heading, rather than mixed in.
     *
     * See research/02-hardware-panel-and-controls.md §Options menu tree.
     */
    case 'options':
      return (
        <>
          <Section>System</Section>
          <Row label="View" value={VIEW_LABEL[s.view]} onClick={() => s.cycleView(1)} />

          <Section>Instrument</Section>
          <Row
            label="Play Style"
            value={PLAY_STYLE_LABEL[s.playStyle]}
            onClick={() => s.cyclePlayStyle(1)}
          />
          <Row
            label="Secret Chords"
            value={SECRET_CHORD_LABEL[s.secretChords]}
            onClick={() => s.cycleSecretChords(1)}
          />
          <Row
            label="Single Notes"
            value={SINGLE_NOTES_LABEL[s.singleNotes]}
            onClick={() => s.toggleSingleNotes()}
          />
          {s.singleNotes === 'split' && (
            <Row
              label="Split point"
              value={noteName(s.splitPoint, s.key)}
              onClick={() => s.setSplitPoint((((s.splitPoint + 1) % 12) + 12) % 12 as PitchClass)}
            />
          )}
          <Row
            label="Extension Addition"
            value={EXTENSION_ADDITION_LABEL[s.extensionAddition]}
            onClick={() => s.toggleExtensionAddition()}
          />
          <Row label="Quantization" value={s.quantize} onClick={() => s.cycleQuantize(1)} />
          <Row
            label="Velocity Sense"
            value={s.velocitySense ? 'On' : 'Off'}
            onClick={() => s.toggleVelocitySense()}
          />

          <Section>Bass</Section>
          <Row
            label="Bass plays"
            value={BASS_MODE_LABEL[s.bassMode]}
            onClick={() => s.cycleBassMode(1)}
          />

          <Section>This build</Section>
          <Row label="Key legends" value={s.tier} onClick={() => s.cycleTier()} />
          <Row
            label="Extended"
            value={s.extended ? 'On' : 'Off'}
            onClick={() => s.toggleExtended()}
          />

          <Section>Audio and MIDI</Section>
          <Row
            label="Master Volume"
            value={dbUnit(s.masterVolume)}
            onClick={() => s.setMasterVolume(s.masterVolume + 1)}
          />
          <Row
            label="Bass Volume"
            value={dbUnit(s.bassVolume)}
            onClick={() => s.setBassVolume(s.bassVolume + 1)}
          />
          <Row
            label="Drum Volume"
            value={dbUnit(s.drumVolume)}
            onClick={() => s.setDrumVolume(s.drumVolume + 1)}
          />
          <Row
            label="Metronome Click"
            value={s.metronome === 'beep' ? 'Beep' : 'Hi Hat'}
            onClick={() => s.cycleMetronome()}
          />
          <div className="pg-midi">
            <label>
              MIDI Out
              <select value={p.midiPort} onChange={(e) => p.onMidiPort(e.target.value)}>
                <option value="">
                  {!MidiOut.supported ? 'Unsupported' : p.midiPorts.length ? 'None' : 'No devices'}
                </option>
                {p.midiPorts.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            {STREAMS.map((stream) => (
              <label key={stream}>
                {STREAM_LABEL[stream]}
                <select
                  value={String(p.midi.getChannel(stream) ?? '')}
                  onChange={(e) =>
                    p.midi.setChannel(stream, e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Off</option>
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )
  }
}

const LOOP_LABEL: Record<LoopSnapshot['state'], string> = {
  empty: '● Record',
  counting: 'Count-in…',
  recording: '● Recording',
  playing: '+ Overdub',
  paused: '▶ Play',
  overdubbing: '■ Stop',
}

// --- small screen primitives ----------------------------------------------

/**
 * 0-99, the only numeric scale the panel uses. No percentages, no decibels —
 * the manual quotes volumes as "0-99" and nothing on the device says "dB".
 */
function scrUnit(n: number): string {
  return String(Math.round(Math.max(0, Math.min(1, n)) * 99)).padStart(2, '0')
}

function dbUnit(db: number): string {
  return scrUnit((db + 40) / 46)
}

/** A menu heading, mirroring the firmware's own grouping. */
function Section({ children }: { children: string }) {
  return <h4 className="scr-section">{children}</h4>
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div className="scr-row">
      <span>{label}</span>
      {onClick ? <button onClick={onClick}>{value}</button> : <em>{value}</em>}
    </div>
  )
}

/**
 * A list on a display four rows tall.
 *
 * The selection has to drag the viewport with it. Turning the encoder past
 * the last visible row otherwise moves a cursor you cannot see — you are
 * changing the sound, or the beat, with no idea which one you are on.
 *
 * The scroll is computed against the scrolling ancestor rather than using
 * `scrollIntoView`, which is free to scroll the *page* as well and would drag
 * the whole instrument around inside the browser window.
 */
function List({
  items,
}: {
  items: Array<{ key: string | number; label: string; value?: string; selected: boolean; onSelect: () => void }>
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  const selected = items.findIndex((i) => i.selected)

  useLayoutEffect(() => {
    const row = selectedRef.current
    const view = row?.closest('.scr-body')
    if (!row || !(view instanceof HTMLElement)) return

    // Offsets within the scroller, not viewport coordinates — the panel is
    // transformed and scaled, so getBoundingClientRect would be in the wrong
    // space the moment the window is resized.
    const top = row.offsetTop - view.offsetTop
    const bottom = top + row.offsetHeight

    if (top < view.scrollTop) {
      view.scrollTop = top
    } else if (bottom > view.scrollTop + view.clientHeight) {
      view.scrollTop = bottom - view.clientHeight
    }
  }, [selected])

  return (
    <div className="scr-list">
      {items.map((i) => (
        <button
          key={i.key}
          ref={i.selected ? selectedRef : undefined}
          data-sel={i.selected}
          onClick={i.onSelect}
        >
          <span>{i.label}</span>
          {i.value && <em>{i.value}</em>}
        </button>
      ))}
    </div>
  )
}

function Meter({ label, value, centred }: { label: string; value: number; centred?: boolean }) {
  return (
    <div className="scr-meter">
      <span>{label}</span>
      <div className="scr-bar">
        <i style={{ width: `${Math.round(value * 100)}%` }} data-centred={centred} />
      </div>
      <em>{centred ? `${Math.round((value - 0.5) * 99)}` : scrUnit(value)}</em>
    </div>
  )
}
