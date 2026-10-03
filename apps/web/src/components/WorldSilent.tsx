import { useEffect, useState } from 'react'
import type { WorldState } from '../types'
import { everLived, livingCount, worldEpitaph } from '../world/world-end'
import { Modal } from './Modal'

interface Props {
  world: WorldState | null
  /** Pick up the tribe tool so the player can seed new people. */
  onSeed: () => void
  /** Start over in a new world, or null when this world can't be reset here. */
  onNewWorld: (() => void) | null
}

/**
 * When the last person dies the world falls silent. Nobody migrates into
 * an empty land, so this is the end unless the player seeds new people.
 */
export function WorldSilent({ world, onSeed, onNewWorld }: Props) {
  const silent = !!world && world.tick > 0 && livingCount(world) === 0 && everLived(world)
  const [dismissed, setDismissed] = useState(false)

  // Mourn again if a later world (or a later extinction) falls silent.
  useEffect(() => {
    if (!silent) setDismissed(false)
  }, [silent])

  if (!silent || dismissed || !world) return null
  const e = worldEpitaph(world)
  const close = () => setDismissed(true)

  return (
    <Modal open onClose={close} className="confirm-modal world-silent" title="The world has fallen silent">
      <div className="confirm-body">
        <p>The last of your people is gone. Nothing stirs in the villages they built.</p>
        <dl className="world-silent-stats">
          <dt>lasted</dt>
          <dd>
            {e.years} {e.years === 1 ? 'year' : 'years'}
          </dd>
          <dt>most alive at once</dt>
          <dd>{e.peak.toLocaleString()}</dd>
          <dt>tribes</dt>
          <dd>{e.tribes}</dd>
          {e.era && (
            <>
              <dt>furthest age</dt>
              <dd>{e.era}</dd>
            </>
          )}
          <dt>prayers answered</dt>
          <dd>
            {e.answered}
            {e.forsaken > 0 && <span className="world-silent-forsaken"> · {e.forsaken} unanswered</span>}
          </dd>
        </dl>
      </div>
      <div className="confirm-actions">
        <button className="lang-btn" onClick={close}>
          keep watching
        </button>
        {onNewWorld && (
          <button
            className="lang-btn"
            onClick={() => {
              close()
              onNewWorld()
            }}
          >
            new world
          </button>
        )}
        <button
          className="lang-btn primary"
          autoFocus
          onClick={() => {
            close()
            onSeed()
          }}
        >
          seed new people
        </button>
      </div>
    </Modal>
  )
}
