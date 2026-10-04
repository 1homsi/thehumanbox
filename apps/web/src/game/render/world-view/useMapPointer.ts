import { useRef, useState } from 'react'
import type { PrayerInfo, WorldState } from '../../../shared/types'
import { useUIStore, type ViewFlags } from '../../../state/store'
import { useSceneStore } from '../../../state/scene'
import { TILE_ID, isWaterTile } from '../../model/terrain-ids'
import { hasRuinedBuildingAtWorldTile } from '../../model/building-state'
import { lineageAtTerritoryTile, type TerritoryIndex } from '../../model/territory'
import { TILE } from '../../model/palette'
import { prayerAtPoint } from '../prayer-bubbles'
import { burstForTool, type useSandboxBursts } from '../sandbox-bursts'
import { isMapControl } from '../camera-controls'

/** Taps, drags and hovers on the map: selection, sandbox tools, prayer bubbles, territory focus. */
export function useMapPointer({
  containerRef,
  cameraStateRef,
  dims,
  world,
  ox,
  oy,
  sandboxArmed,
  onSandboxApply,
  sandboxToolId,
  sandboxRadius,
  spawnBurst,
  onPrayerClick,
  viewFlags,
  focus,
  territoryIndex,
  setFocus,
  onOrgSelect,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  dims: { w: number; h: number }
  world: WorldState
  ox: number
  oy: number
  sandboxArmed?: boolean
  onSandboxApply?: (worldX: number, worldY: number) => void
  sandboxToolId?: string | null
  sandboxRadius?: number
  spawnBurst: ReturnType<typeof useSandboxBursts>['spawn']
  onPrayerClick?: (prayer: PrayerInfo) => void
  viewFlags: ViewFlags
  focus: string
  territoryIndex: TerritoryIndex
  setFocus: (focus: string) => void
  onOrgSelect: (id: string | null) => void
}) {
  const [overPrayer, setOverPrayer] = useState(false)
  // Track pointer-down position so we can distinguish a tap (select)
  // from a drag-then-release (pan). Without this every pan ends with
  // an accidental org-select on the tile under the release point -
  // especially painful on touch where finger jitter is large.
  const pointerDownPos = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMapControl(e.target)) return
    if (!e.isPrimary) {
      if (pointerDownPos.current) pointerDownPos.current.moved = true
      return
    }
    pointerDownPos.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMapControl(e.target)) return
    const down = pointerDownPos.current
    pointerDownPos.current = null
    if (down) {
      const dx = e.clientX - down.x
      const dy = e.clientY - down.y
      if (down.moved || dx * dx + dy * dy > 36) return
    }
    const rect = containerRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: camX, y: camY, zoom } = cameraStateRef.current
    const canvasTileX = (camX + (sx - dims.w / 2) / zoom) / TILE
    const canvasTileY = (camY + (sy - dims.h / 2) / zoom) / TILE
    const worldX = canvasTileX + ox
    const worldY = canvasTileY + oy

    if (
      canvasTileX < 0 ||
      canvasTileY < 0 ||
      canvasTileX >= world.grid.width ||
      canvasTileY >= world.grid.height
    )
      return

    if (sandboxArmed && onSandboxApply) {
      if (
        Math.round(worldX) < ox ||
        Math.round(worldX) >= ox + world.grid.width ||
        Math.round(worldY) < oy ||
        Math.round(worldY) >= oy + world.grid.height
      )
        return
      const burst = burstForTool(sandboxToolId)
      if (burst) spawnBurst(burst, sx, sy, (sandboxRadius ?? 0) * TILE * zoom)
      onSandboxApply(worldX, worldY)
      return
    }

    // A prayer bubble is a button: clicking it goes to help that tribe.
    if (onPrayerClick && world.prayers?.length && !viewFlags.hideUI) {
      const prayer = prayerAtPoint(
        world.prayers,
        canvasTileX * TILE,
        canvasTileY * TILE,
        { x: ox, y: oy },
        TILE,
        zoom,
      )
      if (prayer) {
        onPrayerClick(prayer)
        return
      }
    }

    const tx = Math.floor(worldX)
    const ty = Math.floor(worldY)

    if (viewFlags.territory) {
      const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
      const lineageId = lineageAtTerritoryTile(territoryIndex, tx, ty, focusedLineage)
      onOrgSelect(null)
      useUIStore.setState({ panelOpen: false })
      setFocus(lineageId ? `lineage:${lineageId}` : 'all')
      return
    }

    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

    let nearestOrg: { id: string; dist: number } | null = null
    let nearestOrgDist = Math.min(5, Math.max(1.2, (isCoarse ? 26 : 16) / (TILE * zoom)))
    for (const org of world.viewport_organisms?.length ? world.viewport_organisms : world.organisms) {
      if (!org.alive) continue
      const d = Math.hypot(org.x - worldX, org.y - worldY)
      if (d < nearestOrgDist) {
        nearestOrgDist = d
        nearestOrg = { id: org.id, dist: d }
      }
    }
    if (nearestOrg && nearestOrg.dist < 1.2) {
      onOrgSelect(nearestOrg.id)
      return
    }

    const ruinedBuildingAtTile = hasRuinedBuildingAtWorldTile(world.buildings, tx, ty)
    const localCol = tx - ox
    const localRow = ty - oy
    const tileRow = world.grid?.tiles?.[localRow]
    const tileVal = tileRow ? tileRow[localCol] : undefined
    if (isWaterTile(tileVal) && (!nearestOrg || nearestOrg.dist >= 2.5)) {
      onOrgSelect(null)
      return
    }
    const isHut = tileVal === TILE_ID.HUT
    const structRow = world.grid?.structure?.[localRow]
    const structVal = (structRow && structRow[localCol]) || 0
    if (!ruinedBuildingAtTile && (isHut || structVal >= 0.35)) {
      let bestHost: { id: string; age: number } | null = null
      for (const org of world.organisms) {
        if (!org.alive) continue
        const hx = Math.floor(org.home_x)
        const hy = Math.floor(org.home_y)
        if (hx === tx && hy === ty) {
          if (!bestHost || org.age > bestHost.age) {
            bestHost = { id: org.id, age: org.age }
          }
        }
      }
      if (bestHost) {
        useSceneStore.getState().enter({ kind: 'home', orgId: bestHost.id })
        return
      }
    }

    onOrgSelect(nearestOrg ? nearestOrg.id : null)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownPos.current
    if (down && ((e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2 > 36 || e.pointerId !== down.id))
      down.moved = true
    // Show a hand over prayer bubbles so they read as buttons.
    let hovering = false
    if (!sandboxArmed && !down && world.prayers?.length && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const { x: camX, y: camY, zoom } = cameraStateRef.current
      const mx = camX + (e.clientX - rect.left - dims.w / 2) / zoom
      const my = camY + (e.clientY - rect.top - dims.h / 2) / zoom
      hovering = !!prayerAtPoint(world.prayers, mx, my, { x: ox, y: oy }, TILE, zoom)
    }
    if (hovering !== overPrayer) setOverPrayer(hovering)
  }
  const handlePointerCancel = () => {
    if (pointerDownPos.current) pointerDownPos.current.moved = true
  }

  return { overPrayer, handlePointerDown, handlePointerMove, handlePointerCancel, handleClick }
}
