import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'

const DAY_LENGTH = 600
const NODE_W  = 100
const NODE_H  = 34
const GAP_Y   = 8
const GAP_X   = 150
const PAD_X   = 20
const PAD_Y   = 30

interface Props {
  organisms: OrganismState[]
  currentTick: number
  onClose: () => void
}

interface NodePos { org: OrganismState; x: number; y: number }
interface XY { x: number; y: number }
interface Transform { x: number; y: number; scale: number }

function buildLayout(orgs: OrganismState[]) {
  if (!orgs.length) return { nodes: [] as NodePos[], w: 400, h: 200 }

  const byGen = new Map<number, OrganismState[]>()
  for (const o of orgs) {
    if (!byGen.has(o.generation)) byGen.set(o.generation, [])
    byGen.get(o.generation)!.push(o)
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b)

  const posMap = new Map<string, XY>()
  const nodes: NodePos[] = []

  for (const gen of gens) {
    const list = byGen.get(gen)!
    list.sort((a, b) => {
      const pyA = posMap.get(a.parent_id)?.y ?? 0
      const pyB = posMap.get(b.parent_id)?.y ?? 0
      if (Math.abs(pyA - pyB) > 1) return pyA - pyB
      return a.name.localeCompare(b.name)
    })
    const colX = PAD_X + gens.indexOf(gen) * (NODE_W + GAP_X)
    list.forEach((org, i) => {
      const y = PAD_Y + i * (NODE_H + GAP_Y)
      nodes.push({ org, x: colX, y })
      posMap.set(org.id, { x: colX, y })
    })
  }

  const maxX = Math.max(...nodes.map(n => n.x)) + NODE_W + PAD_X
  const maxY = Math.max(...nodes.map(n => n.y)) + NODE_H + PAD_Y
  return { nodes, w: Math.max(maxX, 400), h: Math.max(maxY, 200) }
}

export function FamilyTreeModal({ organisms: livOrgs, onClose }: Props) {
  // Snapshot on mount — never re-layout from live data (live updates cause constant re-renders)
  const organisms = useRef(livOrgs).current

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [tf, setTf] = useState<Transform>({ x: 20, y: 20, scale: 0.75 })
  const dragging    = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const tfRef       = useRef(tf)
  tfRef.current = tf

  const { nodes, w: svgW, h: svgH } = useMemo(() => buildLayout(organisms), [organisms])

  const posById = useMemo(() => {
    const m = new Map<string, XY>()
    for (const n of nodes) m.set(n.org.id, { x: n.x, y: n.y })
    return m
  }, [nodes])

  const { edges, ghostEdges } = useMemo(() => {
    const edges: { x1: number; y1: number; x2: number; y2: number; color: string }[] = []
    const ghostEdges: { x: number; y: number }[] = []
    for (const n of nodes) {
      const p = posById.get(n.org.parent_id)
      if (p) {
        edges.push({
          x1: p.x + NODE_W, y1: p.y + NODE_H / 2,
          x2: n.x,          y2: n.y + NODE_H / 2,
          color: lineageColor(n.org.lineage_id),
        })
      } else if (n.org.generation > 0 && n.org.parent_id) {
        ghostEdges.push({ x: n.x, y: n.y + NODE_H / 2 })
      }
    }
    return { edges, ghostEdges }
  }, [nodes, posById])

  const gens = useMemo(() =>
    [...new Set(nodes.map(n => n.org.generation))].sort((a, b) => a - b),
    [nodes])

  // ── Canvas draw ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const vw  = wrap.clientWidth
    const vh  = wrap.clientHeight
    if (canvas.width !== vw * dpr || canvas.height !== vh * dpr) {
      canvas.width  = vw * dpr
      canvas.height = vh * dpr
      canvas.style.width  = vw + 'px'
      canvas.style.height = vh + 'px'
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, vw, vh)

    const { x: tx, y: ty, scale: ts } = tfRef.current
    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(ts, ts)

    // Gen labels
    ctx.font = '9px monospace'
    ctx.fillStyle = '#333'
    ctx.textAlign = 'center'
    gens.forEach((gen, i) => {
      const gx = PAD_X + i * (NODE_W + GAP_X) + NODE_W / 2
      ctx.fillText(`gen ${gen}`, gx, 14)
    })

    // Ghost stubs
    ctx.strokeStyle = '#2a2a2a'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    for (const g of ghostEdges) {
      ctx.beginPath()
      ctx.moveTo(g.x, g.y)
      ctx.lineTo(g.x - 40, g.y)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Edges
    ctx.lineWidth = 1.5
    for (const e of edges) {
      const mx = (e.x1 + e.x2) / 2
      ctx.strokeStyle = e.color + '55'
      ctx.beginPath()
      ctx.moveTo(e.x1, e.y1)
      ctx.bezierCurveTo(mx, e.y1, mx, e.y2, e.x2, e.y2)
      ctx.stroke()
    }

    // Nodes
    for (const { org, x, y } of nodes) {
      const color   = lineageColor(org.lineage_id)
      const isAlive = org.alive
      const isHover = org.id === hoverId

      // Card bg
      ctx.fillStyle = isAlive ? '#181818' : '#101010'
      ctx.strokeStyle = isHover ? '#ddd' : color + (isAlive ? 'cc' : '44')
      ctx.lineWidth = isHover ? 1.5 : 0.8
      ctx.beginPath()
      ctx.roundRect(x, y, NODE_W, NODE_H, 3)
      ctx.fill()
      ctx.stroke()

      // Lineage bar
      ctx.fillStyle = color + (isAlive ? 'e6' : '44')
      ctx.beginPath()
      ctx.roundRect(x, y, 3, NODE_H, 2)
      ctx.fill()

      // Name
      ctx.font = '600 10px monospace'
      ctx.fillStyle = isAlive ? '#ddd' : '#555'
      ctx.textAlign = 'left'
      ctx.fillText(org.name + (isAlive ? '' : ' †'), x + 8, y + 13)

      // Sub info
      ctx.font = '8px monospace'
      ctx.fillStyle = '#444'
      ctx.fillText(`${org.lineage_id.slice(0, 5)} · ${Math.floor(org.age / DAY_LENGTH)}d`, x + 8, y + 26)

      // Discovery icons
      const hasFire = org.discoveries?.includes('fire')
      const hasHut  = org.discoveries?.includes('shelter')
      if (hasFire || hasHut) {
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText((hasFire ? '🔥' : '') + (hasHut ? '🏠' : ''), x + NODE_W - 4, y + 13)
      }
    }

    ctx.restore()
  }, [nodes, edges, ghostEdges, gens, hoverId])

  // Redraw whenever transform or hover changes
  useEffect(() => { draw() }, [draw, tf, hoverId])

  // Fit all content into viewport
  const fitAll = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap || !nodes.length) return
    const vw = wrap.clientWidth
    const vh = wrap.clientHeight
    const s  = Math.min(vw / (svgW + PAD_X * 2), vh / (svgH + PAD_Y * 2), 1.0)
    setTf({ x: (vw - svgW * s) / 2, y: (vh - svgH * s) / 2, scale: s })
  }, [svgW, svgH, nodes.length])

  useEffect(() => { fitAll() }, [fitAll])

  // Resize observer
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  // Wheel zoom
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = wrapRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 0.87
    setTf(t => {
      const ns = Math.max(0.1, Math.min(4, t.scale * factor))
      const r  = ns / t.scale
      return { x: mx - r * (mx - t.x), y: my - r * (my - t.y), scale: ns }
    })
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // Drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const t = tfRef.current
    dragging.current = { ox: t.x, oy: t.y, sx: e.clientX, sy: e.clientY }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const { ox, oy, sx, sy } = dragging.current
      setTf(t => ({ ...t, x: ox + ev.clientX - sx, y: oy + ev.clientY - sy }))
    }
    const onUp = () => {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Hover hit-test
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging.current) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x: tx, y: ty, scale: ts } = tfRef.current
    const wx = (e.clientX - rect.left - tx) / ts
    const wy = (e.clientY - rect.top  - ty) / ts
    const hit = nodes.find(n =>
      wx >= n.x && wx <= n.x + NODE_W && wy >= n.y && wy <= n.y + NODE_H
    )
    setHoverId(hit?.org.id ?? null)
  }, [nodes])

  const hovered = hoverId != null ? (organisms.find(o => o.id === hoverId) ?? null) : null

  return (
    <div className="lang-modal-backdrop" onClick={onClose}>
      <div className="tree-modal" onClick={e => e.stopPropagation()}>

        <div className="lang-modal-header">
          <span className="lang-modal-title">FAMILY TREE</span>
          <span className="tree-modal-sub">
            {organisms.filter(o => o.alive).length} alive · {organisms.filter(o => !o.alive).length} ancestors
          </span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="tree-tooltip">
          {hovered ? (
            <>
              <span style={{ color: lineageColor(hovered.lineage_id), fontWeight: 600 }}>{hovered.name}</span>
              <span style={{ color: '#666' }}> · gen {hovered.generation} · age {hovered.age} · {hovered.lineage_id.slice(0, 6)}</span>
              {hovered.discoveries?.includes('fire')    && <span> 🔥</span>}
              {hovered.discoveries?.includes('shelter') && <span> 🏠</span>}
              <span className="tree-tooltip-thought"> "{hovered.thought}"</span>
            </>
          ) : (
            <span style={{ color: '#333' }}>scroll to zoom · drag to pan · hover a node for info</span>
          )}
        </div>

        <div className="tree-scroll" ref={wrapRef} style={{ overflow: 'hidden', cursor: 'grab' }}>
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHoverId(null)}
            style={{ display: 'block', userSelect: 'none' }}
          />
        </div>

        <div className="tree-legend">
          <button className="tree-zoom-btn" onClick={() => setTf(t => ({ ...t, scale: Math.min(4, t.scale * 1.25) }))}>＋</button>
          <button className="tree-zoom-btn" onClick={fitAll}>fit</button>
          <button className="tree-zoom-btn" onClick={() => setTf(t => ({ ...t, scale: Math.max(0.1, t.scale * 0.8) }))}>－</button>
          <span style={{ color: '#444', marginLeft: 8 }}>🔥 fire · 🏠 shelter · † deceased</span>
          <span style={{ color: '#333', marginLeft: 'auto' }}>{Math.round(tf.scale * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
