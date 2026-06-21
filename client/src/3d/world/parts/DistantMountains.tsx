import { useMemo } from 'react'
import { BufferAttribute, Color, ConeGeometry, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILE_SCALE } from './constants'

interface Props {
  width: number
  height: number
}

const NEAR_MAT = new MeshStandardMaterial({
  roughness: 1,
  metalness: 0,
  flatShading: true,
  vertexColors: true,
})
const FAR_MAT = new MeshStandardMaterial({
  roughness: 1,
  metalness: 0,
  flatShading: true,
  vertexColors: true,
})

const SNOW = new Color('#eef4fc')
const _rock = new Color()

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

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
  rockHex: string,
  snowStart: number,
  snowAmt: number,
) {
  const rock = new Color(rockHex)
  const parts: ConeGeometry[] = []
  for (let i = 0; i < peaks; i++) {
    const a = (i / peaks) * Math.PI * 2
    const s = i + seedOff
    const jitterR = ringR + (((s * 73) % 100) - 50) * 2.2
    const x = cx + Math.cos(a) * jitterR
    const z = cz + Math.sin(a) * jitterR
    const base = baseMin + ((s * 53) % baseRange)
    const h = hMin + ((s * 137) % hRange)
    const cone = new ConeGeometry(base, h, 7, 7)
    const pos = cone.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let v = 0; v < pos.count; v++) {
      const t = (pos.getY(v) + h * 0.5) / h
      const m = smoothstep(snowStart, snowStart + 0.16, t) * snowAmt
      _rock.copy(rock).lerp(SNOW, m)
      colors[v * 3] = _rock.r
      colors[v * 3 + 1] = _rock.g
      colors[v * 3 + 2] = _rock.b
    }
    cone.setAttribute('color', new BufferAttribute(colors, 3))
    cone.rotateY(((s * 211) % 628) / 100)
    cone.translate(x, h * 0.5 - 40, z)
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
      near: buildRing(cx, cz, mapR + 150, 220, 40, 100, 100, 110, 0, '#54637c', 0.8, 0.62),
      far: buildRing(cx, cz, mapR + 380, 220, 90, 200, 130, 120, 500, '#7e8aa0', 0.58, 0.9),
    }
  }, [width, height])

  return (
    <group renderOrder={-1}>
      <mesh geometry={far} material={FAR_MAT} frustumCulled={false} />
      <mesh geometry={near} material={NEAR_MAT} frustumCulled={false} />
    </group>
  )
}
