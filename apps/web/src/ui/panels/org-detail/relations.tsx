import { Tooltip } from '../../toolbar/Tooltip'
import { hasKin, kinLinks, type KinLink } from '../../../game/model/kin-links'
import type { OrganismState } from '../../../shared/types'
import { t } from '../../../i18n'

/** One tie on the card: a name that selects that person when clicked. */
function KinTag({
  label,
  link,
  cls,
  onSelectOrg,
}: {
  label: string
  link: KinLink
  cls: string
  onSelectOrg?: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`relation-tag ${cls}`}
      style={{ fontSize: '9px', opacity: link.alive ? 1 : 0.6 }}
      title={
        link.alive
          ? t('person.kin.tip', { label, name: link.name })
          : t('person.kin.tipDead', { label, name: link.name })
      }
      onClick={() => onSelectOrg?.(link.id)}
    >
      {label} {link.name}
    </button>
  )
}

/** Partner, parents, children, friends and rivals, each one clickable. */
export function KinSection({
  org,
  organisms,
  onSelectOrg,
}: {
  org: OrganismState
  organisms?: OrganismState[]
  onSelectOrg?: (id: string) => void
}) {
  const k = kinLinks(org, organisms ?? [])
  if (!hasKin(k)) return null
  return (
    <>
      <div className="org-detail-section">{t('person.kin.title')}</div>
      <div className="relation-list">
        {k.partner && <KinTag label="♥" link={k.partner} cls="ally" onSelectOrg={onSelectOrg} />}
        {k.mother && (
          <KinTag label={t('person.kin.mother')} link={k.mother} cls="ally" onSelectOrg={onSelectOrg} />
        )}
        {k.father && (
          <KinTag label={t('person.kin.father')} link={k.father} cls="ally" onSelectOrg={onSelectOrg} />
        )}
        {k.children.map((c) => (
          <KinTag key={c.id} label={t('person.kin.child')} link={c} cls="ally" onSelectOrg={onSelectOrg} />
        ))}
        {k.friends.map((f) => (
          <KinTag key={f.id} label={t('person.kin.friend')} link={f} cls="ally" onSelectOrg={onSelectOrg} />
        ))}
        {k.rivals.map((r) => (
          <KinTag key={r.id} label={t('person.kin.rival')} link={r} cls="enemy" onSelectOrg={onSelectOrg} />
        ))}
      </div>
    </>
  )
}

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
          <div className="org-detail-section">{t('person.relations.title')}</div>
          <div className="relation-list">
            {allies.map(([lid, v]) => (
              <Tooltip
                key={lid}
                tip={t('person.relations.allied', { name: tn(lid), percent: (v * 100).toFixed(0) })}
              >
                <span className="relation-tag ally" style={{ cursor: 'default' }}>
                  ♥ {tn(lid)} {(v * 100).toFixed(0)}%
                </span>
              </Tooltip>
            ))}
            {enemies.map(([lid, v]) => (
              <Tooltip
                key={lid}
                tip={t('person.relations.hostile', {
                  name: tn(lid),
                  percent: (Math.abs(v) * 100).toFixed(0),
                })}
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
          <div className="org-detail-section">{t('person.bonds.title')}</div>
          <div className="relation-list">
            {trustedOrgs.slice(0, 4).map(([oid, v]) => (
              <Tooltip
                key={oid}
                tip={t('person.bonds.trusts', { name: on(oid), percent: (v * 100).toFixed(0) })}
              >
                <span className="relation-tag ally" style={{ fontSize: '9px', cursor: 'default' }}>
                  ◆ {on(oid)} {(v * 100).toFixed(0)}
                </span>
              </Tooltip>
            ))}
            {fearedOrgs.slice(0, 4).map(([oid, v]) => (
              <Tooltip
                key={oid}
                tip={t('person.bonds.fears', { name: on(oid), percent: (Math.abs(v) * 100).toFixed(0) })}
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
