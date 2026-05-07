import { useState, useMemo } from 'react'
import type { OrganismState } from '../types'
import { lineageColor } from '../constants'
import { OrgDetail } from './OrgDetail'

const DAY_LENGTH = 600

interface Props {
  organisms: OrganismState[]
  onClose: () => void
}

type StatusFilter    = 'all' | 'alive' | 'dead'
type DiscoveryFilter = 'all' | 'fire' | 'shelter'

export function OrgSearchModal({ organisms, onClose }: Props) {
  const [query,    setQuery]    = useState('')
  const [status,   setStatus]   = useState<StatusFilter>('all')
  const [lineageF, setLineageF] = useState('all')
  const [discF,    setDiscF]    = useState<DiscoveryFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const lineages = useMemo(
    () => [...new Set(organisms.map(o => o.lineage_id))].sort(),
    [organisms]
  )

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return organisms
      .filter(o => {
        if (status === 'alive' && !o.alive) return false
        if (status === 'dead'  &&  o.alive) return false
        if (lineageF !== 'all' && o.lineage_id !== lineageF) return false
        if (discF === 'fire'    && !(o.discoveries ?? []).includes('fire'))    return false
        if (discF === 'shelter' && !(o.discoveries ?? []).includes('shelter')) return false
        if (q && !o.name.toLowerCase().includes(q) &&
                 !o.thought.toLowerCase().includes(q) &&
                 !o.lineage_id.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1
        return b.age - a.age
      })
  }, [organisms, status, lineageF, discF, query])

  const selectedOrg = selectedId
    ? organisms.find(o => o.id === selectedId) ?? null
    : null

  return (
    <div className="lang-modal-backdrop" onClick={onClose}>
      <div className="org-search-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lang-modal-header">
          <span className="lang-modal-title">ORGANISMS</span>
          <span className="tree-modal-sub">
            {filtered.length} shown · {organisms.filter(o => o.alive).length} alive · {organisms.filter(o => !o.alive).length} dead
          </span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Toolbar */}
        <div className="org-search-toolbar">
          <input
            className="org-search-input"
            placeholder="search by name, thought, lineage id…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div className="org-search-filters">
            {(['all', 'alive', 'dead'] as StatusFilter[]).map(s => (
              <button
                key={s}
                className={`filter-chip${status === s ? ' active' : ''}`}
                onClick={() => setStatus(s)}
              >{s}</button>
            ))}
            <span className="filter-sep">·</span>
            <button
              className={`filter-chip${discF === 'fire'    ? ' active' : ''}`}
              onClick={() => setDiscF(discF === 'fire'    ? 'all' : 'fire')}
            >🔥 fire</button>
            <button
              className={`filter-chip${discF === 'shelter' ? ' active' : ''}`}
              onClick={() => setDiscF(discF === 'shelter' ? 'all' : 'shelter')}
            >🏠 shelter</button>
            <span className="filter-sep">·</span>
            <select
              className="lineage-select"
              value={lineageF}
              onChange={e => setLineageF(e.target.value)}
            >
              <option value="all">all tribes</option>
              {lineages.map(lid => (
                <option key={lid} value={lid}>{lid.slice(0, 6)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Body: list + detail */}
        <div className="org-search-body">
          <div className="org-search-list">
            {filtered.length === 0 && (
              <div className="org-search-empty">no organisms match</div>
            )}
            {filtered.map(org => {
              const color = lineageColor(org.lineage_id)
              const isSelected = org.id === selectedId
              const discs = org.discoveries ?? []
              const lifeLog = org.life_log ?? []
              return (
                <div
                  key={org.id}
                  className={`org-search-entry${!org.alive ? ' dead' : ''}${isSelected ? ' selected' : ''}`}
                  style={{ borderLeft: `3px solid ${org.alive ? color : '#3a3a3a'}` }}
                  onClick={() => setSelectedId(isSelected ? null : org.id)}
                >
                  <div className="org-search-entry-top">
                    <span className="org-search-name" style={{ color: org.alive ? '#eee' : '#888' }}>
                      {!org.alive && <span style={{ color: '#555', marginRight: 4 }}>✝</span>}
                      {org.name}
                    </span>
                    <span className="org-search-badges">
                      {discs.includes('fire')    && '🔥'}
                      {discs.includes('shelter') && '🏠'}
                      {discs.includes('cooking') && '🍖'}
                      {discs.includes('spear')   && '🗡️'}
                    </span>
                    <span className="org-search-meta" style={{ color: org.alive ? '#666' : '#444' }}>
                      g{org.generation} · {Math.floor(org.age / DAY_LENGTH)}d
                    </span>
                  </div>

                  {org.alive ? (
                    <>
                      <div className="org-search-thought">{org.thought}</div>
                      <div className="org-search-bars">
                        <div className="org-mini-bar" style={{ width: `${org.energy    * 100}%`, background: '#55dd55' }} />
                        <div className="org-mini-bar" style={{ width: `${org.hydration * 100}%`, background: '#4499ff' }} />
                        <div className="org-mini-bar" style={{ width: `${org.health    * 100}%`, background: '#ff6644' }} />
                      </div>
                    </>
                  ) : (
                    <div className="org-search-memorial">
                      {org.daily_story && (
                        <div className="org-memorial-story">"{org.daily_story}"</div>
                      )}
                      {lifeLog.length > 0 && (
                        <div className="org-memorial-log">
                          {lifeLog.slice(-3).map((e, i) => (
                            <span key={i} className="org-memorial-entry">{e}</span>
                          ))}
                        </div>
                      )}
                      {discs.length > 0 && (
                        <div className="org-memorial-discs">
                          {discs.filter(d => !d.startsWith('pact:')).map(d => (
                            <span key={d} className="org-memorial-disc">{d.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="org-search-detail">
            {selectedOrg ? (
              <OrgDetail
                org={selectedOrg}
                onClose={() => setSelectedId(null)}
                onFollow={() => {}}
                following={false}
              />
            ) : (
              <div className="org-search-placeholder">
                ← select an organism to view details
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
