import { useState } from 'react'
import { useVersionCheck } from '../../shared/hooks/useVersionCheck'
import { reloadAppSafely } from '../../simulation/worldSource'
import { t } from '../../i18n'

export function UpdateToast() {
  const { newVersionAvailable } = useVersionCheck()
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)

  if (!newVersionAvailable || dismissed) return null

  const reload = () => {
    setReloading(true)
    window.setTimeout(
      () =>
        reloadAppSafely({
          onFailure: () => setReloading(false),
          failureMessage: t('dialogs.toast.checkpointFailed'),
        }),
      80,
    )
  }

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <div className="update-toast__icon" aria-hidden="true">
        ⤴
      </div>
      <div className="update-toast__body">
        <div className="update-toast__title">{t('dialogs.toast.newVersion')}</div>
        <div className="update-toast__sub">{t('dialogs.toast.newVersionSub')}</div>
      </div>
      <button type="button" className="update-toast__cta" onClick={reload} disabled={reloading} autoFocus>
        {reloading ? t('dialogs.toast.refreshing') : t('dialogs.toast.refresh')}
      </button>
      <button
        type="button"
        className="update-toast__close"
        onClick={() => setDismissed(true)}
        aria-label={t('dialogs.toast.dismiss')}
      >
        ×
      </button>
    </div>
  )
}
