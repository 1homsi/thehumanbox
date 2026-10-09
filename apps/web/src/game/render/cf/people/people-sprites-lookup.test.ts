import { describe, expect, it } from 'vitest'
import { SpriteLayer } from 'xipjs'
import type { OrganismState } from '../../../../shared/types'
import { PeopleSprites, type PeopleFrameInput } from './people-sprites'

const flags = { health: false, age: false, fear: false, lineageDot: false, pregnancy: false }

function mk(id: string, x: number, y: number, alive = true): OrganismState {
  return {
    id,
    name: id,
    x,
    y,
    energy: 0.6,
    hydration: 0.6,
    health: 0.9,
    age: 30,
    alive,
    thought: 'exploring',
    lineage_id: 'tribe',
    max_age: 80,
    traits: { resilience: 0.5 },
    infection: 0,
    carrying: 0,
    carrying_type: 0,
    home_x: -1000,
    home_y: -1000,
    sex: id.length % 2 ? 'male' : 'female',
    age_stage: 'adult',
  } as unknown as OrganismState
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function setup(options: { mapLookups?: boolean }) {
  const body = new SpriteLayer({ sortByKey: true, atlases: [{}, {}] })
  const soft = new SpriteLayer({ atlases: [{}] })
  const over = new SpriteLayer({ atlases: [{}] })
  const emote = new SpriteLayer({ atlases: [{}] })
  return { body, soft, over, emote, sprites: new PeopleSprites({ body, soft, over, emote }, options) }
}

function snapshot(s: ReturnType<typeof setup>) {
  const layers = [s.body, s.soft, s.over, s.emote].map((l) => {
    const n = l.count
    return {
      count: n,
      x: Array.from(l.x.subarray(0, n)),
      y: Array.from(l.y.subarray(0, n)),
      w: Array.from(l.w.subarray(0, n)),
      h: Array.from(l.h.subarray(0, n)),
      frame: Array.from(l.frame.subarray(0, n)),
      flags: Array.from(l.flags.subarray(0, n)),
      color: Array.from(l.color.subarray(0, n)),
      sortKey: Array.from(l.sortKey.subarray(0, n)),
      ids: Array.from(l.ids.subarray(0, n)),
    }
  })
  const sp = s.sprites
  return {
    layers,
    n: sp.n,
    ids: [...sp.ids],
    px: Array.from(sp.px.subarray(0, sp.n)),
    py: Array.from(sp.py.subarray(0, sp.n)),
    fromX: Array.from(sp.fromX.subarray(0, sp.n)),
    phase: Array.from(sp.phase.subarray(0, sp.n)),
    flipped: Array.from(sp.stepState.flipped.subarray(0, sp.n)),
    movedAt: Array.from(sp.stepState.movedAt.subarray(0, sp.n)),
    hidden: Array.from(sp.hidden.subarray(0, sp.n)),
  }
}

/**
 * The positional lookup of the previous frame's people (and their walking state) must match the
 * map-based reference over lists that drop, add and reorder people between frames.
 */
describe('PeopleSprites lookups', () => {
  it('matches the id-map reference over random births, deaths and reorders', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = rng(seed)
      const fast = setup({})
      const ref = setup({ mapLookups: true })
      let world: OrganismState[] = []
      for (let i = 0; i < 80; i++) world.push(mk(`p${i}`, r() * 40, r() * 40))
      let prev: OrganismState[] | null = null
      let next = 100
      for (let frame = 0; frame < 40; frame++) {
        // the sim: move everyone a little, kill some, birth some, shuffle some
        world = world
          .map((o) => (r() < 0.05 ? mk(o.id, o.x, o.y, false) : o))
          .filter((o) => o.alive || r() < 0.5)
          .map((o) => (o.alive ? mk(o.id, o.x + (r() - 0.5), o.y + (r() - 0.5)) : o))
        if (r() < 0.5) world.push(mk(`p${next++}`, r() * 40, r() * 40))
        if (r() < 0.4) {
          const a = Math.floor(r() * world.length)
          const b = Math.floor(r() * world.length)
          const t = world[a]
          world[a] = world[b]
          world[b] = t
        }
        const input = (p: OrganismState[] | null): PeopleFrameInput => ({
          orgs: world,
          prevOrgs: p,
          selectedId: null,
          focus: 'all',
          viewFlags: flags,
          zoom: 3,
          vehicles: [],
          lineageEras: {},
          ruinedTiles: new Set(),
          ox: 0,
          oy: 0,
        })
        fast.sprites.rebuild(input(prev))
        ref.sprites.rebuild(input(prev))
        for (const t of [0.3, 1]) {
          fast.sprites.animate(1000 + frame * 100 + t, t)
          ref.sprites.animate(1000 + frame * 100 + t, t)
        }
        expect(snapshot(fast)).toEqual(snapshot(ref))
        prev = world.map((o) => ({ ...o }))
      }
    }
  })
})
