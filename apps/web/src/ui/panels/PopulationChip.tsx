import clsx from 'clsx'
import { Tooltip } from '../toolbar/Tooltip'
import { ToolSprite } from '../toolbar/ToolSprite'
import { nextPopulationMilestone } from './population-milestone'
import { formatNumber, t } from '../../i18n'

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
          <span className="tip-title">{t('panels.population.people')}</span>
          <span className="tip-body">
            {t('panels.population.alive', { count: formatNumber(population) })}
          </span>
          {milestone && (
            <span className="tip-how">
              {t('panels.population.milestone', { count: formatNumber(milestone) })}
            </span>
          )}
        </span>
      )}
      {sick > 0 && (
        <span className="tip-part">
          <span className="tip-title">{t('panels.population.sickness')}</span>
          <span className="tip-body">{t('panels.population.sick', { count: sick })}</span>
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
            {formatNumber(population)}
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
