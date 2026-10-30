import clsx from 'clsx'
import { useTribeFollow } from '../../state/tribe-follow'
import { t } from '../../i18n'

/** A star on a tribe's card: follow the tribe to get its detailed famine warnings (when that is the setting). */
export function FollowTribe({ lineage }: { lineage: string }) {
  const following = useTribeFollow((s) => s.followed.includes(lineage))
  const toggle = useTribeFollow((s) => s.toggleFollow)
  const label = following ? t('panels.tribe.unfollow') : t('panels.tribe.follow')
  return (
    <button
      className={clsx('tribe-card-follow', following && 'on')}
      aria-pressed={following}
      aria-label={label}
      title={label}
      onClick={() => toggle(lineage)}
    >
      {following ? '★' : '☆'}
    </button>
  )
}
