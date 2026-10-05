import { tileHash } from 'cubeforge'
import type { TileLayerData } from 'cubeforge'
import { TILE } from '../../model/palette'
import { VARIANTS, terrainTilesetPixels } from './tileset'

/**
 * What the TileLayer shader would put on screen for the terrain at 1:1 (one world pixel per
 * device pixel, no jitter, no opacity), computed on the CPU: the cell's variant by `tileHash`,
 * the atlas texel times the tint. Used by tests and by the parity harness to compare the
 * TileLayer ground against the canvas painter over the whole world without a GPU.
 *
 * Returns an RGBA image of `layer.width * TILE` by `layer.height * TILE` pixels.
 */
export function emulateTerrainLayer(layer: TileLayerData): Uint8ClampedArray {
  const px = terrainTilesetPixels()
  const W = layer.width * TILE
  const H = layer.height * TILE
  const out = new Uint8ClampedArray(W * H * 4)
  const tints = layer.tints
  for (let row = 0; row < layer.height; row++) {
    for (let col = 0; col < layer.width; col++) {
      const i = row * layer.width + col
      let id = layer.tiles[i]
      if (id === 0) continue
      // Variants are the consecutive ids from the head: head + (hash % VARIANTS).
      const head = id
      id = head + (tileHash(col, row) % VARIANTS)
      const slot = id - 1
      const ax = (slot % px.columns) * TILE
      const ay = Math.floor(slot / px.columns) * TILE
      const tr = tints ? tints[i * 4] : 255
      const tg = tints ? tints[i * 4 + 1] : 255
      const tb = tints ? tints[i * 4 + 2] : 255
      for (let ty = 0; ty < TILE; ty++) {
        let a = ((ay + ty) * px.width + ax) * 4
        let o = ((row * TILE + ty) * W + col * TILE) * 4
        for (let tx = 0; tx < TILE; tx++, a += 4, o += 4) {
          out[o] = Math.round((px.data[a] * tr) / 255)
          out[o + 1] = Math.round((px.data[a + 1] * tg) / 255)
          out[o + 2] = Math.round((px.data[a + 2] * tb) / 255)
          out[o + 3] = 255
        }
      }
    }
  }
  return out
}
