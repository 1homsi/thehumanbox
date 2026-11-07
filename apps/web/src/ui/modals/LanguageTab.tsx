import { t } from '../../i18n'
import { REPO_URL } from '../../shared/links'
import { LanguageSelect } from './LanguageSelect'
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
      <LanguageSelect
        value={current}
        pending={pending}
        label={t('settings.language.title')}
        onChoose={choose}
      />
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
