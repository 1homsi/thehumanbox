import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointLight } from 'three'
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

  const lightRefs = useRef<(PointLight | null)[]>(Array(MAX_LIGHTS).fill(null))
  const nearestRef = useRef<FirePos[]>([])

  useFrame(({ clock }) => {
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: FirePos[] = []
    for (const fp of firePositions) {
      const dx = fp.x - cx
      const dz = fp.z - cz
      const d = dx * dx + dz * dz
      if (d > 90_000) continue
      scored.push({ ...fp, d })
    }
    scored.sort((a, b) => a.d - b.d)
    nearestRef.current = scored.slice(0, MAX_LIGHTS)

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
