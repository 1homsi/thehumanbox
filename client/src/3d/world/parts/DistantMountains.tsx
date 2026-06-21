import { useMemo } from 'react'
import { ConeGeometry, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILE_SCALE } from './constants'

interface Props {
  width: number
  height: number
}

const NEAR_MAT = new MeshStandardMaterial({
  color: '#5d6c83',
  roughness: 1,
  metalness: 0,
  flatShading: true,
})
const FAR_MAT = new MeshStandardMaterial({
  color: '#7e8aa0',
  roughness: 1,
  metalness: 0,
  flatShading: true,
})

function buildRing(
  cx: number,
  cz: number,
  ringR: number,
  peaks: number,
  hMin: number,
  hRange: number,
  baseMin: number,
  baseRange: number,
  seedOff: number,
) {
  const parts: ConeGeometry[] = []
  for (let i = 0; i < peaks; i++) {
    const a = (i / peaks) * Math.PI * 2
    const s = i + seedOff
    const jitterR = ringR + (((s * 73) % 100) - 50) * 2.2
    const x = cx + Math.cos(a) * jitterR
    const z = cz + Math.sin(a) * jitterR
    const base = baseMin + ((s * 53) % baseRange)
    const h = hMin + ((s * 137) % hRange)
    const cone = new ConeGeometry(base, h, 6, 1)
    cone.translate(x, h * 0.5 - 40, z)
    cone.rotateY(((s * 211) % 628) / 100)
    parts.push(cone)
  }
  return mergeGeometries(parts)
}

export function DistantMountains({ width, height }: Props) {
  const { near, far } = useMemo(() => {
    const cx = width * TILE_SCALE * 0.5
    const cz = height * TILE_SCALE * 0.5
    const mapR = Math.max(width, height) * TILE_SCALE * 0.5
    return {
      near: buildRing(cx, cz, mapR + 340, 210, 40, 100, 100, 110, 0),
      far: buildRing(cx, cz, mapR + 600, 210, 90, 200, 130, 120, 500),
    }
  }, [width, height])

  return (
    <group renderOrder={-1}>
      <mesh geometry={far} material={FAR_MAT} frustumCulled={false} />
      <mesh geometry={near} material={NEAR_MAT} frustumCulled={false} />
    </group>
  )
}
