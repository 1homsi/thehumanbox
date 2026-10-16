import { useState, type ReactNode } from 'react'
import { useUIStore } from '../../state/store'
import { Modal } from '../modals/Modal'
import { MoreDropdown } from './MoreDropdown'
import { ToolSprite } from './ToolSprite'

interface Props {
  /** Chronicle entries so far, shown as a count like the desktop button. */
  chronicleCount: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

/**
 * The header's action row does not fit a phone, so it is hidden there; this sheet carries
 * everything it held (plus the panels and the view options). The button is always rendered and
 * only shown by the phone breakpoint in CSS, so the two can never disagree about what a phone is.
 */
export function PhoneMenu({ chronicleCount, isFullscreen, onToggleFullscreen }: Props) {
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
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

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
            {canFullscreen && row('⛶', isFullscreen ? 'exit fullscreen' : 'fullscreen', onToggleFullscreen)}
          </div>
          <div className="phone-menu-section">view</div>
          <MoreDropdown onAction={close} />
        </div>
      </Modal>
    </>
  )
}
