import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SpotLight,
} from 'three'
import type { Building, BuildingFunction, BuildingKind } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[]
  depthMap: number[][]
  biomes: number[][]
}

const FN_DEFAULT: Record<BuildingKind, BuildingFunction> = {
  Hut: 'Housing',
  House: 'Housing',
  Manor: 'Housing',
  TownHouse: 'Housing',
  Apartment: 'Housing',
  School: 'Education',
  University: 'Education',
  Library: 'Education',
  Market: 'Commerce',
  Temple: 'Worship',
  Factory: 'Industry',
  Hospital: 'Healthcare',
  Forge: 'Industry',
  Mill: 'Industry',
  Windmill: 'Industry',
  Watermill: 'Industry',
  Lighthouse: 'Civic',
  Tower: 'Military',
  Bridge: 'Infrastructure',
  Wall: 'Military',
  Aqueduct: 'Infrastructure',
}

const FN_COLOR: Record<BuildingFunction, string> = {
  Housing: '#9a7a50',
  Education: '#d6c39a',
  Industry: '#6a6a6a',
  Healthcare: '#f0f0f0',
  Worship: '#c8a040',
  Military: '#4a4a4a',
  Civic: '#bcb098',
  Commerce: '#c88030',
  Infrastructure: '#8a8a8a',
}

const ROOF_DARK = '#4a2a18'
const ROOF_TILE = '#7a4628'

const HUT_GEO = (() => {
  const g = new ConeGeometry(3.6, 5.2, 5)
  return g
})()
const HOUSE_WALL = new BoxGeometry(6.0, 4.2, 7.0)
const HOUSE_ROOF = (() => {
  const g = new ConeGeometry(4.8, 3.0, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const HOUSE_CHIMNEY = new BoxGeometry(0.7, 1.4, 0.7)
const MANOR_WALL_A = new BoxGeometry(7.6, 7.4, 8.4)
const MANOR_WALL_B = new BoxGeometry(4.8, 5.0, 5.6)
const MANOR_ROOF_A = (() => {
  const g = new ConeGeometry(6.2, 4.0, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const MANOR_ROOF_B = (() => {
  const g = new ConeGeometry(4.0, 2.8, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const TOWNHOUSE_GEO = new BoxGeometry(4.6, 11.2, 5.4)
const TOWNHOUSE_ROOF = (() => {
  const g = new ConeGeometry(3.6, 2.2, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const APARTMENT_GEO = new BoxGeometry(5.6, 14.0, 5.6)
const SCHOOL_MID = new BoxGeometry(2.0, 3.6, 5.0)
const SCHOOL_WING = new BoxGeometry(2.0, 3.6, 2.0)
const UNI_BLOCK = new BoxGeometry(7.0, 7.0, 5.0)
const UNI_COL = new CylinderGeometry(0.32, 0.32, 5.6, 8)
const LIB_BASE = new BoxGeometry(5.0, 3.6, 6.0)
const LIB_ROOF = (() => {
  const g = new ConeGeometry(4.0, 1.8, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const LIB_BOOK = new BoxGeometry(0.5, 0.9, 0.32)
const MARKET_ROOF = new BoxGeometry(5.6, 0.28, 4.4)
const MARKET_POST = new CylinderGeometry(0.18, 0.2, 3.2, 6)
const TEMPLE_T1 = new BoxGeometry(7.0, 2.2, 7.0)
const TEMPLE_T2 = new BoxGeometry(5.4, 2.0, 5.4)
const TEMPLE_T3 = new BoxGeometry(3.8, 1.8, 3.8)
const TEMPLE_T4 = new BoxGeometry(2.2, 1.6, 2.2)
const FACTORY_BLOCK = new BoxGeometry(7.0, 4.4, 5.0)
const FACTORY_STACK = new CylinderGeometry(0.45, 0.55, 5.6, 8)
const HOSP_BLOCK = new BoxGeometry(5.6, 4.4, 5.0)
const HOSP_CROSS_V = new PlaneGeometry(0.6, 1.6)
const HOSP_CROSS_H = new PlaneGeometry(1.6, 0.6)
const FORGE_BLOCK = new BoxGeometry(4.0, 2.6, 4.0)
const FORGE_WIN = new PlaneGeometry(1.2, 0.9)
const MILL_BASE = new BoxGeometry(3.6, 3.4, 3.6)
const MILL_ROOF = (() => {
  const g = new ConeGeometry(3.0, 1.6, 4)
  g.rotateY(Math.PI / 4)
  return g
})()
const BLADE_HUB = new CylinderGeometry(0.28, 0.28, 0.4, 8)
const BLADE_ARM = new BoxGeometry(0.18, 4.4, 0.42)
const WATER_PADDLE = new BoxGeometry(0.22, 3.0, 0.55)
const LIGHTHOUSE_COL = new CylinderGeometry(0.95, 1.2, 8.5, 10)
const LIGHTHOUSE_TOP = new CylinderGeometry(0.65, 0.85, 1.6, 10)
const LIGHTHOUSE_CAP = (() => {
  const g = new ConeGeometry(0.9, 1.0, 8)
  return g
})()
const TOWER_COL = new CylinderGeometry(1.2, 1.4, 9.0, 8)
const TOWER_CAP = (() => {
  const g = new ConeGeometry(1.55, 2.0, 8)
  return g
})()
const BRIDGE_GEO = new BoxGeometry(8.0, 0.5, 1.8)
const WALL_GEO = new BoxGeometry(8.0, 2.4, 0.8)
const AQUE_TOP = new BoxGeometry(8.0, 0.6, 1.6)
const AQUE_LEG = new BoxGeometry(0.7, 3.0, 1.4)

const tmp = new Object3D()

const MAT_POOL = new Map<string, MeshStandardMaterial>()

function getMat(
  color: string,
  opts?: { emissive?: string; emissiveIntensity?: number },
): MeshStandardMaterial {
  const key = `${color}|${opts?.emissive ?? ''}|${opts?.emissiveIntensity ?? 0}`
  let m = MAT_POOL.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.85 })
    if (opts?.emissive) {
      m.emissive.set(opts.emissive)
      m.emissiveIntensity = opts.emissiveIntensity ?? 1.0
    }
    MAT_POOL.set(key, m)
  }
  return m
}

interface LayerProps {
  positions: [number, number, number][]
  yOffset: number
  geometry: BufferGeometry
  color: string
  emissive?: string
  emissiveIntensity?: number
  maxCount: number
  scale?: number
  rotY?: number
}

function Layer({
  positions,
  yOffset,
  geometry,
  color,
  emissive,
  emissiveIntensity,
  maxCount,
  scale = 1,
  rotY = 0,
}: LayerProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const count = Math.min(positions.length, maxCount)
  const material = getMat(color, emissive ? { emissive, emissiveIntensity } : undefined)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      tmp.position.set(px, py + yOffset, pz)
      tmp.rotation.set(0, rotY, 0)
      tmp.scale.setScalar(scale)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, count, yOffset, scale, rotY])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(1, maxCount)]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

function SpinningBlades({ positions, axis }: { positions: [number, number, number][]; axis: 'z' | 'x' }) {
  const meshRef = useRef<InstancedMesh>(null)
  const count = positions.length
  const material = getMat('#3a2a1a')

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || count === 0) return
    const t = clock.getElapsedTime()
    let inst = 0
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = positions[i]
      for (let b = 0; b < 4; b++) {
        const a = (b * Math.PI) / 2 + t * (axis === 'x' ? 1.6 : 2.2)
        tmp.position.set(px, py, pz)
        if (axis === 'z') tmp.rotation.set(0, 0, a)
        else tmp.rotation.set(a, 0, 0)
        tmp.scale.setScalar(1)
        tmp.updateMatrix()
        mesh.setMatrixAt(inst++, tmp.matrix)
      }
    }
    mesh.count = inst
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null
  const geom = axis === 'z' ? BLADE_ARM : WATER_PADDLE
  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, material, Math.max(1, count * 4)]}
      castShadow
      frustumCulled={false}
    />
  )
}

function LighthouseBeams({ positions }: { positions: [number, number, number][] }) {
  const lights = useMemo(
    () =>
      positions.map(() => {
        const l = new SpotLight('#ffeac0', 18, 90, Math.PI / 9, 0.4, 1.4)
        l.castShadow = false
        return l
      }),
    [positions],
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i]
      const l = lights[i]
      if (!l) continue
      l.position.set(px, py + 9.4, pz)
      const a = t * 1.2 + i * 0.7
      l.target.position.set(px + Math.cos(a) * 60, py + 3, pz + Math.sin(a) * 60)
      l.target.updateMatrixWorld()
    }
  })

  if (positions.length === 0) return null
  return (
    <>
      {lights.map((l, i) => (
        <group key={i}>
          <primitive object={l} />
          <primitive object={l.target} />
        </group>
      ))}
    </>
  )
}

function ForgeGlows({ positions }: { positions: [number, number, number][] }) {
  if (positions.length === 0) return null
  return (
    <>
      {positions.map(([px, py, pz], i) => (
        <pointLight
          key={i}
          position={[px, py + 1.4, pz + 1.6]}
          color="#ff7028"
          intensity={2.4}
          distance={9}
          decay={1.4}
        />
      ))}
    </>
  )
}

function groupBuildings(
  buildings: Building[],
  depthMap: number[][],
  biomes: number[][],
): Record<BuildingKind, [number, number, number][]> {
  const out: Record<string, [number, number, number][]> = {}
  for (const b of buildings) {
    const px = b.x * TILE_SCALE
    const pz = b.y * TILE_SCALE
    const py = heightAt(b.x, b.y, depthMap, biomes)
    if (!out[b.kind]) out[b.kind] = []
    out[b.kind].push([px, py, pz])
  }
  return out as Record<BuildingKind, [number, number, number][]>
}

export function Buildings3D({ buildings, depthMap, biomes }: Props) {
  const groups = useMemo(
    () => groupBuildings(buildings ?? [], depthMap, biomes),
    [buildings, depthMap, biomes],
  )

  const huts = groups.Hut ?? []
  const houses = groups.House ?? []
  const manors = groups.Manor ?? []
  const townhouses = groups.TownHouse ?? []
  const apartments = groups.Apartment ?? []
  const schools = groups.School ?? []
  const universities = groups.University ?? []
  const libraries = groups.Library ?? []
  const markets = groups.Market ?? []
  const temples = groups.Temple ?? []
  const factories = groups.Factory ?? []
  const hospitals = groups.Hospital ?? []
  const forges = groups.Forge ?? []
  const mills = groups.Mill ?? []
  const windmills = groups.Windmill ?? []
  const watermills = groups.Watermill ?? []
  const lighthouses = groups.Lighthouse ?? []
  const towers = groups.Tower ?? []
  const bridges = groups.Bridge ?? []
  const walls = groups.Wall ?? []
  const aqueducts = groups.Aqueduct ?? []

  const cap = (n: number) => Math.max(50, n)

  return (
    <>
      <Layer
        positions={huts}
        yOffset={2.6}
        geometry={HUT_GEO}
        color={FN_COLOR[FN_DEFAULT.Hut]}
        maxCount={cap(huts.length)}
      />

      <Layer
        positions={houses}
        yOffset={2.1}
        geometry={HOUSE_WALL}
        color={FN_COLOR[FN_DEFAULT.House]}
        maxCount={cap(houses.length)}
      />
      <Layer
        positions={houses}
        yOffset={5.7}
        geometry={HOUSE_ROOF}
        color={ROOF_TILE}
        maxCount={cap(houses.length)}
      />
      <Layer
        positions={houses.map(([x, y, z]) => [x + 1.8, y, z + 1.6] as [number, number, number])}
        yOffset={5.0}
        geometry={HOUSE_CHIMNEY}
        color="#4a3020"
        maxCount={cap(houses.length)}
      />

      <Layer
        positions={manors}
        yOffset={3.7}
        geometry={MANOR_WALL_A}
        color={FN_COLOR[FN_DEFAULT.Manor]}
        maxCount={cap(manors.length)}
      />
      <Layer
        positions={manors.map(([x, y, z]) => [x + 5.4, y, z] as [number, number, number])}
        yOffset={2.5}
        geometry={MANOR_WALL_B}
        color={FN_COLOR[FN_DEFAULT.Manor]}
        maxCount={cap(manors.length)}
      />
      <Layer
        positions={manors}
        yOffset={9.4}
        geometry={MANOR_ROOF_A}
        color={ROOF_DARK}
        maxCount={cap(manors.length)}
      />
      <Layer
        positions={manors.map(([x, y, z]) => [x + 5.4, y, z] as [number, number, number])}
        yOffset={6.4}
        geometry={MANOR_ROOF_B}
        color={ROOF_DARK}
        maxCount={cap(manors.length)}
      />

      <Layer
        positions={townhouses}
        yOffset={5.6}
        geometry={TOWNHOUSE_GEO}
        color="#b89070"
        maxCount={cap(townhouses.length)}
      />
      <Layer
        positions={townhouses}
        yOffset={12.3}
        geometry={TOWNHOUSE_ROOF}
        color={ROOF_DARK}
        maxCount={cap(townhouses.length)}
      />

      <Layer
        positions={apartments}
        yOffset={7.0}
        geometry={APARTMENT_GEO}
        color="#a0a0a0"
        maxCount={cap(apartments.length)}
      />

      <Layer
        positions={schools}
        yOffset={1.8}
        geometry={SCHOOL_MID}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x - 2.0, y, z - 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x + 2.0, y, z - 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x - 2.0, y, z + 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />
      <Layer
        positions={schools.map(([x, y, z]) => [x + 2.0, y, z + 1.5] as [number, number, number])}
        yOffset={1.8}
        geometry={SCHOOL_WING}
        color={FN_COLOR.Education}
        maxCount={cap(schools.length)}
      />

      <Layer
        positions={universities}
        yOffset={3.5}
        geometry={UNI_BLOCK}
        color={FN_COLOR.Education}
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x - 2.4, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x - 0.8, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x + 0.8, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />
      <Layer
        positions={universities.map(([x, y, z]) => [x + 2.4, y, z + 2.8] as [number, number, number])}
        yOffset={2.8}
        geometry={UNI_COL}
        color="#e8dcb6"
        maxCount={cap(universities.length)}
      />

      <Layer
        positions={libraries}
        yOffset={1.8}
        geometry={LIB_BASE}
        color={FN_COLOR.Education}
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries}
        yOffset={4.5}
        geometry={LIB_ROOF}
        color={ROOF_DARK}
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x - 1.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#8a3030"
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x - 0.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#306030"
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x + 0.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#304878"
        maxCount={cap(libraries.length)}
      />
      <Layer
        positions={libraries.map(([x, y, z]) => [x + 1.6, y, z + 3.05] as [number, number, number])}
        yOffset={1.0}
        geometry={LIB_BOOK}
        color="#a07030"
        maxCount={cap(libraries.length)}
      />

      <Layer
        positions={markets}
        yOffset={3.3}
        geometry={MARKET_ROOF}
        color={FN_COLOR.Commerce}
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x - 2.4, y, z - 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x + 2.4, y, z - 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x - 2.4, y, z + 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />
      <Layer
        positions={markets.map(([x, y, z]) => [x + 2.4, y, z + 1.8] as [number, number, number])}
        yOffset={1.6}
        geometry={MARKET_POST}
        color="#5a3a1a"
        maxCount={cap(markets.length)}
      />

      <Layer
        positions={temples}
        yOffset={1.1}
        geometry={TEMPLE_T1}
        color={FN_COLOR.Worship}
        maxCount={cap(temples.length)}
      />
      <Layer
        positions={temples}
        yOffset={3.2}
        geometry={TEMPLE_T2}
        color={FN_COLOR.Worship}
        maxCount={cap(temples.length)}
      />
      <Layer
        positions={temples}
        yOffset={5.1}
        geometry={TEMPLE_T3}
        color={FN_COLOR.Worship}
        maxCount={cap(temples.length)}
      />
      <Layer
        positions={temples}
        yOffset={6.8}
        geometry={TEMPLE_T4}
        color="#e8c870"
        maxCount={cap(temples.length)}
      />

      <Layer
        positions={factories}
        yOffset={2.2}
        geometry={FACTORY_BLOCK}
        color={FN_COLOR.Industry}
        maxCount={cap(factories.length)}
      />
      <Layer
        positions={factories.map(([x, y, z]) => [x - 2.2, y, z - 1.6] as [number, number, number])}
        yOffset={7.2}
        geometry={FACTORY_STACK}
        color="#3a3a3a"
        maxCount={cap(factories.length)}
      />
      <Layer
        positions={factories.map(([x, y, z]) => [x + 2.2, y, z - 1.6] as [number, number, number])}
        yOffset={7.2}
        geometry={FACTORY_STACK}
        color="#3a3a3a"
        maxCount={cap(factories.length)}
      />

      <Layer
        positions={hospitals}
        yOffset={2.2}
        geometry={HOSP_BLOCK}
        color={FN_COLOR.Healthcare}
        maxCount={cap(hospitals.length)}
      />
      <Layer
        positions={hospitals.map(([x, y, z]) => [x, y, z + 2.55] as [number, number, number])}
        yOffset={2.6}
        geometry={HOSP_CROSS_V}
        color="#ffffff"
        emissive="#d83030"
        emissiveIntensity={1.4}
        maxCount={cap(hospitals.length)}
      />
      <Layer
        positions={hospitals.map(([x, y, z]) => [x, y, z + 2.56] as [number, number, number])}
        yOffset={2.6}
        geometry={HOSP_CROSS_H}
        color="#ffffff"
        emissive="#d83030"
        emissiveIntensity={1.4}
        maxCount={cap(hospitals.length)}
      />

      <Layer
        positions={forges}
        yOffset={1.3}
        geometry={FORGE_BLOCK}
        color="#5a4030"
        maxCount={cap(forges.length)}
      />
      <Layer
        positions={forges.map(([x, y, z]) => [x, y, z + 2.05] as [number, number, number])}
        yOffset={1.6}
        geometry={FORGE_WIN}
        color="#ff8030"
        emissive="#ff7020"
        emissiveIntensity={2.2}
        maxCount={cap(forges.length)}
      />
      <ForgeGlows positions={forges} />

      <Layer
        positions={mills}
        yOffset={1.7}
        geometry={MILL_BASE}
        color="#a07854"
        maxCount={cap(mills.length)}
      />
      <Layer
        positions={mills}
        yOffset={4.1}
        geometry={MILL_ROOF}
        color={ROOF_DARK}
        maxCount={cap(mills.length)}
      />

      <Layer
        positions={windmills}
        yOffset={1.7}
        geometry={MILL_BASE}
        color="#a07854"
        maxCount={cap(windmills.length)}
      />
      <Layer
        positions={windmills}
        yOffset={4.1}
        geometry={MILL_ROOF}
        color={ROOF_DARK}
        maxCount={cap(windmills.length)}
      />
      <Layer
        positions={windmills.map(([x, y, z]) => [x, y, z + 1.9] as [number, number, number])}
        yOffset={4.2}
        geometry={BLADE_HUB}
        color="#3a2a1a"
        maxCount={cap(windmills.length)}
        rotY={Math.PI / 2}
      />
      <SpinningBlades
        positions={windmills.map(([x, y, z]) => [x, y + 4.2, z + 2.1] as [number, number, number])}
        axis="z"
      />

      <Layer
        positions={watermills}
        yOffset={1.7}
        geometry={MILL_BASE}
        color="#a07854"
        maxCount={cap(watermills.length)}
      />
      <Layer
        positions={watermills}
        yOffset={4.1}
        geometry={MILL_ROOF}
        color={ROOF_DARK}
        maxCount={cap(watermills.length)}
      />
      <SpinningBlades
        positions={watermills.map(([x, y, z]) => [x + 2.2, y + 1.6, z] as [number, number, number])}
        axis="x"
      />

      <Layer
        positions={lighthouses}
        yOffset={4.25}
        geometry={LIGHTHOUSE_COL}
        color="#e8e0d0"
        maxCount={cap(lighthouses.length)}
      />
      <Layer
        positions={lighthouses}
        yOffset={9.3}
        geometry={LIGHTHOUSE_TOP}
        color="#ffe8a0"
        emissive="#ffd060"
        emissiveIntensity={1.4}
        maxCount={cap(lighthouses.length)}
      />
      <Layer
        positions={lighthouses}
        yOffset={10.6}
        geometry={LIGHTHOUSE_CAP}
        color={ROOF_DARK}
        maxCount={cap(lighthouses.length)}
      />
      <LighthouseBeams positions={lighthouses} />

      <Layer
        positions={towers}
        yOffset={4.5}
        geometry={TOWER_COL}
        color={FN_COLOR.Military}
        maxCount={cap(towers.length)}
      />
      <Layer
        positions={towers}
        yOffset={10.0}
        geometry={TOWER_CAP}
        color={ROOF_DARK}
        maxCount={cap(towers.length)}
      />

      <Layer
        positions={bridges}
        yOffset={0.4}
        geometry={BRIDGE_GEO}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(bridges.length)}
      />

      <Layer
        positions={walls}
        yOffset={1.2}
        geometry={WALL_GEO}
        color="#7a7268"
        maxCount={cap(walls.length)}
      />

      <Layer
        positions={aqueducts}
        yOffset={3.6}
        geometry={AQUE_TOP}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
      <Layer
        positions={aqueducts.map(([x, y, z]) => [x - 3.0, y, z] as [number, number, number])}
        yOffset={1.5}
        geometry={AQUE_LEG}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
      <Layer
        positions={aqueducts.map(([x, y, z]) => [x, y, z] as [number, number, number])}
        yOffset={1.5}
        geometry={AQUE_LEG}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
      <Layer
        positions={aqueducts.map(([x, y, z]) => [x + 3.0, y, z] as [number, number, number])}
        yOffset={1.5}
        geometry={AQUE_LEG}
        color={FN_COLOR.Infrastructure}
        maxCount={cap(aqueducts.length)}
      />
    </>
  )
}
