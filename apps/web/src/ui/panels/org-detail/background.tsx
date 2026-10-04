import { Tooltip } from '../../toolbar/Tooltip'
import { Bar } from './bars'
import { TOOL_ICON } from './icons'
import type { OrganismState, ReligionInfo } from '../../../shared/types'

export function EducationSection({ org }: { org: OrganismState }) {
  return (
    <>
      {((org.literacy ?? null) !== null || (org.degrees ?? []).length > 0) && (
        <>
          <div className="org-detail-section">EDUCATION</div>
          {(org.literacy ?? null) !== null && (
            <Bar label="literacy" value={org.literacy ?? 0} color="#c4a8ff" />
          )}
          {(org.degrees ?? []).length > 0 && (
            <div className="relation-list">
              {(org.degrees ?? []).map((d) => (
                <span
                  key={d}
                  className="relation-tag"
                  style={{ background: '#1a0a2a', color: '#d8b8ff', cursor: 'default' }}
                >
                  🎓 {d}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

export function WealthSection({ org }: { org: OrganismState }) {
  return (
    <>
      {(org.wealth ?? null) !== null && (org.wealth ?? 0) > 0 && (
        <>
          <div className="org-detail-section">WEALTH</div>
          <div className="org-memory" style={{ marginBottom: 6 }}>
            <span style={{ cursor: 'default' }}>💰 {org.wealth}</span>
          </div>
        </>
      )}
    </>
  )
}

export function InventorySection({ org }: { org: OrganismState }) {
  return (
    <>
      {(() => {
        const bag: Record<string, number> = {
          ...(org.inventory ?? {}),
          ...(org.tools ?? {}),
        }
        const entries = Object.entries(bag).filter(([, n]) => n > 0)
        if (entries.length === 0) return null
        entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        return (
          <>
            <div className="org-detail-section">INVENTORY</div>
            <div className="relation-list">
              {entries.map(([kind, count]) => (
                <Tooltip key={kind} tip={`${kind.replace(/_/g, ' ')} ×${count}`}>
                  <span
                    className="relation-tag"
                    style={{ background: '#0a1a1a', color: '#88e6d4', cursor: 'default' }}
                  >
                    {TOOL_ICON[kind] ?? '🧰'} {kind.replace(/_/g, ' ')} ×{count}
                  </span>
                </Tooltip>
              ))}
            </div>
          </>
        )
      })()}
    </>
  )
}

export function ReligionSection({ org, religions }: { org: OrganismState; religions?: ReligionInfo[] }) {
  return (
    <>
      {(org.religion_id ?? null) !== null && (
        <>
          <div className="org-detail-section">RELIGION</div>
          <div style={{ marginBottom: 4, fontSize: 11, color: '#bbb' }}>
            ✦ {religions?.find((r) => r.id === org.religion_id)?.name ?? org.religion_id}
          </div>
          {(org.piety ?? null) !== null && <Bar label="piety" value={org.piety ?? 0} color="#e6c488" />}
        </>
      )}
    </>
  )
}

export function DiseasesSection({ org }: { org: OrganismState }) {
  return (
    <>
      {(org.diseases ?? []).length > 0 && (
        <>
          <div className="org-detail-section">DISEASES</div>
          <div className="relation-list">
            {(org.diseases ?? []).map((d, i) => (
              <Tooltip key={`${d.kind}-${i}`} tip={`Sick with ${d.kind} since t${d.started_tick}`}>
                <span className="relation-tag enemy" style={{ cursor: 'default' }}>
                  🦠 {d.kind}
                </span>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </>
  )
}
