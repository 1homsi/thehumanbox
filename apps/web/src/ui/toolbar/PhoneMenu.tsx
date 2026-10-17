import { useUIStore } from '../../state/store'
import { Modal } from '../modals/Modal'
import { MoreDropdown } from './MoreDropdown'
import { ToolSprite } from './ToolSprite'
import './phone-menu.css'

interface Props {
  open: boolean
  onClose: () => void
  onFullscreen: () => void
  isFullscreen: boolean
}

/**
 * The phone's only route to the header chrome. On a phone (<= 767 px) the whole
 * action row, the panel toggles and the fullscreen button are hidden, and the
 * command palette needs a keyboard, so this sheet brings them back behind one
 * 44 px button: the panels, the modals, the dock panels and the view options
 * that otherwise live in the "more" dropdown.
 */
export function PhoneMenu({ open, onClose, onFullscreen, isFullscreen }: Props) {
  const openStats = useUIStore((s) => s.openStats)
  const openCiv = useUIStore((s) => s.openCiv)
  const openOrgSearch = useUIStore((s) => s.openOrgSearch)
  const openChronicles = useUIStore((s) => s.openChronicles)
  const openSettings = useUIStore((s) => s.openDesktopSettings)
  const openAbout = useUIStore((s) => s.openAbout)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const togglePanel = useUIStore((s) => s.togglePanel)
  const panelOpen = useUIStore((s) => s.panelOpen)

  // Close the sheet first so the opener's modal is never nested inside it.
  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <Modal open={open} onClose={onClose} className="phone-menu-modal" title="Menu" hideTitle>
      <div className="phone-menu">
        <div className="phone-menu-head">menu</div>
        <div className="phone-menu-grid">
          <button type="button" className="phone-menu-item" onClick={go(openStats)}>
            <ToolSprite icon="📊" size={16} />
            stats
          </button>
          <button type="button" className="phone-menu-item" onClick={go(openCiv)}>
            <ToolSprite icon="👑" size={16} />
            civ
          </button>
          <button type="button" className="phone-menu-item" onClick={go(openOrgSearch)}>
            <ToolSprite icon="🔍" size={16} />
            search
          </button>
          <button type="button" className="phone-menu-item" onClick={go(openChronicles)}>
            <ToolSprite icon="📖" size={16} />
            chronicles
          </button>
        </div>
        <div className="phone-menu-divider" />
        <div className="phone-menu-grid">
          <button
            type="button"
            className={`phone-menu-item${leftOpen ? ' active' : ''}`}
            aria-pressed={leftOpen}
            onClick={go(toggleLeft)}
          >
            <span aria-hidden="true">◧</span>world panel
          </button>
          <button
            type="button"
            className={`phone-menu-item${panelOpen ? ' active' : ''}`}
            aria-pressed={panelOpen}
            onClick={go(togglePanel)}
          >
            <span aria-hidden="true">◨</span>people panel
          </button>
        </div>
        <div className="phone-menu-divider" />
        <div className="phone-menu-grid">
          <button type="button" className="phone-menu-item" onClick={go(openSettings)}>
            <ToolSprite icon="⚙️" size={16} />
            settings
          </button>
          <button type="button" className="phone-menu-item" onClick={go(openAbout)}>
            <span aria-hidden="true">❔</span>about
          </button>
          <button
            type="button"
            className={`phone-menu-item${isFullscreen ? ' active' : ''}`}
            onClick={onFullscreen}
          >
            <span aria-hidden="true">⛶</span>
            {isFullscreen ? 'exit full' : 'fullscreen'}
          </button>
        </div>
        <div className="phone-menu-divider" />
        <div className="phone-menu-section">view options</div>
        <div className="phone-menu-more">
          <MoreDropdown />
        </div>
        <div className="phone-menu-divider" />
        <div className="phone-menu-section">touch</div>
        <ul className="phone-menu-tips">
          <li>drag to pan, pinch to zoom</li>
          <li>tap a person to open them</li>
          <li>hold a dock tile to read what it does</li>
        </ul>
      </div>
    </Modal>
  )
}
