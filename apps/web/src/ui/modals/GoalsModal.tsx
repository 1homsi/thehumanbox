import { useEffect, useRef, useState } from 'react'
import {
  DIFFICULTY_NOTES,
  DIFFICULTY_ORDER,
  goalFraction,
  goalProgressText,
  goalsSummary,
} from '../../game/model/goals'
import type { Difficulty, WorldState } from '../../shared/types'
import { sendSandboxCommand } from '../../simulation/commandBus'
import { t, type MessageKey } from '../../i18n'
import { Modal, ModalHeader } from './Modal'
import { PixelIcon } from '../toolbar/ToolSprite'
import clsx from 'clsx'

const DIFFICULTY_LABEL: Record<Difficulty, MessageKey> = {
  calm: 'dialogs.goals.levels.calm',
  normal: 'dialogs.goals.levels.normal',
  harsh: 'dialogs.goals.levels.harsh',
}

interface Props {
  world: WorldState
  onClose: () => void
}

/** The player's goals, the world's difficulty and whether the world is lost. Sits beside the achievements. */
export function GoalsModal({ world, onClose }: Props) {
  const goals = world.goals ?? []
  const difficulty: Difficulty = world.difficulty ?? 'normal'
  const summary = goalsSummary(goals, world.lost_tick)
  // The level the player has just asked for, while the world answers.
  const [sending, setSending] = useState<Difficulty | null>(null)
  // The world turned the last choice down. The buttons still show the old level, so say so.
  const [refused, setRefused] = useState(false)
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const choose = (level: Difficulty) => {
    if (sending) return
    setRefused(false)
    setSending(level)
    sendSandboxCommand({ cmd: 'set_difficulty', level }).then(
      (ok) => {
        if (!open.current) return
        setSending(null)
        setRefused(!ok)
      },
      () => {
        if (!open.current) return
        setSending(null)
        setRefused(true)
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      className="achievements-modal goals-modal"
      title={t('dialogs.goals.title')}
      hideTitle
    >
      <ModalHeader title={t('dialogs.goals.heading')} sub={summary.headline} onClose={onClose} />
      <div className="thb-modal-body">
        {summary.lost && (
          <p role="status" data-testid="goals-lost" className="goals-alert">
            {t('dialogs.goals.lost')}
          </p>
        )}

        <ul className="goal-list">
          {goals.map((g) => (
            <li key={g.id} className="goal-row" data-done={g.done}>
              <div className="goal-head">
                <span className="goal-title">
                  <span className="achievement-star" aria-hidden="true">
                    <PixelIcon name="star" size={12} />
                  </span>
                  {g.title}
                </span>
                <span className="tree-modal-sub">{goalProgressText(g)}</span>
              </div>
              <div className="bar-track goal-bar" aria-hidden="true">
                <div className="bar-fill" style={{ width: `${Math.round(goalFraction(g) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>

        <div className="goals-difficulty">
          <div className="tree-modal-sub">
            {t('dialogs.goals.difficulty', { notes: t(DIFFICULTY_NOTES[difficulty]) })}
          </div>
          <div role="group" aria-label={t('dialogs.goals.difficultyGroup')} className="goals-levels">
            {DIFFICULTY_ORDER.map((level) => (
              <button
                key={level}
                type="button"
                className={clsx('lang-btn', level === difficulty && 'active')}
                aria-pressed={level === difficulty}
                disabled={sending !== null}
                onClick={() => choose(level)}
              >
                {t(DIFFICULTY_LABEL[level])}
              </button>
            ))}
          </div>
          {refused && (
            <p role="alert" className="goals-alert">
              {t('dialogs.goals.difficultyRefused')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
