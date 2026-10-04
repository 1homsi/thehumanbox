import { TileLayerData, type Tileset } from 'cubeforge'
import { TILE } from '../../../model/palette'
import { makeCanvas } from './atlas-host'
import type { HeatGrid } from './heatmap'
import { packRgba } from './color'

/** Tile id 1 is a solid square, id 2 a square outline one world pixel thick (tile ids are 1-based). */
export const TILE_SOLID = 1
export const TILE_OUTLINE = 2
const TEXELS = 16

/** A 2-tile atlas for `TileLayer`s that only exist to carry per-tile tint colours. */
export function flatTileset(): Tileset {
  const canvas = makeCanvas(TEXELS * 2, TEXELS)
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#fff'
    g.fillRect(0, 0, TEXELS, TEXELS)
    // 2 texels of a 16-texel tile covering 8 world px: a 1px world outline.
    g.fillRect(TEXELS, 0, TEXELS, 2)
    g.fillRect(TEXELS, TEXELS - 2, TEXELS, 2)
    g.fillRect(TEXELS, 2, 2, TEXELS - 4)
    g.fillRect(TEXELS * 2 - 2, 2, 2, TEXELS - 4)
  }
  return { image: canvas, tileWidth: TEXELS, tileHeight: TEXELS, columns: 2 }
}

export interface TileLayerSet {
  /** Heat map: every overlay, one tint per tile. */
  heat: TileLayerData
  /** Contested border tiles: one white tint whose layer opacity pulses. */
  contested: TileLayerData
  /** Outlines on tiles with structure (the `structures` view flag). */
  outline: TileLayerData
  all: TileLayerData[]
  /** Counters for the benchmark. */
  uploads: { heat: number; contested: number; outline: number }
}

export function createTileLayers(width: number, height: number): TileLayerSet {
  const tileset = flatTileset()
  const make = (zIndex: number) =>
    new TileLayerData({
      width,
      height,
      tileset,
      tinted: true,
      tileWorldWidth: TILE,
      tileWorldHeight: TILE,
      zIndex,
    })
  const heat = make(10)
  const contested = make(10.5)
  const outline = make(10.6)
  // The outline and contested layers have one colour each, set once.
  const white = new Uint8Array(width * height * 4).fill(255)
  contested.setTints(white)
  const edge = new Uint8Array(width * height * 4)
  const c = packRgba(255, 210, 140, 0.7)
  for (let i = 0; i < width * height; i++) {
    edge[i * 4] = (c >>> 24) & 255
    edge[i * 4 + 1] = (c >>> 16) & 255
    edge[i * 4 + 2] = (c >>> 8) & 255
    edge[i * 4 + 3] = c & 255
  }
  outline.setTints(edge)
  contested.opacity = 0
  return { heat, contested, outline, all: [heat, contested, outline], uploads: { heat: 0, contested: 0, outline: 0 } }
}

/** Push a freshly computed heat grid into its tile layer (full replace: ids and tints). */
export function applyHeat(layers: TileLayerSet, grid: HeatGrid): void {
  layers.heat.setTiles(grid.tiles)
  layers.heat.setTints(grid.rgba)
  layers.uploads.heat++
}

