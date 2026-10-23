import { useSyncExternalStore } from 'react'
import { Modal } from './LazyModal'
import { currentConfirm, settleConfirm, subscribeConfirm } from '../../shared/confirm'
import { t } from '../../i18n'

/** Renders the dialog requested through `askConfirm` or `showNotice`. Mount once near the app root. */
export function ConfirmHost() {
  const current = useSyncExternalStore(subscribeConfirm, currentConfirm, () => null)
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
          <button className="lang-btn" onClick={() => settleConfirm(false)}>
            {current.cancelLabel ?? t('dialogs.confirm.cancel')}
          </button>
        )}
        <button
          className={`lang-btn ${current.danger ? 'danger' : 'primary'}`}
          onClick={() => settleConfirm(true)}
          autoFocus
        >
          {current.confirmLabel ?? t('dialogs.confirm.confirm')}
        </button>
      </div>
    </Modal>
  )
}
