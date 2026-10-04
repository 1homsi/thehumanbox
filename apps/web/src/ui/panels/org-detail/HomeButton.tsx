import type { OrganismState } from '../../../shared/types'
import { Tooltip } from '../../toolbar/Tooltip'
import { useSceneStore } from '../../../state/scene'
import { hasBuiltHome, isAtHome } from '../../../game/scenes'
import { useWorldStore } from '../../../state/worldStore'

export function HomeButton({ org }: { org: OrganismState }) {
  const world = useWorldStore((s) => s.world)
  if (!world) return null
  const built = hasBuiltHome(org, world)
  if (!built) return null
  const inside = isAtHome(org, world)
  return (
    <Tooltip tip={inside ? 'Step inside their home' : 'Visit their home (they are out)'}>
      <button
        className="icon-btn"
        aria-label="Look inside"
        onClick={() => useSceneStore.getState().enter({ kind: 'home', orgId: org.id })}
      >
        ⌂
      </button>
    </Tooltip>
  )
}
