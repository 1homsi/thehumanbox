import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshBasicMaterial } from 'three'
import type { TribalRelation, WorldState } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { territoryStanding, territoryTileToViewport } from '../../../world/territory'
import { heightAt } from './terrain-utils'
import { TILE_SCALE } from './constants'

interface TerrainProps {
  territory: NonNullable<WorldState['territory']>
  depthMap: number[][]
  biomes: number[][]
  originX: number
  originY: number
}

interface Props extends TerrainProps {
  relations: TribalRelation[]
  focus: string
}

const HOVER_Y = 0.25

// Parse an hsl(...) string into [r, g, b] in [0,1] range
function hslToRgb(hsl: string): [number, number, number] {
  const tmp = new Color()
  tmp.setStyle(hsl)
  return [tmp.r, tmp.g, tmp.b]
}

function emphasizedRgb(
  rgb: [number, number, number],
  standing: ReturnType<typeof territoryStanding>,
): [number, number, number] {
  const mix = (target: [number, number, number], amount: number): [number, number, number] => [
    rgb[0] * (1 - amount) + target[0] * amount,
    rgb[1] * (1 - amount) + target[1] * amount,
    rgb[2] * (1 - amount) + target[2] * amount,
  ]
  switch (standing) {
    case 'self':
      return mix([1, 0.82, 0.32], 0.55)
    case 'ally':
      return mix([0.2, 0.9, 0.46], 0.48)
    case 'rival':
      return mix([1, 0.18, 0.16], 0.55)
    case 'neutral':
      return [rgb[0] * 0.34, rgb[1] * 0.34, rgb[2] * 0.34]
    default:
      return rgb
  }
}

// Build a flat BufferGeometry of quads (2 triangles each) for an array of [x,y] tiles,
// each quad gets a uniform colour via vertex colors.
function buildTileGeometry(
  tiles: [number, number][],
  colorFn: (ix: number, iy: number) => [number, number, number],
  depthMap: number[][],
  biomes: number[][],
  originX: number,
  originY: number,
): BufferGeometry {
  const n = tiles.length
  if (n === 0) return new BufferGeometry()

  const positions = new Float32Array(n * 4 * 3) // 4 verts per quad, 3 floats each
  const colors = new Float32Array(n * 4 * 3)
  const indices = new Uint32Array(n * 6) // 2 tris per quad

  for (let i = 0; i < n; i++) {
    const [ix, iy] = tiles[i]
    const [localX, localY] = territoryTileToViewport(ix, iy, originX, originY)
    const wx = localX * TILE_SCALE
    const wz = localY * TILE_SCALE
    const wy = heightAt(localX, localY, depthMap, biomes) + HOVER_Y
    const s = TILE_SCALE

    // four corners: TL, TR, BL, BR
    const base = i * 4 * 3
    positions[base + 0] = wx
    positions[base + 1] = wy
    positions[base + 2] = wz
    positions[base + 3] = wx + s
    positions[base + 4] = wy
    positions[base + 5] = wz
    positions[base + 6] = wx
    positions[base + 7] = wy
    positions[base + 8] = wz + s
    positions[base + 9] = wx + s
    positions[base + 10] = wy
    positions[base + 11] = wz + s

    const [r, g, b] = colorFn(ix, iy)
    for (let v = 0; v < 4; v++) {
      colors[base + v * 3 + 0] = r
      colors[base + v * 3 + 1] = g
      colors[base + v * 3 + 2] = b
    }

    const vi = i * 4
    const ii = i * 6
    // tri 0: TL, BL, TR
    indices[ii + 0] = vi
    indices[ii + 1] = vi + 2
    indices[ii + 2] = vi + 1
    // tri 1: TR, BL, BR
    indices[ii + 3] = vi + 1
    indices[ii + 4] = vi + 2
    indices[ii + 5] = vi + 3
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.setIndex(new BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  return geo
}

// Claimed territory mesh - one mesh per lineage colour, but we union all tiles
// into a single geometry with per-vertex colours for efficiency.
function ClaimedMesh({ territory, depthMap, biomes, originX, originY, focus, relations }: Props) {
  const geo = useMemo(() => {
    const allTiles: [number, number][] = []
    const tileToColor = new Map<string, [number, number, number]>()

    const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
    for (const entry of territory.claimed) {
      const rgb = emphasizedRgb(
        hslToRgb(lineageColor(entry.lid)),
        territoryStanding(entry.lid, focusedLineage, relations),
      )
      for (const tile of entry.tiles) {
        const [localX, localY] = territoryTileToViewport(tile[0], tile[1], originX, originY)
        if (
          localX < 0 ||
          localY < 0 ||
          localY >= depthMap.length ||
          localX >= (depthMap[localY]?.length ?? 0)
        ) {
          continue
        }
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
      originX,
      originY,
    )
  }, [territory.claimed, depthMap, biomes, originX, originY, focus, relations])

  // Dispose the buffer geometry when the memo replaces it - territory
  // updates land every cold frame and three.js never auto-frees these.
  useEffect(
    () => () => {
      geo.dispose()
    },
    [geo],
  )

  return (
    <mesh geometry={geo} renderOrder={1}>
      <meshBasicMaterial vertexColors transparent opacity={0.36} depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}

// Contested tile mesh - white with pulsing opacity
function ContestedMesh({ territory, depthMap, biomes, originX, originY }: TerrainProps) {
  const matRef = useRef<MeshBasicMaterial>(null)

  const geo = useMemo(() => {
    const tiles = territory.contested.filter(([x, y]) => {
      const [localX, localY] = territoryTileToViewport(x, y, originX, originY)
      return (
        localX >= 0 && localY >= 0 && localY < depthMap.length && localX < (depthMap[localY]?.length ?? 0)
      )
    })
    if (!tiles || tiles.length === 0) return new BufferGeometry()
    return buildTileGeometry(tiles, () => [1, 1, 1], depthMap, biomes, originX, originY)
  }, [territory.contested, depthMap, biomes, originX, originY])

  // Dispose the contested-tile geometry on each refresh.
  useEffect(
    () => () => {
      geo.dispose()
    },
    [geo],
  )

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

export function TerritoryOverlay({ territory, relations, focus, depthMap, biomes, originX, originY }: Props) {
  if (!territory.claimed || territory.claimed.length === 0) return null

  return (
    <group>
      <ClaimedMesh
        territory={territory}
        relations={relations}
        focus={focus}
        depthMap={depthMap}
        biomes={biomes}
        originX={originX}
        originY={originY}
      />
      <ContestedMesh
        territory={territory}
        depthMap={depthMap}
        biomes={biomes}
        originX={originX}
        originY={originY}
      />
    </group>
  )
}
