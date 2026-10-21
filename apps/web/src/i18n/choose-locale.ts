import { reloadAppSafely } from '../simulation/worldSource'
import { t } from '.'
import { getLocale, LOCALE_STORAGE_KEY, readStoredLocale, type Locale } from './locale'

/** Switch the interface language. It is read at startup, so this saves the world and reloads. */
export function chooseLocale(locale: Locale) {
  if (locale === getLocale()) return
  const previous = readStoredLocale()
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    return
  }
  reloadAppSafely({
    onFailure: () => {
      try {
        if (previous) window.localStorage.setItem(LOCALE_STORAGE_KEY, previous)
        else window.localStorage.removeItem(LOCALE_STORAGE_KEY)
      } catch {
        /* keep the current language if storage became unavailable */
      }
    },
    failureMessage: t('settings.language.failed'),
  })
}
