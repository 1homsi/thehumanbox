import clsx from 'clsx'
import { LOCALES, nativeName, t } from '../../i18n'
import { REPO_URL } from '../../shared/links'
import { languageFailureText, useLanguageChoice } from './useLanguageChoice'

/** The interface language picker. Choosing one saves the world and reloads the game in it. */
export function LanguageTab() {
  const { current, pending, failed, choose } = useLanguageChoice()

  return (
    <>
      <div className="settings-row settings-row-stacked">
        <div className="settings-row-text">
          <div className="settings-row-title">{t('settings.language.title')}</div>
          <div className="settings-row-desc">{t('settings.language.desc')}</div>
        </div>
      </div>
      <div className="settings-languages" role="radiogroup" aria-label={t('settings.language.title')}>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            lang={code}
            aria-checked={code === current}
            className={clsx('lang-btn', code === (pending ?? current) && 'active')}
            disabled={!!pending}
            onClick={() => choose(code)}
          >
            {nativeName(code)}
          </button>
        ))}
      </div>
      {failed && (
        <div className="settings-note" role="alert">
          {languageFailureText(failed)}
        </div>
      )}
      <div className="settings-note">
        <a href={`${REPO_URL}/tree/main/apps/web/src/i18n`} target="_blank" rel="noreferrer">
          {t('settings.language.contribute')}
        </a>
      </div>
    </>
  )
}
