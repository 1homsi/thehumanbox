import * as THREE from 'three'

// Generate a tileable procedural ground texture on a canvas. We
// don't want to ship binary texture files — instead we write them
// at boot. Result reads as 'soil with grit' from any reasonable
// camera distance: low-octave value noise for chunky tonal
// variation + high-octave hash noise for grit.
//
// Two textures are produced:
//   - colorTex: subtle warm/cool tonal patches modulated around 1.0
//                so it MULTIPLIES with the vertex color (biome paint
//                shows through; texture adds detail).
//   - bumpTex:  greyscale microvariation for normal/bump mapping
//                that gives the surface a non-glossy lit look.
//
// Both are 256×256 with wrap repeat. The terrain UVs tile them
// every TEX_TILES_PER_WORLD units so the pattern stays small.

const SIZE = 256

let _cache: { color: THREE.DataTexture; bump: THREE.DataTexture } | null = null

export function getTerrainTextures(): { color: THREE.DataTexture; bump: THREE.DataTexture } {
  if (_cache) return _cache

  // Value-noise sampler: cheap stable hash → bilinear smoothing.
  const hash = (x: number, y: number): number => {
    let h = (x * 374761393 + y * 668265263) | 0
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
    return (h & 0xffff) / 0xffff
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const noise2 = (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const tx = smooth(x - x0), ty = smooth(y - y0)
    const a = hash(x0,     y0    )
    const b = hash(x0 + 1, y0    )
    const c = hash(x0,     y0 + 1)
    const d = hash(x0 + 1, y0 + 1)
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
  }

  const colorBuf = new Uint8Array(SIZE * SIZE * 4)
  const bumpBuf  = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Low-frequency tonal patches (3 octaves of value noise).
      const n =
        noise2(x / 32, y / 32) * 0.55 +
        noise2(x / 12, y / 12) * 0.30 +
        noise2(x / 4,  y / 4 ) * 0.15
      // Centre around 0.5 so a *2 in the shader puts the multiplier
      // around 1.0 (no global brightness shift on the terrain).
      const tone = 0.78 + n * 0.44   // 0.78 .. 1.22
      // Slight warm/cool drift by location so the texture has
      // believable hue jitter (soil isn't all the same colour).
      const warm = noise2(x / 18 + 41.7, y / 18 + 11.3)
      const r = Math.max(0, Math.min(255, Math.round(tone * 255 * (1.0 + (warm - 0.5) * 0.10))))
      const g = Math.max(0, Math.min(255, Math.round(tone * 255 * (1.0 + (warm - 0.5) * 0.02))))
      const b = Math.max(0, Math.min(255, Math.round(tone * 255 * (1.0 - (warm - 0.5) * 0.06))))
      const ci = (y * SIZE + x) * 4
      colorBuf[ci]     = r
      colorBuf[ci + 1] = g
      colorBuf[ci + 2] = b
      colorBuf[ci + 3] = 255

      // Bump = high-frequency grit. Mix two octaves so it's not flat.
      const grit =
        noise2(x / 2.5, y / 2.5) * 0.7 +
        noise2(x / 6,   y / 6)   * 0.3
      const v = Math.max(0, Math.min(255, Math.round(grit * 255)))
      const bi = (y * SIZE + x) * 4
      bumpBuf[bi]     = v
      bumpBuf[bi + 1] = v
      bumpBuf[bi + 2] = v
      bumpBuf[bi + 3] = 255
    }
  }

  const color = new THREE.DataTexture(colorBuf, SIZE, SIZE, THREE.RGBAFormat)
  color.wrapS = THREE.RepeatWrapping
  color.wrapT = THREE.RepeatWrapping
  color.magFilter = THREE.LinearFilter
  color.minFilter = THREE.LinearMipMapLinearFilter
  color.generateMipmaps = true
  color.anisotropy = 4
  color.needsUpdate = true

  const bump = new THREE.DataTexture(bumpBuf, SIZE, SIZE, THREE.RGBAFormat)
  bump.wrapS = THREE.RepeatWrapping
  bump.wrapT = THREE.RepeatWrapping
  bump.magFilter = THREE.LinearFilter
  bump.minFilter = THREE.LinearMipMapLinearFilter
  bump.generateMipmaps = true
  bump.anisotropy = 4
  bump.needsUpdate = true

  _cache = { color, bump }
  return _cache
}
