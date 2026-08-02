import { useMemo } from 'react'
import type { SupplyCacheInfo } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  caches: SupplyCacheInfo[] | undefined
  depthMap: number[][]
  biomes: number[][]
  originX: number
  originY: number
}

interface CacheVisual extends SupplyCacheInfo {
  localX: number
  localY: number
  groundY: number
  color: string
}

const MAX_VISIBLE_CACHES = 96

export function SupplyCaches3D({ caches, depthMap, biomes, originX, originY }: Props) {
  const visible = useMemo(() => {
    const result: CacheVisual[] = []
    for (const cache of caches ?? []) {
      const localX = cache.x - originX
      const localY = cache.y - originY
      if (localX < 0 || localY < 0 || localX >= depthMap[0]?.length || localY >= depthMap.length) continue
      result.push({
        ...cache,
        localX,
        localY,
        groundY: heightAt(localX, localY, depthMap, biomes),
        color: lineageColor(cache.lineage_id),
      })
      if (result.length >= MAX_VISIBLE_CACHES) break
    }
    return result
  }, [caches, depthMap, biomes, originX, originY])

  return (
    <group>
      {visible.map((cache) => {
        const fullness = Math.min(1, (cache.food + cache.water) / 8)
        const damage = Math.min(1, Math.max(0, (cache.damage ?? 0) / 100))
        const broken = damage >= 1
        return (
          <group
            key={`${cache.x}:${cache.y}`}
            position={[(cache.localX + 0.5) * TILE_SCALE, cache.groundY, (cache.localY + 0.5) * TILE_SCALE]}
            rotation={[
              broken ? 0.18 : 0,
              ((cache.x * 17 + cache.y * 31) % 12) * (Math.PI / 6),
              broken ? -0.12 : 0,
            ]}
          >
            <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.15, 1.42, 18]} />
              <meshBasicMaterial color={cache.color} transparent opacity={0.42} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.25, 1.25, 1.75]} />
              <meshStandardMaterial
                color={broken ? '#342c27' : fullness > 0 ? '#745033' : '#493a2d'}
                roughness={0.96}
              />
            </mesh>
            <mesh position={[0, 1.38, 0]} castShadow>
              <boxGeometry args={[2.42, 0.16, 1.9]} />
              <meshStandardMaterial color={damage > 0.5 ? '#5d4938' : '#9a7047'} roughness={0.9} />
            </mesh>
            {cache.food > 0 && (
              <group position={[-0.62, 1.62, 0]}>
                <mesh castShadow scale={[0.72, 0.9 + cache.food * 0.035, 0.72]}>
                  <sphereGeometry args={[0.58, 9, 7]} />
                  <meshStandardMaterial color="#b75c34" roughness={1} />
                </mesh>
                <mesh position={[0, 0.56, 0]}>
                  <torusGeometry args={[0.2, 0.06, 5, 8]} />
                  <meshStandardMaterial color="#d5b06f" roughness={0.9} />
                </mesh>
              </group>
            )}
            {cache.water > 0 && (
              <group position={[0.62, 1.58, 0]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.48, 0.52, 1.15, 10]} />
                  <meshStandardMaterial color="#416b82" roughness={0.72} metalness={0.08} />
                </mesh>
                <mesh position={[0, 0.61, 0]}>
                  <torusGeometry args={[0.34, 0.07, 5, 10]} />
                  <meshStandardMaterial color="#b5c6c6" roughness={0.55} metalness={0.25} />
                </mesh>
              </group>
            )}
            <mesh position={[-1.2, 1.75, -0.65]} castShadow>
              <cylinderGeometry args={[0.055, 0.07, 2.6, 6]} />
              <meshStandardMaterial color="#4b3324" roughness={1} />
            </mesh>
            <mesh position={[-1.18, 2.55, -0.62]} rotation={[0, 0.15, 0]} castShadow>
              <planeGeometry args={[0.95, 0.58]} />
              <meshStandardMaterial color={cache.color} side={2} roughness={0.88} />
            </mesh>
            {damage > 0.35 && (
              <group position={[0.25, 0.3, -0.4]} rotation={[0.1, 0.35, 0.5]}>
                <mesh castShadow>
                  <boxGeometry args={[1.8, 0.16, 0.18]} />
                  <meshStandardMaterial color="#49372b" roughness={1} />
                </mesh>
              </group>
            )}
            {cache.fishing_weir && !broken && (
              <group position={[0, 0.35, 1.55]}>
                {[-1.2, 0, 1.2].map((postX) => (
                  <mesh key={postX} position={[postX, 0.55, 0]} rotation={[0, 0, 0.08]} castShadow>
                    <cylinderGeometry args={[0.07, 0.1, 1.8, 6]} />
                    <meshStandardMaterial color="#5d422d" roughness={1} />
                  </mesh>
                ))}
                <mesh position={[0, 0.55, 0.03]}>
                  <planeGeometry args={[2.45, 1.05, 4, 3]} />
                  <meshStandardMaterial color="#b9a677" wireframe transparent opacity={0.78} side={2} />
                </mesh>
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}
