import { personName } from '../../../shared/personName'
import { personTitles } from '../../../game/model/titles'
import clsx from 'clsx'
import { Tooltip } from '../../toolbar/Tooltip'
import { DAY_LENGTH, fmt } from './format'
import { HomeButton } from './HomeButton'
import type { OrganismState } from '../../../shared/types'

export function OrgHeader({
  org,
  color,
  isSick,
  carrying,
  isStarred,
  toggleStar,
  setShowLife,
  following,
  onFollow,
  onClose,
  tn,
}: {
  org: OrganismState
  color: string
  isSick: boolean
  carrying: boolean
  isStarred: boolean
  toggleStar: (id: string) => void
  setShowLife: (show: boolean) => void
  following: boolean
  onFollow: (id: string | null) => void
  onClose: () => void
  tn: (lid: string) => string
}) {
  const ageInDays = Math.floor(org.age / DAY_LENGTH)
  return (
    <>
      <div className="org-detail-header">
        <span className="org-detail-dot" style={{ background: color }} />
        <span className="org-detail-name">{personName(org)}</span>
        {personTitles(org).map((title) => (
          <span key={title} className="org-title-badge">
            {title}
          </span>
        ))}
        {isSick && <span className="org-sick-badge">sick</span>}
        {carrying && (
          <Tooltip tip="Carrying wood">
            <span className="org-carrying-badge" style={{ cursor: 'default' }}>
              🪵
            </span>
          </Tooltip>
        )}
        <span className="org-detail-actions">
          <Tooltip tip={isStarred ? 'Unstar' : 'Star this organism (saved across reloads)'}>
            <button
              className={clsx('icon-btn', isStarred && 'active-star')}
              aria-label={isStarred ? 'Unstar' : 'Star'}
              onClick={() => toggleStar(org.id)}
            >
              {isStarred ? '★' : '☆'}
            </button>
          </Tooltip>
          <Tooltip tip="View full life history">
            <button className="icon-btn" aria-label="Life" onClick={() => setShowLife(true)}>
              📖
            </button>
          </Tooltip>
          <HomeButton org={org} />
          <Tooltip tip={following ? 'Following' : 'Follow this organism'}>
            <button
              className={clsx('icon-btn', following && 'active')}
              aria-label={following ? 'Unfollow' : 'Follow'}
              onClick={() => onFollow(following ? null : org.id)}
            >
              ⊙
            </button>
          </Tooltip>
          <button aria-label="Close" className="icon-btn icon-close" onClick={onClose}>
            ✕
          </button>
        </span>
      </div>

      <div className="org-detail-sub">
        gen {org.generation} ·{' '}
        {ageInDays > 0 ? `${ageInDays} day${ageInDays !== 1 ? 's' : ''} old` : 'newborn'}
        {' · '}
        {tn(org.lineage_id)}
        {org.max_age > 0 && ` · max ${fmt(org.max_age)}`}
      </div>
    </>
  )
}
