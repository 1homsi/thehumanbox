// @vitest-environment happy-dom
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TILE_ID } from '../model/terrain-ids'
import { permanentWaterLandEdgeMask, permanentWaterNeighborMask } from '../model/terrain-visuals'
import { drawNaturalDecor, paintReed, paintShoreTile, reedAt, shoreTileKey } from './decorations'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function world(seed: number, width: number, height: number) {
  const rand = rng(seed)
  const kinds = [
    TILE_ID.WATER,
    TILE_ID.WATER,
    TILE_ID.WATER,
    TILE_ID.GRASS,
    TILE_ID.GRASS,
    TILE_ID.GRASS,
    TILE_ID.FLOODED,
    TILE_ID.FOOD,
    TILE_ID.HUT,
    TILE_ID.ROCK,
    TILE_ID.SNOW,
    TILE_ID.SAND,
    TILE_ID.ASH,
    TILE_ID.VOID,
  ]
  const tiles: number[][] = []
  const biomes: number[][] = []
  for (let r = 0; r < height; r++) {
    const tr: number[] = []
    const br: number[] = []
    for (let c = 0; c < width; c++) {
      tr.push(kinds[Math.floor(rand() * kinds.length)])
      br.push(Math.floor(rand() * 10))
    }
    tiles.push(tr)
    biomes.push(br)
  }
  return { tiles, biomes }
}

function fnv(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** A context that logs every call and every state assignment. */
function recorder() {
  const log: string[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k in state) return state[k]
        return (...args: unknown[]) => {
          log.push(`${k}(${args.map((a) => (typeof a === 'number' ? a.toFixed(6) : String(a))).join(',')})`)
        }
      },
      set: (_t, k: string, v) => {
        state[k] = v
        log.push(`${k}=${String(v)}`)
        return true
      },
    },
  )
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

// Hashes of the draw-call log recorded from the implementation before the per-tile
// allocations were removed.
const GOLDEN: Record<string, string> = {
  'whole map': '41f77942',
  'offset origin': 'cb41167b',
}

function run(name: string) {
  const { tiles, biomes } = world(name.length * 31, 64, 48)
  const { ctx, log } = recorder()
  if (name === 'whole map') drawNaturalDecor(ctx, 64, 48, tiles, biomes, 0, 0)
  else drawNaturalDecor(ctx, 64, 48, tiles, biomes, 1234, -567)
  return { hash: fnv(log.join('\n')), calls: log.length }
}

describe('drawNaturalDecor', () => {
  it('issues the same draw calls as before', () => {
    const out: Record<string, string> = {}
    for (const name of Object.keys(GOLDEN)) {
      const { hash, calls } = run(name)
      expect(calls).toBeGreaterThan(1000)
      out[name] = hash
    }
    if (process.env.PRINT_GOLDEN) writeFileSync(process.env.PRINT_GOLDEN, JSON.stringify(out))
    expect(out).toEqual(GOLDEN)
  })
})

// The edge-mask helpers as they were written before the closure-free rewrite.
function refEdgeMask(
  tiles: number[][],
  row: number,
  col: number,
  matches: (tile: number | undefined) => boolean,
): number {
  let mask = 0
  if (row > 0 && matches(tiles[row - 1]?.[col])) mask |= 1
  if (row + 1 < tiles.length && matches(tiles[row + 1]?.[col])) mask |= 2
  if (col > 0 && matches(tiles[row]?.[col - 1])) mask |= 4
  if (col + 1 < (tiles[row]?.length ?? 0) && matches(tiles[row]?.[col + 1])) mask |= 8
  return mask
}

describe('water edge masks', () => {
  it('match the closure-based originals everywhere, including the grid border and ragged rows', () => {
    const { tiles } = world(77, 30, 20)
    tiles[5] = tiles[5].slice(0, 12)
    for (let row = 0; row < tiles.length; row++) {
      for (let col = 0; col < tiles[row].length + 1; col++) {
        expect(permanentWaterNeighborMask(tiles, row, col)).toBe(
          refEdgeMask(tiles, row, col, (t) => t === TILE_ID.WATER),
        )
        const here = tiles[row]?.[col]
        const expected =
          here === TILE_ID.WATER
            ? refEdgeMask(
                tiles,
                row,
                col,
                (t) => t !== undefined && t !== TILE_ID.WATER && t !== TILE_ID.FLOODED,
              )
            : 0
        expect(permanentWaterLandEdgeMask(tiles, row, col)).toBe(expected)
      }
    }
  })
})

describe('shore tiles shared with the sprite atlas', () => {
  function record(draw: (ctx: CanvasRenderingContext2D) => void): string {
    const { ctx, log } = recorder()
    draw(ctx)
    return log.join('\n')
  }

  it('paints the same pixels for tiles with the same key, and nothing when the key is null', () => {
    const { tiles, biomes } = world(5, 40, 30)
    const byKey = new Map<string, string>()
    let keyed = 0
    for (let y = 1; y < 29; y++) {
      for (let x = 1; x < 39; x++) {
        const key = shoreTileKey(tiles, biomes, x, y, 100, 200)
        const drawn = record((ctx) => paintShoreTile(ctx, tiles, biomes, x, y, 100, 200, 0, 0))
        if (key === null) {
          expect(drawn).toBe('')
          continue
        }
        keyed++
        const seen = byKey.get(key)
        if (seen === undefined) byKey.set(key, drawn)
        else expect(drawn).toBe(seen)
      }
    }
    expect(keyed).toBeGreaterThan(50)
    // Far fewer looks than tiles: that is what makes an atlas worth it.
    expect(byKey.size).toBeLessThan(keyed / 2)
  })

  it('places a reed from the position alone, and paints it relative to its tile', () => {
    const { tiles } = world(9, 40, 30)
    let reeds = 0
    for (let y = 1; y < 29; y++) {
      for (let x = 1; x < 39; x++) {
        const reed = reedAt(tiles, x, y, 7, 11)
        expect(reedAt(tiles, x, y, 7, 11)).toEqual(reed)
        if (!reed) continue
        reeds++
        const here = record((ctx) => paintReed(ctx, reed, x * 8, y * 8))
        const moved = record((ctx) => paintReed(ctx, reed, x * 8 + 80, y * 8 + 40))
        expect(here).not.toBe(moved)
        expect(record((ctx) => paintReed(ctx, reed, 0, 0))).toBe(
          record((ctx) => paintReed(ctx, { ...reed }, 0, 0)),
        )
      }
    }
    expect(reeds).toBeGreaterThan(5)
  })
})
