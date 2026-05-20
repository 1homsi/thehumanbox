import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshBasicMaterial } from 'three'
import type { WorldState } from '../types'
import { lineageColor } from '../utils/constants'
import { heightAt } from './terrain-utils'
import { TILE_SCALE } from './constants'

interface Props {
  territory: NonNullable<WorldState['territory']>
  depthMap:  number[][]
  biomes:    number[][]
}

const HOVER_Y = 0.25

// Parse an hsl(...) string into [r, g, b] in [0,1] range
function hslToRgb(hsl: string): [number, number, number] {
  const tmp = new Color()
  tmp.setStyle(hsl)
  return [tmp.r, tmp.g, tmp.b]
}

// Build a flat BufferGeometry of quads (2 triangles each) for an array of [x,y] tiles,
// each quad gets a uniform colour via vertex colors.
function buildTileGeometry(
  tiles: [number, number][],
  colorFn: (ix: number, iy: number) => [number, number, number],
  depthMap: number[][],
  biomes:   number[][],
): BufferGeometry {
  const n = tiles.length
  if (n === 0) return new BufferGeometry()

  const positions = new Float32Array(n * 4 * 3) // 4 verts per quad, 3 floats each
  const colors    = new Float32Array(n * 4 * 3)
  const indices   = new Uint32Array(n * 6)       // 2 tris per quad

  for (let i = 0; i < n; i++) {
    const [ix, iy] = tiles[i]
    const wx = ix * TILE_SCALE
    const wz = iy * TILE_SCALE
    const wy = heightAt(ix, iy, depthMap, biomes) + HOVER_Y
    const s  = TILE_SCALE

    // four corners: TL, TR, BL, BR
    const base = i * 4 * 3
    positions[base + 0]  = wx;     positions[base + 1]  = wy; positions[base + 2]  = wz
    positions[base + 3]  = wx + s; positions[base + 4]  = wy; positions[base + 5]  = wz
    positions[base + 6]  = wx;     positions[base + 7]  = wy; positions[base + 8]  = wz + s
    positions[base + 9]  = wx + s; positions[base + 10] = wy; positions[base + 11] = wz + s

    const [r, g, b] = colorFn(ix, iy)
    for (let v = 0; v < 4; v++) {
      colors[base + v * 3 + 0] = r
      colors[base + v * 3 + 1] = g
      colors[base + v * 3 + 2] = b
    }

    const vi = i * 4
    const ii = i * 6
    // tri 0: TL, BL, TR
    indices[ii + 0] = vi;     indices[ii + 1] = vi + 2; indices[ii + 2] = vi + 1
    // tri 1: TR, BL, BR
    indices[ii + 3] = vi + 1; indices[ii + 4] = vi + 2; indices[ii + 5] = vi + 3
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('color',    new BufferAttribute(colors,    3))
  geo.setIndex(new BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  return geo
}

// Claimed territory mesh — one mesh per lineage colour, but we union all tiles
// into a single geometry with per-vertex colours for efficiency.
function ClaimedMesh({ territory, depthMap, biomes }: Props) {
  const geo = useMemo(() => {
    const allTiles: [number, number][] = []
    const tileToColor = new Map<string, [number, number, number]>()

    for (const entry of territory.claimed) {
      const rgb = hslToRgb(lineageColor(entry.lid))
      for (const tile of entry.tiles) {
        const key = `${tile[0]},${tile[1]}`
        if (!tileToColor.has(key)) {
          allTiles.push(tile)
          tileToColor.set(key, rgb)
        }
      }
    }

    return buildTileGeometry(
      allTiles,
      (ix, iy) => tileToColor.get(`${ix},${iy}`) ?? [1, 1, 1],
      depthMap,
      biomes,
    )
  }, [territory.claimed, depthMap, biomes])

  return (
    <mesh geometry={geo} renderOrder={1}>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.36}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  )
}

// Contested tile mesh — white with pulsing opacity
function ContestedMesh({
  territory, depthMap, biomes,
}: Props) {
  const matRef = useRef<MeshBasicMaterial>(null)

  const geo = useMemo(() => {
    const tiles = territory.contested
    if (!tiles || tiles.length === 0) return new BufferGeometry()
    return buildTileGeometry(
      tiles,
      () => [1, 1, 1],
      depthMap,
      biomes,
    )
  }, [territory.contested, depthMap, biomes])

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.opacity = 0.18 + 0.22 * Math.abs(Math.sin(clock.elapsedTime * 2.4))
    }
  })

  if (!territory.contested || territory.contested.length === 0) return null

  return (
    <mesh geometry={geo} renderOrder={2}>
      <meshBasicMaterial
        ref={matRef}
        color="#ffffff"
        transparent
        opacity={0.28}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  )
}

export function TerritoryOverlay({ territory, depthMap, biomes }: Props) {
  if (!territory.claimed || territory.claimed.length === 0) return null

  return (
    <group>
      <ClaimedMesh   territory={territory} depthMap={depthMap} biomes={biomes} />
      <ContestedMesh territory={territory} depthMap={depthMap} biomes={biomes} />
    </group>
  )
}
