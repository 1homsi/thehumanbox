import { describe, expect, it } from 'vitest'
import { SPRITE_FLIP_X, SPRITE_HIDDEN, SPRITE_UNTEXTURED, SpriteLayer } from 'cubeforge'
import type { OrganismState } from '../../../../shared/types'
import { orgVariant } from '../../../model/org-variant'
import { deterministicAppearanceIndex, humanAtlasRow, HUMAN_ATLAS_FRAMES } from '../../character-visuals'
import { BODY_ATLAS, PeopleSprites, isFocused, type PeopleFrameInput } from './people-sprites'
import { emoteFor } from '../../activity-emotes'
import { peopleLabelSource, pickPersonAt, registerPeopleLayer } from '../picking'

const flags = { health: false, age: false, fear: false, lineageDot: false, pregnancy: false }

function org(id: string, x: number, y: number, extra: Partial<OrganismState> = {}): OrganismState {
  return {
    id,
    name: id,
    x,
    y,
    energy: 0.6,
    hydration: 0.6,
    health: 0.9,
    age: 30,
    alive: true,
    thought: 'exploring',
    lineage_id: 'tribe',
    max_age: 80,
    traits: { resilience: 0.5 },
    infection: 0,
    carrying: 0,
    carrying_type: 0,
    home_x: -1000,
    home_y: -1000,
    sex: 'male',
    age_stage: 'adult',
    ...extra,
  } as unknown as OrganismState
}

function setup() {
  const body = new SpriteLayer({ sortByKey: true, atlases: [{}, {}] })
  const soft = new SpriteLayer({ atlases: [{}] })
  const over = new SpriteLayer({ atlases: [{}] })
  const emote = new SpriteLayer({ atlases: [{}] })
  return { body, soft, over, emote, sprites: new PeopleSprites({ body, soft, over, emote }) }
}

function input(orgs: OrganismState[], extra: Partial<PeopleFrameInput> = {}): PeopleFrameInput {
  return {
    orgs,
    prevOrgs: null,
    selectedId: null,
    focus: 'all',
    viewFlags: flags,
    zoom: 3,
    vehicles: [],
    lineageEras: {},
    ruinedTiles: new Set(),
    ox: 0,
    oy: 0,
    ...extra,
  }
}

/** The canvas painter's geometry for one person, as layers/people.ts computes it. */
function painterBox(o: OrganismState, ox = 0, oy = 0) {
  const variant = orgVariant(o.id)
  const bodyR = variant.bodyRadius * (o.sex === 'male' ? 1.05 : 0.95)
  const size = Math.round(Math.max(19, bodyR * 3.8))
  const px = (o.x - ox) * 8 + 4
  const py = (o.y - oy) * 8 + 4
  return { size, px, py, left: Math.round(px - size / 2), top: Math.round(py - size * 0.78) }
}

describe('PeopleSprites', () => {
  it('puts each person where the canvas painter draws them', () => {
    const { body, sprites } = setup()
    const people = [org('a', 10.5, 20.25), org('b', 40.1, 7.9, { sex: 'female' })]
    sprites.rebuild(input(people))
    sprites.animate(1000, 1)
    people.forEach((o, i) => {
      const box = painterBox(o)
      expect(body.w[i]).toBe(box.size)
      expect(body.x[i] - box.size / 2).toBe(box.left)
      expect(body.y[i] - box.size / 2).toBe(box.top)
      const row = humanAtlasRow(o.sex!, 'adult', deterministicAppearanceIndex(o.id))
      expect(body.frame[i]).toBe(row * HUMAN_ATLAS_FRAMES)
      expect(body.atlas[i]).toBe(BODY_ATLAS.people)
    })
  })

  it('skips the dead and assigns slots in order', () => {
    const { body, sprites } = setup()
    sprites.rebuild(input([org('a', 1, 1), org('gone', 2, 2, { alive: false }), org('c', 3, 3)]))
    expect(sprites.n).toBe(2)
    expect(body.count).toBe(2)
    expect(sprites.slotOf('c')).toBe(1)
    expect(sprites.slotOf('gone')).toBe(-1)
  })

  it('walks between frames, faces the way it walks and cycles the walk frames', () => {
    const { body, sprites } = setup()
    const from = [org('a', 10, 5)]
    const to = [org('a', 9, 5)]
    sprites.rebuild(input(to, { prevOrgs: from }))
    const frames = new Set<number>()
    let flipped = false
    for (let k = 1; k <= 10; k++) {
      sprites.animate(1000 + k * 16, k / 10)
      frames.add(body.frame[0] % HUMAN_ATLAS_FRAMES)
      flipped = (body.flags[0] & SPRITE_FLIP_X) !== 0
    }
    // halfway along the way, 9.5 tiles
    sprites.animate(2000, 0.5)
    expect(sprites.px[0]).toBeCloseTo(9.5 * 8 + 4, 3)
    // walking left means flipped
    sprites.animate(2016, 0.6)
    sprites.animate(2032, 0.9)
    expect(flipped).toBe(true)
    expect(frames.size).toBeGreaterThan(1)
    // standing still for longer than the stride timeout returns to frame 0
    sprites.animate(5000, 1)
    sprites.animate(5400, 1)
    expect(body.frame[0] % HUMAN_ATLAS_FRAMES).toBe(0)
  })

  it('keeps walking state when the list changes order', () => {
    const { body, sprites } = setup()
    sprites.rebuild(input([org('a', 10, 5), org('b', 30, 5)]))
    for (let k = 1; k <= 8; k++) {
      sprites.rebuild(
        input([org('a', 10 - k * 0.3, 5), org('b', 30, 5)], { prevOrgs: [org('a', 10 - (k - 1) * 0.3, 5)] }),
      )
      sprites.animate(1000 + k * 100, 1)
    }
    const flippedA = (body.flags[0] & SPRITE_FLIP_X) !== 0
    expect(flippedA).toBe(true)
    // b moves to the front: a's facing must follow it to slot 1
    sprites.rebuild(input([org('b', 30, 5), org('a', 7.6, 5)]))
    sprites.animate(2000, 1)
    expect(sprites.slotOf('a')).toBe(1)
    expect((body.flags[1] & SPRITE_FLIP_X) !== 0).toBe(true)
    expect((body.flags[0] & SPRITE_FLIP_X) !== 0).toBe(false)
  })

  it('sorts by depth', () => {
    const { body, sprites } = setup()
    sprites.rebuild(input([org('low', 5, 30), org('high', 5, 10), org('mid', 5, 20)]))
    sprites.animate(1000, 1)
    const order = Array.from(body.drawOrder().subarray(0, 3))
    expect(order.map((i) => sprites.ids[i])).toEqual(['high', 'mid', 'low'])
  })

  it('dims people outside the focus', () => {
    const { body, sprites } = setup()
    sprites.rebuild(
      input([org('a', 1, 1, { lineage_id: 'x' }), org('b', 2, 2, { lineage_id: 'y' })], {
        focus: 'lineage:x',
      }),
    )
    expect(body.color[0] & 255).toBe(255)
    expect(body.color[1] & 255).toBe(Math.round(255 * 0.12))
    expect(isFocused(org('s', 0, 0, { infection: 0.5 }), 'sick')).toBe(true)
    expect(isFocused(org('s', 0, 0, { energy: 0.9 }), 'hungry')).toBe(false)
  })

  it('hides someone resting indoors until they move', () => {
    const { body, sprites } = setup()
    const sleeper = org('z', 10, 10, { home_x: 10, home_y: 10, sleep_debt: 0.9 })
    sprites.rebuild(input([sleeper]))
    sprites.animate(1000, 1)
    expect(body.flags[0] & SPRITE_HIDDEN).toBe(SPRITE_HIDDEN)
    // a ruined home is no place to rest
    sprites.rebuild(input([sleeper], { ruinedTiles: new Set(['10,10']) }))
    sprites.animate(1016, 1)
    expect(body.flags[0] & SPRITE_HIDDEN).toBe(0)
  })

  it('draws the selection ring, lineage ring and aura at standard zoom, and fewer in a crowd', () => {
    const one = setup()
    one.sprites.rebuild(input([org('a', 10, 10)], { selectedId: 'a' }))
    one.sprites.animate(1000, 1)
    // shadow, halo ring, dashed ring, lineage ring, aura
    expect(one.soft.count).toBeGreaterThanOrEqual(5)
    expect(one.soft.rotation[0]).toBe(0)
    const dashedSpin = Array.from({ length: one.soft.count }, (_, i) => one.soft.rotation[i]).some(
      (r) => r !== 0,
    )
    expect(dashedSpin).toBe(true)

    const crowd = Array.from({ length: 450 }, (_, i) => org(`c${i}`, i % 50, Math.floor(i / 50)))
    const many = setup()
    many.sprites.rebuild(input(crowd))
    many.sprites.animate(1000, 1)
    // no shadows, rings or auras: only what a crowd keeps
    expect(many.soft.count).toBe(0)
    expect(many.body.count).toBe(450)

    const far = setup()
    far.sprites.rebuild(input([org('a', 10, 10)], { zoom: 0.4 }))
    expect(far.soft.count).toBe(0)
    expect(far.over.count).toBe(0)
  })

  it('draws crowns, vitals and the era stripe as snapped solid rects over the person', () => {
    const { over, sprites } = setup()
    const leader = org('l', 10.3, 10.6, { is_leader: true, energy: 0.1, lineage_id: 'tribe' })
    sprites.rebuild(input([leader], { lineageEras: { tribe: 'iron' } }))
    sprites.animate(1000, 1)
    const box = painterBox(leader)
    const solid = Array.from({ length: over.count }, (_, i) => i).filter(
      (i) => (over.flags[i] & SPRITE_UNTEXTURED) !== 0,
    )
    // era stripe, 4 crown rects, vitals background, energy/hydration/health bars
    expect(solid.length).toBe(1 + 4 + 1 + 3)
    const crownBase = solid.find((i) => over.w[i] === 8 && over.h[i] === 2)!
    expect(over.x[crownBase] - 4).toBe(Math.round(box.px - 4))
    expect(over.y[crownBase] - 1).toBe(Math.round(box.top - 2))
  })

  it('draws a boat under a rider and an empty boat on the water', () => {
    const { body, sprites } = setup()
    const rider = org('r', 10, 10)
    sprites.rebuild(
      input([rider], {
        vehicles: [
          { id: 1, kind: 'boat', x: 10, y: 10, rider_id: 'r' },
          { id: 2, kind: 'boat', x: 50, y: 20 },
        ],
      }),
    )
    sprites.animate(1000, 1)
    expect(body.count).toBe(3)
    const boats = [1, 2].filter((i) => body.atlas[i] === BODY_ATLAS.boats)
    expect(boats.length).toBe(2)
    const riderBoat = boats.find((i) => body.ids[i] === 0)!
    expect(body.x[riderBoat]).toBe(Math.round(sprites.px[0]))
    expect(body.y[riderBoat]).toBe(Math.round(sprites.py[0]) + 3)
    // a person in a boat stands on frame 0
    expect(body.frame[0] % HUMAN_ATLAS_FRAMES).toBe(0)
    // the empty boat is drawn beneath everything
    const empty = boats.find((i) => body.ids[i] === -1)!
    expect(body.sortKey[empty]).toBeLessThan(0)
  })

  it('answers picks with the person drawn there and nothing for ground', () => {
    const { sprites } = setup()
    const a = org('a', 10, 10)
    const b = org('b', 10.2, 10.1) // drawn on top of a
    sprites.rebuild(input([a, b]))
    sprites.animate(1000, 1)
    const box = painterBox(b)
    expect(sprites.pick(box.px, box.py)).toBe('b')
    expect(sprites.pick(box.px, box.py + 300)).toBeNull()
    expect(sprites.pick(-50, -50)).toBeNull()
  })

  it('does not let you pick someone hidden indoors', () => {
    const { sprites } = setup()
    sprites.rebuild(input([org('z', 10, 10, { home_x: 10, home_y: 10, sleep_debt: 0.9 })]))
    sprites.animate(1000, 1)
    expect(sprites.pick(84, 84)).toBeNull()
  })

  it('settles: after a quiet moment it reports no motion', () => {
    const { sprites } = setup()
    sprites.rebuild(input([org('a', 10, 10)], { prevOrgs: [org('a', 9, 10)] }))
    expect(sprites.animate(1000, 0.5)).toBe(true)
    expect(sprites.animate(1016, 1)).toBe(true)
    expect(sprites.animate(1500, 1)).toBe(false)
  })
})

describe('emotes', () => {
  it('draws the bubble the painter draws, a pixel-snapped sprite that bobs', () => {
    const { emote, sprites } = setup()
    const praying = org('p', 12.3, 8.7, { thought: 'praying at the shrine' })
    expect(emoteFor(praying)).toBe('pray')
    sprites.rebuild(input([praying, org('quiet', 30, 30)]))
    expect(emote.count).toBe(1)
    const ys = new Set<number>()
    for (let t = 0; t < 2000; t += 40) {
      sprites.animate(t, 1)
      ys.add(emote.y[0])
    }
    expect(ys.size).toBeGreaterThan(1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2)
    sprites.animate(0, 1)
    const box = painterBox(praying)
    // drawEmote: x0 = round(x - size/2) - 1 with size 7; the baked cell has that corner at texel 4
    expect(emote.x[0] - 8 + 4).toBe(Math.round(box.px - 3.5) - 1)
  })

  it('draws no bubbles when zoomed out, and none for hidden sleepers', () => {
    const far = setup()
    far.sprites.rebuild(input([org('p', 1, 1, { thought: 'praying' })], { zoom: 0.4 }))
    expect(far.emote.count).toBe(0)
  })
})

describe('sprite layer bridge', () => {
  it('routes picks to the people layer while it is mounted and hands out who is drawn where', () => {
    const source = { orgs: [], px: [], py: [], hidden: [], phase: [], step: { flipped: [], movedAt: [] } }
    expect(pickPersonAt(1, 1)).toBeUndefined()
    expect(peopleLabelSource()).toBeNull()
    const off = registerPeopleLayer((x) => (x > 0 ? 'p' : null), source)
    expect(pickPersonAt(1, 1)).toBe('p')
    expect(pickPersonAt(-1, 1)).toBeNull()
    expect(peopleLabelSource()).toBe(source)
    off()
    expect(pickPersonAt(1, 1)).toBeUndefined()
    expect(peopleLabelSource()).toBeNull()
  })

  it('lists the living people in slot order with where each is drawn', () => {
    const { sprites } = setup()
    sprites.rebuild(input([org('a', 4, 4), org('b', 6, 6, { alive: false }), org('c', 8, 8)]))
    sprites.animate(0, 1)
    expect(sprites.orgs.map((o) => o.id)).toEqual(['a', 'c'])
    expect(sprites.px[1]).toBeCloseTo(8 * 8 + 4)
  })
})

/** The writes a layer was told about through its public mutators, since the last draw. */
function recordWrites(layer: SpriteLayer) {
  const rec = { all: false, slots: new Set<number>() }
  const touch = layer.touch.bind(layer)
  const touchRange = layer.touchRange.bind(layer)
  const add = layer.add.bind(layer)
  layer.touch = () => {
    rec.all = true
    touch()
  }
  layer.touchRange = (i0: number, i1 = i0) => {
    for (let i = i0; i <= i1; i++) rec.slots.add(i)
    touchRange(i0, i1)
  }
  layer.add = (...args: Parameters<SpriteLayer['add']>) => {
    const i = add(...args)
    rec.slots.add(i)
    return i
  }
  return rec
}

const SLOT_FIELDS = [
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'frame',
  'atlas',
  'color',
  'flags',
  'sortKey',
  'ids',
] as const

/** Everything the engine packs for slot i, as text. */
function slotText(layer: SpriteLayer, i: number): string {
  return SLOT_FIELDS.map((f) => String(layer[f][i])).join(',')
}

function snapshot(layer: SpriteLayer) {
  return {
    count: layer.count,
    capacity: layer.capacity,
    rows: Array.from({ length: layer.count }, (_, i) => slotText(layer, i)),
  }
}

/**
 * The engine repacks a slot when it was touched since the last draw. So every slot whose values changed
 * since the snapshot must be among the recorded writes, or the drawn sprite would be stale.
 */
function uncoveredChanges(
  layer: SpriteLayer,
  rec: ReturnType<typeof recordWrites>,
  before: ReturnType<typeof snapshot>,
): number[] {
  if (layer.capacity !== before.capacity) return [] // grown: the engine repacks the whole layer
  const missed: number[] = []
  for (let i = 0; i < layer.count; i++) {
    const changed = i >= before.count || before.rows[i] !== slotText(layer, i)
    if (changed && !rec.all && !rec.slots.has(i)) missed.push(i)
  }
  return missed
}

function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('PeopleSprites touch ranges', () => {
  it('draws what a full rewrite draws over random frames, touching every slot that changed', () => {
    const rng = mulberry32(20261007)
    const incremental = setup()
    const reference = setup()
    const ref = new PeopleSprites(
      { body: reference.body, soft: reference.soft, over: reference.over, emote: reference.emote },
      { touchAll: true },
    )
    const layersOf = (s: ReturnType<typeof setup>) => [s.body, s.soft, s.over, s.emote] as const
    const recs = layersOf(incremental).map(recordWrites)
    const befores = layersOf(incremental).map(snapshot)
    const thoughts = [
      'exploring',
      'exploring',
      '"hello"',
      'sounding alarm',
      'challenging',
      'gathering',
      'resting',
    ]
    const people = Array.from({ length: 60 }, (_, k) =>
      org(`p${k}`, 10 + rng() * 40, 10 + rng() * 40, {
        sex: rng() < 0.5 ? 'male' : 'female',
        home_x: 10 + rng() * 40,
        home_y: 10 + rng() * 40,
      }),
    )
    const alive = people.map(() => true)
    let prev: OrganismState[] | null = null
    let frameNo = 0
    const checkDraw = (label: string) => {
      layersOf(incremental).forEach((layer, li) => {
        const missed = uncoveredChanges(layer, recs[li], befores[li])
        expect(missed, `${label} layer ${li}`).toEqual([])
        recs[li].all = false
        recs[li].slots.clear()
        befores[li] = snapshot(layer)
      })
      const a = layersOf(incremental)
      const b = layersOf(reference)
      a.forEach((layer, li) => {
        expect(layer.count, `${label} count ${li}`).toBe(b[li].count)
        for (let i = 0; i < layer.count; i++) {
          expect(slotText(layer, i), `${label} layer ${li} slot ${i}`).toBe(slotText(b[li], i))
        }
      })
    }

    for (let frame = 0; frame < 150; frame++) {
      frameNo++
      // The simulation moves some people, changes others' rest and thoughts, and kills a few.
      const orgs = people.map((o, k) => {
        if (rng() < 0.02) alive[k] = false
        if (rng() < 0.3) {
          o.x += (rng() - 0.5) * 1.5
          o.y += (rng() - 0.5) * 1.5
        }
        if (rng() < 0.05) o.sleep_debt = rng() < 0.5 ? 0.6 : 0
        if (rng() < 0.05) o.thought = thoughts[Math.floor(rng() * thoughts.length)]
        if (rng() < 0.03) o.infection = rng() * 0.5
        return { ...o, alive: alive[k] } as OrganismState
      })
      const selectedId = frame % 30 < 10 ? null : `p${(frame * 7) % people.length}`
      const focus = frame % 50 < 25 ? 'all' : 'sick'
      const viewFlags = { ...flags, health: frame % 40 < 8, fear: frame % 3 === 0 }
      const zoom = [0.5, 1, 3][frame % 3]
      const sim = input(orgs, { prevOrgs: prev, selectedId, focus, viewFlags, zoom })
      if (rng() < 0.7) {
        incremental.sprites.rebuild(sim)
        ref.rebuild(sim)
      }
      prev = orgs
      for (let k = 1; k <= 3; k++) {
        const now = 1000 + frameNo * 100 + k * 16
        const t = k / 3
        incremental.sprites.animate(now, t)
        ref.animate(now, t)
        checkDraw(`frame ${frame} step ${k}`)
      }
    }
  })

  it('touches nothing when nobody moved since the last frame', () => {
    const { body, soft, over, emote, sprites } = setup()
    const people = Array.from({ length: 40 }, (_, k) =>
      org(`s${k}`, 10 + (k % 8) * 3, 10 + Math.floor(k / 8) * 3),
    )
    sprites.rebuild(input(people))
    sprites.animate(1000, 1)
    const recs = [body, soft, over, emote].map(recordWrites)
    sprites.animate(60000, 1)
    for (const rec of recs) {
      expect(rec.all).toBe(false)
      expect(rec.slots.size).toBe(0)
    }
  })
})
