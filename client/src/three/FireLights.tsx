import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  tiles:    number[][]
  depthMap: number[][]
  biomes:   number[][]
  width:    number
  height:   number
  isNight?: boolean
}

// Three.js's standard material supports only a handful of dynamic
// lights at any time. We pick the 4 fire / campfire tiles nearest
// to the camera and render <pointLight> at each so they actually
// CAST light - illuminating nearby terrain, huts, and characters
// instead of just being self-emissive sprites. Per-frame
// re-selection means the lit fires "follow" the player around the
// world.
//
// At night the lights are brighter; daytime ones are reduced so
// they don't wash out the scene.
const T_FIRE     = 4
const T_CAMPFIRE = 7
const MAX_LIGHTS = 4

interface FirePos {
  x: number; y: number; z: number
  kind: 'fire' | 'camp'
  d:    number
}

export function FireLights({ tiles, depthMap, biomes, width, height, isNight = false }: Props) {
  const { camera } = useThree()

  // Collect all fire positions once when tiles change. Stored in
  // tile coords with a precomputed world Y so per-frame distance
  // checking stays O(N).
  const firePositions = useMemo(() => {
    const out: { x: number; y: number; z: number; kind: 'fire' | 'camp' }[] = []
    if (!tiles) return out
    for (let row = 0; row < height; row++) {
      const r = tiles[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        const t = r[col]
        if (t !== T_FIRE && t !== T_CAMPFIRE) continue
        const gy = heightAt(col, row, depthMap, biomes)
        out.push({
          x: col * TILE_SCALE,
          y: gy + 1.2,
          z: row * TILE_SCALE,
          kind: t === T_FIRE ? 'fire' : 'camp',
        })
      }
    }
    return out
  }, [tiles, depthMap, biomes, width, height])

  // Per-frame: find the MAX_LIGHTS nearest fires. We rebuild a tiny
  // array and use refs to update <pointLight> intensities for a
  // flicker. Slot count is fixed so we don't add/remove lights every
  // frame (which would cause shader recompiles).
  const lightRefs = useRef<(THREE.PointLight | null)[]>(Array(MAX_LIGHTS).fill(null))
  const nearestRef = useRef<FirePos[]>([])

  useFrame(({ clock }) => {
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: FirePos[] = []
    for (const fp of firePositions) {
      const dx = fp.x - cx
      const dz = fp.z - cz
      const d = dx * dx + dz * dz
      // Skip beyond ~300 units - barely contributes anyway.
      if (d > 90_000) continue
      scored.push({ ...fp, d })
    }
    scored.sort((a, b) => a.d - b.d)
    nearestRef.current = scored.slice(0, MAX_LIGHTS)

    // Update each light slot.
    const t = clock.getElapsedTime()
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = lightRefs.current[i]
      if (!light) continue
      const fp = nearestRef.current[i]
      if (!fp) {
        light.intensity = 0
        light.position.set(0, -1000, 0)
        continue
      }
      light.position.set(fp.x, fp.y, fp.z)
      const baseIntensity = fp.kind === 'fire'
        ? (isNight ? 4.5 : 1.4)
        : (isNight ? 2.4 : 0.7)
      // Flicker keyed on time + per-fire phase derived from position.
      const phase = (fp.x * 0.013 + fp.z * 0.017)
      const flick = 0.85 + Math.sin(t * 9 + phase) * 0.12 + Math.sin(t * 21 + phase) * 0.05
      light.intensity = baseIntensity * flick
      light.color.setHex(fp.kind === 'fire' ? 0xff7820 : 0xffa040)
      light.distance = fp.kind === 'fire' ? 35 : 22
      light.decay = 1.6
    }
  })

  return (
    <>
      {Array.from({ length: MAX_LIGHTS }, (_, i) => (
        <pointLight
          key={i}
          ref={el => { lightRefs.current[i] = el }}
          color="#ffa040"
          intensity={0}
          distance={20}
          decay={1.6}
          castShadow={false}
        />
      ))}
    </>
  )
}
