import clsx from 'clsx'
import { Tooltip } from '../toolbar/Tooltip'
import { ToolSprite } from '../toolbar/ToolSprite'
import { nextPopulationMilestone } from './population-milestone'

interface Props {
  /** People alive. */
  population: number
  /** People who are sick right now. */
  sick: number
}

/**
 * People in one header chip: the living count, and the sick count beside it when anyone
 * is ill. The tooltip explains both. Renders nothing when there are no people.
 */
export function PopulationChip({ population, sick }: Props) {
  if (population <= 0 && sick <= 0) return null
  const milestone = nextPopulationMilestone(population)
  const tip = (
    <span className="tip-card">
      {population > 0 && (
        <span className="tip-part">
          <span className="tip-title">people</span>
          <span className="tip-body">{population.toLocaleString()} alive.</span>
          {milestone && <span className="tip-how">next milestone {milestone.toLocaleString()}</span>}
        </span>
      )}
      {sick > 0 && (
        <span className="tip-part">
          <span className="tip-title">sickness</span>
          <span className="tip-body">
            {sick} {sick > 1 ? 'people are' : 'person is'} sick. It spreads through close contact.
          </span>
        </span>
      )}
    </span>
  )
  return (
    <Tooltip tip={tip}>
      <span className={clsx('hdr-chip', 'population-badge', sick > 0 && 'has-sick')}>
        {population > 0 && (
          <>
            <ToolSprite icon="🚶" size={16} />
            {population.toLocaleString()}
          </>
        )}
        {sick > 0 && (
          <span className="pop-sick">
            <ToolSprite icon="🦠" size={16} />
            {sick}
          </span>
        )}
      </span>
    </Tooltip>
  )
}
