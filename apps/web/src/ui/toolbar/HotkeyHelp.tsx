import { useEffect } from 'react'
import { SHORTCUT_HELP, typingTarget } from '../../game/model/shortcuts'

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
    <div className="hotkey-help" role="dialog" aria-label="keyboard shortcuts" onClick={onClose}>
      <div className="hotkey-help-card" onClick={(e) => e.stopPropagation()}>
        <div className="hotkey-help-title">keys</div>
        <dl className="hotkey-help-list">
          {SHORTCUT_HELP.map(([keys, what]) => (
            <div key={keys} className="hotkey-help-row">
              <dt>{keys}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="hotkey-help-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
