import { t } from '../../i18n'
import type { UpdateCheckResult } from '../../shared/desktop'

/** One short line describing an update check's result. */
export function updateCheckMessage(result: UpdateCheckResult | null): string {
  if (!result) return ''
  if (result.status === 'checking') return t('updates.checking')
  if (result.status === 'available')
    return result.version
      ? t('updates.availableVersion', { version: result.version })
      : t('updates.available')
  if (result.status === 'downloaded')
    return result.version ? t('updates.readyVersion', { version: result.version }) : t('updates.ready')
  if (result.status === 'up-to-date') return t('updates.upToDate')
  if (result.status === 'unsupported') return result.message ?? t('updates.packagedOnly')
  return result.message ?? t('updates.failed')
}
