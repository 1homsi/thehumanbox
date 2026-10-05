import { useRef, useState } from 'react'
import type { PrayerInfo, WorldState } from '../../../shared/types'
import { useUIStore, type ViewFlags } from '../../../state/store'
import { useSceneStore } from '../../../state/scene'
import type { TerritoryIndex } from '../../model/territory'
import { TILE } from '../../model/palette'
import { prayerAtPoint } from '../prayer-bubbles'
import { burstForTool, type useSandboxBursts } from '../sandbox-bursts'
import { isMapControl } from '../camera-controls'
import { resolveMapClick, type MapClickOutcome } from '../cf/input/map-click'

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
  /** Carry out what a click on the map means. `screen` is where it landed, in container pixels. */
  const act = (outcome: MapClickOutcome, screen: { x: number; y: number }, zoom: number) => {
    switch (outcome.kind) {
      case 'ignore':
        return
      case 'sandbox': {
        if (!onSandboxApply) return
        const burst = burstForTool(sandboxToolId)
        if (burst) spawnBurst(burst, screen.x, screen.y, (sandboxRadius ?? 0) * TILE * zoom)
        onSandboxApply(outcome.worldX, outcome.worldY)
        return
      }
      case 'prayer':
        onPrayerClick?.(outcome.prayer)
        return
      case 'territory':
        onOrgSelect(null)
        useUIStore.setState({ panelOpen: false })
        setFocus(outcome.lineageId ? `lineage:${outcome.lineageId}` : 'all')
        return
      case 'enter-home':
        useSceneStore.getState().enter({ kind: 'home', orgId: outcome.orgId })
        return
      case 'select':
        onOrgSelect(outcome.orgId)
    }
  }
  const resolve = (mapX: number, mapY: number, zoom: number) =>
    resolveMapClick({
      mapX,
      mapY,
      zoom,
      world,
      ox,
      oy,
      sandboxArmed: !!sandboxArmed && !!onSandboxApply,
      prayerClicksEnabled: !!onPrayerClick,
      viewFlags,
      focus,
      territoryIndex,
      coarsePointer: typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
    })
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
    act(
      resolve(camX + (sx - dims.w / 2) / zoom, camY + (sy - dims.h / 2) / zoom, zoom),
      { x: sx, y: sy },
      zoom,
    )
  }
  /**
   * A tap reported by the cubeforge camera (`useCameraPanZoom` onTap): the map
   * point and the container point it landed on. Same rules as a click.
   */
  const handleTap = (tap: { worldX: number; worldY: number; screenX: number; screenY: number }) => {
    act(
      resolve(tap.worldX, tap.worldY, cameraStateRef.current.zoom),
      { x: tap.screenX, y: tap.screenY },
      cameraStateRef.current.zoom,
    )
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

  return { overPrayer, handlePointerDown, handlePointerMove, handlePointerCancel, handleClick, handleTap }
}
