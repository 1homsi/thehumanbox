import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { TILE_ID } from '../../../model/terrain-ids'
import { TILE } from '../../../model/palette'
import { cachedHutClusters, hutTileList, ruinedBuildingTiles } from '../../base-parts/terrain-scans'
import { PAD, PAD_TOP } from '../../building-painters/kit'
import { getBuildingSprite } from '../../building-sprites'
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
/** The two night glows, each one soft radial gradient scaled per flicker. */
export const GLOW_CLASSES: ReadonlyArray<readonly [number, number]> = [
  [54, 54],
  [70, 70],
]

const FIRE_GLOW_R = TILE * 3.2
const CAMP_GLOW_R = TILE * 4.2
const FIRE_STEPS = 24
const FIRE_FRAMES = 6

/** Town hall icon over a cluster of five or more huts: the canvas painter's shapes, baked once. */
function paintTownHall(ctx: CanvasRenderingContext2D, fx: number, fy: number) {
  const TH = TILE * 3.5
  // The cell's (0,0) is (tx - TILE, ty - TILE) of the painter's coordinates.
  ctx.translate(TILE + fx, TILE + fy)
  const tx = 0
  const ty = 0
  const px2 = TH / 2
  ctx.fillStyle = 'rgba(255,220,130,0.22)'
  ctx.fillRect(tx - TILE, ty - TILE, TH + TILE * 2, TH + TILE * 2)
  ctx.fillStyle = '#d4b87a'
  ctx.fillRect(tx + 2, ty + TH * 0.36, TH - 4, TH * 0.64 - 1)
  ctx.fillStyle = '#6a3820'
  ctx.beginPath()
  ctx.moveTo(px2, ty)
  ctx.lineTo(tx + TH, ty + TH * 0.38)
  ctx.lineTo(tx, ty + TH * 0.38)
  ctx.closePath()
  ctx.fill()
  const tw = TH * 0.22
  const th2 = TH * 0.85
  ctx.fillStyle = '#c0a870'
  ctx.fillRect(px2 - tw / 2, ty - th2 * 0.2, tw, th2 * 0.65)
  ctx.fillStyle = '#6a3820'
  ctx.beginPath()
  ctx.moveTo(px2, ty - th2 * 0.28)
  ctx.lineTo(px2 + tw / 2 + 1, ty - th2 * 0.2)
  ctx.lineTo(px2 - tw / 2 - 1, ty - th2 * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#2a1000'
  ctx.fillRect(px2 - TH * 0.06, ty + TH * 0.55, TH * 0.12, TH * 0.45 - 1)
  ctx.fillStyle = 'rgba(255,235,150,0.65)'
  ctx.fillRect(tx + 4, ty + TH * 0.42, 4, 4)
  ctx.fillRect(tx + TH - 8, ty + TH * 0.42, 4, 4)
}

/** One soft light: the canvas painter's radial gradient at its resting radius. */
function paintGlow(ctx: CanvasRenderingContext2D, size: number, inner: number) {
  const c = size / 2
  const grad = ctx.createRadialGradient(c, c, inner, c, c, c)
  grad.addColorStop(0, 'rgba(255,190,90,0.36)')
  grad.addColorStop(0.45, 'rgba(255,150,50,0.14)')
  grad.addColorStop(1, 'rgba(255,120,30,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
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

  constructor(props: SpriteLayer, propAtlas: CellAtlas, glow: SpriteLayer, glowAtlas: CellAtlas) {
    this.props = props
    this.propAtlas = propAtlas
    this.glow = glow
    this.glowAtlas = glowAtlas
  }

  update(f: CfFrame): boolean {
    const t0 = performance.now()
    // The props and glow sprites this rebuild hands out stay valid until the next one.
    this.propAtlas.beginFrame()
    this.glowAtlas.beginFrame()
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
    const glowAlpha = 0.04 + 0.18 * nightFactor
    const smokeAlpha = night && !overview ? 0.25 : 0
    const ruined = ruinedBuildingTiles(world.buildings)
    const special = specialTileIndex(tiles)
    const cells = special.animated
    const fireIntensity = world.grid.fire_intensity

    // Upper bound on sprites: a hut is a rect, a sprite and three smoke puffs.
    let propCount = 0
    const start = firstCellAtRow(cells, r0)
    for (let i = start; i < cells.length; i += 2) {
      if (cells[i] >= r1) break
      const col = cells[i + 1]
      if (col >= c0 && col < c1) propCount += 5
    }
    props.resize(propCount)
    glow.resize(propCount)
    let np = 0
    let nf = 0
    let huts = 0
    let fires = 0
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
          const flicker = 0.88 + Math.sin(now * 0.011 + col * 3.1 + row * 1.7) * 0.12
          const r0g = camp ? CAMP_GLOW_R : FIRE_GLOW_R
          // Baked at the nearest even size; the quad is scaled so its radius is r0g * flicker.
          const side = Math.ceil(r0g * 2)
          const cell = this.glowAtlas.bake(`G${camp ? 1 : 0}`, side, side, (ctx) =>
            paintGlow(ctx, side, (TILE * 0.4 * side) / 2 / r0g),
          )
          if (cell) {
            const k = (flicker * r0g) / (side / 2)
            writeSprite(
              glow,
              nf++,
              px + TILE / 2,
              py + TILE / 2,
              cell.cw * k,
              cell.ch * k,
              cell.atlas,
              cell.frame,
              rgba(255, 255, 255, Math.round(Math.max(0, Math.min(1, fi)) * 255)),
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
      if (tile !== TILE_ID.HUT || (ruined.size > 0 && ruined.has(`${col + ox},${row + oy}`))) continue
      huts++
      // The ground glow under the hut.
      writeSprite(
        props,
        np++,
        px + TILE / 2,
        py + TILE / 2,
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
      const { w: cw, h: ch } = contentSize(1, 1)
      const cell = this.propAtlas.bake(`H|${variant}|${nightBucket}`, cw, ch, (ctx) => {
        const sprite = getBuildingSprite('Hut', 1, 1, TILE, variant, nightBucket, 1)
        if (sprite) ctx.drawImage(sprite, 0, 0)
      })
      if (cell) {
        writeSprite(
          props,
          np++,
          px - PAD - CELL_GUTTER + cell.cw / 2,
          py - PAD_TOP - CELL_GUTTER + cell.ch / 2,
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
          const x = Math.round(px + TILE / 2 + Math.sin(phase * Math.PI) * 2)
          const y = Math.round(py - phase * 10)
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
    // Settlement marks over clusters of five or more huts.
    const hutList = hutTileList(tiles)
    let halls = 0
    if (hutList.length >= 3) {
      for (const { cx, cy, count } of cachedHutClusters(hutList)) {
        if (count < 5) continue
        const px2 = cx * TILE + TILE / 2
        const py2 = cy * TILE + TILE / 2
        const TH = TILE * 3.5
        const tx = px2 - TH / 2
        const ty = py2 - TH / 2
        if (
          tx + TH < c0 * TILE - 64 ||
          tx > c1 * TILE + 64 ||
          ty + TH < r0 * TILE - 64 ||
          ty > r1 * TILE + 64
        )
          continue
        // The cluster centre is fractional, and the shapes antialias to it: bake per position.
        const ix = Math.floor(tx)
        const iy = Math.floor(ty)
        const fx = tx - ix
        const fy = ty - iy
        const cell = this.propAtlas.bake(`TH|${tx}|${ty}`, TH + TILE * 2 + 1, TH + TILE * 2 + 1, (ctx) =>
          paintTownHall(ctx, fx, fy),
        )
        if (!cell) continue
        if (np >= props.count) props.resize(np + 1)
        writeSprite(
          props,
          np++,
          ix - TILE - CELL_GUTTER + cell.cw / 2,
          iy - TILE - CELL_GUTTER + cell.ch / 2,
          cell.cw,
          cell.ch,
          cell.atlas,
          cell.frame,
          WHITE,
          0,
          width * 1000 * 4 + halls,
          -1,
        )
        halls++
      }
    }
    props.resize(np)
    glow.resize(nf)
    props.touch()
    glow.touch()
    this.stats.huts = huts
    this.stats.fires = fires
    this.stats.townHalls = halls
    this.stats.bakes = this.propAtlas.bakes + this.glowAtlas.bakes
    this.stats.resets = this.propAtlas.resets + this.glowAtlas.resets
    this.stats.updates++
    this.stats.ms += performance.now() - t0
    return true
  }
}
