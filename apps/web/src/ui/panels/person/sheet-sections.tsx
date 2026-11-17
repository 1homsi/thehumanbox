import clsx from 'clsx'
import type { ReactNode } from 'react'
import { kinLinks, type KinLink } from '../../../game/model/kin-links'
import { lifeStory } from '../../../game/model/life-story'
import { familySentence } from '../../../game/model/family-lines'
import { deathLine } from '../../../game/model/death'
import { doingNow, needLevel, standoutTraits, storyEvents } from '../../../game/model/person-words'
import { formatNumber, t } from '../../../i18n'
import type { OrganismState, OrgDetail } from '../../../shared/types'
import { PixelIcon, type SpriteName } from '../../toolbar/ToolSprite'
import { Tooltip } from '../../toolbar/Tooltip'
import { aspirationLabel, aspirationTip, moodLabel } from '../org-detail/icons'
import { Portrait } from './Portrait'

export function SheetSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('person-sheet-section', className)}>
      <h3 className="person-sheet-title">{title}</h3>
      {children}
    </section>
  )
}

export function NowSection({ org }: { org: OrganismState }) {
  const chips: string[] = []
  if (org.mood && org.mood !== 'calm') chips.push(t('person.status.feels', { mood: moodLabel(org.mood) }))
  if (org.infection > 0.15) chips.push(t('person.condition.sick'))
  if (org.pregnant) chips.push(t('person.card.expecting'))
  if (org.carrying > 0) chips.push(t('person.header.carrying'))
  if (org.attracted_to && !org.partner_id) chips.push(t('person.sheet.inLove'))
  return (
    <SheetSection title={t('person.sheet.now')}>
      <p className="person-now">
        {org.alive ? doingNow(org.thought) : (deathLine(org) ?? t('person.condition.dead'))}
      </p>
      {chips.length > 0 && (
        <div className="person-chips">
          {chips.map((chip) => (
            <span key={chip} className="person-trait">
              {chip}
            </span>
          ))}
        </div>
      )}
    </SheetSection>
  )
}

function Need({
  icon,
  label,
  value,
  nerd,
  invert,
}: {
  icon: SpriteName
  label: string
  value: number
  nerd: boolean
  invert?: boolean
}) {
  const level = needLevel(invert ? 1 - value : value)
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 10)
  return (
    <div className={clsx('person-need', level)}>
      <PixelIcon name={icon} size={14} />
      <span className="person-need-label">{label}</span>
      <span
        className="px-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < filled ? 'on' : undefined} />
        ))}
      </span>
      {nerd ? (
        <span className="person-need-num">{Math.round(value * 100)}%</span>
      ) : (
        level === 'bad' && <span className="person-need-low">{t('person.sheet.low')}</span>
      )}
    </div>
  )
}

export function NeedsSection({ org, nerd }: { org: OrganismState; nerd: boolean }) {
  if (!org.alive) return null
  return (
    <SheetSection title={t('person.sheet.needs')}>
      <div className="person-needs">
        <Need icon="apple" label={t('person.sheet.food')} value={org.energy} nerd={nerd} />
        <Need icon="drop" label={t('person.sheet.water')} value={org.hydration} nerd={nerd} />
        <Need icon="heart" label={t('person.sheet.health')} value={org.health} nerd={nerd} />
        {org.infection > 0.15 && (
          <Need icon="germ" label={t('person.sheet.sickness')} value={org.infection} nerd={nerd} invert />
        )}
      </div>
    </SheetSection>
  )
}

export function PersonalitySection({ org }: { org: OrganismState }) {
  const traits = standoutTraits(org.traits, 4)
  const born = [...(org.personality ?? []), ...(org.attributes ?? [])]
  const all = [...new Set(born)]
  if (traits.length === 0 && !org.aspiration && all.length === 0) return null
  return (
    <SheetSection title={t('person.sheet.personality')}>
      <div className="person-chips">
        {traits.map((trait) => (
          <span key={trait.trait} className={clsx('person-trait', 'strong')}>
            {trait.word}
          </span>
        ))}
        {org.aspiration && (
          <Tooltip tip={aspirationTip(org.aspiration)}>
            <span className="person-trait dream">
              {t('person.sheet.dream', { dream: aspirationLabel(org.aspiration) })}
            </span>
          </Tooltip>
        )}
      </div>
      {all.length > 0 && (
        <details className="person-fold">
          <summary>{t('person.sheet.allTraits')}</summary>
          <div className="person-chips">
            {all.map((word) => (
              <span key={word} className="person-trait quiet">
                {word}
              </span>
            ))}
          </div>
        </details>
      )}
    </SheetSection>
  )
}

interface Tie {
  link: KinLink
  relation: string
  rival?: boolean
}

export function PeopleSection({
  org,
  organisms,
  onSelectOrg,
}: {
  org: OrganismState
  organisms?: OrganismState[]
  onSelectOrg?: (id: string) => void
}) {
  const all = organisms ?? []
  const k = kinLinks(org, all)
  const ties: Tie[] = [
    ...(k.partner ? [{ link: k.partner, relation: t('person.sheet.partner') }] : []),
    ...(k.mother ? [{ link: k.mother, relation: t('person.kin.mother') }] : []),
    ...(k.father ? [{ link: k.father, relation: t('person.kin.father') }] : []),
    ...k.children.map((link) => ({ link, relation: t('person.kin.child') })),
    ...k.friends.map((link) => ({ link, relation: t('person.kin.friend') })),
    ...k.rivals.map((link) => ({ link, relation: t('person.kin.rival'), rival: true })),
  ]
  const byId = new Map(all.map((o) => [o.id, o]))
  return (
    <SheetSection title={t('person.sheet.people')}>
      {ties.length === 0 ? (
        <p className="person-empty">{t('person.sheet.noPeople')}</p>
      ) : (
        <div className="person-ties">
          {ties.map(({ link, relation, rival }) => {
            const other = byId.get(link.id)
            return (
              <button
                key={`${relation}-${link.id}`}
                type="button"
                className={clsx('person-tie', rival && 'rival', !link.alive && 'gone')}
                onClick={() => onSelectOrg?.(link.id)}
                title={
                  link.alive
                    ? t('person.kin.tip', { label: relation, name: link.name })
                    : t('person.kin.tipDead', { label: relation, name: link.name })
                }
              >
                {other ? <Portrait person={other} size={24} /> : <span className="person-portrait empty" />}
                <span className="person-tie-text">
                  <span className="person-tie-name">{link.name}</span>
                  <span className="person-tie-rel">{relation}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </SheetSection>
  )
}

export function StorySection({
  org,
  organisms,
  detail,
  nerd,
}: {
  org: OrganismState
  organisms?: OrganismState[]
  detail: OrgDetail | null
  nerd: boolean
}) {
  const lines = lifeStory(org, organisms ?? [], detail?.life_log ?? [])
  const family = familySentence(org, organisms ?? [])
  const events = storyEvents(detail?.life_log, nerd)
  return (
    <SheetSection title={t('person.sheet.story')}>
      {lines.length === 0 && !family && events.length === 0 ? (
        <p className="person-empty">{t('person.sheet.noStory')}</p>
      ) : (
        <ul className="person-story">
          {lines.map((line, i) => (
            <li key={`l${i}`}>{line}</li>
          ))}
          {family && <li className="family">{family}</li>}
          {events.map((e, i) => (
            <li key={`e${i}`} className="event">
              {nerd && (
                <span className="person-story-tick">
                  {t('person.life.tick', { tick: formatNumber(e.tick) })}
                </span>
              )}
              {e.text}
            </li>
          ))}
        </ul>
      )}
    </SheetSection>
  )
}
