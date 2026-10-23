import { useState } from 'react'
import clsx from 'clsx'
import { getLocale, LOCALES, nativeName, saveLocale, t } from '../../i18n'
import { reloadAppSafely } from '../../simulation/worldSource'
import { REPO_URL } from '../../shared/links'

/** The interface language picker. Choosing one saves the world and reloads the game in it. */
export function LanguageTab() {
  const current = getLocale()
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<'reload' | 'storage' | null>(null)

  function choose(code: string) {
    if (code === current || pending) return
    const previous = current
    setFailed(null)
    // Without storage the reload would come back in the old language.
    if (!saveLocale(code)) {
      setFailed('storage')
      return
    }
    setPending(code)
    reloadAppSafely({
      onFailure: () => {
        // If the old choice cannot be put back either, say so: the next visit would open in the new one.
        const restored = saveLocale(previous)
        setPending(null)
        setFailed(restored ? 'reload' : 'storage')
      },
      failureMessage: t('settings.language.failed'),
    })
  }

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
          {failed === 'storage' ? t('settings.language.storageFailed') : t('settings.language.failed')}
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
