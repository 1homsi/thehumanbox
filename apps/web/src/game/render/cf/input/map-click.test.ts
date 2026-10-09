import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { TILE_ID, isWaterTile } from '../../../model/terrain-ids'
import { hasRuinedBuildingAtWorldTile } from '../../../model/building-state'
import { lineageAtTerritoryTile, type TerritoryIndex } from '../../../model/territory'
import { TILE } from '../../../model/palette'
import { prayerAtPoint } from '../../prayer-bubbles'
import { residentOf, resolveMapClick, type MapClickInput, type MapClickOutcome } from './map-click'

/**
 * What a click on the map does used to live inside `useMapPointer`'s click
 * handler, mixed with its side effects. `resolveMapClick` is that decision
 * lifted out so the xipjs tap and the old click share it. `legacy` below
 * is the old handler, with each side effect turned into the outcome it
 * produced, kept verbatim as the reference the refactor must agree with.
 */
function legacy(input: MapClickInput): MapClickOutcome {
  const { world, ox, oy, viewFlags, focus, zoom } = input
  const canvasTileX = input.mapX / TILE
  const canvasTileY = input.mapY / TILE
  const worldX = canvasTileX + ox
  const worldY = canvasTileY + oy

  if (
    canvasTileX < 0 ||
    canvasTileY < 0 ||
    canvasTileX >= world.grid.width ||
    canvasTileY >= world.grid.height
  )
    return { kind: 'ignore' }

  if (input.sandboxArmed) {
    if (
      Math.round(worldX) < ox ||
      Math.round(worldX) >= ox + world.grid.width ||
      Math.round(worldY) < oy ||
      Math.round(worldY) >= oy + world.grid.height
    )
      return { kind: 'ignore' }
    return { kind: 'sandbox', worldX, worldY }
  }

  if (input.prayerClicksEnabled && world.prayers?.length && !viewFlags.hideUI) {
    const prayer = prayerAtPoint(
      world.prayers,
      canvasTileX * TILE,
      canvasTileY * TILE,
      { x: ox, y: oy },
      TILE,
      zoom,
    )
    if (prayer) return { kind: 'prayer', prayer }
  }

  const tx = Math.floor(worldX)
  const ty = Math.floor(worldY)

  if (viewFlags.territory) {
    const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
    const lineageId = lineageAtTerritoryTile(input.territoryIndex, tx, ty, focusedLineage)
    return { kind: 'territory', lineageId }
  }

  let nearestOrg: { id: string; dist: number } | null = null
  let nearestOrgDist = Math.min(5, Math.max(1.2, (input.coarsePointer ? 26 : 16) / (TILE * zoom)))
  for (const org of world.viewport_organisms?.length ? world.viewport_organisms : world.organisms) {
    if (!org.alive) continue
    const d = Math.hypot(org.x - worldX, org.y - worldY)
    if (d < nearestOrgDist) {
      nearestOrgDist = d
      nearestOrg = { id: org.id, dist: d }
    }
  }
  if (nearestOrg && nearestOrg.dist < 1.2) return { kind: 'select', orgId: nearestOrg.id }

  const ruinedBuildingAtTile = hasRuinedBuildingAtWorldTile(world.buildings, tx, ty)
  const localCol = tx - ox
  const localRow = ty - oy
  const tileRow = world.grid?.tiles?.[localRow]
  const tileVal = tileRow ? tileRow[localCol] : undefined
  if (isWaterTile(tileVal) && (!nearestOrg || nearestOrg.dist >= 2.5)) return { kind: 'select', orgId: null }
  const isHut = tileVal === TILE_ID.HUT
  const structRow = world.grid?.structure?.[localRow]
  const structVal = (structRow && structRow[localCol]) || 0
  if (!ruinedBuildingAtTile && (isHut || structVal >= 0.35)) {
    let bestHost: { id: string; age: number } | null = null
    for (const org of world.organisms) {
      if (!org.alive) continue
      const hx = Math.floor(org.home_x)
      const hy = Math.floor(org.home_y)
      if (hx === tx && hy === ty) {
        if (!bestHost || org.age > bestHost.age) {
          bestHost = { id: org.id, age: org.age }
        }
      }
    }
    if (bestHost) return { kind: 'enter-home', orgId: bestHost.id }
  }
  return { kind: 'select', orgId: nearestOrg ? nearestOrg.id : null }
}

function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
}

function randomInput(seed: number): MapClickInput {
  const r = lcg(seed)
  const pick = <T>(items: readonly T[]) => items[Math.floor(r() * items.length)]
  const width = 12 + Math.floor(r() * 20)
  const height = 8 + Math.floor(r() * 12)
  const ox = Math.floor(r() * 40) - 10
  const oy = Math.floor(r() * 40) - 10
  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () =>
      pick([TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.WATER, TILE_ID.FLOODED, TILE_ID.HUT, TILE_ID.SAND]),
    ),
  )
  const structure = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => pick([0, 0, 0, 0.2, 0.4, 0.9])),
  )
  const organisms = Array.from({ length: Math.floor(r() * 25) }, (_, i) => {
    const homeCol = Math.floor(r() * width)
    const homeRow = Math.floor(r() * height)
    return {
      id: `o${i}`,
      alive: r() > 0.15,
      x: ox + r() * width,
      y: oy + r() * height,
      home_x: ox + homeCol + r() * 0.9,
      home_y: oy + homeRow + r() * 0.9,
      age: Math.floor(r() * 80),
    }
  })
  const prayers = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({
    id: i,
    x: ox + Math.floor(r() * width),
    y: oy + Math.floor(r() * height),
  }))
  const claims = Array.from({ length: Math.floor(r() * 4) }, (_, i) => ({
    lid: `L${i}`,
    tiles: Array.from({ length: 30 }, () => [ox + Math.floor(r() * width), oy + Math.floor(r() * height)]),
  }))
  const ownersByTile = new Map<string, string[]>()
  for (const claim of claims)
    for (const [x, y] of claim.tiles) {
      const key = `${x},${y}`
      const owners = ownersByTile.get(key)
      if (!owners) ownersByTile.set(key, [claim.lid])
      else if (!owners.includes(claim.lid)) owners.push(claim.lid)
    }
  const territoryIndex: TerritoryIndex = { ownersByTile, contested: new Set() }
  const world = {
    grid: { width, height, tiles, structure },
    organisms,
    viewport_organisms: pick([undefined, [], organisms.filter((_, i) => i % 2 === 0)]),
    buildings: [],
    prayers,
  } as unknown as WorldState
  return {
    mapX: (r() * (width + 6) - 3) * TILE,
    mapY: (r() * (height + 6) - 3) * TILE,
    zoom: pick([0.05, 0.2, 0.5, 1, 1.5, 3, 5.5, 8]),
    world,
    ox,
    oy,
    sandboxArmed: r() < 0.15,
    prayerClicksEnabled: r() < 0.8,
    viewFlags: { territory: r() < 0.15, hideUI: r() < 0.2 } as MapClickInput['viewFlags'],
    focus: pick(['all', 'lineage:L0', 'lineage:L1']),
    territoryIndex,
    coarsePointer: r() < 0.3,
  }
}

describe('resolveMapClick', () => {
  it('decides 40,000 random clicks exactly as the old click handler did', () => {
    const seen = new Map<string, number>()
    for (let seed = 1; seed <= 40_000; seed++) {
      const input = randomInput(seed)
      const expected = legacy(input)
      const actual = resolveMapClick(input)
      // Cheap check first: a deep equality on every one of the 40,000 is slow.
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        expect(actual, `seed ${seed}`).toEqual(expected)
      seen.set(expected.kind, (seen.get(expected.kind) ?? 0) + 1)
    }
    // The generator reaches every kind of outcome, so the comparison is not vacuous.
    for (const kind of ['ignore', 'sandbox', 'prayer', 'territory', 'enter-home', 'select'])
      expect(seen.get(kind) ?? 0, kind).toBeGreaterThan(50)
  }, 30_000)

  it('picks a person within a tile and a bit, a wider reach on touch screens', () => {
    const world = {
      grid: { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array(10).fill(TILE_ID.GRASS)) },
      organisms: [{ id: 'a', alive: true, x: 5, y: 5, home_x: 0, home_y: 0, age: 1 }],
      buildings: [],
    } as unknown as WorldState
    const base = {
      world,
      ox: 0,
      oy: 0,
      sandboxArmed: false,
      prayerClicksEnabled: false,
      viewFlags: {} as MapClickInput['viewFlags'],
      focus: 'all',
      territoryIndex: { ownersByTile: new Map(), contested: new Set<string>() },
      zoom: 1,
    }
    const at = (tiles: number, coarsePointer: boolean) =>
      resolveMapClick({ ...base, mapX: (5 + tiles) * TILE, mapY: 5 * TILE, coarsePointer })
    // At zoom 1 a mouse reaches 2 tiles, a finger 3.25.
    expect(at(1.1, false)).toEqual({ kind: 'select', orgId: 'a' })
    expect(at(1.9, false)).toEqual({ kind: 'select', orgId: 'a' })
    expect(at(2.5, false)).toEqual({ kind: 'select', orgId: null })
    expect(at(2.5, true)).toEqual({ kind: 'select', orgId: 'a' })
    expect(at(3.5, true)).toEqual({ kind: 'select', orgId: null })
  })
})

describe('residents of a picked building', () => {
  const building = (over: Record<string, unknown> = {}) => ({
    id: 7,
    kind: 'House',
    x: 10,
    y: 10,
    fw: 2,
    fh: 2,
    condition: 1,
    ...over,
  })
  const person = (id: string, hx: number, hy: number, age = 20) => ({
    id,
    alive: true,
    home_x: hx,
    home_y: hy,
    age,
    // Out in the fields, away from the click.
    x: 35,
    y: 35,
  })

  function click(world: Partial<WorldState>, pickBuilding: (x: number, y: number) => number) {
    const full = {
      grid: { width: 40, height: 40, tiles: Array.from({ length: 40 }, () => Array(40).fill(TILE_ID.GRASS)) },
      organisms: [],
      buildings: [],
      ...world,
    } as unknown as WorldState
    return resolveMapClick({
      mapX: 11 * TILE,
      mapY: 11 * TILE,
      zoom: 2,
      world: full,
      ox: 0,
      oy: 0,
      sandboxArmed: false,
      prayerClicksEnabled: false,
      viewFlags: { territory: false, hideUI: false } as MapClickInput['viewFlags'],
      focus: 'all',
      territoryIndex: new Map() as unknown as TerritoryIndex,
      coarsePointer: false,
      pickBuilding,
    })
  }

  it('opens the home of the oldest person who lives inside the footprint', () => {
    const outcome = click(
      {
        buildings: [building()] as never,
        organisms: [
          person('young', 10, 10, 5),
          person('elder', 11, 11, 70),
          person('away', 20, 20, 90),
        ] as never,
      },
      () => 7,
    )
    expect(outcome).toEqual({ kind: 'enter-home', orgId: 'elder' })
  })

  it('does nothing special when nobody lives there, the building is a ruin, or none is under the pointer', () => {
    const base = { buildings: [building()] as never, organisms: [person('far', 30, 30)] as never }
    expect(click(base, () => 7)).toEqual({ kind: 'select', orgId: null })
    expect(click({ ...base, organisms: [person('home', 10, 10)] as never }, () => -1)).toEqual({
      kind: 'select',
      orgId: null,
    })
    expect(
      click(
        { buildings: [building({ ruined: true })] as never, organisms: [person('home', 10, 10)] as never },
        () => 7,
      ),
    ).toEqual({ kind: 'select', orgId: null })
  })

  it('finds the residents of a building by its footprint', () => {
    const world = {
      buildings: [building({ fw: 3, fh: 1 })],
      organisms: [person('a', 12, 10), person('b', 12, 11)],
    } as unknown as WorldState
    expect(residentOf(world, 7)).toBe('a')
    expect(residentOf(world, 99)).toBeNull()
  })
})
