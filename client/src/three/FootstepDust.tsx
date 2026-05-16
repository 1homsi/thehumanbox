import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrganismState } from '../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY, getOrgVelocityXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

// Tiny puffs of dust kicked up behind moving orgs. One shared
// instanced mesh pool of N_PARTICLES particles, each particle has
// a (position, age, scale, dirX, dirZ). When an org is moving and
// near the camera, we spawn a fresh particle behind their feet on
// a free slot. Particles fade + grow + drift over 1.2 seconds.
//
// All state is local refs (no React re-renders per frame). One
// draw call for the whole pool.
const N_PARTICLES = 200
const PARTICLE_LIFE = 1.2     // seconds
const NEAR_RADIUS_SQ = 180 * 180
const PARTICLE_GEO = new THREE.SphereGeometry(0.08, 4, 3)

interface Particle {
  x: number; y: number; z: number
  vx: number; vz: number
  born: number     // performance.now()
}

const tmp = new THREE.Object3D()

export function FootstepDust({ organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const pool    = useRef<Particle[]>([])
  // Tracks the last position we spawned a dust for per org, so we
  // throttle - one puff per ~0.5 world unit moved.
  const lastSpawn = useRef<Map<string, [number, number]>>(new Map())
  const { camera } = useThree()

  // Allocate the pool once. Particles start "dead" (age > life).
  useMemo(() => {
    pool.current = []
    for (let i = 0; i < N_PARTICLES; i++) {
      pool.current.push({ x: 0, y: -1000, z: 0, vx: 0, vz: 0, born: -PARTICLE_LIFE * 1000 })
    }
  }, [])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const now = performance.now()
    const t   = clock.getElapsedTime()
    void t

    // Spawn new puffs for moving orgs near the camera.
    for (const o of organisms) {
      if (!o.alive) continue
      const [tx, ty] = getOrgXY(o.id)
      const wx = tx * TILE_SCALE
      const wz = ty * TILE_SCALE
      const dx = wx - camera.position.x
      const dz = wz - camera.position.z
      if (dx * dx + dz * dz > NEAR_RADIUS_SQ) continue
      const [vx, vy] = getOrgVelocityXY(o.id)
      const speed = Math.hypot(vx, vy)
      if (speed < 0.04) continue
      // Throttle: require some travelled distance since last spawn.
      const last = lastSpawn.current.get(o.id)
      const movedSq = last
        ? (tx - last[0]) ** 2 + (ty - last[1]) ** 2
        : Infinity
      if (movedSq < 0.20) continue   // ~0.45 tile units between puffs
      lastSpawn.current.set(o.id, [tx, ty])

      // Find a free slot (oldest particle).
      let slot = 0
      let oldestAge = -1
      for (let i = 0; i < pool.current.length; i++) {
        const age = now - pool.current[i].born
        if (age > oldestAge) { oldestAge = age; slot = i }
      }
      const groundY = heightAt(tx, ty, depthMap, biomes)
      // Slight random offset behind motion direction so puffs land
      // behind the feet, not at the centre.
      const offX = -vx * 0.4 + (Math.random() - 0.5) * 0.3
      const offZ = -vy * 0.4 + (Math.random() - 0.5) * 0.3
      pool.current[slot] = {
        x: wx + offX, y: groundY + 0.12, z: wz + offZ,
        vx: -vx * 0.8 + (Math.random() - 0.5) * 0.6,
        vz: -vy * 0.8 + (Math.random() - 0.5) * 0.6,
        born: now,
      }
    }

    // Per-particle matrix update.
    for (let i = 0; i < N_PARTICLES; i++) {
      const p = pool.current[i]
      const ageMs = now - p.born
      if (ageMs >= PARTICLE_LIFE * 1000 || p.y < -100) {
        // Dead - park off-screen.
        tmp.position.set(0, -1000, 0)
        tmp.scale.set(0, 0, 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
        continue
      }
      const life = ageMs / 1000 / PARTICLE_LIFE   // 0..1
      const dt = life * PARTICLE_LIFE
      const px = p.x + p.vx * dt
      const py = p.y + life * 0.4
      const pz = p.z + p.vz * dt
      const scale = (0.6 + life * 1.2) * (1 - life * 0.4)
      tmp.position.set(px, py, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(scale, scale, scale)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[PARTICLE_GEO, undefined, N_PARTICLES]}
      count={N_PARTICLES}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color="#b0a48a"
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
