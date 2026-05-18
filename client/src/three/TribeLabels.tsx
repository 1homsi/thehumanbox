import { useMemo } from 'react'
import { Billboard, Text } from '@react-three/drei'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  organisms: OrganismState[]
  lineageNames?: Record<string, string>
  depthMap:  number[][]
  biomes:    number[][]
}

// Large tribe-name labels floating high above each lineage's
// centroid so you can see at a glance "this is Aldenvale's
// territory" while flying around. One label per lineage (skipped
// for lineages with <2 alive orgs so transient one-off-survivors
// don't crowd the sky).
//
// Centroid is computed each render (cheap - a few hundred orgs
// max). Label height is fixed at +35 above terrain so it floats
// well above huts and trees.
const MIN_LINEAGE_ORGS = 2

interface TribeInfo {
  lineageId:  string
  name:       string
  cx:         number
  cy:         number
  count:      number
}

export function TribeLabels({ organisms, lineageNames, depthMap, biomes }: Props) {
  const tribes = useMemo<TribeInfo[]>(() => {
    if (!lineageNames) return []
    const acc: Record<string, { sx: number; sy: number; n: number }> = {}
    for (const o of organisms) {
      if (!o.alive) continue
      const a = acc[o.lineage_id] ?? (acc[o.lineage_id] = { sx: 0, sy: 0, n: 0 })
      a.sx += o.x
      a.sy += o.y
      a.n  += 1
    }
    const out: TribeInfo[] = []
    for (const [lid, a] of Object.entries(acc)) {
      if (a.n < MIN_LINEAGE_ORGS) continue
      out.push({
        lineageId: lid,
        name:      lineageNames[lid] ?? lid.slice(0, 6),
        cx:        a.sx / a.n,
        cy:        a.sy / a.n,
        count:     a.n,
      })
    }
    return out
  }, [organisms, lineageNames])

  return (
    <>
      {tribes.map(t => {
        const groundY = heightAt(t.cx, t.cy, depthMap, biomes)
        return (
          <Billboard
            key={t.lineageId}
            position={[t.cx * TILE_SCALE, groundY + 35, t.cy * TILE_SCALE]}
            frustumCulled={false}
          >
            <Text
              fontSize={3.6}
              color={lineageColor(t.lineageId)}
              outlineWidth={0.20}
              outlineColor="#000000"
              outlineOpacity={0.85}
              anchorX="center"
              anchorY="middle"
              fillOpacity={0.65}
              renderOrder={994}
              material-toneMapped={false}
              material-depthWrite={false}
            >
              {t.name.toUpperCase()}
            </Text>
            <Text
              fontSize={1.3}
              color="#cad3df"
              outlineWidth={0.08}
              outlineColor="#000000"
              outlineOpacity={0.7}
              anchorX="center"
              anchorY="middle"
              position={[0, -2.6, 0]}
              fillOpacity={0.5}
              renderOrder={994}
              material-toneMapped={false}
              material-depthWrite={false}
            >
              {`${t.count} kin`}
            </Text>
          </Billboard>
        )
      })}
    </>
  )
}
