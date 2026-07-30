import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { WorldState } from '../../../types'
import { buildLineageHistoryGeometryData } from './lineage-history-geometry'

type History = NonNullable<WorldState['lineage_centroid_history']>

interface Props {
  history: History
  depthMap: number[][]
  biomes: number[][]
  originX: number
  originY: number
}

export function LineageHistory3D({ history, depthMap, biomes, originX, originY }: Props) {
  const geometry = useMemo(() => {
    const { positions, colors } = buildLineageHistoryGeometryData({
      history,
      depthMap,
      biomes,
      originX,
      originY,
    })
    const next = new BufferGeometry()
    next.setAttribute('position', new BufferAttribute(positions, 3))
    next.setAttribute('color', new BufferAttribute(colors, 3))
    return next
  }, [history, depthMap, biomes, originX, originY])

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  if (geometry.getAttribute('position').count === 0) return null

  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={4}>
      <lineBasicMaterial vertexColors transparent opacity={0.82} depthWrite={false} />
    </lineSegments>
  )
}
