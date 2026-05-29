import { useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import {
  BoxGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  lineageEras: Record<string, string> | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
  isNight: boolean
}

const tmp = new Object3D()

function buildBikeGeo() {
  const frame = new BoxGeometry(0.6, 0.05, 0.1)
  frame.translate(0, 0.25, 0)
  const seatPost = new BoxGeometry(0.05, 0.2, 0.05)
  seatPost.translate(0.15, 0.35, 0)
  const handlebar = new BoxGeometry(0.05, 0.18, 0.32)
  handlebar.translate(-0.25, 0.36, 0)
  const wheelL = new CylinderGeometry(0.16, 0.16, 0.04, 12)
  wheelL.rotateZ(Math.PI / 2)
  wheelL.translate(-0.28, 0.16, 0)
  const wheelR = new CylinderGeometry(0.16, 0.16, 0.04, 12)
  wheelR.rotateZ(Math.PI / 2)
  wheelR.translate(0.28, 0.16, 0)
  const merged = mergeGeometries([frame, seatPost, handlebar, wheelL, wheelR])
  if (merged) merged.computeVertexNormals()
  return merged ?? frame
}

function buildCartGeo() {
  const bed = new BoxGeometry(0.9, 0.15, 0.55)
  bed.translate(0, 0.25, 0)
  const sideL = new BoxGeometry(0.9, 0.18, 0.04)
  sideL.translate(0, 0.36, -0.27)
  const sideR = new BoxGeometry(0.9, 0.18, 0.04)
  sideR.translate(0, 0.36, 0.27)
  const wheelFL = new CylinderGeometry(0.18, 0.18, 0.05, 10)
  wheelFL.rotateX(Math.PI / 2)
  wheelFL.translate(-0.32, 0.18, -0.32)
  const wheelFR = wheelFL.clone()
  wheelFR.translate(0, 0, 0.64)
  const wheelRL = wheelFL.clone()
  wheelRL.translate(0.64, 0, 0)
  const wheelRR = wheelFL.clone()
  wheelRR.translate(0.64, 0, 0.64)
  const merged = mergeGeometries([bed, sideL, sideR, wheelFL, wheelFR, wheelRL, wheelRR])
  if (merged) merged.computeVertexNormals()
  return merged ?? bed
}

function buildCarGeo() {
  const body = new BoxGeometry(1.1, 0.34, 0.55)
  body.translate(0, 0.32, 0)
  const cabin = new BoxGeometry(0.55, 0.25, 0.48)
  cabin.translate(0.05, 0.58, 0)
  const wheelFL = new CylinderGeometry(0.16, 0.16, 0.06, 12)
  wheelFL.rotateX(Math.PI / 2)
  wheelFL.translate(-0.38, 0.16, -0.31)
  const wheelFR = wheelFL.clone()
  wheelFR.translate(0, 0, 0.62)
  const wheelRL = wheelFL.clone()
  wheelRL.translate(0.76, 0, 0)
  const wheelRR = wheelFL.clone()
  wheelRR.translate(0.76, 0, 0.62)
  const merged = mergeGeometries([body, cabin, wheelFL, wheelFR, wheelRL, wheelRR])
  if (merged) merged.computeVertexNormals()
  return merged ?? body
}

const PRE_INDUSTRIAL = new Set([
  'pre-stone',
  'stone',
  'bronze',
  'iron',
  'classical',
  'medieval',
  'renaissance',
])

function vehicleKindFor(era: string | undefined): 'cart' | 'bike' | 'car' | null {
  if (!era) return null
  if (PRE_INDUSTRIAL.has(era)) {
    return 'cart'
  }
  if (era === 'industrial') return 'bike'
  return 'car'
}

export function Vehicles3D({ buildings, lineageEras, depthMap, biomes, isNight }: Props) {
  const cartGeo = useMemo(() => buildCartGeo(), [])
  const bikeGeo = useMemo(() => buildBikeGeo(), [])
  const carGeo = useMemo(() => buildCarGeo(), [])
  const cartMat = useMemo(() => new MeshStandardMaterial({ color: '#6b4628', roughness: 0.9 }), [])
  const bikeMat = useMemo(() => new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.45 }), [])
  const carMat = useMemo(() => new MeshStandardMaterial({ color: '#3a4452', roughness: 0.45, metalness: 0.45 }), [])

  const placements = useMemo(() => {
    if (!buildings || !lineageEras || !depthMap || !biomes) {
      return { carts: [], bikes: [], cars: [] }
    }
    const carts: { x: number; y: number; z: number; rot: number }[] = []
    const bikes: { x: number; y: number; z: number; rot: number }[] = []
    const cars: { x: number; y: number; z: number; rot: number }[] = []
    for (const b of buildings) {
      if ((b.condition ?? 1) < 0.6) continue
      const lid = b.owner_lineage ?? b.lineage_id
      if (!lid) continue
      const era = lineageEras[lid]
      const kind = vehicleKindFor(era)
      if (!kind) continue
      const seed = (b.id * 9301 + 49297) % 233280
      if (seed % 100 > 35) continue
      const fw = b.fw ?? 1
      const fh = b.fh ?? 1
      const wx = (b.x + fw + 0.5) * TILE_SCALE
      const wz = (b.y + fh / 2) * TILE_SCALE
      const wy = heightAt(b.x + fw, b.y + Math.floor(fh / 2), depthMap, biomes)
      const rot = ((seed / 100) % 6.28) - 3.14
      const target = kind === 'cart' ? carts : kind === 'bike' ? bikes : cars
      target.push({ x: wx, y: wy, z: wz, rot })
    }
    return { carts, bikes, cars }
  }, [buildings, lineageEras, depthMap, biomes])

  const cartRef = useRef<InstancedMesh>(null)
  const bikeRef = useRef<InstancedMesh>(null)
  const carRef = useRef<InstancedMesh>(null)

  // Vehicles are static — fill instance matrices once when placements
  // change, not every frame. (useLayoutEffect so the upload happens
  // after the conditional instancedMesh meshes mount/remount.)
  useLayoutEffect(() => {
    for (const [ref, list] of [
      [cartRef, placements.carts],
      [bikeRef, placements.bikes],
      [carRef, placements.cars],
    ] as const) {
      const mesh = ref.current
      if (!mesh) continue
      for (let i = 0; i < list.length; i++) {
        const v = list[i]
        tmp.position.set(v.x, v.y, v.z)
        tmp.rotation.set(0, v.rot, 0)
        tmp.scale.setScalar(1)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [placements])

  // Night emissive dimming only changes when isNight flips.
  useEffect(() => {
    const dim = isNight ? 0.65 : 1
    cartMat.emissive.setRGB(0.03 * dim, 0.02 * dim, 0)
    carMat.emissive.setRGB(0.04 * dim, 0.06 * dim, 0.08 * dim)
    bikeMat.emissive.setRGB(0, 0, 0)
  }, [isNight, cartMat, carMat, bikeMat])

  return (
    <>
      {placements.carts.length > 0 && (
        <instancedMesh ref={cartRef} args={[cartGeo, cartMat, Math.max(1, placements.carts.length)]} castShadow frustumCulled={false} />
      )}
      {placements.bikes.length > 0 && (
        <instancedMesh ref={bikeRef} args={[bikeGeo, bikeMat, Math.max(1, placements.bikes.length)]} castShadow frustumCulled={false} />
      )}
      {placements.cars.length > 0 && (
        <instancedMesh ref={carRef} args={[carGeo, carMat, Math.max(1, placements.cars.length)]} castShadow frustumCulled={false} />
      )}
    </>
  )
}
