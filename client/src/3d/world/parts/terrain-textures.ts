import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipMapLinearFilter, RGBAFormat } from 'three'
const TILE = 1024
const ATLAS = TILE * 2

let _cache: { color: DataTexture; bump: DataTexture } | null = null

function makeNoise() {
  const hash = (x: number, y: number, salt: number): number => {
    let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
    return (h & 0xffff) / 0xffff
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const noise = (x: number, y: number, salt = 0) => {
    const x0 = Math.floor(x),
      y0 = Math.floor(y)
    const tx = smooth(x - x0),
      ty = smooth(y - y0)
    const a = hash(x0, y0, salt)
    const b = hash(x0 + 1, y0, salt)
    const c = hash(x0, y0 + 1, salt)
    const d = hash(x0 + 1, y0 + 1, salt)
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
  }
  return { noise, hash }
}

function paintTile(cbuf: Uint8Array, bbuf: Uint8Array, tx: number, ty: number, variant: 0 | 1 | 2 | 3) {
  const { noise } = makeNoise()
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const x = px,
        y = py
      let r = 1.0,
        g = 1.0,
        b = 1.0

      // 7-octave fractal — bigger structure to grain-level
      const o0 = noise(x / 256, y / 256, variant) * 0.35
      const o1 = noise(x / 96, y / 96, variant + 3) * 0.25
      const o2 = noise(x / 32, y / 32, variant + 7) * 0.18
      const o3 = noise(x / 14, y / 14, variant + 11) * 0.12
      const o4 = noise(x / 5, y / 5, variant + 13) * 0.06
      const o5 = noise(x / 2.2, y / 2.2, variant + 17) * 0.03
      const o6 = noise(x / 1.0, y / 1.0, variant + 19) * 0.01
      const n = o0 + o1 + o2 + o3 + o4 + o5 + o6
      // separate fine-scale grit channel for bump
      const grit =
        noise(x / 2.5, y / 2.5, variant + 23) * 0.45 +
        noise(x / 6, y / 6, variant + 29) * 0.3 +
        noise(x / 18, y / 18, variant + 31) * 0.15 +
        noise(x / 1.4, y / 1.4, variant + 37) * 0.1
      let bumpStr = grit

      // Subtle color variation overlay — three-way mix so the same biome
      // shows patches of slightly different hue rather than one flat tone.
      const patch = noise(x / 110, y / 110, variant + 41) * 0.6 + noise(x / 40, y / 40, variant + 43) * 0.4

      switch (variant) {
        case 0: {
          // Grass — mix three greens
          const tone = 0.78 + n * 0.32
          const cool = patch
          const warm = 1 - patch
          r = tone * (0.78 + 0.15 * warm)
          g = tone * (1.0 + 0.08 * cool)
          b = tone * (0.72 + 0.18 * cool)
          break
        }
        case 1: {
          // Sand / dry — soft sand blend
          const tone = 0.88 + n * 0.26
          r = tone * (1.0 + 0.08 * patch)
          g = tone * (0.94 + 0.05 * patch)
          b = tone * (0.78 + 0.06 * (1 - patch))
          bumpStr = grit * 1.0
          break
        }
        case 2: {
          // Rocky / stone
          const tone = 0.66 + n * 0.42
          r = tone * (0.94 + 0.05 * patch)
          g = tone * (0.94 + 0.04 * patch)
          b = tone * (0.96 + 0.04 * (1 - patch))
          bumpStr = Math.min(1, grit * 1.4)
          break
        }
        case 3: {
          // Wet / mossy — darker green-brown
          const tone = 0.7 + n * 0.36
          r = tone * (0.78 + 0.08 * (1 - patch))
          g = tone * (0.92 + 0.06 * patch)
          b = tone * (0.7 + 0.08 * patch)
          break
        }
      }

      const ax = tx + px
      const ay = ty + py
      const ci = (ay * ATLAS + ax) * 4
      cbuf[ci] = Math.max(0, Math.min(255, Math.round(r * 255)))
      cbuf[ci + 1] = Math.max(0, Math.min(255, Math.round(g * 255)))
      cbuf[ci + 2] = Math.max(0, Math.min(255, Math.round(b * 255)))
      cbuf[ci + 3] = 255

      const bv = Math.max(0, Math.min(255, Math.round(bumpStr * 255)))
      bbuf[ci] = bv
      bbuf[ci + 1] = bv
      bbuf[ci + 2] = bv
      bbuf[ci + 3] = 255
    }
  }
}

export function getTerrainTextures(): { color: DataTexture; bump: DataTexture } {
  if (_cache) return _cache

  const colorBuf = new Uint8Array(ATLAS * ATLAS * 4)
  const bumpBuf = new Uint8Array(ATLAS * ATLAS * 4)

  paintTile(colorBuf, bumpBuf, 0, 0, 0)
  paintTile(colorBuf, bumpBuf, TILE, 0, 1)
  paintTile(colorBuf, bumpBuf, 0, TILE, 2)
  paintTile(colorBuf, bumpBuf, TILE, TILE, 3)

  const color = new DataTexture(colorBuf, ATLAS, ATLAS, RGBAFormat)
  color.wrapS = ClampToEdgeWrapping
  color.wrapT = ClampToEdgeWrapping
  color.magFilter = LinearFilter
  color.minFilter = LinearMipMapLinearFilter
  color.generateMipmaps = true
  color.anisotropy = 16
  color.needsUpdate = true

  const bump = new DataTexture(bumpBuf, ATLAS, ATLAS, RGBAFormat)
  bump.wrapS = ClampToEdgeWrapping
  bump.wrapT = ClampToEdgeWrapping
  bump.magFilter = LinearFilter
  bump.minFilter = LinearMipMapLinearFilter
  bump.generateMipmaps = true
  bump.anisotropy = 16
  bump.needsUpdate = true

  _cache = { color, bump }
  return _cache
}

export function biomeQuadrant(biomeId: number): number {
  switch (biomeId) {
    case 0:
      return 0
    case 1:
      return 3
    case 2:
      return 1
    case 3:
      return 0
    case 4:
      return 1
    case 5:
      return 2
    default:
      return 0
  }
}
