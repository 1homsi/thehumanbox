import * as THREE from 'three'

// Procedural terrain texture atlas. We pack four distinct ground
// styles into one 512x512 image (4× 256x256 quadrants) so each
// biome can sample its own micro-pattern via a UV offset in the
// vertex shader. Same single texture binding for the whole world.
//
// Atlas layout (UV space):
//   (0.0..0.5, 0.0..0.5)   quadrant 0  - grass / wetland (green stipple)
//   (0.5..1.0, 0.0..0.5)   quadrant 1  - sand / tundra base (warm grain)
//   (0.0..0.5, 0.5..1.0)   quadrant 2  - rock / volcanic (grey angular)
//   (0.5..1.0, 0.5..1.0)   quadrant 3  - forest litter (dark mottled)
//
// Both colour and bump atlases share the same layout.

const TILE   = 256
const ATLAS  = TILE * 2

let _cache: { color: THREE.DataTexture; bump: THREE.DataTexture } | null = null

// Cheap deterministic value-noise sampler.
function makeNoise() {
  const hash = (x: number, y: number, salt: number): number => {
    let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
    return (h & 0xffff) / 0xffff
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const noise = (x: number, y: number, salt = 0) => {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const tx = smooth(x - x0), ty = smooth(y - y0)
    const a = hash(x0,     y0,     salt)
    const b = hash(x0 + 1, y0,     salt)
    const c = hash(x0,     y0 + 1, salt)
    const d = hash(x0 + 1, y0 + 1, salt)
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
  }
  return { noise, hash }
}

// Render a single tile of the atlas into the buffers. `tx`/`ty` are
// the tile's top-left in the atlas (0 or TILE).
function paintTile(
  cbuf: Uint8Array,
  bbuf: Uint8Array,
  tx: number, ty: number,
  variant: 0 | 1 | 2 | 3,
) {
  const { noise } = makeNoise()
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const x = px, y = py
      // Variant-specific colour multiplier (centred near 1.0 so it
      // multiplies cleanly with the vertex-color biome paint).
      let r = 1.0, g = 1.0, b = 1.0
      let bumpStr = 0.5

      const lo  = noise(x / 32, y / 32, variant) * 0.55
      const mid = noise(x / 12, y / 12, variant + 7) * 0.30
      const hi  = noise(x / 4,  y / 4,  variant + 13) * 0.15
      const n = lo + mid + hi   // 0..1
      const grit = noise(x / 2.5, y / 2.5, variant + 23) * 0.7
                 + noise(x / 6,   y / 6,   variant + 29) * 0.3
      bumpStr = grit

      switch (variant) {
        case 0: { // grass / wetland - green stipple
          const tone = 0.85 + n * 0.35    // 0.85..1.20
          r = tone * 0.95
          g = tone * 1.05
          b = tone * 0.92
          break
        }
        case 1: { // sand / tundra - warm grain
          const tone = 0.88 + n * 0.30
          r = tone * 1.05
          g = tone * 1.00
          b = tone * 0.85
          // Sand has finer grain - more bump weight on high freq.
          bumpStr = grit * 1.15
          break
        }
        case 2: { // rock / volcanic - grey angular
          const tone = 0.70 + n * 0.50
          r = tone * 0.95
          g = tone * 0.95
          b = tone * 0.98
          // Rock bumps are stronger.
          bumpStr = Math.min(1, grit * 1.3)
          break
        }
        case 3: { // forest litter - dark mottled
          const tone = 0.75 + n * 0.40
          r = tone * 0.88
          g = tone * 0.95
          b = tone * 0.80
          break
        }
      }

      const ax = tx + px
      const ay = ty + py
      const ci = (ay * ATLAS + ax) * 4
      cbuf[ci]     = Math.max(0, Math.min(255, Math.round(r * 255)))
      cbuf[ci + 1] = Math.max(0, Math.min(255, Math.round(g * 255)))
      cbuf[ci + 2] = Math.max(0, Math.min(255, Math.round(b * 255)))
      cbuf[ci + 3] = 255

      const bv = Math.max(0, Math.min(255, Math.round(bumpStr * 255)))
      bbuf[ci]     = bv
      bbuf[ci + 1] = bv
      bbuf[ci + 2] = bv
      bbuf[ci + 3] = 255
    }
  }
}

export function getTerrainTextures(): { color: THREE.DataTexture; bump: THREE.DataTexture } {
  if (_cache) return _cache

  const colorBuf = new Uint8Array(ATLAS * ATLAS * 4)
  const bumpBuf  = new Uint8Array(ATLAS * ATLAS * 4)

  paintTile(colorBuf, bumpBuf, 0,    0,    0)   // grass / wetland
  paintTile(colorBuf, bumpBuf, TILE, 0,    1)   // sand / tundra
  paintTile(colorBuf, bumpBuf, 0,    TILE, 2)   // rock / volcanic
  paintTile(colorBuf, bumpBuf, TILE, TILE, 3)   // forest litter

  const color = new THREE.DataTexture(colorBuf, ATLAS, ATLAS, THREE.RGBAFormat)
  // No wrap repeat for the atlas itself - we'll wrap manually in the
  // shader by fract()-ing on each quadrant.
  color.wrapS = THREE.ClampToEdgeWrapping
  color.wrapT = THREE.ClampToEdgeWrapping
  color.magFilter = THREE.LinearFilter
  color.minFilter = THREE.LinearMipMapLinearFilter
  color.generateMipmaps = true
  color.anisotropy = 4
  color.needsUpdate = true

  const bump = new THREE.DataTexture(bumpBuf, ATLAS, ATLAS, THREE.RGBAFormat)
  bump.wrapS = THREE.ClampToEdgeWrapping
  bump.wrapT = THREE.ClampToEdgeWrapping
  bump.magFilter = THREE.LinearFilter
  bump.minFilter = THREE.LinearMipMapLinearFilter
  bump.generateMipmaps = true
  bump.anisotropy = 4
  bump.needsUpdate = true

  _cache = { color, bump }
  return _cache
}

// Map a biome enum id to an atlas quadrant index (0..3).
//   0 Grassland -> 0 (grass)
//   1 Forest    -> 3 (litter)
//   2 Desert    -> 1 (sand)
//   3 Wetland   -> 0 (grass)
//   4 Tundra    -> 1 (sand/tundra)
//   5 Volcanic  -> 2 (rock)
export function biomeQuadrant(biomeId: number): number {
  switch (biomeId) {
    case 0: return 0
    case 1: return 3
    case 2: return 1
    case 3: return 0
    case 4: return 1
    case 5: return 2
    default: return 0
  }
}
