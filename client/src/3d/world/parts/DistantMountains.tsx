import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide } from 'three'
import { TILE_SCALE } from './constants'
import { getWildernessPalette, type WildernessWeather } from './wilderness-palette'

interface Props {
  width: number
  height: number
  dayProgress: number
  weatherKind?: WildernessWeather
}

interface RidgeSpec {
  radius: number
  segments: number
  height: number
  variation: number
  seed: number
}

function hash(index: number, seed: number): number {
  const value = Math.sin((index + seed * 31.7) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function ridgeHeight(index: number, spec: RidgeSpec): number {
  const broad = Math.sin(index * 0.19 + spec.seed) * 0.42
  const medium = Math.sin(index * 0.47 + spec.seed * 2.1) * 0.24
  const detail = (hash(index, spec.seed) - 0.5) * 0.68
  return spec.height + (broad + medium + detail) * spec.variation
}

function buildRidgeRing(cx: number, cz: number, spec: RidgeSpec): BufferGeometry {
  const positions = new Float32Array(spec.segments * 4 * 3)
  const colors = new Float32Array(spec.segments * 4 * 3)
  const indices = new Uint32Array(spec.segments * 6)
  const bottom = -100
  for (let index = 0; index < spec.segments; index++) {
    const next = (index + 1) % spec.segments
    const a0 = (index / spec.segments) * Math.PI * 2
    const a1 = (next / spec.segments) * Math.PI * 2
    const radius0 = spec.radius + (hash(index, spec.seed + 7) - 0.5) * 28
    const radius1 = spec.radius + (hash(next, spec.seed + 7) - 0.5) * 28
    const h0 = ridgeHeight(index, spec)
    const h1 = ridgeHeight(next, spec)
    const base = index * 4
    const vertices = [
      [cx + Math.cos(a0) * radius0, bottom, cz + Math.sin(a0) * radius0],
      [cx + Math.cos(a0) * radius0, h0, cz + Math.sin(a0) * radius0],
      [cx + Math.cos(a1) * radius1, bottom, cz + Math.sin(a1) * radius1],
      [cx + Math.cos(a1) * radius1, h1, cz + Math.sin(a1) * radius1],
    ]
    for (let vertex = 0; vertex < vertices.length; vertex++) {
      const offset = (base + vertex) * 3
      positions[offset] = vertices[vertex][0]
      positions[offset + 1] = vertices[vertex][1]
      positions[offset + 2] = vertices[vertex][2]
      const shade = vertex === 0 || vertex === 2 ? 0.72 : 1
      colors[offset] = shade
      colors[offset + 1] = shade
      colors[offset + 2] = shade
    }
    const ii = index * 6
    indices[ii] = base
    indices[ii + 1] = base + 1
    indices[ii + 2] = base + 2
    indices[ii + 3] = base + 2
    indices[ii + 4] = base + 1
    indices[ii + 5] = base + 3
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

export function DistantMountains({ width, height, dayProgress, weatherKind = 'clear' }: Props) {
  const palette = getWildernessPalette(dayProgress, weatherKind)
  const ridges = useMemo(() => {
    const cx = width * TILE_SCALE * 0.5
    const cz = height * TILE_SCALE * 0.5
    const mapRadius = Math.max(width, height) * TILE_SCALE * 0.5
    return {
      far: buildRidgeRing(cx, cz, {
        radius: mapRadius + 520,
        segments: 112,
        height: 360,
        variation: 190,
        seed: 31,
      }),
      mid: buildRidgeRing(cx, cz, {
        radius: mapRadius + 330,
        segments: 128,
        height: 270,
        variation: 150,
        seed: 17,
      }),
      near: buildRidgeRing(cx, cz, {
        radius: mapRadius + 180,
        segments: 144,
        height: 180,
        variation: 100,
        seed: 7,
      }),
    }
  }, [width, height])

  useEffect(
    () => () => {
      ridges.far.dispose()
      ridges.mid.dispose()
      ridges.near.dispose()
    },
    [ridges],
  )

  return (
    <group renderOrder={-1}>
      <mesh geometry={ridges.far} frustumCulled={false}>
        <meshBasicMaterial color={palette.ridgeFar} vertexColors side={DoubleSide} fog toneMapped />
      </mesh>
      <mesh geometry={ridges.mid} frustumCulled={false}>
        <meshBasicMaterial color={palette.ridgeMid} vertexColors side={DoubleSide} fog toneMapped />
      </mesh>
      <mesh geometry={ridges.near} frustumCulled={false}>
        <meshBasicMaterial color={palette.ridgeNear} vertexColors side={DoubleSide} fog toneMapped />
      </mesh>
    </group>
  )
}
