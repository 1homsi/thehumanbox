import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Camera2D,
  Entity,
  Game,
  Script,
  Sprite,
  Transform,
  World,
  useCoordinates,
  useDynamicCanvas,
  useGame,
  useSpriteLayer,
} from 'cubeforge'
import type { SceneContext } from '../../../scenes/core/types'
import { CANVAS_H, CANVAS_W, SCALE } from '../../../scenes/shared/room-constants'
import {
  drawAmbient,
  drawHostRing,
  drawHoverRing,
  drawNamePlate,
  drawNightLights,
  drawOccupantShadow,
} from '../../../scenes/shared/room-draw'
import { HUMAN_ATLAS_COLS } from '../../character-visuals'
import { getPeopleAtlas } from '../../../../shared/sprites'
import {
  HIT_RADIUS,
  OCCUPANT_SIZE,
  idleBob,
  nightTint,
  pickOccupant,
  placeOccupants,
  type RoomPainter,
} from './room-model'

interface Props {
  ctx: SceneContext
  painter: RoomPainter
  selectedOrgId: string | null
  onSelectOrg: (id: string) => void
}

/**
 * The stage frame the 2D scenes get from `.scene-stage--pixel > canvas`, which
 * does not reach a canvas one element deeper.
 */
const FRAME: CSSProperties = {
  display: 'block',
  margin: '0 auto',
  borderRadius: 4,
  boxShadow:
    '0 0 0 1px rgba(160, 130, 90, 0.28), 0 0 0 6px rgba(20, 14, 9, 0.9), 0 0 0 7px rgba(160, 130, 90, 0.16), 0 18px 40px rgba(0, 0, 0, 0.6)',
}

/**
 * A room interior on cubeforge: the room (floor, furniture, walls, the night
 * dim) is a Canvas2D picture shown as one sprite, the occupants are a
 * `SpriteLayer` of the people atlas with `pick()` for hover and click, and the
 * name plates are a second transparent picture that is only repainted when
 * someone is hovered, selected or moves. Same look and the same hit circles as
 * the 2D `RoomCanvas` and `HomeCanvas`.
 */
export function CfRoomView(props: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setAvailable(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // The 2D canvas is CANVAS_W * SCALE wide, shrinking with its container.
  const width = Math.min(available, CANVAS_W * SCALE)
  const height = Math.round((width * CANVAS_H) / CANVAS_W)
  return (
    <div ref={wrap} style={{ width: '100%', maxWidth: CANVAS_W * SCALE, margin: '0 auto' }}>
      {width > 0 && (
        <Game width={width} height={height} gravity={0} style={FRAME}>
          <World background="#000000">
            <Camera2D x={CANVAS_W / 2} y={CANVAS_H / 2} zoom={width / CANVAS_W} pixelSnap />
            <RoomScene {...props} />
          </World>
        </Game>
      )}
    </div>
  )
}

function RoomScene({ ctx, painter, selectedOrgId, onSelectOrg }: Props) {
  const engine = useGame()
  const { screenToWorld } = useCoordinates()
  const back = useDynamicCanvas(CANVAS_W, CANVAS_H)
  const labels = useDynamicCanvas(CANVAS_W, CANVAS_H)
  const people = useSpriteLayer({
    frameWidth: OCCUPANT_SIZE,
    frameHeight: OCCUPANT_SIZE,
    frameColumns: HUMAN_ATLAS_COLS,
    zIndex: 2,
  })
  // Never drawn: boxes the size of a person's hit circle, for `pick()`.
  const hits = useSpriteLayer({ visible: false })
  const placed = useMemo(() => placeOccupants(ctx.occupants, painter.slots), [ctx.occupants, painter])

  const live = useRef({ placed, painter, isDay: ctx.isDay, selectedOrgId, hovered: null as string | null })
  live.current.placed = placed
  live.current.painter = painter
  live.current.isDay = ctx.isDay
  live.current.selectedOrgId = selectedOrgId
  const labelsDirty = useRef(true)
  const bobs = useRef<Array<0 | -1>>([])
  const onSelectRef = useRef(onSelectOrg)
  onSelectRef.current = onSelectOrg

  // Who stands where: written when the occupants change, not every frame.
  useLayoutEffect(() => {
    people.resize(placed.length)
    hits.resize(placed.length)
    const tint = ctx.isDay ? 0xffffffff : nightTint()
    placed.forEach((o, i) => {
      people.x[i] = o.px
      people.y[i] = o.py
      people.w[i] = people.h[i] = OCCUPANT_SIZE
      people.frame[i] = o.frame
      people.color[i] = tint
      hits.x[i] = o.px
      hits.y[i] = o.py - 2
      hits.w[i] = hits.h[i] = HIT_RADIUS * 2
    })
    bobs.current = placed.map(() => 0)
    people.touch()
    hits.touch()
    labelsDirty.current = true
  }, [people, hits, placed, ctx.isDay])
  useEffect(() => {
    labelsDirty.current = true
  }, [selectedOrgId])

  // Hover, cursor and click, through the engine's own conversions and pick().
  useEffect(() => {
    const canvas = engine.canvas
    const at = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      return pickOccupant(hits, live.current.placed, world.x, world.y)
    }
    const move = (e: PointerEvent) => {
      const id = at(e)
      if (id !== live.current.hovered) {
        live.current.hovered = id
        labelsDirty.current = true
        canvas.style.cursor = id ? 'pointer' : 'default'
      }
    }
    const leave = () => {
      live.current.hovered = null
      labelsDirty.current = true
      canvas.style.cursor = 'default'
    }
    // A tap, from pointer events: the engine cancels touchstart on its canvas,
    // which stops browsers from sending the `click` that follows a touch.
    let down: { id: number; x: number; y: number } | null = null
    const press = (e: PointerEvent) => {
      down = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const release = (e: PointerEvent) => {
      const start = down
      down = null
      if (!start || start.id !== e.pointerId) return
      if ((e.clientX - start.x) ** 2 + (e.clientY - start.y) ** 2 > 36) return
      const id = at(e)
      if (id) onSelectRef.current(id)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', press)
    canvas.addEventListener('pointerup', release)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', press)
      canvas.removeEventListener('pointerup', release)
    }
  }, [engine, screenToWorld, hits])

  // Every frame, before the renderer draws.
  const frame = () => {
    const t0 = performance.now()
    const { placed: list, painter: look, isDay, selectedOrgId: selected, hovered } = live.current
    const time = t0
    const c = back.ctx
    look.paintBack(c, time)
    list.forEach((o) => {
      drawOccupantShadow(c, o.px, o.py)
      if (o.id === hovered && o.id !== selected) drawHoverRing(c, o.px, o.py - 2)
      if (o.id === selected) drawHostRing(c, o.px, o.py - 2, time)
    })
    if (!isDay) {
      drawAmbient(c, false)
      drawNightLights(c, look.nightLights)
    }
    back.markDirty()

    // The people atlas arrives after the page does; take it as soon as it has.
    if (!people.image) {
      const atlas = getPeopleAtlas()
      if (atlas) {
        people.image = atlas
        people.touch()
      }
    }
    let moved = false
    list.forEach((o, i) => {
      const bob = idleBob(time, i)
      if (bobs.current[i] !== bob) {
        bobs.current[i] = bob
        people.y[i] = o.py + bob
        moved = true
      }
    })
    if (moved) people.touch()

    if (labelsDirty.current) {
      labelsDirty.current = false
      const l = labels.ctx
      l.clearRect(0, 0, CANVAS_W, CANVAS_H)
      for (const o of list) drawNamePlate(l, o.name, o.px, o.py, o.id === hovered || o.id === selected)
      labels.markDirty()
    }
  }
  const frameRef = useRef(frame)
  frameRef.current = frame

  return (
    <>
      <Entity>
        <Transform x={CANVAS_W / 2} y={CANVAS_H / 2} />
        <Sprite width={CANVAS_W} height={CANVAS_H} dynamicSrc={back.id} color="#ffffff" zIndex={0} />
        <Script update={() => frameRef.current()} />
      </Entity>
      <Entity>
        <Transform x={CANVAS_W / 2} y={CANVAS_H / 2} />
        <Sprite width={CANVAS_W} height={CANVAS_H} dynamicSrc={labels.id} color="#ffffff" zIndex={3} />
      </Entity>
    </>
  )
}
