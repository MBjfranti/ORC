import { beforeEach, describe, expect, test, vi } from 'vitest'

import { clearAll, loadLoops, loadSettings, LOOP_SLOTS, saveLoops, saveSettings } from './storage.js'
import type { PersistedSettings } from './storage.js'
import { emptyLoop, withLayer } from '../core/looper.js'

/** Minimal in-memory localStorage, since these tests run in node. */
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  get raw() {
    return this.map
  }
}

const install = (storage: unknown) => {
  vi.stubGlobal('window', { localStorage: storage })
}

const settings = (): PersistedSettings => ({
  presetIndex: 3,
  soundIndex: 3,
  masterVolume: -9,
  bassVolume: 2,
  drumVolume: -4,
  voicing: -2,
  octave: 5,
  bpm: 124,
  performMode: 'arp',
  performAmount: 0.75,
  bassOn: true,
  bassMode: 'solo',
  bassVoicing: 1,
  bassPresetIndex: 2,
  singleNotes: 'split',
  splitPoint: 7,
  keyMode: true,
  keyTonic: 7,
  keyMode_: 'dorian',
  rootLayout: 'scale',
  tier: 'numeral',
  loopBars: 8,
  quantize: '1/16',
  beatOn: true,
  beatIndex: 4,
  playStyle: 'advanced',
  extensionAddition: 'chord',
  secretChords: 'all',
  extended: true,
  performLock: true,
  fxLock: false,
  transpose: -2,
  velocitySense: false,
  metronome: 'hat',
  timeSignature: '3/4',
  view: 'geek',
  midiChannels: { performance: 1, bass: 2, chord: null },
  midiPort: 'port-a',
})

describe('settings', () => {
  beforeEach(() => install(new MemoryStorage()))

  test('round-trip', () => {
    expect(saveSettings(settings())).toBe(true)
    expect(loadSettings()).toEqual(settings())
  })

  test('nothing stored yields nothing, not a crash', () => {
    expect(loadSettings()).toEqual({})
  })

  test('a free-length loop persists as null bars', () => {
    saveSettings({ ...settings(), loopBars: null })
    expect(loadSettings().loopBars).toBeNull()
  })
})

describe('resilience', () => {
  test('storage being unavailable is survivable', () => {
    install({
      get localStorage() {
        throw new Error('disabled')
      },
    })
    expect(() => loadSettings()).not.toThrow()
    expect(loadSettings()).toEqual({})
    expect(saveSettings(settings())).toBe(false)
    expect(loadLoops()).toHaveLength(LOOP_SLOTS)
  })

  test('a full quota is reported, not thrown', () => {
    install({
      localStorage: {
        getItem: () => null,
        setItem: (k: string) => {
          if (!k.endsWith('probe')) throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
      },
    })
    expect(saveSettings(settings())).toBe(false)
  })

  test('corrupt JSON is ignored', () => {
    const store = new MemoryStorage()
    install(store)
    store.setItem('orc1.settings', '{not json')
    expect(loadSettings()).toEqual({})
  })

  test('data from a different version is discarded', () => {
    const store = new MemoryStorage()
    install(store)
    store.setItem('orc1.settings', JSON.stringify({ version: 999, data: settings() }))
    expect(loadSettings()).toEqual({})
  })

  test('fields of the wrong type are dropped, valid ones kept', () => {
    const store = new MemoryStorage()
    install(store)
    store.setItem(
      'orc1.settings',
      JSON.stringify({ version: 1, data: { bpm: 'fast', octave: 4, tier: 'chord' } }),
    )
    const loaded = loadSettings()
    expect(loaded.bpm).toBeUndefined()
    expect(loaded.octave).toBe(4)
    expect(loaded.tier).toBe('chord')
  })
})

describe('loop slots', () => {
  beforeEach(() => install(new MemoryStorage()))

  test('always returns exactly the slot count', () => {
    expect(loadLoops()).toHaveLength(LOOP_SLOTS)
    expect(loadLoops().every((s) => s === null)).toBe(true)
  })

  test('round-trips a loop', () => {
    const loop = withLayer(emptyLoop(4, 2), [
      { time: 0, note: 60, velocity: 0.8, duration: 0.5, stream: 'performance' },
    ])
    const slots = loadLoops()
    slots[3] = loop
    expect(saveLoops(slots)).toBe(true)
    expect(loadLoops()[3]).toEqual(loop)
    expect(loadLoops()[0]).toBeNull()
  })

  test('a malformed loop reads back as an empty slot', () => {
    // Better an empty slot than something that throws in the scheduler.
    const store = new MemoryStorage()
    install(store)
    store.setItem(
      'orc1.loops',
      JSON.stringify({
        version: 1,
        data: [{ lengthSeconds: 4, bars: 2, layers: [{ events: [{ note: 'C' }] }] }],
      }),
    )
    expect(loadLoops()[0]).toBeNull()
  })

  test('a loop with no length is rejected', () => {
    const store = new MemoryStorage()
    install(store)
    store.setItem(
      'orc1.loops',
      JSON.stringify({ version: 1, data: [{ lengthSeconds: 0, bars: 1, layers: [] }] }),
    )
    expect(loadLoops()[0]).toBeNull()
  })

  test('clearAll empties both keys', () => {
    const store = new MemoryStorage()
    install(store)
    saveSettings(settings())
    saveLoops(loadLoops())
    clearAll()
    expect(store.raw.size).toBe(0)
  })
})
