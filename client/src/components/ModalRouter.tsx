import { lazy, Suspense } from 'react'
import type { WorldState, OrganismState } from '../types'
import { useUIStore } from '../store'
import { Modal } from './Modal'
import { lineageColor, lineageWord } from '../constants'

const LanguageModal      = lazy(() => import('./LanguageModal').then(m => ({ default: m.LanguageModal })))
const ChroniclesModal    = lazy(() => import('./ChroniclesModal').then(m => ({ default: m.ChroniclesModal })))
const FamilyTreeModal    = lazy(() => import('./FamilyTreeModal').then(m => ({ default: m.FamilyTreeModal })))
const OrgSearchModal     = lazy(() => import('./OrgSearchModal').then(m => ({ default: m.OrgSearchModal })))
const StatsModal         = lazy(() => import('./StatsModal').then(m => ({ default: m.StatsModal })))
const ConversationsModal = lazy(() => import('./ConversationsModal').then(m => ({ default: m.ConversationsModal })))
const AboutModal         = lazy(() => import('./AboutModal').then(m => ({ default: m.AboutModal })))

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
  const showLanguages   = useUIStore(s => s.showLanguages)
  const showChronicles  = useUIStore(s => s.showChronicles)
  const showFamilyTree  = useUIStore(s => s.showFamilyTree)
  const showOrgSearch   = useUIStore(s => s.showOrgSearch)
  const showStats       = useUIStore(s => s.showStats)
  const showAllLineages = useUIStore(s => s.showAllLineages)
  const showAbout       = useUIStore(s => s.showAbout)
  const convoOrgId      = useUIStore(s => s.convoOrgId)

  const closeLanguages   = useUIStore(s => s.closeLanguages)
  const closeChronicles  = useUIStore(s => s.closeChronicles)
  const closeFamilyTree  = useUIStore(s => s.closeFamilyTree)
  const closeOrgSearch   = useUIStore(s => s.closeOrgSearch)
  const closeStats       = useUIStore(s => s.closeStats)
  const closeAllLineages = useUIStore(s => s.closeAllLineages)
  const closeAbout       = useUIStore(s => s.closeAbout)
  const closeConvo       = useUIStore(s => s.closeConvo)
  const followOrg        = useUIStore(s => s.followOrg)

  const tribeName = (lid: string) =>
    world?.lineage_names?.[lid] ?? (lid ?? '').slice(0, 6)

  return (
    <>
      <Suspense fallback={null}>
        {showLanguages && (
          <LanguageModal
            organisms={world.organisms.filter(o => o.alive)}
            sexWords={world.sex_words}
            onClose={closeLanguages}
            lineageNames={world.lineage_names}
          />
        )}
        {showChronicles && (
          <ChroniclesModal
            stories={world.story_history ?? []}
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
            onTrack={(id) => { followOrg(id); closeOrgSearch() }}
            onClose={closeOrgSearch}
            lineageNames={world.lineage_names}
          />
        )}
        {convoOrgId && (() => {
          const org = world.organisms.find(o => o.id === convoOrgId)
          return org ? (
            <ConversationsModal
              org={org}
              allOrgs={world.organisms}
              sexWords={world.sex_words}
              onClose={closeConvo}
            />
          ) : null
        })()}
        {showStats && (
          <StatsModal
            world={world}
            onClose={closeStats}
          />
        )}
        {showAbout && (
          <AboutModal onClose={closeAbout} />
        )}
      </Suspense>

      {showAllLineages && (
        <Modal open onClose={closeAllLineages} className="lang-modal" title="All lineages" hideTitle>
          <div className="lang-modal-header">
            <span className="lang-modal-title">ALL LINEAGES ({Object.keys(lineages).length})</span>
            <button className="close-btn" onClick={closeAllLineages}>✕</button>
          </div>
          <div className="lang-modal-body">
            <div className="lineage-list">
              {Object.entries(lineages)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([lid, info]) => (
                  <div key={lid} className="lineage-row">
                    <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
                    <span className="lineage-id">{tribeName(lid)}</span>
                    <span className="lineage-count">{info.count}</span>
                    <span className="lineage-gen">
                      g{info.minGen}{info.maxGen > info.minGen ? `–${info.maxGen}` : ''}
                    </span>
                    <span className="lineage-strat">
                      {lineageWord(info.orgs, 'home') || lineageWord(info.orgs, 'food') || ''}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
