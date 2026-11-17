import { describe, expect, it } from 'vitest'
import { byDay, chronicleTarget, inFilter, peopleCounts, readChronicle, readHeadline } from './chronicle'
import { DAY_TICKS } from './calendar'
import type { OrganismState } from '../../shared/types'

const kind = (text: string) => readHeadline({ tick: 1, text })

describe('readHeadline', () => {
  it.each([
    ['⚔️ The Gelup conquered 12 tiles of Dozo land.', 'war', 'Gelup'],
    ['🤝 Tare and Towep forged an alliance.', 'peace', 'Tare'],
    ['👑 Huwo of the Gelup seized power in a coup.', 'rule', 'Huwo'],
    ['✊ the poor of Dozo rose up and shared out the wealth of Ada.', 'uprising', 'Dozo'],
    ['🏛️ The Gelup completed a temple — a wonder of their age.', 'wonder', 'Gelup'],
    ['🔥 A house of the Dozo fell to fire.', 'ruin', 'Dozo'],
    ['🌥️ A drought grips the land — water retreats and crops wither.', 'drought', undefined],
    ['❄️ A hard winter has come.', 'winter', undefined],
    ['🤒 Pox spreads among the Gelup.', 'plague', 'Gelup'],
    ['⚠️ The Dozo are dwindling: only 3 remain, and hunger.', 'peril', 'Dozo'],
    ['💀 The Lafew dynasty has died out, after rising to 30 strong.', 'fall', 'Lafew'],
    ['🏕️ The last 3 of the Zavsopbo were taken in by the Zefbam.', 'fall', 'Zefbam'],
    ['🏕️ The last of the Ashfolk was taken in by the Lupif.', 'fall', 'Lupif'],
    ['🧬 The 5th generation of Vuto is born', 'generation', 'Vuto'],
    ['the Gelup held a Sun Feast — drums, dancing, every belly full', 'festival', 'Gelup'],
    ['a solar eclipse stunned the people: dark at noon', 'sky', undefined],
  ])('reads %s as a world turn', (text, k, actor) => {
    const entry = kind(text)!
    expect(entry.scope).toBe('world')
    expect(entry.kind).toBe(k)
    expect(entry.actor).toBe(actor)
    expect(entry.text).not.toMatch(/^[^\p{L}]/u)
  })

  it.each([
    ['Moki became an elder, carrying: "a song"', 'elder'],
    ['Witi is gone. What they carried: "a song"', 'death'],
    ['Jale and Moven pledged themselves to each other', 'bond'],
    ['💔 Pazabe and Mitihih parted ways.', 'parting'],
    ['⚖️ Ada of Gelup was caught stealing from Bo: fined.', 'crime'],
    ['🗡️ Ada killed Bo of Gelup to get away with the goods.', 'murder'],
  ])('reads %s as a personal moment', (text, k) => {
    expect(kind(text)).toMatchObject({ scope: 'person', kind: k })
  })

  it('drops the moon, the turning seasons and the new year', () => {
    expect(kind('the moon stood full and bright')).toBeNull()
    expect(kind('frost takes the land — winter is here')).toBeNull()
    expect(kind('📅 Year 3 begins.')).toBeNull()
  })

  it('turns a world milestone into a sentence and keeps its id for nerds', () => {
    expect(kind('first_fire: the first flame is tamed')).toMatchObject({
      kind: 'era',
      text: 'The first flame is tamed',
      raw: 'first_fire',
    })
  })
})

describe('readChronicle', () => {
  it('splits world turns from lives, newest first, and groups them by day', () => {
    const { history, lives } = readChronicle(
      [{ tick: 3, org_name: 'Gelup', lineage_id: 'l1', story: 'Gelup built a granary' }],
      [
        { tick: DAY_TICKS + 1, text: '🤝 Tare and Towep forged an alliance.' },
        { tick: 2, text: 'Moki became an elder among the people' },
        { tick: 1, text: '⚔️ The Gelup conquered 3 tiles of Dozo land.' },
      ],
    )
    expect(history.map((e) => e.kind)).toEqual(['peace', 'war'])
    expect(lives.map((e) => e.kind)).toEqual(['deed', 'elder'])
    expect(lives[0]).toMatchObject({ lead: 'Gelup', text: 'built a granary' })
    expect(byDay(history).map((d) => d.entries.length)).toEqual([1, 1])
    expect(peopleCounts(lives)).toEqual({ deed: 1, elder: 1 })
  })
})

describe('feasts', () => {
  const feast = (tribe: string, tick = 5) => ({
    tick,
    text: `the ${tribe} held a Long-Night Vigil — huddled close, sharing the last stores`,
  })

  it('folds the same feast held by many tribes on one day into one line', () => {
    const { history } = readChronicle(
      [],
      ['Kefag', 'Kate', 'Tizito', 'Wumut', 'Nagor'].map((t) => feast(t)),
    )
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      lead: 'Kefag, Kate, Tizito +2',
      text: 'held a Long-Night Vigil — huddled close, sharing the last stores',
      actor: undefined,
    })
  })

  it('keeps a lone feast as it was, and feasts on other days apart', () => {
    const { history } = readChronicle([], [feast('Kefag'), feast('Kate', 5 + DAY_TICKS)])
    expect(history.map((e) => e.text)).toEqual([
      'The Kate held a Long-Night Vigil — huddled close, sharing the last stores',
      'The Kefag held a Long-Night Vigil — huddled close, sharing the last stores',
    ])
    expect(history[0]!.actor).toBe('Kate')
  })
})

describe('leads', () => {
  it('names the person a personal line is about', () => {
    expect(kind('Witi is gone. What they carried: "a song"')).toMatchObject({
      lead: 'Witi',
      text: 'is gone. What they carried: "a song"',
    })
  })
})

describe('inFilter', () => {
  it('sorts kinds into the chips', () => {
    expect(inFilter('war', 'wars')).toBe(true)
    expect(inFilter('war', 'wonders')).toBe(false)
    expect(inFilter('plague', 'disasters')).toBe(true)
    expect(inFilter('generation', 'people')).toBe(true)
    expect(inFilter('sky', 'all')).toBe(true)
  })
})

describe('chronicleTarget', () => {
  const world = {
    lineage_names: { l1: 'Gelup' },
    settlements: [
      {
        lineage_id: 'l1',
        name: 'Oakfold',
        tier: 1,
        tier_name: 'village',
        center: [40, 50] as [number, number],
        population: 9,
        building_count: 3,
        capacity: 10,
        score: 1,
      },
    ],
    organisms: [{ id: 'o1', name: 'Huwo', alive: true, x: 1, y: 2, lineage_id: 'l1' } as OrganismState],
  }

  it('finds the tribe, the person or the village a line is about', () => {
    expect(chronicleTarget(world, kind('⚔️ The Gelup conquered 3 tiles of Dozo land.')!)).toMatchObject({
      kind: 'tribe',
      lineage: 'l1',
      at: { x: 40, y: 50 },
    })
    expect(chronicleTarget(world, kind('👑 Huwo of the Gelup seized power in a coup.')!)).toMatchObject({
      kind: 'person',
      id: 'o1',
    })
    expect(chronicleTarget(world, kind('The people of Oakfold laid a road to the river.')!)).toEqual({
      kind: 'place',
      at: { x: 40, y: 50 },
    })
    expect(chronicleTarget(world, kind('❄️ A hard winter has come.')!)).toBeNull()
  })
})
