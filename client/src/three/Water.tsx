import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE, OCEAN_EXTENT } from './constants'

interface Props {
  width:    number
  height:   number
  // When provided, the inner water plane masks off vertices that sit
  // over land so wave crests never poke up through the terrain. Land
  // verts are pinned several units below sea level instead.
  depthMap?: number[][]
}

// Two-layer water:
//
//   1. Outer ocean - flat huge plane (80000 x 80000), no waves.
//      Just kills the void past the world edges. Animates colour
//      slightly so it doesn't feel like a static painting.
//
//   2. Inner world water - subdivided plane that runs a multi-octave
//      sine displacement in a useFrame for moving wave crests. Each
//      vertex carries an aLand flag (0=water, 1=land) baked from the
//      depth map at build time. Land verts are pinned below sea
//      level and skip wave animation, so the moving surface never
//      crosses the terrain.
const SUB_X = 96
const SUB_Y = 48

export function Water({ width, height, depthMap }: Props) {
  const outerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const innerRef    = useRef<THREE.Mesh>(null)

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5

  // Plane fits exactly within the world (no overscan). The outer
  // ocean already handles the void past the edges, so we don't need
  // the inner plane to extend beyond the world bounds.
  const PLANE_W = width  * TILE_SCALE
  const PLANE_H = height * TILE_SCALE

  // Inner geometry + per-vert land mask. Built once per
  // (width, height, depthMap) reference change.
  const { innerGeo, landMask } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, SUB_X, SUB_Y)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const mask = new Float32Array(pos.count)
    // The plane is centred at (0, 0) before being rotated/translated
    // by the mesh. Vert (x, y) in plane-local coords maps to world
    // tile (col, row) via:
    //   col = (x + PLANE_W/2) / TILE_SCALE
    //   row = (y + PLANE_H/2) / TILE_SCALE
    // Note Y in plane-local is what becomes Z in world after the
    // mesh's rotation-x = -PI/2.
    if (depthMap && depthMap.length) {
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i)
        const ly = pos.getY(i)
        const col = Math.floor((lx + PLANE_W / 2) / TILE_SCALE)
        const row = Math.floor((ly + PLANE_H / 2) / TILE_SCALE)
        const d = depthMap[Math.max(0, Math.min(height - 1, row))]
                          ?.[Math.max(0, Math.min(width - 1, col))]
                  ?? 255
        const isLand = d >= 254
        mask[i] = isLand ? 1 : 0
        if (isLand) {
          // Drop the vert several units below sea level so it never
          // becomes visible through gaps in the terrain mesh.
          pos.setZ(i, -3.0)
        }
      }
      pos.needsUpdate = true
    } else {
      mask.fill(0)
    }
    return { innerGeo: geo, landMask: mask }
  }, [PLANE_W, PLANE_H, width, height, depthMap])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (outerMatRef.current) {
      const s = Math.sin(t * 0.4) * 0.04
      outerMatRef.current.color.setRGB(0.16 + s, 0.32 + s * 0.5, 0.5)
    }
    const mesh = innerRef.current
    if (!mesh) return
    const geom = mesh.geometry as THREE.PlaneGeometry
    const pos = geom.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      if (landMask[i] > 0.5) {
        // Land vert stays pinned deep; don't waste cycles animating.
        continue
      }
      const x = pos.getX(i)
      const y = pos.getY(i)
      // Multi-octave sine: two crossed waves at different frequencies
      // and speeds give a believable rolling-sea feel without a
      // shader. Amplitude kept under 0.25 so crests never approach
      // the +0 plane height anyway (defence in depth on top of the
      // land mask).
      const w = Math.sin(x * 0.04 + t * 0.7) * 0.12
              + Math.cos(y * 0.05 + t * 0.55) * 0.08
              + Math.sin((x + y) * 0.02 + t * 0.3) * 0.05
      pos.setZ(i, w)
    }
    pos.needsUpdate = true
    geom.computeVertexNormals()
  })

  return (
    <>
      {/* Outer ocean - past the visible world bounds, kills the void */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.6, cz]}
        receiveShadow
        frustumCulled={false}
      >
        <planeGeometry args={[OCEAN_EXTENT * 2, OCEAN_EXTENT * 2, 1, 1]} />
        <meshStandardMaterial
          ref={outerMatRef}
          color="#1f4870"
          transparent
          opacity={0.95}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Inner world water - animated waves, land verts masked off */}
      <mesh
        ref={innerRef}
        rotation-x={-Math.PI / 2}
        position={[cx, -0.05, cz]}
        receiveShadow
        geometry={innerGeo}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#3a78ac"
          transparent
          opacity={0.82}
          roughness={0.18}
          metalness={0.15}
          flatShading
        />
      </mesh>
    </>
  )
}
