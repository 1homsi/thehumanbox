import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Modal } from './LazyModal'
import { currentConfirm, settleConfirm, subscribeConfirm } from '../../shared/confirm'
import { t } from '../../i18n'

/** Renders the dialog requested through `askConfirm` or `showNotice`. Mount once near the app root. */
export function ConfirmHost() {
  const current = useSyncExternalStore(subscribeConfirm, currentConfirm, () => null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // A new question can replace an open one while the same buttons stay mounted, and autoFocus only
  // applies on mount. So focus follows the question: Cancel for a destructive one, confirm otherwise.
  useEffect(() => {
    if (!current) return
    const target = current.danger ? cancelRef.current : confirmRef.current
    target?.focus()
  }, [current])
  if (!current) return null
  return (
    <Modal open onClose={() => settleConfirm(false)} className="confirm-modal" title={current.title}>
      {current.body && (
        <div className="confirm-body">
          {current.body.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      )}
      <div className="confirm-actions">
        {!current.notice && (
          <button
            ref={cancelRef}
            className="lang-btn"
            onClick={() => settleConfirm(false)}
            autoFocus={!!current.danger}
          >
            {current.cancelLabel ?? t('dialogs.confirm.cancel')}
          </button>
        )}
        {/* A destructive question starts on Cancel: a reflex Enter must not delete anything. */}
        <button
          ref={confirmRef}
          className={`lang-btn ${current.danger ? 'danger' : 'primary'}`}
          onClick={() => settleConfirm(true)}
          autoFocus={!current.danger}
        >
          {current.confirmLabel ?? t('dialogs.confirm.confirm')}
        </button>
      </div>
    </Modal>
  )
}
