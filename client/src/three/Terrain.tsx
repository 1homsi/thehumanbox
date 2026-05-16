import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TILE_SCALE, MAX_DEPTH, BIOME_COLORS, BIOME_ELEVATION, BIOME_ROUGHNESS, terrainNoise } from './constants'

interface Props {
  depthMap: number[][]   // [row][col], 0=deepest water, 255=land
  biomes:   number[][]   // [row][col], biome enum id 0-5
  width:    number
  height:   number
}

// One BufferGeometry over the whole 600x300 grid. ~180k vertices,
// ~358k triangles - well within desktop budget. If chunking becomes
// necessary later, this component is the swap site (build N chunk
// meshes + frustum-cull instead).
//
// Coordinate mapping:
//   2D tile (col, row)  ->  3D position (col*S, y, row*S)
// where S = TILE_SCALE and y is:
//   land:  BIOME_ELEVATION[biome]
//   water: -(1 - depth/200) * MAX_DEPTH    (depth_map value <255)
export function Terrain({ depthMap, biomes, width, height }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)

  const geometry = useMemo(() => {
    if (!depthMap || !biomes) return null
    const geo = new THREE.BufferGeometry()

    const positions = new Float32Array(width * height * 3)
    const colors    = new Float32Array(width * height * 3)
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
          // Land: base biome elevation + noise variation. Volcanic
          // gets dramatic peaks (rough=6), grassland gentle rolls
          // (rough=0.6), wetland nearly flat.
          const base   = BIOME_ELEVATION[b] ?? 0
          const rough  = BIOME_ROUGHNESS[b] ?? 0.5
          elev = base + terrainNoise(x, y) * rough
          // Volcanic biome: extra spike on noise peaks for sharp
          // mountains (raise peaks but keep valleys reasonable).
          if (b === 5 && elev > 6) elev += (elev - 6) * 1.5
        } else {
          // Water - depth_map = (1 - depth) * 200, so depth = 1 - d/200
          const depthFrac = Math.max(0, Math.min(1, 1 - d / 200))
          elev = -depthFrac * MAX_DEPTH
        }

        positions[i * 3]     = x * TILE_SCALE
        positions[i * 3 + 1] = elev
        positions[i * 3 + 2] = y * TILE_SCALE

        const [r, g, bl] = BIOME_COLORS[b] ?? BIOME_COLORS[0]
        // Darken underwater vertices so submerged biomes read as
        // ocean floor instead of bright color through the water plane.
        const darken = d >= 254 ? 1.0 : 0.45
        colors[i * 3]     = r * darken
        colors[i * 3 + 1] = g * darken
        colors[i * 3 + 2] = bl * darken
      }
    }

    // Two triangles per cell (top-left, bottom-right).
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const a = y * width + x
        const b = a + 1
        const c = a + width
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [depthMap, biomes, width, height])

  if (!geometry) return null

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        vertexColors
        flatShading
        roughness={0.95}
        metalness={0.0}
      />
    </mesh>
  )
}
