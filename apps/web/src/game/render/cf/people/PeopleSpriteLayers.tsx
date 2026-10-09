import { useEffect, useMemo, useRef } from 'react'
import { useGame, useSpriteLayer } from 'xipjs'
import type { WorldState } from '../../../../shared/types'
import type { InterpRefs } from '../../../../simulation/useSimulation'
import type { ViewFlags } from '../../../../state/store'
import { normalizeLineageEras } from '../../../../shared/lineageEras'
import { zoomDetailLevel } from '../../character-visuals'
import { ruinedBuildingTiles } from '../../base-parts/terrain-scans'
import { useBoatAtlas, useDecalAtlas, useEmoteAtlas, useGlyphAtlas, usePeopleAtlas } from '../atlas-hooks'
import { useSpriteClock, wakeEngine } from '../frame-clock'
import { wakeRenderLoops } from '../render-loop'
import { registerPeopleLayer } from '../picking'
import { PeopleSprites } from './people-sprites'
import { PEOPLE_Z } from './z-order'
import { HUMAN_ATLAS_CELL } from '../../character-visuals'
import { BOAT_CELL, DECAL_CELL, EMOTE_CELL, GLYPH_CELL } from '../atlas-bake'

interface Props {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  focus: string
  viewFlags: ViewFlags
  rendererPaused: boolean
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
}

/**
 * People drawn by four SpriteLayers instead of the canvas painter's
 * `draw_people`. Mount inside `<World>`; renders nothing itself.
 */
export function PeopleSpriteLayers({
  world,
  interp,
  selectedOrgId,
  focus,
  viewFlags,
  rendererPaused,
  cameraStateRef,
}: Props) {
  const engine = useGame()
  const peopleAtlas = usePeopleAtlas()
  const boatAtlas = useBoatAtlas()
  const decalAtlas = useDecalAtlas()
  const glyphAtlas = useGlyphAtlas()
  const emoteAtlas = useEmoteAtlas()

  const bodyAtlases = useMemo(
    () => [
      { dynamicSrc: peopleAtlas, frameWidth: HUMAN_ATLAS_CELL, frameHeight: HUMAN_ATLAS_CELL },
      { dynamicSrc: boatAtlas, frameWidth: BOAT_CELL.width, frameHeight: BOAT_CELL.height },
    ],
    [peopleAtlas, boatAtlas],
  )
  const softAtlases = useMemo(
    () => [{ dynamicSrc: decalAtlas, frameWidth: DECAL_CELL, frameHeight: DECAL_CELL }],
    [decalAtlas],
  )
  const overAtlases = useMemo(
    () => [{ dynamicSrc: glyphAtlas, frameWidth: GLYPH_CELL, frameHeight: GLYPH_CELL }],
    [glyphAtlas],
  )
  const emoteAtlases = useMemo(
    () => [{ dynamicSrc: emoteAtlas, frameWidth: EMOTE_CELL, frameHeight: EMOTE_CELL }],
    [emoteAtlas],
  )
  // Nearest keeps the pixel art crisp; the soft decals are anti-aliased shapes and want linear.
  const body = useSpriteLayer({
    atlases: bodyAtlases,
    sortByKey: true,
    zIndex: PEOPLE_Z.body,
    sampling: 'nearest',
  })
  const soft = useSpriteLayer({ atlases: softAtlases, zIndex: PEOPLE_Z.soft, sampling: 'linear' })
  const over = useSpriteLayer({ atlases: overAtlases, zIndex: PEOPLE_Z.over, sampling: 'linear' })

  const emote = useSpriteLayer({ atlases: emoteAtlases, zIndex: PEOPLE_Z.emote, sampling: 'nearest' })

  const sprites = useMemo(() => new PeopleSprites({ body, soft, over, emote }), [body, soft, over, emote])

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const ui = useRef({ selectedOrgId, focus, viewFlags })
  ui.current = { selectedOrgId, focus, viewFlags }
  const lastAnimate = useRef(0)
  const last = useRef<{
    orgs: unknown
    prev: unknown
    ui: unknown
    selected: string | null
    focus: string
    detail: string
    vehicles: unknown
    buildings: unknown
    eras: unknown
  } | null>(null)

  useEffect(() => {
    const pick = (wx: number, wy: number) => sprites.pick(wx, wy)
    const unregister = registerPeopleLayer(pick, {
      get orgs() {
        return sprites.orgs
      },
      get px() {
        return sprites.px
      },
      get py() {
        return sprites.py
      },
      get hidden() {
        return sprites.hidden
      },
      get phase() {
        return sprites.phase
      },
      get step() {
        return sprites.stepState
      },
      get labelFlags() {
        return sprites.labelFlags
      },
      get tileX() {
        return sprites.toX
      },
      get tileY() {
        return sprites.toY
      },
      get ids() {
        return sprites.ids
      },
      get radius() {
        return sprites.bodyRadius
      },
    })
    // Force the next frame to rebuild: the buffer is new.
    last.current = null
    return unregister
  }, [sprites])

  useSpriteClock(interp, world, rendererPaused, (frame) => {
    const w = frame.world
    const zoom = cameraStateRef.current.zoom
    const orgs =
      w.viewport_organisms && w.viewport_organisms.length > 0 ? w.viewport_organisms : (w.organisms ?? [])
    const prevOrgs = frame.prev
      ? frame.prev.viewport_organisms && frame.prev.viewport_organisms.length > 0
        ? frame.prev.viewport_organisms
        : (frame.prev.organisms ?? [])
      : null
    const { selectedOrgId: selected, focus: foc, viewFlags: flags } = ui.current
    const detail = zoomDetailLevel(zoom)
    const l = last.current
    const stale =
      !l ||
      l.orgs !== orgs ||
      l.prev !== prevOrgs ||
      l.ui !== flags ||
      l.selected !== selected ||
      l.focus !== foc ||
      l.detail !== detail ||
      l.vehicles !== w.vehicles ||
      l.buildings !== w.buildings ||
      l.eras !== w.lineage_eras
    if (stale) {
      sprites.rebuild({
        orgs,
        prevOrgs,
        selectedId: selected,
        focus: foc,
        viewFlags: flags,
        zoom,
        vehicles: w.vehicles ?? [],
        lineageEras: normalizeLineageEras(w.lineage_eras),
        ruinedTiles: ruinedBuildingTiles(w.buildings),
        ox,
        oy,
        clock: (w.tick ?? 0) * 100,
      })
      last.current = {
        orgs,
        prev: prevOrgs,
        ui: flags,
        selected,
        focus: foc,
        detail,
        vehicles: w.vehicles,
        buildings: w.buildings,
        eras: w.lineage_eras,
      }
    }
    // A quiet world needs no more frames. Only the selected person's turning ring keeps going,
    // and not while the simulation is paused.
    // The clock sleeps until a frame, a camera move or a UI change wakes it.
    if (!stale && frame.t >= 1 && !sprites.moving && (selected === null || frame.settled)) return false
    // Zoomed out, a person moves a few pixels a second: 20 updates a second are as smooth as 60.
    if (!stale && detail === 'overview' && frame.now - lastAnimate.current < 50) return true
    lastAnimate.current = frame.now
    sprites.animate(frame.now, frame.t)
    wakeEngine(engine, detail === 'overview' ? 20 : 60)
    return true
  })

  // Who is selected, the focus and the view flags are read by the clock from refs.
  useEffect(() => wakeRenderLoops(), [selectedOrgId, focus, viewFlags])

  return null
}
