import { cachedRailLinks } from '.././rails'
import { drawTradeNetwork2D } from '.././base-layer'
import { cfActive } from '../cf/active'
import { lineageEraTiers } from '.././draw-helpers'

import { farmCropColor, farmProgress, farmStage } from '../../model/farms'
import { drawPlanting } from '.././plantings'

import { drawRail, drawTrain, trainProgress } from '.././era-traffic'

import { TILE } from '../../model/palette'

import { cfOwns } from '../cf/ownership'
import type { DrawFrame } from './frame'

/** One farm tile. Painted with its top-left at (x, y); also used to bake the tile into a sprite atlas. */
export function paintFarmTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stage: string,
  progress: number,
  cropColor: string,
  cropLength: number,
) {
  ctx.fillStyle = '#3f2c21'
  ctx.fillRect(x, y, TILE, TILE)
  ctx.fillStyle = stage === 'fallow' ? '#6b4c32' : '#705335'
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
  ctx.fillStyle = stage === 'mature' ? '#b98b45' : '#4a3326'
  for (let row = 2; row < TILE - 1; row += 3) {
    ctx.fillRect(x + 1, y + row, TILE - 2, 1)
  }
  if (stage !== 'fallow') {
    ctx.fillStyle = cropColor
    const plantHeight = Math.max(1, Math.round(1 + progress * 4))
    const cropOffset = cropLength % 2
    for (let plantX = 2 + cropOffset; plantX < TILE - 1; plantX += 3) {
      ctx.fillRect(x + plantX, y + TILE - plantHeight - 1, 1, plantHeight)
      if (plantHeight >= 3) ctx.fillRect(x + plantX + 1, y + TILE - plantHeight, 1, 1)
    }
  }
  if (stage === 'mature') {
    ctx.fillStyle = 'rgba(255, 232, 145, 0.9)'
    ctx.fillRect(x, y, TILE, 1)
    ctx.fillRect(x, y + TILE - 1, TILE, 1)
    ctx.fillRect(x, y, 1, TILE)
    ctx.fillRect(x + TILE - 1, y, 1, TILE)
  }
}

/** Farms, railways, plantings and trade roads. */
export function draw_landuse(f: DrawFrame) {
  const { ctx, world, ox, oy, r0, r1, c0, c1, t } = f
  const cfLanduse = cfOwns('landuse')
  if (!cfLanduse && world.farms && world.farms.length > 0) {
    ctx.save()
    for (const farm of world.farms) {
      const localX = farm.x - ox
      const localY = farm.y - oy
      if (localX < c0 - 1 || localX > c1 || localY < r0 - 1 || localY > r1) continue
      const x = localX * TILE
      const y = localY * TILE
      paintFarmTile(
        ctx,
        x,
        y,
        farmStage(farm, world.tick),
        farmProgress(farm, world.tick),
        farmCropColor(farm.crop),
        farm.crop?.length ?? 0,
      )
    }
    ctx.restore()
  }

  // Railways between each tribe's train stations, with trains shuttling
  // along them in the style of the tribe's age.
  const links = cachedRailLinks(world.buildings)
  if (links.length > 0) {
    const tiers = lineageEraTiers(world.lineage_eras)
    for (const link of links) {
      drawRail(
        ctx,
        (link.a.x - ox) * TILE,
        (link.a.y - oy) * TILE,
        (link.b.x - ox) * TILE,
        (link.b.y - oy) * TILE,
      )
    }
    for (const link of links) {
      drawTrain(
        ctx,
        (link.a.x - ox) * TILE,
        (link.a.y - oy) * TILE,
        (link.b.x - ox) * TILE,
        (link.b.y - oy) * TILE,
        trainProgress(link, world.tick),
        tiers.get(link.owner) ?? 5,
        t,
      )
    }
  }

  if (!cfLanduse && world.plantings && world.plantings.length >= 4) {
    const flat = world.plantings
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const localX = flat[i]! - ox
      const localY = flat[i + 1]! - oy
      if (localX < c0 - 1 || localX > c1 || localY < r0 - 1 || localY > r1) continue
      drawPlanting(ctx, localX * TILE, localY * TILE, flat[i + 2]!, flat[i + 3]!)
    }
  }

  if (!cfActive('roads')) drawTradeNetwork2D(ctx, world, { c0, c1, r0, r1 }, t, 'roads')
}
