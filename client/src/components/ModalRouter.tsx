import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '../utils/lazyWithRetry'
import type { WorldState, OrganismState } from '../types'
import { useUIStore } from '../stores/store'

const LanguageModal = lazy(() => import('./LanguageModal').then((m) => ({ default: m.LanguageModal })))
const ChroniclesModal = lazy(() => import('./ChroniclesModal').then((m) => ({ default: m.ChroniclesModal })))
const FamilyTreeModal = lazy(() => import('./FamilyTreeModal').then((m) => ({ default: m.FamilyTreeModal })))
const OrgSearchModal = lazy(() => import('./OrgSearchModal').then((m) => ({ default: m.OrgSearchModal })))
const StatsModal = lazy(() => import('./StatsModal').then((m) => ({ default: m.StatsModal })))
const ConversationsModal = lazy(() =>
  import('./ConversationsModal').then((m) => ({ default: m.ConversationsModal })),
)
const AboutModal = lazy(() => import('./AboutModal').then((m) => ({ default: m.AboutModal })))
const CivStatsModal = lazy(() => import('./CivStatsModal').then((m) => ({ default: m.CivStatsModal })))
const AllLineagesModal = lazy(() =>
  import('./AllLineagesModal').then((m) => ({ default: m.AllLineagesModal })),
)
const WorldsModal = lazy(() => import('./WorldsModal').then((m) => ({ default: m.WorldsModal })))
const NotableOrgsModal = lazy(() =>
  import('./NotableOrgsModal').then((m) => ({ default: m.NotableOrgsModal })),
)
const DesktopSettingsModal = lazy(() =>
  import('./DesktopSettingsModal').then((m) => ({ default: m.DesktopSettingsModal })),
)

interface LineageInfo {
  count: number
  minGen: number
  maxGen: number
  orgs: OrganismState[]
}

interface Props {
  world: WorldState
  lineages: Record<string, LineageInfo>
}

export function ModalRouter({ world, lineages }: Props) {
  const showLanguages = useUIStore((s) => s.showLanguages)
  const showChronicles = useUIStore((s) => s.showChronicles)
  const showFamilyTree = useUIStore((s) => s.showFamilyTree)
  const showOrgSearch = useUIStore((s) => s.showOrgSearch)
  const showStats = useUIStore((s) => s.showStats)
  const showAllLineages = useUIStore((s) => s.showAllLineages)
  const showAbout = useUIStore((s) => s.showAbout)
  const showCiv = useUIStore((s) => s.showCiv)
  const showWorlds = useUIStore((s) => s.showWorlds)
  const showNotable = useUIStore((s) => s.showNotable)
  const showDesktopSettings = useUIStore((s) => s.showDesktopSettings)
  const convoOrgId = useUIStore((s) => s.convoOrgId)

  const closeLanguages = useUIStore((s) => s.closeLanguages)
  const closeChronicles = useUIStore((s) => s.closeChronicles)
  const closeFamilyTree = useUIStore((s) => s.closeFamilyTree)
  const closeOrgSearch = useUIStore((s) => s.closeOrgSearch)
  const closeStats = useUIStore((s) => s.closeStats)
  const closeAllLineages = useUIStore((s) => s.closeAllLineages)
  const closeAbout = useUIStore((s) => s.closeAbout)
  const closeCiv = useUIStore((s) => s.closeCiv)
  const closeWorlds = useUIStore((s) => s.closeWorlds)
  const closeNotable = useUIStore((s) => s.closeNotable)
  const closeDesktopSettings = useUIStore((s) => s.closeDesktopSettings)
  const closeConvo = useUIStore((s) => s.closeConvo)
  const followOrg = useUIStore((s) => s.followOrg)

  return (
    <>
      <Suspense fallback={null}>
        {showLanguages && (
          <LanguageModal
            organisms={world.organisms.filter((o) => o.alive)}
            sexWords={world.sex_words}
            onClose={closeLanguages}
            lineageNames={world.lineage_names}
          />
        )}
        {showChronicles && (
          <ChroniclesModal
            stories={world.story_history ?? []}
            headlines={world.headlines ?? []}
            onClose={closeChronicles}
          />
        )}
        {showFamilyTree && (
          <FamilyTreeModal
            organisms={world.organisms}
            currentTick={world.tick}
            sexWords={world.sex_words}
            onClose={closeFamilyTree}
          />
        )}
        {showOrgSearch && (
          <OrgSearchModal
            organisms={world.organisms}
            onTrack={(id) => {
              followOrg(id)
              closeOrgSearch()
            }}
            onClose={closeOrgSearch}
            lineageNames={world.lineage_names}
          />
        )}
        {convoOrgId &&
          (() => {
            const org = world.organisms.find((o) => o.id === convoOrgId)
            return org ? (
              <ConversationsModal
                org={org}
                allOrgs={world.organisms}
                sexWords={world.sex_words}
                onClose={closeConvo}
              />
            ) : null
          })()}
        {showStats && <StatsModal world={world} onClose={closeStats} />}
        {showAbout && <AboutModal onClose={closeAbout} />}
        {showCiv && <CivStatsModal world={world} onClose={closeCiv} />}
        {showWorlds && <WorldsModal onClose={closeWorlds} />}
        {showNotable && <NotableOrgsModal organisms={world.organisms} onClose={closeNotable} />}
        {showDesktopSettings && <DesktopSettingsModal onClose={closeDesktopSettings} />}
      </Suspense>

      {showAllLineages && (
        <Suspense fallback={null}>
          <AllLineagesModal
            lineages={lineages}
            lineageNames={world.lineage_names}
            onClose={closeAllLineages}
          />
        </Suspense>
      )}
    </>
  )
}
