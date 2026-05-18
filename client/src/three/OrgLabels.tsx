import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import type { OrganismState } from '../types'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  organisms: OrganismState[]
  depthMap:  number[][]
  biomes:    number[][]
}

const LABEL_RADIUS_SQ = 140 * 140
const MAX_LABELS      = 60

export function OrgLabels({ organisms, depthMap, biomes }: Props) {
  const { camera } = useThree()
  const selectedOrgId = useUIStore(s => s.selectedOrgId)

  const labels = useMemo(() => {
    if (!depthMap || !biomes) return []
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: {
      id: string; name: string; pos: [number, number, number];
      d: number; selected: boolean
    }[] = []
    for (const o of organisms) {
      if (!o.alive) continue
      const px = o.x * TILE_SCALE
      const pz = o.y * TILE_SCALE
      const dx = px - cx
      const dz = pz - cz
      const d  = dx * dx + dz * dz
      const isSel = o.id === selectedOrgId
      if (!isSel && d > LABEL_RADIUS_SQ) continue
      const groundY = heightAt(o.x, o.y, depthMap, biomes)
      scored.push({
        id: o.id,
        name: o.name,
        pos: [px, groundY + 3.2, pz],
        d,
        selected: isSel,
      })
    }
    scored.sort((a, b) => (a.selected === b.selected ? a.d - b.d : a.selected ? -1 : 1))
    return scored.slice(0, MAX_LABELS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, depthMap, biomes, camera.position.x, camera.position.z, selectedOrgId])

  return (
    <>
      {labels.map(l => (
        <Billboard key={l.id} position={l.pos} frustumCulled={false}>
          <Text
            fontSize={l.selected ? 0.9 : 0.7}
            color={l.selected ? '#ffcf6a' : '#ffffff'}
            outlineWidth={0.05}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
            frustumCulled={false}
            renderOrder={999}
            material-toneMapped={false}
          >
            {l.name}
          </Text>
          <Text
            fontSize={0.35}
            color={lineageColor(getLineage(l.id, organisms))}
            outlineWidth={0.04}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
            position={[0, -0.55, 0]}
            frustumCulled={false}
            renderOrder={999}
            material-toneMapped={false}
          >
            ◆
          </Text>
        </Billboard>
      ))}
    </>
  )
}

function getLineage(id: string, organisms: OrganismState[]): string | null {
  for (const o of organisms) if (o.id === id) return o.lineage_id
  return null
}
