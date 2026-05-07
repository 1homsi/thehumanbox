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

export function FamilyTreeModal({ organisms, onClose }: Props) {
  const svgRef     = useRef<SVGSVGElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [tf, setTf] = useState<Transform>({ x: 20, y: 20, scale: 0.75 })
  const dragging   = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)

  const { nodes, w: svgW, h: svgH } = useMemo(() => buildLayout(organisms), [organisms])

  const posById = useMemo(() => {
    const m = new Map<string, XY>()
    for (const n of nodes) m.set(n.org.id, { x: n.x, y: n.y })
    return m
  }, [nodes])

  const { edges, ghostEdges } = useMemo(() => {
    const edges: { d: string; color: string; key: string }[] = []
    const ghostEdges: { x: number; y: number; key: string }[] = []
    for (const n of nodes) {
      const p = posById.get(n.org.parent_id)
      if (p) {
        const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2
        const x2 = n.x,          y2 = n.y + NODE_H / 2
        const mx = (x1 + x2) / 2
        edges.push({
          d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
          color: lineageColor(n.org.lineage_id),
          key: `${n.org.parent_id}-${n.org.id}`,
        })
      } else if (n.org.generation > 0 && n.org.parent_id) {
        // Parent was pruned from history — draw a ghost stub going left
        ghostEdges.push({ x: n.x, y: n.y + NODE_H / 2, key: `ghost-${n.org.id}` })
      }
    }
    return { edges, ghostEdges }
  }, [nodes, posById])

  // Fit all content into the viewport
  const fitAll = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap || !nodes.length) return
    const vw = wrap.clientWidth
    const vh = wrap.clientHeight
    const s  = Math.min(vw / (svgW + PAD_X * 2), vh / (svgH + PAD_Y * 2), 1.0)
    setTf({ x: (vw - svgW * s) / 2, y: (vh - svgH * s) / 2, scale: s })
  }, [svgW, svgH, nodes.length])

  // Fit on first mount
  useEffect(() => { fitAll() }, [fitAll])

  // Wheel → zoom toward cursor
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

  // Drag to pan (background only)
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('g[data-node]')) return
    e.preventDefault()
    dragging.current = { ox: tf.x, oy: tf.y, sx: e.clientX, sy: e.clientY }
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
  }, [tf])

  const hovered = hoverId != null ? (organisms.find(o => o.id === hoverId) ?? null) : null
  const disc = (org: OrganismState) => org.discoveries ?? []

  return (
    <div className="lang-modal-backdrop" onClick={onClose}>
      <div className="tree-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lang-modal-header">
          <span className="lang-modal-title">FAMILY TREE</span>
          <span className="tree-modal-sub">
            {organisms.filter(o => o.alive).length} alive · {organisms.filter(o => !o.alive).length} ancestors
          </span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Hover info bar */}
        <div className="tree-tooltip">
          {hovered ? (
            <>
              <span style={{ color: lineageColor(hovered.lineage_id), fontWeight: 600 }}>{hovered.name}</span>
              <span style={{ color: '#666' }}> · gen {hovered.generation} · age {hovered.age} · {hovered.lineage_id.slice(0, 6)}</span>
              {disc(hovered).includes('fire')    && <span> 🔥</span>}
              {disc(hovered).includes('shelter') && <span> 🏠</span>}
              <span className="tree-tooltip-thought"> "{hovered.thought}"</span>
            </>
          ) : (
            <span style={{ color: '#333' }}>scroll to zoom · drag to pan · hover a node for info</span>
          )}
        </div>

        {/* Canvas */}
        <div className="tree-scroll" ref={wrapRef} style={{ overflow: 'hidden', cursor: 'grab' }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            onMouseDown={onMouseDown}
            style={{ display: 'block', userSelect: 'none' }}
          >
            <g transform={`translate(${tf.x.toFixed(1)}, ${tf.y.toFixed(1)}) scale(${tf.scale.toFixed(3)})`}>
              {/* Gen column headers */}
              {[...new Set(nodes.map(n => n.org.generation))].sort((a,b)=>a-b).map((gen, i) => (
                <text
                  key={gen}
                  x={PAD_X + i * (NODE_W + GAP_X) + NODE_W / 2}
                  y={14}
                  textAnchor="middle"
                  fill="#333"
                  fontSize={9}
                  fontFamily="monospace"
                  letterSpacing="0.08em"
                >
                  gen {gen}
                </text>
              ))}

              {/* Ghost stubs: ancestor pruned from history */}
              {ghostEdges.map(g => (
                <g key={g.key}>
                  <line
                    x1={g.x} y1={g.y} x2={g.x - 40} y2={g.y}
                    stroke="#333" strokeWidth={1} strokeDasharray="3 3"
                  />
                  <text x={g.x - 46} y={g.y + 3} textAnchor="end"
                    fill="#2a2a2a" fontSize={8} fontFamily="monospace">···</text>
                </g>
              ))}

              {/* Edges */}
              {edges.map(e => (
                <path key={e.key} d={e.d} stroke={e.color}
                  strokeWidth={1.5} strokeOpacity={0.35} fill="none" />
              ))}

              {/* Nodes */}
              {nodes.map(({ org, x, y }) => {
                const color    = lineageColor(org.lineage_id)
                const isAlive  = org.alive
                const isHover  = org.id === hoverId
                const hasFire  = disc(org).includes('fire')
                const hasHut   = disc(org).includes('shelter')
                return (
                  <g
                    key={org.id}
                    data-node="1"
                    transform={`translate(${x}, ${y})`}
                    onMouseEnter={() => setHoverId(org.id)}
                    onMouseLeave={() => setHoverId(null)}
                    style={{ cursor: 'default' }}
                  >
                    <rect width={NODE_W} height={NODE_H} rx={3}
                      fill={isAlive ? '#181818' : '#101010'}
                      stroke={isHover ? '#ddd' : color}
                      strokeWidth={isHover ? 1.5 : 0.8}
                      strokeOpacity={isAlive ? 0.85 : 0.3}
                    />
                    {/* Left lineage bar */}
                    <rect width={3} height={NODE_H} rx={2}
                      fill={color} fillOpacity={isAlive ? 0.9 : 0.3} />
                    {/* Name */}
                    <text x={8} y={13} fill={isAlive ? '#ddd' : '#555'}
                      fontSize={10} fontFamily="monospace" fontWeight="600">
                      {org.name}{!isAlive ? ' †' : ''}
                    </text>
                    {/* Sub-line: lineage + age */}
                    <text x={8} y={26} fill="#444" fontSize={8} fontFamily="monospace">
                      {org.lineage_id.slice(0, 5)} · {Math.floor(org.age / DAY_LENGTH)}d
                    </text>
                    {/* Discoveries */}
                    {(hasFire || hasHut) && (
                      <text x={NODE_W - (hasFire && hasHut ? 24 : 14)} y={13} fontSize={9}>
                        {hasFire ? '🔥' : ''}{hasHut ? '🏠' : ''}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        {/* Zoom controls + legend */}
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
