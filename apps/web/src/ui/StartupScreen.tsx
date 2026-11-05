import { t } from '../i18n'
import { reloadAppSafely } from '../simulation/worldSource'

interface Props {
  /** The local world could not start: show the failure and a retry instead of the spinner. */
  failed: boolean
  /** The desktop app, which runs the native simulation instead of the WebAssembly one. */
  desktop: boolean
  /** The worker's own error, shown under the translated line when the start failed. */
  detail?: string
}

/** What shows behind the splash while the world starts, and in its place if the start fails. */
export function StartupScreen({ failed, desktop, detail }: Props) {
  return (
    <div className="waiting">
      {!failed && <div className="waiting-spinner" aria-hidden="true" />}
      <div className="waiting-title">
        {failed ? t('common.startup.failedTitle') : t('common.startup.title')}
      </div>
      <div className="waiting-sub">
        {failed
          ? t('common.startup.failed')
          : desktop
            ? t('common.startup.desktop')
            : t('common.startup.web')}
      </div>
      {/* The worker's own words, untranslated: technical, and what a bug report needs. */}
      {failed && detail && <div className="waiting-detail">{detail}</div>}
      {failed && (
        <button className="lang-btn" onClick={() => reloadAppSafely()}>
          {t('common.startup.retry')}
        </button>
      )}
    </div>
  )
}
