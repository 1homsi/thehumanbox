// node --test apps/web/bench/find-feature.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatesFor, caravanAt, findFeature, summarize } from './find-feature.mjs'

const frame = {
  tick: 1000,
  settlements: [{ center: [50, 50] }],
  organisms: [{ alive: true }, { alive: false }],
  buildings: [
    { kind: 'market', x: 90, y: 90, ruined: false, construction_progress: 1 },
    { kind: 'market', x: 52, y: 49, ruined: false, construction_progress: 1 },
    { kind: 'market', x: 51, y: 50, ruined: false, construction_progress: 0.4 },
    { kind: 'market', x: 50, y: 51, ruined: true, construction_progress: 1 },
    { kind: 'gate', x: 40, y: 40, ruined: false, construction_progress: 1 },
  ],
  caravans: [
    { cargo: 'stone', from: [0, 0], to: [100, 0], departed_tick: 900, arrives_tick: 1100 },
    { cargo: 'wood', from: [0, 10], to: [10, 10], departed_tick: 0, arrives_tick: 10 },
  ],
  vehicles: [
    { kind: 'boat', x: 20, y: 30, era: 'iron' },
    { kind: 'cart', x: 1, y: 1 },
  ],
  farms: [{ x: 60, y: 60, crop: 'potato', stage: 'mature' }],
}

test('a building is a finished, standing one, nearest the settlement first', () => {
  const list = candidatesFor(frame, 'building:market')
  assert.deepEqual(
    list.map((c) => [c.x, c.y]),
    [
      [52, 49],
      [90, 90],
    ],
  )
  assert.equal(findFeature(frame, 'building:market').x, 52)
  assert.equal(findFeature(frame, 'market').x, 52, 'a bare kind name works too')
})

test('index picks another candidate and out-of-range indexes fail', () => {
  assert.equal(findFeature(frame, 'building:market', { index: 1 }).x, 90)
  assert.throws(() => findFeature(frame, 'building:market', { index: 2 }), /out of range/)
})

test('a missing feature says what the frame holds', () => {
  assert.throws(() => findFeature(frame, 'building:castle'), /no "building:castle".*gate/s)
})

test('a caravan is placed on its line at the given tick, and only mid-route ones count', () => {
  assert.deepEqual(caravanAt(frame.caravans[0], 1050), { x: 75, y: 0, progress: 0.75 })
  const list = candidatesFor(frame, 'caravan')
  assert.equal(list.length, 1, 'the wood caravan is already done at tick 1000')
  assert.equal(list[0].name, 'caravan-stone')
  assert.equal(list[0].x, 50)
  assert.throws(() => findFeature(frame, 'caravan:wood'), /no "caravan:wood"/)
})

test('caravan position follows the tick asked for', () => {
  const p = findFeature(frame, 'caravan', { tick: 1040 })
  assert.equal(p.x, 70)
  assert.equal(p.y, 0)
})

test('boats and fields', () => {
  assert.equal(findFeature(frame, 'boat').name, 'boat-iron')
  assert.equal(findFeature(frame, 'boat').x, 20)
  assert.equal(findFeature(frame, 'field').name, 'field-potato')
})

test('summary counts non-ruined buildings and boats only', () => {
  const s = summarize(frame)
  assert.equal(s.buildings.market, 3)
  assert.equal(s.boats, 1)
  assert.equal(s.people, 1)
  assert.equal(s.caravans.count, 2)
})

test('a pier is a harbour berth or a ferry landing, one candidate per tile', () => {
  const piers = {
    tick: 1000,
    settlements: [{ center: [50, 50] }],
    vehicles: [
      { kind: 'boat', x: 21, y: 31, era: 'iron', harbour: [20, 30], piers: 2 },
      { kind: 'boat', x: 22, y: 30, era: 'iron', harbour: [20, 30], piers: 2 },
      { kind: 'boat', x: 8, y: 8, era: 'iron', harbour: [9, 9], piers: 0 },
      {
        kind: 'ferry',
        x: 40,
        y: 40,
        era: 'iron',
        ferry: [
          { at: [40, 41], shore: [1, 0] },
          { at: [44, 41], shore: [-1, 0] },
        ],
      },
    ],
  }
  assert.deepEqual(
    candidatesFor(piers, 'pier').map((c) => [c.x, c.y]),
    [
      [44, 41],
      [40, 41],
      [20, 30],
    ],
  )
  assert.equal(findFeature(piers, 'pier', { index: 1 }).x, 40)
})

test('a canal is a channel cell of the road layer, nearest the town first', () => {
  const canals = {
    tick: 1000,
    settlements: [{ center: [50, 50] }],
    grid: {
      roads: [
        [10, 10, 4],
        [49, 53, 4],
        [49, 54, 1],
        [48, 52, 4],
      ],
    },
  }
  const list = candidatesFor(canals, 'canal')
  assert.deepEqual(
    list.map((c) => [c.x, c.y]),
    [
      [52, 48],
      [53, 49],
      [10, 10],
    ],
  )
  assert.equal(findFeature(canals, 'canal', { index: 1 }).y, 49)
})
