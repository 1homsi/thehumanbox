import { useRef, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { useUIStore } from '../store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { nearAnimatedIds } from './Humans3D'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Far-LOD: render orgs not picked up by Humans3D as instanced capsules.
// One draw call for the whole population.
const ORG_HEIGHT  = 1.6
const ORG_RADIUS  = 0.35
const SHARED_GEO  = new THREE.CapsuleGeometry(ORG_RADIUS, ORG_HEIGHT - ORG_RADIUS * 2, 4, 6)
const SHARED_MAT  = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.0 })
const tmp         = new THREE.Object3D()
const tmpColor    = new THREE.Color()
const MAX_INSTANCES = 1024

export function Organisms({ organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()
  const selectOrg = useUIStore(s => s.selectOrg)

  const farOrgs = useMemo(() => {
    const animated = nearAnimatedIds(organisms, camera.position.x, camera.position.z)
    return organisms.filter(o => o.alive && !animated.has(o.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, camera.position.x, camera.position.z])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !depthMap || !biomes) return
    const count = Math.min(farOrgs.length, MAX_INSTANCES)
    mesh.count = count
    for (let i = 0; i < count; i++) {
      const o = farOrgs[i]
      const groundY = heightAt(o.x, o.y, depthMap, biomes)
      tmp.position.set(o.x * TILE_SCALE, groundY + ORG_HEIGHT / 2, o.y * TILE_SCALE)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      tmpColor.set(lineageColor(o.lineage_id))
      mesh.setColorAt(i, tmpColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [farOrgs, depthMap, biomes])

  return (
    <instancedMesh
      ref={meshRef}
      args={[SHARED_GEO, SHARED_MAT, MAX_INSTANCES]}
      count={0}
      castShadow
      receiveShadow
      frustumCulled={false}
      onClick={(e) => {
        const idx = e.instanceId
        if (idx == null) return
        const o = farOrgs[idx]
        if (o) {
          e.stopPropagation()
          selectOrg(o.id)
        }
      }}
    />
  )
}
