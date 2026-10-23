import { useState, type ReactNode } from 'react'
import { canUseFullscreen } from '../../shared/fullscreen'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { useUIStore } from '../../state/store'
import { Modal } from '../modals/Modal'
import { MoreDropdown } from './MoreDropdown'
import { ToolSprite } from './ToolSprite'
import { saveBlocked, phoneSaveLabel, type WorldActions } from './world-actions'
import { t } from '../../i18n'

interface Props {
  /** Chronicle entries so far, shown as a count like the desktop button. */
  chronicleCount: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
  /** Find a tool and save the world, which live here on a phone rather than on the dock. */
  worldActions?: WorldActions
}

/**
 * The header's action row does not fit a phone, so it is hidden there; this sheet carries
 * everything it held (plus the panels and the view options). The button is always rendered and
 * only shown by the phone breakpoint in CSS, so the two can never disagree about what a phone is.
 */
export function PhoneMenu({ chronicleCount, isFullscreen, onToggleFullscreen, worldActions }: Props) {
  const [open, setOpen] = useState(false)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const panelOpen = useUIStore((s) => s.panelOpen)
  const openStats = useUIStore((s) => s.openStats)
  const openCiv = useUIStore((s) => s.openCiv)
  const openOrgSearch = useUIStore((s) => s.openOrgSearch)
  const openChronicles = useUIStore((s) => s.openChronicles)
  const openSettings = useUIStore((s) => s.openDesktopSettings)
  const openAbout = useUIStore((s) => s.openAbout)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const togglePanel = useUIStore((s) => s.togglePanel)

  const close = () => setOpen(false)
  /** Closes the sheet, then does the thing, so a modal never opens on top of the menu. */
  const run = (fn: () => void) => () => {
    close()
    fn()
  }
  const openRepo = () => {
    trackEvent('star_link_clicked', { source: 'phone_menu' })
    window.open(REPO_URL, '_blank', 'noopener,noreferrer')
  }
  const canFullscreen = canUseFullscreen()

  const row = (icon: string, label: string, onClick: () => void, extra?: ReactNode, pressed?: boolean) => (
    <button
      type="button"
      className="phone-menu-row"
      onClick={run(onClick)}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
    >
      <ToolSprite icon={icon} size={20} />
      <span className="phone-menu-label">{label}</span>
      {extra}
    </button>
  )

  return (
    <>
      <button
        type="button"
        className="hdr-btn phone-menu-btn"
        aria-label={t('dock.phone.menu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ToolSprite icon="☰" size={18} />
      </button>
      <Modal open={open} onClose={close} className="phone-menu-modal" title={t('dock.phone.menu')} hideTitle>
        <div className="phone-menu-head">
          <span className="phone-menu-title">{t('dock.phone.menuHead')}</span>
          <button
            type="button"
            className="phone-menu-close"
            aria-label={t('dock.phone.closeMenu')}
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className="phone-menu-body">
          {(worldActions?.findTool || worldActions?.save) && (
            <div className="phone-menu-list phone-menu-world">
              {worldActions.findTool && row('🔍', t('dock.phone.findTool'), worldActions.findTool)}
              {worldActions.save && (
                <button
                  type="button"
                  className="phone-menu-row phone-menu-save"
                  // Saving keeps the sheet open, so the status below the label can be read.
                  onClick={worldActions.save.onSave}
                  disabled={saveBlocked(worldActions.save)}
                  aria-busy={worldActions.save.busy}
                >
                  <ToolSprite icon="💾" size={20} />
                  <span className="phone-menu-label">
                    {phoneSaveLabel(worldActions.save)}
                    {worldActions.save.status && (
                      <small className="phone-menu-status" role="status">
                        {worldActions.save.status}
                      </small>
                    )}
                  </span>
                </button>
              )}
            </div>
          )}
          <div className="phone-menu-list">
            {row('📊', t('dock.phone.stats'), openStats)}
            {row('👑', t('dock.phone.civilization'), openCiv)}
            {row('🔍', t('dock.phone.findPeople'), openOrgSearch)}
            {row(
              '📖',
              t('dock.phone.chronicles'),
              openChronicles,
              chronicleCount > 0 ? <span className="btn-count">{chronicleCount}</span> : null,
            )}
            {row('◧', t('dock.phone.worldPanel'), toggleLeft, null, leftOpen)}
            {row('◨', t('dock.phone.peoplePanel'), togglePanel, null, panelOpen)}
            {row('⚙️', t('dock.phone.settings'), openSettings)}
            {row('🌼', t('dock.phone.about'), openAbout)}
            {row('⭐', t('dock.phone.starOnGithub'), openRepo)}
            {canFullscreen &&
              row(
                '⛶',
                isFullscreen ? t('dock.phone.exitFullscreen') : t('dock.phone.fullscreen'),
                onToggleFullscreen,
              )}
          </div>
          <div className="phone-menu-section">{t('dock.phone.view')}</div>
          <MoreDropdown onAction={close} />
        </div>
      </Modal>
    </>
  )
}
