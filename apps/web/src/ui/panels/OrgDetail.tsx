import { personName } from '../../shared/personName'
import { useState } from 'react'
import type { OrganismState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { useOrgDetail } from '../../shared/hooks/useOrgDetail'
import { WithQueryClient } from '../../shared/query'
import { useUIStore } from '../../state/store'
import { LifeModal } from '../modals/LifeModal'
import { OrgHeader } from './org-detail/OrgHeader'
import { StatusChips, Vitals } from './org-detail/status'
import { MentalState } from './org-detail/MentalState'
import { AspirationSection, LearningSection, TraitsSection, ZodiacSection } from './org-detail/character'
import { KinSection, PersonalBondsSection, RelationsSection } from './org-detail/relations'
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

interface Props {
  org: OrganismState
  onClose: () => void
  onFollow: (id: string | null) => void
  following: boolean
  lineageNames?: Record<string, string>
  organisms?: OrganismState[]
  religions?: import('../../shared/types').ReligionInfo[]
  onSelectOrg?: (id: string) => void
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
  const starredOrgIds = useUIStore((s) => s.starredOrgIds)
  const toggleStar = useUIStore((s) => s.toggleStar)
  const isStarred = starredOrgIds.includes(org.id)
  const tn = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const on = (oid: string) => organisms?.find((o) => o.id === oid)?.name ?? (oid ?? '').slice(0, 5)
  const color = lineageColor(org.lineage_id)
  // `traits`, `name` and `lineage_id` are cold fields. The server omits
  // them from periodic "full" frames (which still set `organisms_complete`),
  // so a cache entry seeded from one has none of them. `OrgCard` already
  // guards exactly this case; without the same guard here, selecting an
  // organism during that window threw on `org.traits.curiosity` and took
  // down the whole app via the top-level ErrorBoundary.
  if (!org.traits || !org.name || !org.lineage_id) return null
  const isSick = org.infection > 0.15
  const carrying = org.carrying > 0

  return (
    <>
      {showLife && <LifeModal orgId={org.id} orgName={personName(org)} onClose={() => setShowLife(false)} />}
      <div className="org-detail" style={{ borderTop: `3px solid ${color}` }}>
        <OrgHeader
          org={org}
          color={color}
          isSick={isSick}
          carrying={carrying}
          isStarred={isStarred}
          toggleStar={toggleStar}
          setShowLife={setShowLife}
          following={following}
          onFollow={onFollow}
          onClose={onClose}
          tn={tn}
        />
        <StatusChips org={org} />
        <Vitals org={org} isSick={isSick} />
        <MentalState org={org} />
        <AspirationSection org={org} />
        <LearningSection detail={detail} />
        <ZodiacSection org={org} />
        <TraitsSection org={org} />
        <RelationsSection org={org} tn={tn} />
        <PersonalBondsSection org={org} on={on} />
        <KinSection org={org} organisms={organisms} onSelectOrg={onSelectOrg} />
        <EducationSection org={org} />
        <WealthSection org={org} />
        <InventorySection org={org} />
        <ReligionSection org={org} religions={religions} />
        <DiseasesSection org={org} />
        <MemoryCountsSection org={org} />
        <RecentLifeSection detail={detail} />
        <WitnessedSection detail={detail} />
        <InnerLifeSection detail={detail} />
        <BondsRememberedSection detail={detail} organisms={organisms} onSelectOrg={onSelectOrg} />
        <MemoriesSection detail={detail} organisms={organisms} onSelectOrg={onSelectOrg} />
        <LanguageSection detail={detail} />
      </div>
    </>
  )
}

export function OrgDetail(props: Props) {
  return (
    <WithQueryClient>
      <OrgDetailBody {...props} />
    </WithQueryClient>
  )
}
