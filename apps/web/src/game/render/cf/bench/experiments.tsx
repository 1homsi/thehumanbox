import { useEffect, useMemo } from 'react'
import type { TransformComponent } from 'cubeforge'
import {
  Circle,
  SPRITE_UNTEXTURED,
  TileLayer,
  useSpriteLayer,
  useTileLayer,
  Entity,
  Gradient,
  Line,
  ParticleEmitter,
  Polygon,
  Sprite,
  Text,
  Trail,
  Transform,
  useEntity,
  useGame,
  usePostProcess,
  useWebGLPostProcess,
  vignetteEffect,
} from 'cubeforge'
import { rng } from './world'

/** What an experiment draws, and where (a box of world pixels round the camera centre). */
export interface ExperimentSpec {
  kind:
    | 'line'
    | 'circle'
    | 'polygon'
    | 'gradient'
    | 'text'
    | 'emitter-rain'
    | 'trail'
    | 'post-gl'
    | 'post-2d'
    | 'sprite-additive'
    | 'sprite-shape'
    | 'tile-under-sprite'
    | 'layer-image-update'
    | 'layer-blend'
  n: number
  box: { cx: number; cy: number; w: number; h: number }
  /** Font size for text, in world px. */
  fontSize?: number
}

function scatter(spec: ExperimentSpec) {
  const rand = rng(77)
  return Array.from({ length: spec.n }, (_, i) => ({
    i,
    x: spec.box.cx + (rand() - 0.5) * spec.box.w,
    y: spec.box.cy + (rand() - 0.5) * spec.box.h,
  }))
}

/** Moves every trailed entity on a circle each frame (one driver per entity keeps the sketch simple). */
function Moving({ id, x, y }: { id: number; x: number; y: number }) {
  const engine = useGame()
  const eid = useEntity()
  useEffect(() => {
    let raf = 0
    let k = 0
    const tick = () => {
      k++
      const t = engine.ecs.getComponent<TransformComponent>(eid, 'Transform')
      if (t) {
        t.x = x + Math.cos((k + id) / 12) * 40
        t.y = y + Math.sin((k + id) / 12) * 40
      }
      engine.loop.markDirty()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine, eid, id, x, y])
  return null
}

function PostGl() {
  useWebGLPostProcess({
    vignette: { enabled: true, intensity: 0.5 },
    bloom: { enabled: true, threshold: 0.6, intensity: 0.5 },
  })
  return null
}

function Post2d() {
  const effect = useMemo(() => vignetteEffect(0.6), [])
  usePostProcess(effect)
  return null
}

/** A red tile layer at zIndex 100 over a green sprite at zIndex 0: if the pixel is green, tiles draw below sprites. */
function TileUnderSprite({ spec }: { spec: ExperimentSpec }) {
  const tileset = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 8
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 8, 8)
    return { image: c, tileWidth: 8, tileHeight: 8, columns: 1 }
  }, [])
  const layer = useTileLayer({
    width: 4,
    height: 4,
    tileset,
    tinted: true,
    tileWorldWidth: 20,
    tileWorldHeight: 20,
    tiles: new Array(16).fill(1),
  })
  useEffect(() => {
    const red = new Uint8Array(16 * 4)
    for (let i = 0; i < 16; i++) red.set([255, 0, 0, 255], i * 4)
    layer.setTints(red)
    layer.x = spec.box.cx - 40
    layer.y = spec.box.cy - 40
    layer.zIndex = 100
  }, [layer, spec])
  return (
    <>
      <TileLayer layer={layer} zIndex={100} />
      <Entity>
        <Transform x={spec.box.cx} y={spec.box.cy} />
        <Sprite width={80} height={80} color="#00ff00" zIndex={0} />
      </Entity>
    </>
  )
}

/** A SpriteLayer atlas given as a canvas: repaint the canvas and see whether the layer shows the change. */
function LayerImageUpdate({ spec }: { spec: ExperimentSpec }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    c.getContext('2d')!.fillStyle = '#ff0000'
    c.getContext('2d')!.fillRect(0, 0, 16, 16)
    return c
  }, [])
  const layer = useSpriteLayer({
    image: canvas,
    frameWidth: 16,
    frameHeight: 16,
    zIndex: 5,
    sampling: 'nearest',
  })
  const engine = useGame()
  useEffect(() => {
    layer.add(spec.box.cx, spec.box.cy, 80, 80, 0)
    let n = 0
    const id = window.setInterval(() => {
      n++
      if (n === 3) {
        const g = canvas.getContext('2d')!
        g.fillStyle = '#0000ff'
        g.fillRect(0, 0, 16, 16)
        layer.touch()
      }
      engine.loop.markDirty()
    }, 50)
    return () => window.clearInterval(id)
  }, [layer, canvas, engine, spec])
  return null
}

/** Two overlapping sprites in a SpriteLayer: there is no per-layer blend mode to make the glow additive. */
function LayerBlend({ spec }: { spec: ExperimentSpec }) {
  const layer = useSpriteLayer({ zIndex: 5 })
  useEffect(() => {
    for (let i = 0; i < 2; i++) {
      const k = layer.add(spec.box.cx + i * 20, spec.box.cy, 60, 60, 0)
      layer.color[k] = i === 0 ? 0xff0000ff : 0x0000ffff
      layer.flags[k] = SPRITE_UNTEXTURED
    }
    layer.touch()
  }, [layer, spec])
  return null
}

export function Experiment({ spec }: { spec: ExperimentSpec }) {
  const pts = useMemo(() => scatter(spec), [spec])
  switch (spec.kind) {
    case 'line':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Line endX={40} endY={16} color="#ff2020" lineWidth={4} zIndex={5} />
            </Entity>
          ))}
        </>
      )
    case 'circle':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Circle radius={14} color="#ff2020" strokeColor="#ffff00" strokeWidth={2} zIndex={5} />
            </Entity>
          ))}
        </>
      )
    case 'polygon':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Polygon
                points={[
                  { x: 0, y: 0 },
                  { x: 30, y: 4 },
                  { x: 12, y: 26 },
                ]}
                color="#ff2020"
                zIndex={5}
              />
            </Entity>
          ))}
        </>
      )
    case 'gradient':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Gradient
                gradientType="radial"
                stops={[
                  { offset: 0, color: 'rgba(255,0,0,1)' },
                  { offset: 1, color: 'rgba(255,0,0,0)' },
                ]}
                width={40}
                height={40}
                zIndex={5}
              />
            </Entity>
          ))}
        </>
      )
    case 'text':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Text text={`Settlement ${p.i}`} fontSize={spec.fontSize ?? 10} color="#ffffff" zIndex={5} />
            </Entity>
          ))}
        </>
      )
    case 'emitter-rain':
      return (
        <Entity>
          <Transform x={spec.box.cx} y={spec.box.cy - spec.box.h / 2} />
          <ParticleEmitter
            rate={spec.n}
            speed={420}
            spread={0.1}
            angle={Math.PI / 2 + 0.3}
            particleLife={1.1}
            particleSize={2}
            color="rgba(170,190,225,0.5)"
            gravity={0}
            maxParticles={Math.round(spec.n * 1.2)}
            emitShape="box"
            emitWidth={spec.box.w}
            emitHeight={1}
          />
        </Entity>
      )
    case 'trail':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Sprite width={4} height={4} color="#ffffff" zIndex={5} />
              <Trail length={20} color="#ff4040" width={2} />
              <Moving id={p.i} x={p.x} y={p.y} />
            </Entity>
          ))}
        </>
      )
    case 'post-gl':
      return <PostGl />
    case 'post-2d':
      return <Post2d />
    case 'sprite-additive':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Sprite width={30} height={30} color="#ff8030" shape="circle" blendMode="additive" zIndex={5} />
            </Entity>
          ))}
        </>
      )
    case 'sprite-shape':
      return (
        <>
          {pts.map((p) => (
            <Entity key={p.i}>
              <Transform x={p.x} y={p.y} />
              <Sprite width={30} height={30} color="#ff2020" shape="circle" zIndex={5} />
            </Entity>
          ))}
        </>
      )
    case 'tile-under-sprite':
      return <TileUnderSprite spec={spec} />
    case 'layer-image-update':
      return <LayerImageUpdate spec={spec} />
    case 'layer-blend':
      return <LayerBlend spec={spec} />
    default:
      return null
  }
}
