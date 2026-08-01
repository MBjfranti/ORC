/**
 * The two browse orders.
 *
 * The point of these tests is that turning and press-turning must genuinely
 * *disagree* about what comes next — before this module they walked the same
 * numeric sequence and only the readout differed, which looked correct in a
 * screenshot and was wrong in the hand.
 */

import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { FX_TYPES } from './SynthEngine.js'
import { PRESETS } from './presets.js'
import { autoName, freeSlot, nameOrder, soundList, stepSound } from './soundList.js'
import { emptyUserSounds } from './userSounds.js'
import type { UserSound, UserSounds } from './userSounds.js'

const sound = (name: string): UserSound => ({
  name,
  presetIndex: 0,
  cutoff: 0.5,
  fx: Object.fromEntries(FX_TYPES.map((t) => [t, 0])) as UserSound['fx'],
  performMode: 'off',
  performAmount: 0.5,
})

function withUsers(...names: string[]): UserSounds {
  const list = emptyUserSounds()
  names.forEach((n, i) => (list[i] = sound(n)))
  return list
}

describe('the sound list', () => {
  test('factory sounds come first, in catalogue order', () => {
    const list = soundList(emptyUserSounds())
    expect(list).toHaveLength(PRESETS.length)
    expect(list.map((e) => e.number)).toEqual(PRESETS.map((p) => p.id))
    expect(list.every((e) => !e.user)).toBe(true)
  })

  test('user sounds continue the numbering after them', () => {
    const list = soundList(withUsers('Aardvark', 'Zebra'))
    expect(list).toHaveLength(PRESETS.length + 2)
    expect(list.slice(-2).map((e) => e.name)).toEqual(['Aardvark', 'Zebra'])
    expect(list.slice(-2).every((e) => e.user)).toBe(true)
    // Continuing rather than restarting at 01 is what makes it one list you
    // keep turning into, rather than a separate bank.
    expect(list.at(-2)!.number).toBe(PRESETS.length + 1)
  })

  test('empty slots leave no gaps', () => {
    const list = emptyUserSounds()
    list[7] = sound('Lonely')
    const entries = soundList(list)
    expect(entries).toHaveLength(PRESETS.length + 1)
    expect(entries.at(-1)!.slot).toBe(7)
  })
})

describe('name order', () => {
  test('sorts alphabetically, ignoring case', () => {
    const names = nameOrder(soundList(withUsers('aardvark', 'Zebra'))).map((e) => e.name)
    expect(names[0]!.toLowerCase()).toBe('aardvark')
    expect(names.at(-1)).toBe('Zebra')
  })

  /* Plain string sort puts "Trout 10" before "Trout 2", which reads as a bug
     the first time you scroll past it. */
  test('orders embedded numbers numerically', () => {
    const list = soundList(withUsers('Trout 10', 'Trout 2'))
    const users = nameOrder(list).filter((e) => e.user).map((e) => e.name)
    expect(users).toEqual(['Trout 2', 'Trout 10'])
  })

  test('is a total order — no entry is lost or duplicated', () => {
    const list = soundList(withUsers('Same', 'Same'))
    const sorted = nameOrder(list)
    expect(sorted).toHaveLength(list.length)
    expect(new Set(sorted.map((e) => e.index)).size).toBe(list.length)
  })
})

describe('stepping', () => {
  test('by number moves one place through the catalogue', () => {
    const list = soundList(emptyUserSounds())
    expect(stepSound(list, 3, 1, 'number')).toBe(4)
    expect(stepSound(list, 3, -1, 'number')).toBe(2)
  })

  /**
   * The behaviour that did not exist before. Walking by name from a given
   * sound must land on its alphabetical neighbour, which is only the same as
   * its numeric neighbour by coincidence.
   */
  test('by name moves to the alphabetical neighbour', () => {
    const list = soundList(emptyUserSounds())
    const alpha = nameOrder(list)
    const third = alpha[2]!
    expect(stepSound(list, third.index, 1, 'name')).toBe(alpha[3]!.index)
    expect(stepSound(list, third.index, -1, 'name')).toBe(alpha[1]!.index)
  })

  test('the two orders genuinely disagree', () => {
    const list = soundList(emptyUserSounds())
    const byNumber: number[] = []
    const byName: number[] = []
    let a = 0
    let b = 0
    for (let i = 0; i < 5; i++) {
      a = stepSound(list, a, 1, 'number')
      b = stepSound(list, b, 1, 'name')
      byNumber.push(a)
      byName.push(b)
    }
    expect(byNumber).not.toEqual(byName)
  })

  test('reaches user sounds by turning', () => {
    const list = soundList(withUsers('Mine'))
    let at = 0
    for (let i = 0; i < list.length; i++) at = stepSound(list, at, 1, 'number')
    expect(list[at]!.user).toBe(true)
  })

  test('clamps at both ends rather than wrapping', () => {
    const list = soundList(emptyUserSounds())
    expect(stepSound(list, 0, -5, 'number')).toBe(0)
    expect(stepSound(list, list.length - 1, 5, 'number')).toBe(list.length - 1)
    // Far enough to clamp from anywhere in the alphabetical order.
    expect(stepSound(list, 0, -99, 'name')).toBe(nameOrder(list)[0]!.index)
    expect(stepSound(list, 0, 99, 'name')).toBe(nameOrder(list).at(-1)!.index)
  })

  test('an index no longer in the list does not throw', () => {
    const list = soundList(emptyUserSounds())
    expect(() => stepSound(list, 999, 1, 'number')).not.toThrow()
    expect(stepSound(list, 999, 0, 'number')).toBe(list[0]!.index)
  })

  test('every step lands on a real entry, in either order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 6 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: -8, max: 8 }),
        fc.constantFrom<'number' | 'name'>('number', 'name'),
        (names, from, delta, order) => {
          const list = soundList(withUsers(...names))
          const at = stepSound(list, from, delta, order)
          expect(list.some((e) => e.index === at)).toBe(true)
        },
      ),
    )
  })
})

describe('saving', () => {
  test('finds the first free slot, and reports when full', () => {
    expect(freeSlot(emptyUserSounds())).toBe(0)
    expect(freeSlot(withUsers('a', 'b'))).toBe(2)
    expect(freeSlot(emptyUserSounds().map(() => sound('x')))).toBe(-1)
  })

  test('names a saved sound after where it came from', () => {
    expect(autoName(emptyUserSounds(), 'Trout')).toBe('Trout 2')
  })

  test('does not produce two identical names', () => {
    expect(autoName(withUsers('Trout 2'), 'Trout')).toBe('Trout 3')
    expect(autoName(withUsers('Trout 2', 'Trout 3'), 'Trout')).toBe('Trout 4')
  })
})
