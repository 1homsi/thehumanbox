import { useState, useSyncExternalStore } from 'react'
import { useVersionCheck } from '../../shared/hooks/useVersionCheck'
import { staleBuildCount, subscribeStaleBuild } from '../../shared/staleBuild'
import { reloadAppSafely } from '../../simulation/worldSource'
import { t } from '../../i18n'

export function UpdateToast() {
  const { newVersionAvailable } = useVersionCheck()
  const staleCount = useSyncExternalStore(subscribeStaleBuild, staleBuildCount, () => 0)
  const [dismissedVersion, setDismissedVersion] = useState(false)
  const [dismissedStale, setDismissedStale] = useState(0)
  const [reloading, setReloading] = useState(false)

  const stale = staleCount > dismissedStale
  if (!stale && (!newVersionAvailable || dismissedVersion)) return null

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

  const dismiss = () => {
    setDismissedVersion(true)
    setDismissedStale(staleCount)
  }

  return (
    <div className="update-toast" role={stale ? 'alert' : 'status'} aria-live="polite">
      <div className="update-toast__icon" aria-hidden="true">
        ⤴
      </div>
      <div className="update-toast__body">
        <div className="update-toast__title">
          {stale ? t('dialogs.toast.staleBuild') : t('dialogs.toast.newVersion')}
        </div>
        <div className="update-toast__sub">
          {stale ? t('dialogs.toast.staleBuildSub') : t('dialogs.toast.newVersionSub')}
        </div>
      </div>
      <button type="button" className="update-toast__cta" onClick={reload} disabled={reloading} autoFocus>
        {reloading ? t('dialogs.toast.refreshing') : t('dialogs.toast.refresh')}
      </button>
      <button
        type="button"
        className="update-toast__close"
        onClick={dismiss}
        aria-label={t('dialogs.toast.dismiss')}
      >
        ×
      </button>
    </div>
  )
}
