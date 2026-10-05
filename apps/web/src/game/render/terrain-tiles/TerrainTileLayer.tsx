import { useLayoutEffect, useMemo } from 'react'
import { TileLayer, useTileLayer } from 'cubeforge'
import type { TileLayerData } from 'cubeforge'
import { TILE } from '../../model/palette'
import { TERRAIN_VARIANTS, getTerrainTileset } from './atlas'
import { createTerrainSyncState, syncTerrainLayer } from './sync'
import type { TerrainSource, TerrainSyncResult } from './sync'

export type TerrainSyncFn = (src: TerrainSource) => TerrainSyncResult

/**
 * The terrain ground as a cubeforge TileLayer, one tile per grid cell at world (0, 0).
 *
 * It draws nothing by itself from React: the owner calls the function published through `syncRef`
 * with each frame's terrain (before painting the canvas that goes over it) and the layer updates
 * itself, in place and incrementally. Mount it only when the backend is `tilelayer`.
 */
export function TerrainTileLayer({
  width,
  height,
  syncRef,
  layerRef,
}: {
  width: number
  height: number
  syncRef: { current: TerrainSyncFn | null }
  /** Optional: the layer data, for benchmarks and tests. */
  layerRef?: { current: TileLayerData | null }
}) {
  const layer = useTileLayer({
    width,
    height,
    tileset: getTerrainTileset(),
    variants: TERRAIN_VARIANTS,
    tinted: true,
    tileWorldWidth: TILE,
    tileWorldHeight: TILE,
  })
  // A new layer (the grid changed size) starts with nothing synced.
  const state = useMemo(() => {
    void layer
    return createTerrainSyncState()
  }, [layer])

  useLayoutEffect(() => {
    syncRef.current = (src) => syncTerrainLayer(layer, state, src)
    if (layerRef) layerRef.current = layer
    return () => {
      syncRef.current = null
      if (layerRef) layerRef.current = null
    }
  }, [layer, state, syncRef, layerRef])

  return <TileLayer layer={layer} x={0} y={0} />
}
