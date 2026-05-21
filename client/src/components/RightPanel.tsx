import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { OrganismState, WorldState } from '../types'
import { useUIStore, useViewFlag } from '../stores/store'
import { OrgCard } from './OrgCard'
import { OrgDetail } from './OrgDetail'

interface Props {
  world: WorldState
  liveOrgs: OrganismState[]
  deadOrgs: OrganismState[]
  selectedOrg: OrganismState | null
}

function useThrottledValue<T>(value: T, intervalMs = 200): T {
  const [throttled, setThrottled] = useState(value)
  const latest = useRef(value)
  useEffect(() => { latest.current = value }, [value])
  useEffect(() => {
    const id = setInterval(() => setThrottled(latest.current), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return throttled
}

export function RightPanel({ world, liveOrgs, deadOrgs, selectedOrg }: Props) {
  const throttledLive = useThrottledValue(liveOrgs)
  const throttledDead = useThrottledValue(deadOrgs)
  const panelOpen   = useUIStore(s => s.panelOpen)
  const followOrgId = useUIStore(s => s.followOrgId)
  const threeD      = useViewFlag('threeD')
  const hideUI      = useViewFlag('hideUI')
  const selectOrg   = useUIStore(s => s.selectOrg)
  const followOrg   = useUIStore(s => s.followOrg)
  const togglePanel = useUIStore(s => s.togglePanel)

  return (
    <>
      {panelOpen && (
        <div className="panel-overlay" onClick={togglePanel} />
      )}
      <aside className={clsx(
        'panel', 'panel-right', panelOpen && 'open',
        threeD && hideUI && 'hidden-by-3d'
      )}>
        {selectedOrg && (
          <OrgDetail
            org={selectedOrg}
            onClose={() => selectOrg(null)}
            onFollow={followOrg}
            following={followOrgId === selectedOrg.id}
            lineageNames={world?.lineage_names}
            organisms={world?.organisms}
          />
        )}

        <div className="section-title">ALIVE ({throttledLive.length})</div>
        {throttledLive.map((org) => (
          <OrgCard key={org.id} orgId={org.id} />
        ))}

        {throttledDead.length > 0 && (
          <>
            <div className="section-title">DEAD ({throttledDead.length})</div>
            {throttledDead.slice(-5).map(org => (
              <div key={org.id} className="org-card dead">
                <div className="org-header">
                  <span className="org-name">{org.name}</span>
                  <span className="org-meta">g{org.generation} · {org.age}</span>
                </div>
                <div className="org-thought">
                  {org.thought ?? '-'}
                </div>
              </div>
            ))}
          </>
        )}
      </aside>
    </>
  )
}
