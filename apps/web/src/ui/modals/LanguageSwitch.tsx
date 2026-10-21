import clsx from 'clsx'
import { getLocale, LOCALES, type Locale } from '../../i18n'
import { chooseLocale } from '../../i18n/choose-locale'

/** Each language is named in itself, so it can be found whatever the interface is in. */
const LANGUAGE_NAMES: Record<Locale, string> = { ru: 'Русский', en: 'English' }

export function LanguageSwitch() {
  const current = getLocale()
  return (
    <div className="language-switch" role="group">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          className={clsx('lang-btn', locale === current && 'active')}
          aria-pressed={locale === current}
          onClick={() => chooseLocale(locale)}
        >
          {LANGUAGE_NAMES[locale]}
        </button>
      ))}
    </div>
  )
}
