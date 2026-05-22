import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import type { OrganismState } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { useUIStore } from '../../../stores/store'
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

  const camX5 = Math.round(camera.position.x / 5) * 5
  const camZ5 = Math.round(camera.position.z / 5) * 5

  const labels = useMemo(() => {
    if (!depthMap || !biomes) return []
    const cx = camera.position.x
    const cz = camera.position.z
    const scored: {
      id: string; name: string; pos: [number, number, number];
      d: number; selected: boolean
      lineage_id: string
      isLeader: boolean
      hasDegree: boolean
      isSick: boolean
      specialty: string | null
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
        pos: [px, groundY + 4.2, pz],
        d,
        selected: isSel,
        lineage_id: o.lineage_id,
        isLeader: !!o.is_leader,
        hasDegree: Array.isArray(o.degrees) && o.degrees.length > 0,
        isSick: Array.isArray(o.diseases) && o.diseases.length > 0,
        specialty: o.specialty ?? null,
      })
    }
    scored.sort((a, b) => (a.selected === b.selected ? a.d - b.d : a.selected ? -1 : 1))
    return scored.slice(0, MAX_LABELS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisms, depthMap, biomes, camX5, camZ5, selectedOrgId])

  return (
    <>
      {labels.map(l => {
        const badge = badgeForOrg(l)
        return (
        <Billboard key={l.id} position={l.pos} frustumCulled={false} follow={true}>
          {badge && (
            <Text
              fontSize={0.55}
              color="#ffe0a0"
              outlineWidth={0.05}
              outlineColor="#000000"
              anchorX="center"
              anchorY="middle"
              position={[0, 0.85, 0]}
              frustumCulled={false}
              renderOrder={999}
              material-toneMapped={false}
              material-depthTest={false}
              material-depthWrite={false}
              material-transparent={true}
            >
              {badge}
            </Text>
          )}
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
            material-depthTest={false}
            material-depthWrite={false}
            material-transparent={true}
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
            material-depthTest={false}
            material-depthWrite={false}
            material-transparent={true}
          >
            ◆
          </Text>
        </Billboard>
        )
      })}
    </>
  )
}

const SPECIALTY_GLYPH: Record<string, string> = {
  farmer: '\u{1F33E}', smith: '\u{1F528}', hunter: '\u{1F3F9}', healer: '\u{2695}\u{FE0F}',
  scholar: '\u{1F4DC}', merchant: '\u{1F4B0}', soldier: '\u{2694}\u{FE0F}', builder: '\u{1F3D7}\u{FE0F}',
  priest: '\u{1F4FF}', artist: '\u{1F3A8}', engineer: '\u{2699}\u{FE0F}', sailor: '\u{26F5}',
  doctor: '\u{1F489}', teacher: '\u{1F4DA}', programmer: '\u{1F4BB}',
}

function badgeForOrg(l: { isLeader: boolean; hasDegree: boolean; isSick: boolean; specialty: string | null }): string {
  const parts: string[] = []
  if (l.isLeader) parts.push('\u{1F451}')
  if (l.isSick) parts.push('\u{1F912}')
  if (l.hasDegree) parts.push('\u{1F393}')
  if (l.specialty && SPECIALTY_GLYPH[l.specialty]) parts.push(SPECIALTY_GLYPH[l.specialty])
  return parts.join(' ')
}

function getLineage(id: string, organisms: OrganismState[]): string | null {
  for (const o of organisms) if (o.id === id) return o.lineage_id
  return null
}
