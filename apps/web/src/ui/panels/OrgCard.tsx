import { personName } from '../../shared/personName'
import { memo } from 'react'
import clsx from 'clsx'
import { lineageColor } from '../../shared/constants'
import { useNerdStats, useUIStore } from '../../state/store'
import { useOrganism, useWorldStore } from '../../state/worldStore'
import { shownGeneration } from '../../game/model/generations'
import { ageWords, condition, doingNow, standoutTraits, tribeName } from '../../game/model/person-words'
import { formatNumber, t } from '../../i18n'
import type { OrganismState } from '../../shared/types'
import { PixelIcon } from '../toolbar/ToolSprite'
import { PersonAction } from './person/PersonAction'

const percent = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`
const score = (v: number | undefined) => (typeof v === 'number' ? Math.round(v * 100) : '–')

function NerdLine({ org }: { org: OrganismState }) {
  const traits = org.traits
  return (
    <div className="person-card-nerd">
      <span>
        {t('person.card.energyShort')} {percent(org.energy)} · {t('person.card.hydrationShort')}{' '}
        {percent(org.hydration)} · ♥ {percent(org.health)}
      </span>
      <span>
        {t('person.card.traitLabel.curiosity')} {score(traits.curiosity)} ·{' '}
        {t('person.card.traitLabel.aggression')} {score(traits.aggression)} ·{' '}
        {t('person.card.traitLabel.fear')} {score(traits.fear)} · {t('person.card.traitLabel.memory')}{' '}
        {score(traits.memory_strength)} · {t('person.card.traitLabel.social')} {score(traits.social_tendency)}{' '}
        · {t('person.card.traitLabel.resilience')} {score(traits.resilience)}
      </span>
      <span>
        {t('person.header.gen', { generation: formatNumber(shownGeneration(org.generation)) })} ·{' '}
        {org.lineage_id} · {t('person.card.memoryFoodShort')}
        {org.memory_count?.food ?? 0} {t('person.card.memoryWaterShort')}
        {org.memory_count?.water ?? 0} {t('person.card.memoryDangerShort')}
        {org.memory_count?.danger ?? 0}
      </span>
    </div>
  )
}

function OrgCardImpl({ orgId }: { orgId: string }) {
  const org = useOrganism(orgId)
  const lineageNames = useWorldStore((s) => s.world?.lineage_names)
  const following = useUIStore((s) => s.followOrgId === orgId)
  const selected = useUIStore((s) => s.selectedOrgId === orgId)
  const nerd = useNerdStats()

  if (!org) return null
  if (!org.lineage_id || !org.traits || !org.name) return null

  const name = personName(org)
  const color = lineageColor(org.lineage_id)
  const state = condition(org)
  const traits = standoutTraits(org.traits, 2)
  const ui = useUIStore.getState

  return (
    <article
      className={clsx('org-card person-card', selected && 'selected', state.level === 'bad' && 'needs-help')}
      style={{ borderLeftColor: color }}
      aria-label={name}
    >
      <div className="person-card-top">
        <button
          type="button"
          className="person-card-name"
          onClick={() => ui().selectOrg(org.id)}
          title={t('person.list.info', { name })}
        >
          {name}
          {org.surname ? <span className="org-surname"> {org.surname}</span> : null}
        </button>
        <span className="person-card-actions">
          <PersonAction
            icon="info"
            label={t('person.list.info', { name })}
            className="org-info-btn"
            onClick={() => ui().selectOrg(org.id)}
          />
          <PersonAction
            icon="pencil"
            label={t('person.card.renameAria')}
            className="org-rename-btn"
            onClick={() => ui().startRename(org.id)}
          />
          <PersonAction
            icon="footprints"
            label={following ? t('person.list.unfollow', { name }) : t('person.list.follow', { name })}
            className="org-track-btn"
            active={following}
            onClick={() => ui().followOrg(following ? null : org.id)}
          />
        </span>
      </div>
      <div className="person-card-sub">
        <span className="person-tribe-dot" style={{ background: color }} aria-hidden="true" />
        <span className="person-card-tribe">{tribeName(org.lineage_id, lineageNames)}</span>
        <span className="person-card-age">{ageWords(org)}</span>
      </div>
      <p className="person-card-now">{doingNow(org.thought)}</p>
      <div className="person-card-foot">
        {traits.map((trait) => (
          <span key={trait.trait} className="person-trait">
            {trait.word}
          </span>
        ))}
        {org.pregnant && <span className="person-trait expecting">{t('person.card.expecting')}</span>}
        <span className={clsx('person-cond', state.level)} title={t('person.list.conditionTip')}>
          <PixelIcon name="heart" size={10} />
          {state.word}
        </span>
      </div>
      {nerd && <NerdLine org={org} />}
    </article>
  )
}

export const OrgCard = memo(OrgCardImpl)
