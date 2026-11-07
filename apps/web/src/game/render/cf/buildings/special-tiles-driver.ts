import { ellipsePixels } from '../atlas-bake'
import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { TILE_ID } from '../../../model/terrain-ids'
import { TILE } from '../../../model/palette'
import { cachedHutClusters, hutTileList, ruinedBuildingTiles } from '../../base-parts/terrain-scans'
import { PAD, PAD_TOP } from '../../building-painters/kit'
import { getBuildingSprite } from '../../building-sprites'
import { homeLandOfBiome } from '../../building-painters/land-homes'
import { paintedBiome } from '../../base-parts/tile-paint'
import { drawPixelFire, visualTileHash } from '../../draw-helpers'
import { firstCellAtRow, specialTileIndex } from '../../special-tiles'
import { CELL_GUTTER, type CellAtlas } from '../atlas/cell-atlas'
import { WHITE, rgba, writeSprite, type CfDriver, type CfFrame } from '../frame'
import { contentSize, nightBucketOf } from './building-visuals'

/** Fire cells are 8x8 plus gutter; huts are building cells; the town hall mark is 44x44. */
export const PROP_CLASSES: ReadonlyArray<readonly [number, number]> = [
  [10, 10],
  [34, 48],
  [48, 48],
]
/** The two night glows, each a few flat steps of whole pixels (see paintGlow). */
export const GLOW_CLASSES: ReadonlyArray<readonly [number, number]> = [
  [54, 54],
  [70, 70],
]

const FIRE_GLOW_R = TILE * 3.2
const CAMP_GLOW_R = TILE * 4.2
const FIRE_STEPS = 24
const FIRE_FRAMES = 6

/** The meeting hall's footprint in tiles (a longhouse). */
const HALL_W = 3
/** Huts a cluster needs before it gets a hall: a real village, not every hamlet of a few families. */
const HALL_MIN_HUTS = 10
const HALL_H = 2

/** The steps of a fire's light, outermost first: the share of its radius each covers, and its alpha. */
const GLOW_STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.1],
  [0.66, 0.12],
  [0.36, 0.14],
]

/**
 * One fire's light at night: three discs of whole pixels, each a flat warmer step over the last. A smooth
 * radial gradient scaled up and down every frame, many of them over a wildfire, came out as soft blurred
 * blobs: the airbrushed look the rest of the map no longer has.
 */
function paintGlow(ctx: CanvasRenderingContext2D, size: number) {
  for (const [share, alpha] of GLOW_STEPS) {
    const d = Math.max(2, Math.round(size * share))
    const off = Math.floor((size - d) / 2)
    ctx.fillStyle = `rgba(255,170,70,${alpha})`
    for (const [i, j] of ellipsePixels(d, d, 'disc')) ctx.fillRect(off + i, off + j, 1, 1)
  }
}

/**
 * Huts, fires and campfires (the terrain's occupancy tiles): the hut sprites, their
 * night glow and smoke, the animated pixel fire and its night light. The props layer
 * holds sprites and untextured rects ordered by tile; the glow layer holds the lights.
 */
export class SpecialTilesDriver implements CfDriver {
  stats = { huts: 0, fires: 0, townHalls: 0, bakes: 0, resets: 0, ms: 0, updates: 0 }
  private readonly props: SpriteLayer
  private readonly propAtlas: CellAtlas
  private readonly glow: SpriteLayer
  private readonly glowAtlas: CellAtlas
  /**
   * What the last rebuild was made from. By day nothing here moves between the fires' animation
   * steps (no flicker, no smoke, a fixed hut glow), so the same inputs would write the same sprites.
   */
  private built: {
    day: boolean
    tiles: unknown
    ruined: unknown
    fireSig: number
    ox: number
    oy: number
    c0: number
    c1: number
    r0: number
    r1: number
    overview: boolean
    step: number
    propEpoch: number
    glowEpoch: number
  } | null = null

  constructor(props: SpriteLayer, propAtlas: CellAtlas, glow: SpriteLayer, glowAtlas: CellAtlas) {
    this.props = props
    this.propAtlas = propAtlas
    this.glow = glow
    this.glowAtlas = glowAtlas
  }

  update(f: CfFrame): boolean {
    const t0 = performance.now()
    const { world, win, ox, oy, now } = f
    const tiles = world.grid.tiles
    if (!tiles) return false
    const width = world.grid.width
    const { c0, c1, r0, r1 } = win
    const props = this.props
    const glow = this.glow
    const overview = f.detail === 'overview'
    const night = !world.is_day
    const nightBucket = nightBucketOf(world)
    const dp = world.day_progress ?? 0.5
    const nightFactor = world.is_day ? 0 : 1 - Math.abs(dp - 0.5) * 2
    // The warm ground light round a hut is a night thing: by day a yellow square under every hut tinted
    // whole villages into one glowing block.
    const glowAlpha = 0.18 * nightFactor
    const smokeAlpha = night && !overview ? 0.25 : 0
    const ruined = ruinedBuildingTiles(world.buildings)
    const special = specialTileIndex(tiles)
    const cells = special.animated
    const fireIntensity = world.grid.fire_intensity

    // Upper bound on sprites: a hut is a rect, a sprite and three smoke puffs.
    let propCount = 0
    let fireSig = 2166136261
    const start = firstCellAtRow(cells, r0)
    for (let i = start; i < cells.length; i += 2) {
      if (cells[i] >= r1) break
      const col = cells[i + 1]
      if (col < c0 || col >= c1) continue
      propCount += 5
      const tile = tiles[cells[i]][col]
      if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE) {
        // A fire's picture depends on its intensity bucket and, by night, on the intensity itself.
        const fi = fireIntensity?.[cells[i]]?.[col] ?? 1
        fireSig = Math.imul(fireSig ^ Math.round(Math.max(0, Math.min(1, fi)) * 255), 16777619)
      }
    }
    const step = Math.floor(now / 170)
    const b = this.built
    if (
      b &&
      !night &&
      b.day &&
      b.tiles === tiles &&
      b.ruined === ruined &&
      b.fireSig === fireSig &&
      b.ox === ox &&
      b.oy === oy &&
      b.c0 === c0 &&
      b.c1 === c1 &&
      b.r0 === r0 &&
      b.r1 === r1 &&
      b.overview === overview &&
      b.step === step &&
      b.propEpoch === this.propAtlas.epoch &&
      b.glowEpoch === this.glowAtlas.epoch
    )
      return false
    // The props and glow sprites this rebuild hands out stay valid until the next one.
    this.propAtlas.beginFrame()
    this.glowAtlas.beginFrame()
    props.resize(propCount)
    glow.resize(propCount)
    let np = 0
    let nf = 0
    let huts = 0
    let fires = 0
    // A village of ten or more huts gets its meeting hall, standing on the huts at the cluster's middle.
    const hutList = hutTileList(tiles)
    const halls: Array<{ col: number; row: number }> = []
    if (hutList.length >= 3) {
      for (const { cx, cy, count } of cachedHutClusters(hutList)) {
        if (count >= HALL_MIN_HUTS) halls.push({ col: Math.round(cx) - 1, row: Math.round(cy) - 1 })
      }
    }
    const underHall = (col: number, row: number) =>
      halls.some((h) => col >= h.col && col < h.col + HALL_W && row >= h.row && row < h.row + HALL_H)
    const isHut = (col: number, row: number) =>
      tiles[row]?.[col] === TILE_ID.HUT &&
      !(ruined.size > 0 && ruined.has(`${col + ox},${row + oy}`)) &&
      !underHall(col, row)
    for (let i = start; i < cells.length; i += 2) {
      const row = cells[i]
      if (row >= r1) break
      const col = cells[i + 1]
      if (col < c0 || col >= c1) continue
      const tile = tiles[row][col]
      const px = col * TILE
      const py = row * TILE
      const order = (row * width + col) * 4
      if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE) {
        const camp = tile === TILE_ID.CAMPFIRE
        const fi = fireIntensity?.[row]?.[col] ?? 1
        const seed = visualTileHash(col + ox, row + oy)
        if (night && !overview) {
          // The light flickers in strength, not size: a whole-pixel disc scaled by a fraction would shimmer.
          const flicker = 0.88 + Math.sin(now * 0.011 + col * 3.1 + row * 1.7) * 0.12
          const side = Math.ceil((camp ? CAMP_GLOW_R : FIRE_GLOW_R) * 2)
          const cell = this.glowAtlas.bake(`G${camp ? 1 : 0}`, side, side, (ctx) => paintGlow(ctx, side))
          if (cell) {
            writeSprite(
              glow,
              nf++,
              px + TILE / 2,
              py + TILE / 2,
              cell.cw,
              cell.ch,
              cell.atlas,
              cell.frame,
              rgba(255, 255, 255, Math.round(Math.max(0, Math.min(1, fi * flicker)) * 255)),
              0,
              order,
              row * width + col,
            )
          }
        }
        const strength = Math.max(0.2, Math.min(1, fi))
        const bucket = Math.round(strength * FIRE_STEPS)
        const frame = (((Math.floor(now / 170 + (seed & 7)) % FIRE_FRAMES) + FIRE_FRAMES) % FIRE_FRAMES) | 0
        const cell = this.propAtlas.bake(`F${camp ? 1 : 0}|${bucket}|${frame}`, TILE, TILE, (ctx) =>
          drawPixelFire(ctx, 0, 0, bucket / FIRE_STEPS, frame, camp),
        )
        if (cell) {
          writeSprite(
            props,
            np++,
            px - CELL_GUTTER + cell.cw / 2,
            py - CELL_GUTTER + cell.ch / 2,
            cell.cw,
            cell.ch,
            cell.atlas,
            cell.frame,
            WHITE,
            0,
            order + 1,
            row * width + col,
          )
          fires++
        }
        continue
      }
      if (tile !== TILE_ID.HUT || !isHut(col, row)) continue
      // One hut per 2x2 block of hut tiles, standing in the middle of the block. Hut tiles packed side by
      // side drew their roofs into one another, and a village was a mush of brown cones; one per block
      // leaves ground showing round every hut, so each reads as a house (#883).
      const bx = (col + ox) & ~1
      const by = (row + oy) & ~1
      const firstInBlock = (() => {
        for (let r = by; r < by + 2; r++)
          for (let c = bx; c < bx + 2; c++) {
            if (r === row + oy && c === col + ox) return true
            if (isHut(c - ox, r - oy)) return false
          }
        return true
      })()
      if (!firstInBlock) continue
      const hx = (bx - ox) * TILE + TILE / 2 + (((bx * 7 + by * 3) & 1) === 0 ? 0 : -1)
      const hy = (by - oy) * TILE + TILE / 2
      huts++
      // The ground glow under the hut, at night.
      if (glowAlpha > 0)
        writeSprite(
          props,
          np++,
          hx + TILE / 2,
          hy + TILE / 2,
          TILE * 2,
          TILE * 2,
          0,
          0,
          rgba(255, 215, 110, Math.round(glowAlpha * 255)),
          SPRITE_UNTEXTURED,
          order,
          -1,
        )
      const variant = (((col * 73856093) ^ (row * 19349663)) >>> 0) & 7
      // The hut takes the shape of its land: round houses on the grass, domes in the desert, turf halls in the
      // cold, stilt houses in the marsh (land-homes.ts).
      const land = homeLandOfBiome(paintedBiome(f.biomes, row, col))
      const { w: cw, h: ch } = contentSize(1, 1)
      const cell = this.propAtlas.bake(`H|${variant}|${nightBucket}|${land}`, cw, ch, (ctx) => {
        const sprite = getBuildingSprite('Hut', 1, 1, TILE, variant, nightBucket, 1, 0, '', false, land)
        if (sprite) ctx.drawImage(sprite, 0, 0)
      })
      if (cell) {
        writeSprite(
          props,
          np++,
          hx - PAD - CELL_GUTTER + cell.cw / 2,
          hy - PAD_TOP - CELL_GUTTER + cell.ch / 2,
          cell.cw,
          cell.ch,
          cell.atlas,
          cell.frame,
          WHITE,
          0,
          order + 1,
          row * width + col,
        )
      }
      if (smokeAlpha > 0) {
        for (let s = 0; s < 3; s++) {
          const phase = (now * 0.0008 + s * 0.4) % 1
          const size = 1 + Math.floor(phase * 2)
          const x = Math.round(hx + TILE / 2 + Math.sin(phase * Math.PI) * 2)
          const y = Math.round(hy - phase * 10)
          writeSprite(
            props,
            np++,
            x + (size + 1) / 2,
            y + size / 2,
            size + 1,
            size,
            0,
            0,
            rgba(180, 180, 185, Math.round(smokeAlpha * (1 - phase) * 255)),
            SPRITE_UNTEXTURED,
            order + 2,
            -1,
          )
        }
      }
    }
    // The meeting hall of each village of ten or more huts: a longhouse painted and finished like every other
    // building. It was a hand-drawn icon with a translucent yellow square round it, in a style of its own.
    let hallCount = 0
    for (const h of halls) {
      if (h.col + HALL_W < c0 - 2 || h.col > c1 + 2 || h.row + HALL_H < r0 - 2 || h.row > r1 + 4) continue
      const variant = ((h.col * 73856093) ^ (h.row * 19349663)) & 7
      const land = homeLandOfBiome(paintedBiome(f.biomes, h.row, h.col))
      const { w: cw, h: ch } = contentSize(HALL_W, HALL_H)
      const cell = this.propAtlas.bake(`HALL|${variant}|${nightBucket}|${land}`, cw, ch, (ctx) => {
        const sprite = getBuildingSprite(
          'Longhouse',
          HALL_W,
          HALL_H,
          TILE,
          variant,
          nightBucket,
          1,
          0,
          '',
          false,
          land,
        )
        if (sprite) ctx.drawImage(sprite, 0, 0)
      })
      if (!cell) continue
      if (np >= props.count) props.resize(np + 1)
      writeSprite(
        props,
        np++,
        h.col * TILE - PAD - CELL_GUTTER + cell.cw / 2,
        h.row * TILE - PAD_TOP - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        ((h.row + HALL_H - 1) * width + h.col) * 4 + 1,
        -1,
      )
      hallCount++
    }
    props.resize(np)
    glow.resize(nf)
    props.touch()
    glow.touch()
    this.stats.huts = huts
    this.stats.fires = fires
    this.stats.townHalls = hallCount
    this.stats.bakes = this.propAtlas.bakes + this.glowAtlas.bakes
    this.stats.resets = this.propAtlas.resets + this.glowAtlas.resets
    this.built = {
      day: !night,
      tiles,
      ruined,
      fireSig,
      ox,
      oy,
      c0,
      c1,
      r0,
      r1,
      overview,
      step,
      propEpoch: this.propAtlas.epoch,
      glowEpoch: this.glowAtlas.epoch,
    }
    this.stats.updates++
    this.stats.ms += performance.now() - t0
    return true
  }
}
