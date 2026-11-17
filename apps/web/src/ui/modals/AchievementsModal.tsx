import { useMemo } from 'react'
import { achievementsFor } from '../../game/model/achievements'
import type { WorldState } from '../../shared/types'
import { Modal, ModalHeader } from './Modal'
import { formatNumber, t } from '../../i18n'
import { PixelIcon } from '../toolbar/ToolSprite'

interface Props {
  world: WorldState
  onClose: () => void
}

/** What the world has achieved so far. Read live from the world, so nothing here is saved or replayed. */
export function AchievementsModal({ world, onClose }: Props) {
  const list = useMemo(
    () =>
      achievementsFor({
        tick: world.tick,
        organisms: world.organisms,
        settlements: world.settlements,
        grid: world.grid,
      }),
    [world.tick, world.organisms, world.settlements, world.grid],
  )
  const earned = list.filter((a) => a.unlocked).length

  return (
    <Modal
      open
      onClose={onClose}
      className="achievements-modal"
      title={t('dialogs.achievements.title')}
      hideTitle
    >
      <ModalHeader
        title={t('dialogs.achievements.heading')}
        sub={t('dialogs.achievements.earned', {
          earned: formatNumber(earned),
          total: formatNumber(list.length),
        })}
        onClose={onClose}
      />
      <div className="thb-modal-body">
        <ul className="achievement-list">
          {list.map((a) => (
            <li key={a.id} className="achievement-row" data-unlocked={a.unlocked}>
              <span className="achievement-star" aria-hidden="true">
                <PixelIcon name="star" size={14} />
              </span>
              <span className="achievement-text">
                <span className="achievement-title">{a.title}</span>
                <span className="tree-modal-sub">{a.detail}</span>
                {!a.unlocked && a.progress && <span className="tree-modal-sub">{a.progress}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
