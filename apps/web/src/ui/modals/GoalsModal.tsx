import {
  DIFFICULTY_NOTES,
  DIFFICULTY_ORDER,
  goalFraction,
  goalProgressText,
  goalsSummary,
} from '../../game/model/goals'
import type { Difficulty, WorldState } from '../../shared/types'
import { sendSandboxCommand } from '../../simulation/commandBus'
import { Modal } from './Modal'

interface Props {
  world: WorldState
  onClose: () => void
}

/** The player's goals, the world's difficulty and whether the world is lost. Sits beside the achievements. */
export function GoalsModal({ world, onClose }: Props) {
  const goals = world.goals ?? []
  const difficulty: Difficulty = world.difficulty ?? 'normal'
  const summary = goalsSummary(goals, world.lost_tick)

  return (
    <Modal open onClose={onClose} className="achievements-modal goals-modal" title="Goals" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">GOALS</span>
        <span className="tree-modal-sub">{summary.headline}</span>
      </div>

      {summary.lost && (
        <p role="status" data-testid="goals-lost" style={{ color: '#e07060', margin: '10px 0 0' }}>
          No one is left alive.
        </p>
      )}

      <ul className="goal-list" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {goals.map((g) => (
          <li
            key={g.id}
            data-done={g.done}
            style={{ padding: '8px 0', borderBottom: '1px solid #3a3020', opacity: g.done ? 1 : 0.85 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: g.done ? '#e8b060' : '#f4e6c0' }}>
                {g.done ? '★ ' : '☆ '}
                {g.title}
              </span>
              <span className="tree-modal-sub">{goalProgressText(g)}</span>
            </div>
            <div
              aria-hidden="true"
              style={{ height: 4, marginTop: 6, background: '#3a3020', borderRadius: 2, overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${Math.round(goalFraction(g) * 100)}%`,
                  height: '100%',
                  background: g.done ? '#e8b060' : '#a08040',
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 14 }}>
        <div className="tree-modal-sub" style={{ marginBottom: 6 }}>
          Difficulty: {DIFFICULTY_NOTES[difficulty]}
        </div>
        <div role="group" aria-label="Difficulty" style={{ display: 'flex', gap: 6 }}>
          {DIFFICULTY_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              className="lang-btn"
              aria-pressed={level === difficulty}
              onClick={() => {
                void sendSandboxCommand({ cmd: 'set_difficulty', level })
              }}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
