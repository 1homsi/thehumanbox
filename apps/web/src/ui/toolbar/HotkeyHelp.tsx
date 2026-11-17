import { useEffect } from 'react'
import { SHORTCUT_HELP, typingTarget } from '../../game/model/shortcuts'
import { t } from '../../i18n'
import { Modal } from '../modals/LazyModal'
import { shortcutKeys, shortcutWhat } from './shortcut-text'

/** The keys the game answers to, from the same list the More menu shows. Press ? or Escape to close it. */
export function HotkeyHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      // App's game-key handler toggles the list on ? (and closes it); both acting on one press reopened it.
      // Only when focus is inside the list, where that handler stands aside, does this close it.
      else if (event.key === '?' && typingTarget(event.target)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Modal open onClose={onClose} className="hotkey-help-modal" title={t('dock.keys.aria')} hideTitle>
      <div className="lang-modal-header thb-modal-header">
        <span className="lang-modal-title thb-modal-title">{t('dock.keys.title')}</span>
        <button
          type="button"
          className="close-btn thb-modal-close hotkey-help-close"
          aria-label={t('dock.keys.close')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="thb-modal-body">
        <dl className="hotkey-help-list">
          {SHORTCUT_HELP.map(([keys, what]) => (
            <div key={keys} className="hotkey-help-row">
              <dt>{shortcutKeys(keys)}</dt>
              <dd>{shortcutWhat(keys, what)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  )
}
