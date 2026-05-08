import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'

const DAY_LENGTH = 600
const NODE_R    = 22      // circle radius
const ROW_H     = 130     // vertical space between generation rows
const MIN_SEP   = 70      // minimum horizontal gap between sibling centers
const PAD_X     = 60
const PAD_Y     = 60

interface Props {
  organisms: OrganismState[]
  currentTick: number
  sexWords?: [string, string]   // [0]=male word, [1]=female word
  onClose: () => void
}

interface NodePos { org: OrganismState; x: number; y: number }
interface XY { x: number; y: number }
interface Transform { x: number; y: number; scale: number }

// Reingold-Tilford-inspired layout for a vertical tree
// Generations go top→bottom (gen 0 at top, newest at bottom)
function buildLayout(orgs: OrganismState[]) {
  if (!orgs.length) return { nodes: [] as NodePos[], w: 400, h: 300 }

  const byId = new Map<string, OrganismState>()
  for (const o of orgs) byId.set(o.id, o)

  // Build children map
  const children = new Map<string, string[]>()
  for (const o of orgs) {
    if (!children.has(o.id)) children.set(o.id, [])
    if (o.parent_id && byId.has(o.parent_id)) {
      if (!children.has(o.parent_id)) children.set(o.parent_id, [])
      children.get(o.parent_id)!.push(o.id)
    }
  }

  // Find roots: no parent in the list
  const roots = orgs.filter(o => !o.parent_id || !byId.has(o.parent_id))

  // Compute subtree width for each node (recursive)
  const subtreeWidth = new Map<string, number>()
  function computeWidth(id: string): number {
    const kids = children.get(id) ?? []
    if (kids.length === 0) {
      subtreeWidth.set(id, MIN_SEP)
      return MIN_SEP
    }
    let total = 0
    for (const kid of kids) total += computeWidth(kid)
    subtreeWidth.set(id, Math.max(MIN_SEP, total))
    return subtreeWidth.get(id)!
  }
  for (const r of roots) computeWidth(r.id)

  // Assign x positions by distributing subtree widths
  const posMap = new Map<string, XY>()
  const maxGen = Math.max(...orgs.map(o => o.generation))

  function assignX(id: string, left: number): number {
    const org = byId.get(id)!
    const y   = PAD_Y + org.generation * ROW_H
    const kids = children.get(id) ?? []
    if (kids.length === 0) {
      const x = left + MIN_SEP / 2
      posMap.set(id, { x, y })
      return left + MIN_SEP
    }
    let cursor = left
    for (const kid of kids) cursor = assignX(kid, cursor)
    // Center parent above its children span
    const firstChild = posMap.get(kids[0])!
    const lastChild  = posMap.get(kids[kids.length - 1])!
    const x = (firstChild.x + lastChild.x) / 2
    posMap.set(id, { x, y })
    return left + subtreeWidth.get(id)!
  }

  let cursor = PAD_X
  for (const r of roots) cursor = assignX(r.id, cursor)

  // Orphaned nodes (gen > 0 but parent not in list) — stack them in their gen row
  const placed = new Set(posMap.keys())
  const byGen = new Map<number, OrganismState[]>()
  for (const o of orgs) {
    if (!placed.has(o.id)) {
      if (!byGen.has(o.generation)) byGen.set(o.generation, [])
      byGen.get(o.generation)!.push(o)
    }
  }
  for (const [gen, list] of byGen) {
    const y = PAD_Y + gen * ROW_H
    let maxX = cursor
    for (const n of posMap.values()) if (n.x > maxX) maxX = n.x
    list.forEach((o, i) => {
      posMap.set(o.id, { x: maxX + PAD_X + i * MIN_SEP, y })
    })
  }

  const nodes: NodePos[] = orgs.map(o => {
    const p = posMap.get(o.id) ?? { x: PAD_X, y: PAD_Y + o.generation * ROW_H }
    return { org: o, x: p.x, y: p.y }
  })

  const maxX = Math.max(...nodes.map(n => n.x)) + NODE_R + PAD_X
  const maxY = PAD_Y + maxGen * ROW_H + NODE_R * 2 + PAD_Y
  return { nodes, w: Math.max(maxX, 400), h: Math.max(maxY, 300), posMap, maxGen }
}

export function FamilyTreeModal({ organisms: livOrgs, sexWords, onClose }: Props) {
  const organisms = useRef(livOrgs).current

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging   = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const tfRef      = useRef(tf)
  tfRef.current = tf

  const { nodes, w: svgW, h: svgH, maxGen } = useMemo(
    () => buildLayout(organisms),
    [organisms]
  )

  // Build edge list (parent → child connecting lines)
  const edges = useMemo(() => {
    const list: { x1: number; y1: number; x2: number; y2: number; color: string }[] = []
    const byId = new Map<string, { x: number; y: number }>()
    for (const n of nodes) byId.set(n.org.id, { x: n.x, y: n.y })
    for (const n of nodes) {
      const p = n.org.parent_id ? byId.get(n.org.parent_id) : null
      if (p) {
        list.push({
          x1: p.x, y1: p.y + NODE_R,
          x2: n.x, y2: n.y - NODE_R,
          color: lineageColor(n.org.lineage_id),
        })
      }
    }
    return list
  }, [nodes])

  // Paternity edges: father → child (separate from the maternal tree lines)
  const paternityEdges = useMemo(() => {
    const list: { x1: number; y1: number; x2: number; y2: number; color: string; isCheating: boolean }[] = []
    const byId = new Map<string, { x: number; y: number; org: OrganismState }>()
    for (const n of nodes) byId.set(n.org.id, { x: n.x, y: n.y, org: n.org })
    for (const n of nodes) {
      const fid = n.org.father_id
      if (!fid || !byId.has(fid)) continue
      const father = byId.get(fid)!
      // Is this a "cheating" child? Father is someone other than the mother's partner
      const mother = n.org.parent_id ? byId.get(n.org.parent_id) : null
      const isCheating = mother ? (mother.org.partner_id !== fid) : false
      list.push({
        x1: father.x, y1: father.y + NODE_R,
        x2: n.x + 4,  y2: n.y - NODE_R,   // slight horizontal offset so lines don't overlap
        color: lineageColor(father.org.lineage_id),
        isCheating,
      })
    }
    return list
  }, [nodes])

  // Partner lines
  const partnerEdges = useMemo(() => {
    const list: { x1: number; y1: number; x2: number; y2: number }[] = []
    const byId = new Map<string, { x: number; y: number; org: OrganismState }>()
    for (const n of nodes) byId.set(n.org.id, { x: n.x, y: n.y, org: n.org })
    const done = new Set<string>()
    for (const n of nodes) {
      const pid = n.org.partner_id
      if (pid && byId.has(pid) && !done.has(n.org.id) && !done.has(pid)) {
        const partner = byId.get(pid)!
        list.push({ x1: n.x, y1: n.y, x2: partner.x, y2: partner.y })
        done.add(n.org.id)
        done.add(pid)
      }
    }
    return list
  }, [nodes])

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

    // Generation row labels
    ctx.font = '9px monospace'
    ctx.fillStyle = '#3a3028'
    ctx.textAlign = 'left'
    const genSet = [...new Set(nodes.map(n => n.org.generation))].sort((a, b) => a - b)
    const minNodeX = Math.min(...nodes.map(n => n.x))
    for (const gen of genSet) {
      const gy = PAD_Y + gen * ROW_H
      ctx.fillText(`generation ${gen}`, minNodeX - 40, gy - NODE_R - 6)
    }

    // Partner edges (heart bond line)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#c97'
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.45
    for (const e of partnerEdges) {
      ctx.beginPath()
      ctx.moveTo(e.x1, e.y1)
      ctx.lineTo(e.x2, e.y2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // Paternity edges: father → child (dashed, slightly different tone)
    ctx.lineWidth = 1.2
    ctx.setLineDash([3, 5])
    for (const e of paternityEdges) {
      const my = (e.y1 + e.y2) / 2
      ctx.globalAlpha = e.isCheating ? 0.55 : 0.28
      ctx.strokeStyle = e.isCheating ? '#e8b060' : e.color  // gold for infidelity
      ctx.beginPath()
      ctx.moveTo(e.x1, e.y1)
      ctx.bezierCurveTo(e.x1, my, e.x2, my, e.x2, e.y2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // Mother → child connecting lines (solid)
    ctx.lineWidth = 1.5
    for (const e of edges) {
      const my = (e.y1 + e.y2) / 2
      ctx.globalAlpha = 0.40
      ctx.strokeStyle = e.color
      ctx.beginPath()
      ctx.moveTo(e.x1, e.y1)
      ctx.bezierCurveTo(e.x1, my, e.x2, my, e.x2, e.y2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Node shapes: female=circle, male=rounded-square
    const drawNodeShape = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, isFemale: boolean) => {
      ctx.beginPath()
      if (isFemale) {
        ctx.arc(x, y, r, 0, Math.PI * 2)
      } else {
        // Rounded square
        const s = r * 1.22
        const cr = r * 0.32
        ctx.moveTo(x - s + cr, y - s)
        ctx.lineTo(x + s - cr, y - s)
        ctx.arcTo(x + s, y - s, x + s, y - s + cr, cr)
        ctx.lineTo(x + s, y + s - cr)
        ctx.arcTo(x + s, y + s, x + s - cr, y + s, cr)
        ctx.lineTo(x - s + cr, y + s)
        ctx.arcTo(x - s, y + s, x - s, y + s - cr, cr)
        ctx.lineTo(x - s, y - s + cr)
        ctx.arcTo(x - s, y - s, x - s + cr, y - s, cr)
        ctx.closePath()
      }
    }

    // Node shapes + labels
    for (const { org, x, y } of nodes) {
      const color     = lineageColor(org.lineage_id)
      const isAlive   = org.alive
      const isHover   = org.id === hoverId
      const isPartnered = !!org.partner_id
      const isFemale  = org.sex === 'female'

      // Shadow for hovered node
      if (isHover) {
        ctx.shadowColor = color
        ctx.shadowBlur  = 14
      }

      // Shape fill
      ctx.globalAlpha = isAlive ? 0.22 : 0.10
      ctx.fillStyle   = color
      drawNodeShape(ctx, x, y, NODE_R, isFemale)
      ctx.fill()

      // Shape border
      ctx.globalAlpha = isHover ? 1 : (isAlive ? 0.85 : 0.28)
      ctx.strokeStyle = isHover ? '#fff' : color
      ctx.lineWidth   = isHover ? 2 : (isAlive ? 1.5 : 0.8)
      drawNodeShape(ctx, x, y, NODE_R, isFemale)
      ctx.stroke()

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Partner heart dot
      if (isPartnered && isAlive) {
        ctx.fillStyle = '#c97'
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.arc(x + NODE_R - 5, y - NODE_R + 5, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Name label below circle
      ctx.font      = `${isHover ? 600 : 500} 9.5px monospace`
      ctx.fillStyle = isAlive ? (isHover ? '#fff' : '#d0c8c0') : '#555'
      ctx.textAlign = 'center'
      ctx.fillText(org.name + (isAlive ? '' : ' †'), x, y + NODE_R + 13)

      // Age/gen label below name
      ctx.font      = '8px monospace'
      ctx.fillStyle = '#4a3e35'
      ctx.fillText(`${Math.floor(org.age / DAY_LENGTH)}d · g${org.generation}`, x, y + NODE_R + 24)

      // Discovery icons inside node (top half)
      const hasFire = org.discoveries?.includes('fire')
      const hasHut  = org.discoveries?.includes('shelter')
      if (hasFire || hasHut) {
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'
        const icons = (hasFire ? '🔥' : '') + (hasHut ? '🏠' : '')
        ctx.fillText(icons, x, y - 3)
      } else {
        // Initial
        ctx.font      = '600 11px monospace'
        ctx.fillStyle = isAlive ? color : '#444'
        ctx.globalAlpha = isAlive ? 0.9 : 0.4
        ctx.textAlign   = 'center'
        ctx.fillText(org.name[0], x, y - 3)
        ctx.globalAlpha = 1
      }

      // Sex word inside node (bottom half, small)
      const sw = sexWords ? (isFemale ? sexWords[1] : sexWords[0]) : null
      if (sw) {
        ctx.font      = `500 7px monospace`
        ctx.fillStyle = isFemale ? '#e09ab0' : '#7ab0e0'
        ctx.globalAlpha = isAlive ? 0.85 : 0.35
        ctx.textAlign   = 'center'
        ctx.fillText(sw, x, y + 9)
        ctx.globalAlpha = 1
      }
    }

    ctx.restore()
  }, [nodes, edges, paternityEdges, partnerEdges, hoverId])

  // Fit so newest generation is visible at the bottom
  const fitAll = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap || !nodes.length) return
    const vw = wrap.clientWidth
    const vh = wrap.clientHeight
    const s  = Math.min(vw / (svgW + PAD_X * 2), vh / (svgH + PAD_Y * 2), 1.0)
    // Start scrolled to bottom (most recent generation)
    const scaledH = svgH * s
    const startY  = scaledH > vh ? vh - scaledH - PAD_Y : (vh - svgH * s) / 2
    setTf({ x: (vw - svgW * s) / 2, y: startY, scale: s })
  }, [svgW, svgH, nodes.length])

  useEffect(() => { fitAll() }, [fitAll])

  useEffect(() => { draw() }, [draw, tf, hoverId])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = wrapRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 0.87
    setTf(t => {
      const ns = Math.max(0.08, Math.min(4, t.scale * factor))
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

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging.current) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x: tx, y: ty, scale: ts } = tfRef.current
    const wx = (e.clientX - rect.left - tx) / ts
    const wy = (e.clientY - rect.top  - ty) / ts
    const hit = nodes.find(n =>
      Math.hypot(wx - n.x, wy - n.y) <= NODE_R + 4
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
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHoverId(null)}
            style={{ display: 'block', userSelect: 'none' }}
          />
        </div>

        <div className="tree-legend">
          <button className="tree-zoom-btn" onClick={() => setTf(t => ({ ...t, scale: Math.min(4, t.scale * 1.25) }))}>＋</button>
          <button className="tree-zoom-btn" onClick={fitAll}>fit</button>
          <button className="tree-zoom-btn" onClick={() => setTf(t => ({ ...t, scale: Math.max(0.08, t.scale * 0.8) }))}>－</button>
          <span style={{ color: '#444', marginLeft: 8 }}>
            🔥 fire · 🏠 shelter · † deceased · <span style={{ color: '#c97' }}>♥</span> bonded
            · <span style={{ color: '#888' }}>— mother</span>
            · <span style={{ color: '#888', borderBottom: '1px dashed #888' }}>- - father</span>
            · <span style={{ color: '#e8b060' }}>- - infidelity</span>
            {sexWords && (
              <> · <span style={{ color: '#7ab0e0' }}>▪ {sexWords[0]}</span> · <span style={{ color: '#e09ab0' }}>● {sexWords[1]}</span></>
            )}
          </span>
          <span style={{ color: '#333', marginLeft: 'auto' }}>{Math.round(tf.scale * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
