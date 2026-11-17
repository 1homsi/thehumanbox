import { personName } from '../../shared/personName'
import { Suspense, useState } from 'react'
import type { OrganismState, ReligionInfo } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { useOrgDetail } from '../../shared/hooks/useOrgDetail'
import { lazyWithRetry } from '../../shared/lazyWithRetry'
import { WithQueryClient } from '../../shared/query'
import { useNerdStats, useUIStore } from '../../state/store'
import { useWorldStore } from '../../state/worldStore'
import { personTitles } from '../../game/model/titles'
import { shownGeneration } from '../../game/model/generations'
import { ageWords, tribeName } from '../../game/model/person-words'
import { hasBuiltHome } from '../../game/scenes'
import { useSceneStore } from '../../state/scene'
import { formatNumber, t } from '../../i18n'
import { StatusChips, Vitals } from './org-detail/status'
import { MentalState } from './org-detail/MentalState'
import { LearningSection, TraitsSection, ZodiacSection } from './org-detail/character'
import { PersonalBondsSection, RelationsSection } from './org-detail/relations'
import {
  DiseasesSection,
  EducationSection,
  InventorySection,
  ReligionSection,
  WealthSection,
} from './org-detail/background'
import {
  InnerLifeSection,
  MemoryCountsSection,
  RecentLifeSection,
  WitnessedSection,
} from './org-detail/life-log'
import { BondsRememberedSection, MemoriesSection } from './org-detail/memories'
import { LanguageSection } from './org-detail/LanguageSection'
import { WordHistorySection } from './org-detail/word-history'
import { fmt } from './org-detail/format'
import { RenameForm } from './RenameForm'
import { Portrait } from './person/Portrait'
import { PersonAction } from './person/PersonAction'
import {
  NeedsSection,
  NowSection,
  PeopleSection,
  PersonalitySection,
  SheetSection,
  StorySection,
} from './person/sheet-sections'

const LifeModal = lazyWithRetry(() => import('../modals/LifeModal').then((m) => ({ default: m.LifeModal })))

interface Props {
  org: OrganismState
  onClose: () => void
  onFollow: (id: string | null) => void
  following: boolean
  lineageNames?: Record<string, string>
  organisms?: OrganismState[]
  religions?: ReligionInfo[]
  onSelectOrg?: (id: string) => void
}

function Actions({
  org,
  following,
  onFollow,
  onLife,
}: {
  org: OrganismState
  following: boolean
  onFollow: (id: string | null) => void
  onLife: () => void
}) {
  const starred = useUIStore((s) => s.starredOrgIds.includes(org.id))
  const world = useWorldStore((s) => s.world)
  const ui = useUIStore.getState
  const talks = org.conversation_count ?? 0
  const home = !!world && hasBuiltHome(org, world)
  return (
    <div className="person-sheet-actions">
      {org.alive && (
        <PersonAction
          icon="footprints"
          text={following ? t('person.sheet.action.following') : t('person.sheet.action.follow')}
          label={following ? t('person.sheet.tip.following') : t('person.sheet.tip.follow')}
          active={following}
          onClick={() => onFollow(following ? null : org.id)}
        />
      )}
      {org.alive && (
        <PersonAction
          icon="pencil"
          text={t('person.sheet.action.rename')}
          label={t('person.sheet.tip.rename')}
          onClick={() => ui().startRename(org.id)}
        />
      )}
      <PersonAction
        icon="kin_tree"
        text={t('person.sheet.action.tree')}
        label={t('person.sheet.tip.tree')}
        className="org-tree-btn"
        onClick={() => ui().openFamilyTree(org.id)}
      />
      {talks > 0 && (
        <PersonAction
          icon="v_bubble"
          text={t('person.sheet.action.talks', { count: formatNumber(talks) })}
          label={t('person.sheet.tip.talks')}
          onClick={() => ui().openConvo(org.id)}
        />
      )}
      <PersonAction
        icon="book"
        text={t('person.sheet.action.life')}
        label={t('person.sheet.tip.life')}
        onClick={onLife}
      />
      {home && (
        <PersonAction
          icon="house"
          text={t('person.sheet.action.home')}
          label={t('person.home.lookInside')}
          onClick={() => useSceneStore.getState().enter({ kind: 'home', orgId: org.id })}
        />
      )}
      <PersonAction
        icon="star"
        text={starred ? t('person.sheet.action.starred') : t('person.sheet.action.star')}
        label={starred ? t('person.header.unstar') : t('person.header.starTip')}
        active={starred}
        className="person-star"
        onClick={() => ui().toggleStar(org.id)}
      />
    </div>
  )
}

function NerdSection({
  org,
  detail,
  lineageNames,
  organisms,
  religions,
  onSelectOrg,
}: Omit<Props, 'onClose' | 'onFollow' | 'following'> & { detail: ReturnType<typeof useOrgDetail>['data'] }) {
  const tn = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const on = (oid: string) => {
    const other = organisms?.find((o) => o.id === oid)
    return (other && personName(other)) || (oid ?? '').slice(0, 5)
  }
  return (
    <SheetSection title={t('person.sheet.nerd')} className="person-nerd">
      <p className="person-nerd-line">
        {t('person.sheet.nerdLine', {
          lineage: org.lineage_id,
          generation: formatNumber(shownGeneration(org.generation)),
          ticks: formatNumber(org.age),
          max: fmt(org.max_age),
        })}
      </p>
      <StatusChips org={org} />
      <Vitals org={org} isSick={org.infection > 0.15} />
      <TraitsSection org={org} />
      <MentalState org={org} />
      <ZodiacSection org={org} />
      <RelationsSection org={org} tn={tn} />
      <PersonalBondsSection org={org} on={on} />
      <EducationSection org={org} />
      <WealthSection org={org} />
      <InventorySection org={org} />
      <ReligionSection org={org} religions={religions} />
      <DiseasesSection org={org} />
      <MemoryCountsSection org={org} />
      <RecentLifeSection detail={detail ?? null} />
      <WitnessedSection detail={detail ?? null} />
      <BondsRememberedSection detail={detail ?? null} organisms={organisms} onSelectOrg={onSelectOrg} />
      <MemoriesSection detail={detail ?? null} organisms={organisms} onSelectOrg={onSelectOrg} />
      <LanguageSection detail={detail ?? null} />
      <WordHistorySection detail={detail ?? null} />
    </SheetSection>
  )
}

function OrgDetailBody({
  org,
  onClose,
  onFollow,
  following,
  lineageNames,
  organisms,
  religions,
  onSelectOrg,
}: Props) {
  const { data: detail } = useOrgDetail(org.id)
  const [showLife, setShowLife] = useState(false)
  const nerd = useNerdStats()
  const renaming = useUIStore((s) => s.renamingOrgId === org.id)
  if (!org.traits || !org.name || !org.lineage_id) return null
  const color = lineageColor(org.lineage_id)
  const name = personName(org)

  return (
    <>
      {showLife && (
        <Suspense fallback={null}>
          <LifeModal orgId={org.id} orgName={name} onClose={() => setShowLife(false)} />
        </Suspense>
      )}
      <div className="org-detail person-sheet" style={{ borderTopColor: color }}>
        <header className="person-sheet-head">
          <span className="person-sheet-portrait" style={{ borderColor: color }}>
            <Portrait person={org} size={48} />
          </span>
          <div className="person-sheet-id">
            <h2 className="org-detail-name">
              {name}
              {org.surname ? <span className="org-surname"> {org.surname}</span> : null}
            </h2>
            <div className="person-sheet-tribe">
              <span className="person-tribe-dot" style={{ background: color }} aria-hidden="true" />
              <span>{tribeName(org.lineage_id, lineageNames)}</span>
              <span className="person-card-age">{ageWords(org)}</span>
            </div>
            {personTitles(org).length > 0 && (
              <div className="person-chips">
                {personTitles(org).map((title) => (
                  <span key={title} className="person-trait dream">
                    {title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="button" aria-label={t('person.header.close')} className="close-btn" onClick={onClose}>
            ✕
          </button>
        </header>
        {renaming && <RenameForm key={org.id} org={org} />}
        <Actions org={org} following={following} onFollow={onFollow} onLife={() => setShowLife(true)} />
        <NowSection org={org} />
        <NeedsSection org={org} nerd={nerd} />
        <PersonalitySection org={org} />
        <PeopleSection org={org} organisms={organisms} onSelectOrg={onSelectOrg} />
        <StorySection org={org} organisms={organisms} detail={detail ?? null} nerd={nerd} />
        <LearningSection detail={detail ?? null} />
        <InnerLifeSection detail={detail ?? null} />
        {nerd && (
          <NerdSection
            org={org}
            detail={detail}
            lineageNames={lineageNames}
            organisms={organisms}
            religions={religions}
            onSelectOrg={onSelectOrg}
          />
        )}
      </div>
    </>
  )
}

export function OrgDetail(props: Props) {
  return (
    <WithQueryClient>
      <OrgDetailBody key={props.org.id} {...props} />
    </WithQueryClient>
  )
}
