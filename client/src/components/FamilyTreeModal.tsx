import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import * as d3 from 'd3'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { Modal } from './Modal'

const DAY_LENGTH = 600
const NODE_R = 22       // circle radius
const ROW_H  = 130      // vertical space between generation rows
const NODE_SEP = 70     // minimum horizontal gap between sibling centers

interface Props {
  organisms:   OrganismState[]
  currentTick: number
  sexWords?:   [string, string]   // [0]=male word, [1]=female word
  onClose:     () => void
}

interface NodePos { org: OrganismState; x: number; y: number }

/**
 * Lay the family tree out using d3-hierarchy.
 *
 * Builds a synthetic root that holds every organism with no parent in the
 * data set (founders + orphans whose parents fell out of the snapshot
 * window). d3.tree() then runs the Reingold-Tilford algorithm with
 * nodeSize() so siblings get a constant minimum horizontal gap regardless
 * of subtree depth — same intent as the old hand-written layout, with
 * battle-tested d3 maths instead of recursion we maintain ourselves.
 */
function layoutTree(orgs: OrganismState[]): { nodes: NodePos[]; w: number; h: number; maxGen: number } {
  if (!orgs.length) return { nodes: [], w: 400, h: 300, maxGen: 0 }

  const byId = new Map<string, OrganismState>()
  for (const o of orgs) byId.set(o.id, o)

  // Find roots: any org whose parent isn't in our data set
  const roots = orgs.filter(o => !o.parent_id || !byId.has(o.parent_id))

  // Synthetic root that holds all the real roots — keeps the d3 hierarchy
  // strictly tree-shaped even if the data has multiple founding lineages.
  const SYNTHETIC_ROOT = '__root__'
  const synthetic: OrganismState = {
    ...orgs[0],
    id:        SYNTHETIC_ROOT,
    parent_id: '',
    generation: -1,
  } as OrganismState

  const allNodes: OrganismState[] = [synthetic, ...orgs]
  const stratify = d3.stratify<OrganismState>()
    .id(d => d.id)
    .parentId(d => {
      if (d.id === SYNTHETIC_ROOT) return null
      const isRoot = roots.some(r => r.id === d.id)
      if (isRoot) return SYNTHETIC_ROOT
      return d.parent_id || SYNTHETIC_ROOT
    })

  let root: d3.HierarchyNode<OrganismState>
  try {
    root = stratify(allNodes)
  } catch (_e) {
    // Defensive: stratify throws on cycles or duplicates. Fall back to a
    // flat layout where every org is a child of the synthetic root.
    root = d3.hierarchy<OrganismState>(synthetic, n => {
      if (n.id === SYNTHETIC_ROOT) return orgs
      return []
    })
  }

  d3.tree<OrganismState>()
    .nodeSize([NODE_SEP, ROW_H])
    (root)

  const nodes: NodePos[] = []
  let minX = Infinity, maxX = -Infinity, maxGen = 0
  root.each((n) => {
    if (n.data.id === SYNTHETIC_ROOT) return
    const x = (n as d3.HierarchyPointNode<OrganismState>).x
    const y = (n as d3.HierarchyPointNode<OrganismState>).y
    nodes.push({ org: n.data, x, y })
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (n.data.generation > maxGen) maxGen = n.data.generation
  })

  // Shift all nodes so the leftmost is at x=0 — d3 centers root at x=0 and
  // can produce negative coordinates we'd rather not deal with downstream.
  for (const n of nodes) n.x -= minX

  return {
    nodes,
    w:      Math.max(maxX - minX + NODE_R * 2, 400),
    h:      Math.max((maxGen + 1) * ROW_H + NODE_R * 2, 300),
    maxGen,
  }
}

export function FamilyTreeModal({ organisms: livOrgs, sexWords, onClose }: Props) {
  // Snapshot once on open — the modal shows a static tree, not a moving
  // one. Avoids re-laying out on every world tick.
  const organisms = useRef(livOrgs).current

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  // d3-zoom owns the transform; we mirror it to React state so the percent
  // readout in the legend stays in sync.
  const [tf, setTf] = useState<d3.ZoomTransform>(d3.zoomIdentity)
  const tfRef = useRef(tf)
  tfRef.current = tf

  const { nodes, maxGen } = useMemo(() => layoutTree(organisms), [organisms])

  // Edges keyed by relationship type — drawn separately so each gets its
  // own visual style without per-edge string compares.
  const { motherEdges, paternityEdges, partnerEdges } = useMemo(() => {
    const byId = new Map<string, NodePos>()
    for (const n of nodes) byId.set(n.org.id, n)

    const motherEdges:    Array<{ p: NodePos; c: NodePos }> = []
    const paternityEdges: Array<{ f: NodePos; c: NodePos; isCheating: boolean }> = []
    const partnerEdges:   Array<{ a: NodePos; b: NodePos }> = []
    const partnerDone     = new Set<string>()

    for (const n of nodes) {
      const o = n.org
      // Mother (parent_id) → solid bezier
      if (o.parent_id) {
        const m = byId.get(o.parent_id)
        if (m) motherEdges.push({ p: m, c: n })
      }
      // Father (father_id) → dashed bezier; gold if mother's partner != father
      if (o.father_id) {
        const f = byId.get(o.father_id)
        if (f) {
          const m = o.parent_id ? byId.get(o.parent_id) : null
          const isCheating = !!(m && m.org.partner_id && m.org.partner_id !== o.father_id)
          paternityEdges.push({ f, c: n, isCheating })
        }
      }
      // Partner (partner_id) → dashed heart line, deduped by sorted id pair
      const pid = o.partner_id
      if (pid && byId.has(pid) && !partnerDone.has(o.id) && !partnerDone.has(pid)) {
        partnerEdges.push({ a: n, b: byId.get(pid)! })
        partnerDone.add(o.id)
        partnerDone.add(pid)
      }
    }

    return { motherEdges, paternityEdges, partnerEdges }
  }, [nodes])

  // d3-shape link generator for parent→child curves
  const linkPath = useMemo(
    () => d3.linkVertical<{ source: { x: number; y: number }; target: { x: number; y: number } }, { x: number; y: number }>()
            .x(d => d.x)
            .y(d => d.y),
    []
  )

  // ── d3-zoom: replaces the hand-rolled wheel + mousedown logic ───────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sel = d3.select<HTMLCanvasElement, unknown>(canvas)

    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.08, 4])
      .on('zoom', (event) => setTf(event.transform))

    sel.call(zoom)

    // Save the zoom controller on the canvas for the +/-/fit buttons to use
    ;(canvas as any).__d3zoom__ = zoom

    return () => { sel.on('.zoom', null) }
  }, [])

  // Initial fit — pan so the topmost generation is visible at the top
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    const zoom   = canvas && (canvas as any).__d3zoom__ as d3.ZoomBehavior<HTMLCanvasElement, unknown> | undefined
    if (!canvas || !wrap || !zoom || !nodes.length) return
    const vw = wrap.clientWidth
    const vh = wrap.clientHeight
    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    const treeW = Math.max(...xs) - Math.min(...xs) + NODE_R * 2 + 60
    const treeH = Math.max(...ys) - Math.min(...ys) + NODE_R * 2 + 60
    const k = Math.min(vw / treeW, vh / treeH, 1)
    const tx = (vw - (Math.max(...xs) + Math.min(...xs)) * k) / 2
    const ty = -Math.min(...ys) * k + 60
    d3.select(canvas).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
  }, [nodes])

  // Drawing — pure canvas, transform comes from d3-zoom
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

    const { x: tx, y: ty, k: ts } = tfRef.current
    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(ts, ts)

    // Generation row labels
    ctx.font      = '9px monospace'
    ctx.fillStyle = '#3a3028'
    ctx.textAlign = 'left'
    const genSet  = [...new Set(nodes.map(n => n.org.generation))].sort((a, b) => a - b)
    const minNodeX = Math.min(...nodes.map(n => n.x))
    for (const gen of genSet) {
      const gy = nodes.find(n => n.org.generation === gen)?.y ?? gen * ROW_H
      ctx.fillText(`generation ${gen}`, minNodeX - 40, gy - NODE_R - 6)
    }

    // ── Partner edges (heart bond) ───────────────────────────────────
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#c97'
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.45
    for (const e of partnerEdges) {
      ctx.beginPath()
      ctx.moveTo(e.a.x, e.a.y)
      ctx.lineTo(e.b.x, e.b.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // ── Paternity edges (father → child, dashed) ─────────────────────
    ctx.lineWidth = 1.2
    ctx.setLineDash([3, 5])
    for (const e of paternityEdges) {
      const path = linkPath({
        source: { x: e.f.x,     y: e.f.y + NODE_R },
        target: { x: e.c.x + 4, y: e.c.y - NODE_R },
      })
      if (path) {
        ctx.globalAlpha = e.isCheating ? 0.55 : 0.28
        ctx.strokeStyle = e.isCheating ? '#e8b060' : lineageColor(e.f.org.lineage_id)
        const p = new Path2D(path)
        ctx.stroke(p)
      }
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // ── Mother edges (parent → child, solid) ─────────────────────────
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.40
    for (const e of motherEdges) {
      const path = linkPath({
        source: { x: e.p.x, y: e.p.y + NODE_R },
        target: { x: e.c.x, y: e.c.y - NODE_R },
      })
      if (path) {
        ctx.strokeStyle = lineageColor(e.c.org.lineage_id)
        const p = new Path2D(path)
        ctx.stroke(p)
      }
    }
    ctx.globalAlpha = 1

    // Node shapes: female=circle, male=rounded square
    const drawNodeShape = (
      c: CanvasRenderingContext2D, x: number, y: number, r: number, isFemale: boolean
    ) => {
      c.beginPath()
      if (isFemale) {
        c.arc(x, y, r, 0, Math.PI * 2)
      } else {
        const s = r * 1.22
        const cr = r * 0.32
        c.moveTo(x - s + cr, y - s)
        c.lineTo(x + s - cr, y - s)
        c.arcTo(x + s, y - s, x + s, y - s + cr, cr)
        c.lineTo(x + s, y + s - cr)
        c.arcTo(x + s, y + s, x + s - cr, y + s, cr)
        c.lineTo(x - s + cr, y + s)
        c.arcTo(x - s, y + s, x - s, y + s - cr, cr)
        c.lineTo(x - s, y - s + cr)
        c.arcTo(x - s, y - s, x - s + cr, y - s, cr)
        c.closePath()
      }
    }

    // Nodes + labels
    for (const { org, x, y } of nodes) {
      const color    = lineageColor(org.lineage_id)
      const isAlive  = org.alive
      const isHover  = org.id === hoverId
      const isFemale = org.sex === 'female'
      const isPartnered = !!org.partner_id

      if (isHover) { ctx.shadowColor = color; ctx.shadowBlur = 14 }

      ctx.globalAlpha = isAlive ? 0.22 : 0.10
      ctx.fillStyle   = color
      drawNodeShape(ctx, x, y, NODE_R, isFemale)
      ctx.fill()

      ctx.globalAlpha = isHover ? 1 : (isAlive ? 0.85 : 0.28)
      ctx.strokeStyle = isHover ? '#fff' : color
      ctx.lineWidth   = isHover ? 2 : (isAlive ? 1.5 : 0.8)
      drawNodeShape(ctx, x, y, NODE_R, isFemale)
      ctx.stroke()

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      if (isPartnered && isAlive) {
        ctx.fillStyle = '#c97'
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.arc(x + NODE_R - 5, y - NODE_R + 5, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      ctx.font      = `${isHover ? 600 : 500} 9.5px monospace`
      ctx.fillStyle = isAlive ? (isHover ? '#fff' : '#d0c8c0') : '#555'
      ctx.textAlign = 'center'
      ctx.fillText(org.name + (isAlive ? '' : ' †'), x, y + NODE_R + 13)

      ctx.font      = '8px monospace'
      ctx.fillStyle = '#4a3e35'
      ctx.fillText(`${Math.floor(org.age / DAY_LENGTH)}d · g${org.generation}`, x, y + NODE_R + 24)

      const hasFire = org.discoveries?.includes('fire')
      const hasHut  = org.discoveries?.includes('shelter')
      if (hasFire || hasHut) {
        ctx.font      = '9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText((hasFire ? '🔥' : '') + (hasHut ? '🏠' : ''), x, y - 3)
      } else {
        ctx.font      = '600 11px monospace'
        ctx.fillStyle = isAlive ? color : '#444'
        ctx.globalAlpha = isAlive ? 0.9 : 0.4
        ctx.textAlign = 'center'
        ctx.fillText(org.name[0], x, y - 3)
        ctx.globalAlpha = 1
      }

      const sw = sexWords ? (isFemale ? sexWords[1] : sexWords[0]) : null
      if (sw) {
        ctx.font      = '500 7px monospace'
        ctx.fillStyle = isFemale ? '#e09ab0' : '#7ab0e0'
        ctx.globalAlpha = isAlive ? 0.85 : 0.35
        ctx.textAlign = 'center'
        ctx.fillText(sw, x, y + 9)
        ctx.globalAlpha = 1
      }
    }

    ctx.restore()
  }, [nodes, motherEdges, paternityEdges, partnerEdges, hoverId, sexWords, linkPath])

  useEffect(() => { draw() }, [draw, tf])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  // Hover hit-test in screen space → world space (d3 transform.invert handles
  // the math we used to do manually).
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = tfRef.current.invert([sx, sy])
    const hit = nodes.find(n => Math.hypot(wx - n.x, wy - n.y) <= NODE_R + 4)
    setHoverId(hit?.org.id ?? null)
  }, [nodes])

  // Imperative zoom controls — drive the d3 zoom behaviour so its internal
  // state stays in sync with our buttons.
  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current
    const zoom   = canvas && (canvas as any).__d3zoom__ as d3.ZoomBehavior<HTMLCanvasElement, unknown> | undefined
    if (canvas && zoom) d3.select(canvas).transition().duration(150).call(zoom.scaleBy, factor)
  }
  const fitAll = () => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    const zoom   = canvas && (canvas as any).__d3zoom__ as d3.ZoomBehavior<HTMLCanvasElement, unknown> | undefined
    if (!canvas || !wrap || !zoom || !nodes.length) return
    const vw = wrap.clientWidth
    const vh = wrap.clientHeight
    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    const treeW = Math.max(...xs) - Math.min(...xs) + NODE_R * 2 + 60
    const treeH = Math.max(...ys) - Math.min(...ys) + NODE_R * 2 + 60
    const k = Math.min(vw / treeW, vh / treeH, 1)
    const tx = (vw - (Math.max(...xs) + Math.min(...xs)) * k) / 2
    const ty = -Math.min(...ys) * k + 60
    d3.select(canvas).transition().duration(200)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
  }

  const hovered = hoverId != null ? (organisms.find(o => o.id === hoverId) ?? null) : null

  return (
    <Modal open onClose={onClose} className="tree-modal" title="Family tree" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">FAMILY TREE</span>
        <span className="tree-modal-sub">
          {organisms.filter(o => o.alive).length} alive · {organisms.filter(o => !o.alive).length} ancestors · {(maxGen ?? 0) + 1} generations
        </span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="tree-tooltip">
        {hovered ? (
          <>
            <span style={{ color: lineageColor(hovered.lineage_id), fontWeight: 600 }}>{hovered.name}</span>
            {sexWords && hovered.sex && (
              <span style={{ color: hovered.sex === 'female' ? '#e09ab0' : '#7ab0e0', marginLeft: 4 }}>
                {hovered.sex === 'female' ? sexWords[1] : sexWords[0]}
              </span>
            )}
            <span style={{ color: '#666' }}> · gen {hovered.generation} · {Math.floor(hovered.age / DAY_LENGTH)}d · {hovered.lineage_id.slice(0, 6)}</span>
            {hovered.partner_id && <span style={{ color: '#c97' }}> ♥ bonded</span>}
            {hovered.father_id && (() => {
              const father = organisms.find(o => o.id === hovered.father_id)
              const mother = organisms.find(o => o.id === hovered.parent_id)
              const isCheating = mother && mother.partner_id !== hovered.father_id
              return father ? (
                <span style={{ color: isCheating ? '#e8b060' : '#7ab0e0' }}>
                  {' · '}{isCheating ? '⚡' : ''}father: {father.name}
                </span>
              ) : null
            })()}
            {hovered.children_count != null && hovered.children_count > 0 && (
              <span style={{ color: '#888' }}> · {hovered.children_count} children</span>
            )}
            {hovered.discoveries?.includes('fire')    && <span> 🔥</span>}
            {hovered.discoveries?.includes('shelter') && <span> 🏠</span>}
            <span className="tree-tooltip-thought"> "{hovered.thought}"</span>
          </>
        ) : (
          <span style={{ color: '#333' }}>scroll to zoom · drag to pan · hover a node for info · <span style={{ color: '#c97' }}>─ ─</span> bonded pair</span>
        )}
      </div>

      <div className="tree-scroll" ref={wrapRef} style={{ overflow: 'hidden', cursor: 'grab' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverId(null)}
          style={{ display: 'block', userSelect: 'none' }}
        />
      </div>

      <div className="tree-legend">
        <button className="tree-zoom-btn" onClick={() => zoomBy(1.25)}>＋</button>
        <button className="tree-zoom-btn" onClick={fitAll}>fit</button>
        <button className="tree-zoom-btn" onClick={() => zoomBy(0.8)}>－</button>
        <span style={{ color: '#444', marginLeft: 8 }}>
          🔥 fire · 🏠 shelter · † deceased · <span style={{ color: '#c97' }}>♥</span> bonded
          · <span style={{ color: '#888' }}>— mother</span>
          · <span style={{ color: '#888', borderBottom: '1px dashed #888' }}>- - father</span>
          · <span style={{ color: '#e8b060' }}>- - infidelity</span>
          {sexWords && (
            <> · <span style={{ color: '#7ab0e0' }}>▪ {sexWords[0]}</span> · <span style={{ color: '#e09ab0' }}>● {sexWords[1]}</span></>
          )}
        </span>
        <span style={{ color: '#333', marginLeft: 'auto' }}>{Math.round(tf.k * 100)}%</span>
      </div>
    </Modal>
  )
}
