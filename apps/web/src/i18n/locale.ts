// The language the interface is shown in. It is read once at startup (like the
// low-performance mode), so text built at module load — tables, painters, the
// tour — is in the right language without subscribing to anything; changing it
// reloads the app safely (see chooseLocale).

export type Locale = 'ru' | 'en'

export const LOCALES: readonly Locale[] = ['ru', 'en']

/** This fork is the Russian edition: Russian unless the player picked English. */
export const DEFAULT_LOCALE: Locale = 'ru'

export const LOCALE_STORAGE_KEY = 'thb-locale'

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en'
}

export function readStoredLocale(): Locale | null {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    return null
  }
}

function detectLocale(): Locale {
  // The test suite asserts on the English text.
  if (import.meta.env.MODE === 'test') return 'en'
  return readStoredLocale() ?? DEFAULT_LOCALE
}

let current: Locale = detectLocale()

export function getLocale(): Locale {
  return current
}

/** BCP 47 tag for Intl and the document's lang attribute. */
export function localeTag(locale: Locale = current): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US'
}

/** Tests only: switch the language without a reload. */
export function setLocaleForTests(locale: Locale) {
  current = locale
}

/** Marks the page with its language so the browser picks the right hyphenation, fonts and voice. */
export function applyDocumentLocale() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = current
}
