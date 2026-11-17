import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { OrganismState, WorldState } from '../../shared/types'
import { personName } from '../../shared/personName'
import { useUIStore } from '../../state/store'
import { t } from '../../i18n'
import { OrgDetail } from './OrgDetail'

function editingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (!!el.closest?.('input, textarea, select') || el.isContentEditable === true)
}

export function PersonDrawer({ org, world }: { org: OrganismState; world: WorldState }) {
  const panelOpen = useUIStore((s) => s.panelOpen)
  const following = useUIStore((s) => s.followOrgId === org.id)
  const selectOrg = useUIStore((s) => s.selectOrg)
  const followOrg = useUIStore((s) => s.followOrg)
  const scroller = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || editingText(event.target)) return
      if (document.querySelector('.thb-modal')) return
      useUIStore.getState().selectOrg(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 })
  }, [org.id])

  return (
    <aside
      ref={scroller}
      className={clsx('person-drawer', panelOpen && 'beside-list')}
      aria-label={t('person.sheet.aria', { name: personName(org) })}
      data-person-id={org.id}
    >
      <OrgDetail
        org={org}
        onClose={() => selectOrg(null)}
        onFollow={followOrg}
        following={following}
        lineageNames={world.lineage_names}
        organisms={world.organisms}
        religions={world.religions}
        onSelectOrg={(id) => selectOrg(id)}
      />
    </aside>
  )
}
