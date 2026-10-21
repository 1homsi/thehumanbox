import { useState, type ReactNode } from 'react'
import { canUseFullscreen } from '../../shared/fullscreen'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { useUIStore } from '../../state/store'
import { Modal } from '../modals/Modal'
import { MoreDropdown } from './MoreDropdown'
import { ToolSprite } from './ToolSprite'
import { saveBlocked, saveLabel, type WorldActions } from './world-actions'

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
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ToolSprite icon="☰" size={18} />
      </button>
      <Modal open={open} onClose={close} className="phone-menu-modal" title="Menu" hideTitle>
        <div className="phone-menu-head">
          <span className="phone-menu-title">menu</span>
          <button type="button" className="phone-menu-close" aria-label="Close menu" onClick={close}>
            ×
          </button>
        </div>
        <div className="phone-menu-body">
          {(worldActions?.findTool || worldActions?.save) && (
            <div className="phone-menu-list phone-menu-world">
              {worldActions.findTool && row('🔍', 'find a tool', worldActions.findTool)}
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
                    {saveLabel(worldActions.save).toLowerCase()}
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
            {row('📊', 'stats', openStats)}
            {row('👑', 'civilization', openCiv)}
            {row('🔍', 'find people', openOrgSearch)}
            {row(
              '📖',
              'chronicles',
              openChronicles,
              chronicleCount > 0 ? <span className="btn-count">{chronicleCount}</span> : null,
            )}
            {row('◧', 'world panel', toggleLeft, null, leftOpen)}
            {row('◨', 'people panel', togglePanel, null, panelOpen)}
            {row('⚙️', 'settings', openSettings)}
            {row('🌼', 'about', openAbout)}
            {row('⭐', 'star on GitHub', openRepo)}
            {canFullscreen && row('⛶', isFullscreen ? 'exit fullscreen' : 'fullscreen', onToggleFullscreen)}
          </div>
          <div className="phone-menu-section">view</div>
          <MoreDropdown onAction={close} />
        </div>
      </Modal>
    </>
  )
}
