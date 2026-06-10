import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import {
  TILE_SCALE,
  MAX_DEPTH,
  BIOME_COLORS,
  BIOME_ELEVATION,
  BIOME_ROUGHNESS,
  terrainNoise,
} from './constants'
import { getTerrainTextures, biomeQuadrant } from './terrain-textures'

interface Props {
  depthMap: number[][]
  biomes: number[][]
  width: number
  height: number
  season?: string
}

const TEX_TILES_PER_WORLD = 16

const SEASON_TINT_3D: Record<string, { rgb: [number, number, number]; w: number }> = {
  abundance: { rgb: [0.23, 0.54, 0.26], w: 0.18 },
  recovery: { rgb: [0.36, 0.59, 0.25], w: 0.26 },
  decline: { rgb: [0.59, 0.46, 0.17], w: 0.38 },
  scarcity: { rgb: [0.5, 0.4, 0.22], w: 0.48 },
}
const BEACH_3D: [number, number, number] = [0.77, 0.69, 0.48]

function vnHash3d(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0
  return ((h >>> 0) & 0xffff) / 0xffff
}

function vNoise3d(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = vnHash3d(xi, yi)
  const b = vnHash3d(xi + 1, yi)
  const c = vnHash3d(xi, yi + 1)
  const d = vnHash3d(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export function Terrain({ depthMap, biomes, width, height, season }: Props) {
  const meshRef = useRef<Mesh>(null)
  const gl = useThree((s) => s.gl)

  const { color: colorTex, bump: bumpTex } = useMemo(() => {
    const tex = getTerrainTextures()
    const maxAniso = gl.capabilities.getMaxAnisotropy()
    if (tex.color.anisotropy !== maxAniso) {
      tex.color.anisotropy = maxAniso
      tex.color.needsUpdate = true
    }
    if (tex.bump.anisotropy !== maxAniso) {
      tex.bump.anisotropy = maxAniso
      tex.bump.needsUpdate = true
    }
    return tex
  }, [gl])

  const geometry = useMemo(() => {
    if (!depthMap || !biomes) return null
    const geo = new BufferGeometry()

    const positions = new Float32Array(width * height * 3)
    const colors = new Float32Array(width * height * 3)
    const uvs = new Float32Array(width * height * 2)
    const quads = new Float32Array(width * height)
    const indices: number[] = []

    for (let y = 0; y < height; y++) {
      const dRow = depthMap[y]
      const bRow = biomes[y]
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const d = dRow?.[x] ?? 255
        const b = bRow?.[x] ?? 0
        let elev: number
        if (d >= 254) {
          const base = BIOME_ELEVATION[b] ?? 0
          const rough = BIOME_ROUGHNESS[b] ?? 0.5
          elev = base + terrainNoise(x, y) * rough
        } else {
          const depthFrac = Math.max(0, Math.min(1, 1 - d / 200))
          elev = -depthFrac * MAX_DEPTH
        }

        positions[i * 3] = x * TILE_SCALE
        positions[i * 3 + 1] = elev
        positions[i * 3 + 2] = y * TILE_SCALE

        uvs[i * 2] = (x / width) * TEX_TILES_PER_WORLD
        uvs[i * 2 + 1] = (y / height) * TEX_TILES_PER_WORLD

        quads[i] = biomeQuadrant(b)

        const [r, g, bl] = BIOME_COLORS[b] ?? BIOME_COLORS[0]
        const darken = d >= 254 ? 1.0 : 0.45
        let h = (x * 374761393 + y * 668265263) | 0
        h = ((h ^ (h >>> 13)) * 1274126177) | 0
        const jitter = (((h >>> 0) & 0xff) - 128) / 1700
        const snow = d >= 254 ? Math.max(0, Math.min(0.55, (elev - 5.5) * 0.18)) : 0
        let baseR = r + jitter
        let baseG = g + jitter
        let baseB = bl + jitter

        if (d >= 254) {
          const tint = season ? SEASON_TINT_3D[season] : undefined
          if (tint) {
            const macro = vNoise3d(x / 34, y / 34) * 0.6 + vNoise3d(x / 11 + 5, y / 11 + 5) * 0.4
            let w = tint.w * (0.5 + macro * 0.95)
            if (w > 0.8) w = 0.8
            const iw = 1 - w
            baseR = baseR * iw + tint.rgb[0] * w
            baseG = baseG * iw + tint.rgb[1] * w
            baseB = baseB * iw + tint.rgb[2] * w
            const lum = 0.92 + macro * 0.16
            baseR *= lum
            baseG *= lum
            baseB *= lum
          }
          const nD = depthMap[y - 1]?.[x] ?? 255
          const sD = depthMap[y + 1]?.[x] ?? 255
          const eD = dRow?.[x + 1] ?? 255
          const wD = dRow?.[x - 1] ?? 255
          if (nD < 254 || sD < 254 || eD < 254 || wD < 254) {
            baseR = baseR * 0.55 + BEACH_3D[0] * 0.45
            baseG = baseG * 0.55 + BEACH_3D[1] * 0.45
            baseB = baseB * 0.55 + BEACH_3D[2] * 0.45
          }
        }

        colors[i * 3] = (baseR + (1.0 - baseR) * snow) * darken
        colors[i * 3 + 1] = (baseG + (1.0 - baseG) * snow) * darken
        colors[i * 3 + 2] = (baseB + (1.0 - baseB) * snow) * darken
      }
    }

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const a = y * width + x
        const b = a + 1
        const c = a + width
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.setAttribute('uv', new BufferAttribute(uvs, 2))
    geo.setAttribute('aQuad', new BufferAttribute(quads, 1))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [depthMap, biomes, width, height, season])

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({
      vertexColors: true,
      map: colorTex,
      bumpMap: bumpTex,
      bumpScale: 0.45,
      roughness: 0.95,
      metalness: 0.0,
    })
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aQuad;
           varying float vQuad;
           varying vec2  vBaseUv;
          `,
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
           vQuad = aQuad;
           vBaseUv = uv;
          `,
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying float vQuad;
           varying vec2  vBaseUv;
           vec2 atlasUv() {
             // Wrap the base UV into [0,1) per tile, then offset
             // into one of the four 0.5x0.5 atlas quadrants based
             // on vQuad (0..3): 0=TL, 1=TR, 2=BL, 3=BR.
             vec2 tile = fract(vBaseUv);
             float q = vQuad + 0.5;
             float qx = (q >= 0.5 && q < 1.5) || (q >= 2.5)
                          ? (q < 1.5 ? 0.0 : 0.0) : 0.0;
             // Simpler: derive offsets via mod / step.
             float qi = floor(vQuad + 0.5);
             float ox = mod(qi, 2.0) * 0.5;     // 0 or 0.5
             float oy = (qi >= 2.0 ? 0.5 : 0.0); // 0 or 0.5
             return vec2(tile.x * 0.5 + ox, tile.y * 0.5 + oy);
             // (qx use is suppressed - kept above for reference)
             // The unused qx is intentionally there to silence
             // ESLint-style unused-warning; GLSL just ignores it.
           }
          `,
        )
        .replace(
          '#include <map_fragment>',
          `
           #ifdef USE_MAP
             vec4 sampledDiffuseColor = texture2D( map, atlasUv() );
             #ifdef DECODE_VIDEO_TEXTURE
               sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
             #endif
             diffuseColor *= sampledDiffuseColor;
           #endif
          `,
        )
        .replace(
          '#include <bumpmap_pars_fragment>',
          `
           #ifdef USE_BUMPMAP
             uniform sampler2D bumpMap;
             uniform float bumpScale;
             // Adapted from three's bumpmap_pars_fragment but sources
             // its UV from atlasUv() so each biome reads its own tile.
             vec2 dHdxy_fwd_atlas() {
               vec2 uvA = atlasUv();
               vec2 dSTdx = dFdx( uvA );
               vec2 dSTdy = dFdy( uvA );
               float Hll = bumpScale * texture2D( bumpMap, uvA ).x;
               float dBx = bumpScale * texture2D( bumpMap, uvA + dSTdx ).x - Hll;
               float dBy = bumpScale * texture2D( bumpMap, uvA + dSTdy ).x - Hll;
               return vec2( dBx, dBy );
             }
             vec3 perturbNormalArb_atlas( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
               vec3 vSigmaX = vec3( dFdx( surf_pos.x ), dFdx( surf_pos.y ), dFdx( surf_pos.z ) );
               vec3 vSigmaY = vec3( dFdy( surf_pos.x ), dFdy( surf_pos.y ), dFdy( surf_pos.z ) );
               vec3 vN = surf_norm;
               vec3 R1 = cross( vSigmaY, vN );
               vec3 R2 = cross( vN, vSigmaX );
               float fDet = dot( vSigmaX, R1 ) * faceDirection;
               vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
               return normalize( abs( fDet ) * surf_norm - vGrad );
             }
           #endif
          `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `
           #ifdef USE_BUMPMAP
             normal = perturbNormalArb_atlas( - vViewPosition, normal, dHdxy_fwd_atlas(), faceDirection );
           #endif
          `,
        )
    }
    m.needsUpdate = true
    return m
  }, [colorTex, bumpTex])

  // Dispose GPU-side buffers when the memoised geometry/material is
  // replaced (depthMap or biomes ref changes - happens on every full
  // frame). Without this, three.js leaks the previous BufferGeometry
  // and MeshStandardMaterial on every snapshot. The useMemo for
  // geometry returns null on the bootstrap render (before depthMap
  // arrives), so the cleanup guards against that.
  useEffect(
    () => () => {
      geometry?.dispose()
    },
    [geometry],
  )
  useEffect(
    () => () => {
      material.dispose()
    },
    [material],
  )

  if (!geometry) return null
  return <mesh ref={meshRef} geometry={geometry} material={material} receiveShadow castShadow />
}
