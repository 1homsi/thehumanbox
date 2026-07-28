import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three'
import type { Building } from '../../../types'
import { getBuildingState } from '../../../world/building-state'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
}

interface Instance {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  ry: number
  rz: number
}

const MAX_RUBBLE = 1_500
const MAX_DAMAGE_BEAMS = 700
const MAX_REPAIR_FRAMES = 260
const CUBE = new BoxGeometry(1, 1, 1)
const RUBBLE_MATERIAL = new MeshStandardMaterial({
  color: '#50443a',
  roughness: 0.98,
  metalness: 0,
})
const CHARRED_MATERIAL = new MeshStandardMaterial({
  color: '#281b17',
  emissive: '#6c1f14',
  emissiveIntensity: 0.28,
  roughness: 0.94,
})
const REPAIR_MATERIAL = new MeshBasicMaterial({
  color: '#f2c96d',
  transparent: true,
  opacity: 0.82,
  wireframe: true,
  depthWrite: false,
  toneMapped: false,
})
const scratch = new Object3D()

function hash01(id: number, salt: number): number {
  let value = Math.imul(id + salt * 101, 2654435761)
  value ^= value >>> 15
  value = Math.imul(value, 2246822519)
  value ^= value >>> 13
  return (value >>> 0) / 4294967295
}

function StaticInstances({
  name,
  instances,
  material,
  renderOrder = 0,
}: {
  name: string
  instances: Instance[]
  material: MeshStandardMaterial | MeshBasicMaterial
  renderOrder?: number
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i]
      scratch.position.set(instance.x, instance.y, instance.z)
      scratch.rotation.set(0, instance.ry, instance.rz)
      scratch.scale.set(instance.sx, instance.sy, instance.sz)
      scratch.updateMatrix()
      mesh.setMatrixAt(i, scratch.matrix)
    }
    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances])

  if (instances.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[CUBE, material, instances.length]}
      castShadow
      receiveShadow
      renderOrder={renderOrder}
    />
  )
}

/**
 * A bounded three-draw-call damage layer: collapsed rubble for ruins,
 * charred cross-beams for damaged shells, and gold wire cages while crews
 * repair or rebuild. Intact building meshes are handled separately.
 */
export function BuildingDamage3D({ buildings, depthMap, biomes }: Props) {
  const visuals = useMemo(() => {
    const rubble: Instance[] = []
    const beams: Instance[] = []
    const repairFrames: Instance[] = []
    if (!buildings || !depthMap || !biomes) return { rubble, beams, repairFrames }

    for (const building of buildings) {
      const state = getBuildingState(building)
      if (!state.isDamaged) continue
      const fw = Math.max(1, building.footprint?.[0] ?? building.fw ?? 1)
      const fh = Math.max(1, building.footprint?.[1] ?? building.fh ?? 1)
      const centerX = (building.x + fw / 2) * TILE_SCALE
      const centerZ = (building.y + fh / 2) * TILE_SCALE
      const ground = heightAt(building.x, building.y, depthMap, biomes)
      const spanX = Math.max(TILE_SCALE * 0.8, fw * TILE_SCALE)
      const spanZ = Math.max(TILE_SCALE * 0.8, fh * TILE_SCALE)

      if (state.isRuined) {
        const chunkCount = Math.min(10, 5 + Math.ceil((fw + fh) * 0.8))
        for (let i = 0; i < chunkCount && rubble.length < MAX_RUBBLE; i++) {
          const sx = 0.55 + hash01(building.id, i * 5 + 1) * 1.45
          const sy = 0.35 + hash01(building.id, i * 5 + 2) * 0.85
          const sz = 0.55 + hash01(building.id, i * 5 + 3) * 1.45
          rubble.push({
            x: centerX + (hash01(building.id, i * 5 + 4) - 0.5) * spanX * 0.86,
            y: ground + sy / 2,
            z: centerZ + (hash01(building.id, i * 5 + 5) - 0.5) * spanZ * 0.86,
            sx,
            sy,
            sz,
            ry: hash01(building.id, i * 7 + 8) * Math.PI,
            rz: (hash01(building.id, i * 7 + 9) - 0.5) * 0.45,
          })
        }
      }

      const beamCount = 2
      for (let i = 0; i < beamCount && beams.length < MAX_DAMAGE_BEAMS; i++) {
        const frontZ = state.isRuined ? centerZ : centerZ + spanZ * 0.52
        beams.push({
          x: centerX,
          y: ground + (state.isRuined ? 0.65 : 2.1),
          z: frontZ + i * 0.18,
          sx: Math.max(2.8, spanX * 0.72),
          sy: state.isRuined ? 0.34 : 0.28,
          sz: 0.34,
          ry: state.isRuined ? (i === 0 ? 0.72 : -0.72) : 0,
          rz: i % 2 === 0 ? 0.62 : -0.62,
        })
      }

      if (state.isRepairing && repairFrames.length < MAX_REPAIR_FRAMES) {
        const frameHeight = state.isRuined ? 5.2 : 7.2
        repairFrames.push({
          x: centerX,
          y: ground + frameHeight / 2,
          z: centerZ,
          sx: spanX + 1.4,
          sy: frameHeight,
          sz: spanZ + 1.4,
          ry: 0,
          rz: 0,
        })
      }
    }

    return { rubble, beams, repairFrames }
  }, [buildings, depthMap, biomes])

  if (visuals.rubble.length === 0 && visuals.beams.length === 0 && visuals.repairFrames.length === 0) {
    return null
  }

  return (
    <group name="building-damage">
      <StaticInstances name="building-rubble" instances={visuals.rubble} material={RUBBLE_MATERIAL} />
      <StaticInstances
        name="building-damage-beams"
        instances={visuals.beams}
        material={CHARRED_MATERIAL}
        renderOrder={2}
      />
      <StaticInstances
        name="building-repair-frames"
        instances={visuals.repairFrames}
        material={REPAIR_MATERIAL}
        renderOrder={3}
      />
    </group>
  )
}
