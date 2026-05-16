import { useRef, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
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

const ORG_HEIGHT  = 1.6
const ORG_RADIUS  = 0.35
const SHARED_GEO  = new THREE.CapsuleGeometry(ORG_RADIUS, ORG_HEIGHT - ORG_RADIUS * 2, 4, 6)
const SHARED_MAT  = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.0 })
const tmp         = new THREE.Object3D()
const tmpColor    = new THREE.Color()
const MAX_INSTANCES = 1024

// Bumped from 30 -> 80. With Text geometry centred on the org's
// head and frustum culling disabled below, labels stay visible even
// when the camera turns away briefly. 80 is still bounded so a
// dense village doesn't dump 200 labels at once.
const LABEL_RADIUS_SQ = 80 * 80

export function Organisms({ organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()
  const selectOrg = useUIStore(s => s.selectOrg)

  // alive subset is the canonical list - both the instances and the
  // labels read from this so click instanceId stays in sync with org.
  // Exclude orgs being rendered as full animated robots (LOD near
  // camera) so we don't double-render the same person.
  const alive = useMemo(() => {
    const animated = nearAnimatedIds(organisms, camera.position.x, camera.position.z)
    return organisms.filter(o => o.alive && !animated.has(o.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, camera.position.x, camera.position.z])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !depthMap || !biomes) return
    const count = Math.min(alive.length, MAX_INSTANCES)
    mesh.count = count
    for (let i = 0; i < count; i++) {
      const o = alive[i]
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
  }, [alive, depthMap, biomes])

  // Labels for nearby orgs only. Cheap to recompute every render -
  // it's just a distance check per org, capped at a few visible
  // labels. Camera position is read from the live three.js camera
  // (not state) so panning doesn't trigger React re-renders.
  const nearLabels = useMemo(() => {
    if (!depthMap || !biomes) return []
    const out: { id: string; name: string; pos: [number, number, number] }[] = []
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    for (const o of alive) {
      const px = o.x * TILE_SCALE
      const pz = o.y * TILE_SCALE
      const dx = px - cx
      const dy = (heightAt(o.x, o.y, depthMap, biomes) + ORG_HEIGHT) - cy
      const dz = pz - cz
      if (dx * dx + dy * dy + dz * dz <= LABEL_RADIUS_SQ) {
        out.push({
          id: o.id,
          name: o.name,
          pos: [px, heightAt(o.x, o.y, depthMap, biomes) + ORG_HEIGHT + 0.5, pz],
        })
        if (out.length >= 30) break
      }
    }
    return out
    // camera position isn't a React dep (mutable Vector3), so labels
    // recompute on each parent render - i.e. each WS tick. That's
    // ~10 Hz which is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive, depthMap, biomes, camera.position.x, camera.position.y, camera.position.z])

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[SHARED_GEO, SHARED_MAT, MAX_INSTANCES]}
        count={0}
        castShadow
        receiveShadow
        onClick={(e) => {
          // R3F gives us the instance id; map back to org.id.
          const idx = e.instanceId
          if (idx == null) return
          const o = alive[idx]
          if (o) {
            e.stopPropagation()
            selectOrg(o.id)
          }
        }}
      />
      {nearLabels.map(l => (
        <Billboard key={l.id} position={l.pos} frustumCulled={false}>
          <Text
            fontSize={0.55}
            color="#ffffff"
            outlineWidth={0.04}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
            frustumCulled={false}
            renderOrder={999}
          >
            {l.name}
          </Text>
        </Billboard>
      ))}
    </>
  )
}
