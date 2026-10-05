import { useEffect, useMemo } from 'react'
import type { TransformComponent } from 'cubeforge'
import {
  Circle,
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
  useWebGLPostProcess({ vignette: { enabled: true, intensity: 0.5 }, bloom: { enabled: true, threshold: 0.6, intensity: 0.5 } })
  return null
}

function Post2d() {
  const effect = useMemo(() => vignetteEffect(0.6), [])
  usePostProcess(effect)
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
    default:
      return null
  }
}
