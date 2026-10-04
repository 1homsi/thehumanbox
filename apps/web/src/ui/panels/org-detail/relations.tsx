import { Tooltip } from '../../toolbar/Tooltip'
import type { OrganismState } from '../../../shared/types'

export function RelationsSection({ org, tn }: { org: OrganismState; tn: (lid: string) => string }) {
  const allies = Object.entries(org.attitudes ?? {})
    .filter(([, v]) => v >= 0.25)
    .sort((a, b) => b[1] - a[1])
  const enemies = Object.entries(org.attitudes ?? {})
    .filter(([, v]) => v <= -0.25)
    .sort((a, b) => a[1] - b[1])
  return (
    <>
      {(allies.length > 0 || enemies.length > 0) && (
        <>
          <div className="org-detail-section">RELATIONS</div>
          <div className="relation-list">
            {allies.map(([lid, v]) => (
              <Tooltip
                key={lid}
                tip={`Allied with ${tn(lid)} - ${(v * 100).toFixed(0)}% positive attitude. Likely to trade and cooperate.`}
              >
                <span className="relation-tag ally" style={{ cursor: 'default' }}>
                  ♥ {tn(lid)} {(v * 100).toFixed(0)}%
                </span>
              </Tooltip>
            ))}
            {enemies.map(([lid, v]) => (
              <Tooltip
                key={lid}
                tip={`Hostile toward ${tn(lid)} - ${(Math.abs(v) * 100).toFixed(0)}% negative attitude. Likely to challenge or avoid.`}
              >
                <span className="relation-tag enemy" style={{ cursor: 'default' }}>
                  ✕ {tn(lid)} {(v * 100).toFixed(0)}%
                </span>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export function PersonalBondsSection({ org, on }: { org: OrganismState; on: (oid: string) => string }) {
  const trustedOrgs = Object.entries(org.org_trust ?? {})
    .filter(([, v]) => v >= 0.2)
    .sort((a, b) => b[1] - a[1])
  const fearedOrgs = Object.entries(org.org_trust ?? {})
    .filter(([, v]) => v <= -0.2)
    .sort((a, b) => a[1] - b[1])
  return (
    <>
      {(trustedOrgs.length > 0 || fearedOrgs.length > 0) && (
        <>
          <div className="org-detail-section">PERSONAL BONDS</div>
          <div className="relation-list">
            {trustedOrgs.slice(0, 4).map(([oid, v]) => (
              <Tooltip
                key={oid}
                tip={`Trusts ${on(oid)} - personal bond at ${(v * 100).toFixed(0)}%. Built through shared experiences and cooperation.`}
              >
                <span className="relation-tag ally" style={{ fontSize: '9px', cursor: 'default' }}>
                  ◆ {on(oid)} {(v * 100).toFixed(0)}
                </span>
              </Tooltip>
            ))}
            {fearedOrgs.slice(0, 4).map(([oid, v]) => (
              <Tooltip
                key={oid}
                tip={`Fears ${on(oid)} - negative bond at ${(Math.abs(v) * 100).toFixed(0)}%. Result of past conflict or aggression.`}
              >
                <span className="relation-tag enemy" style={{ fontSize: '9px', cursor: 'default' }}>
                  ◇ {on(oid)} {(v * 100).toFixed(0)}
                </span>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </>
  )
}
