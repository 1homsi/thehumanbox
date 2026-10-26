import { useState } from 'react'
import { getLocale, saveLocale, t } from '../../i18n'
import { reloadAppSafely } from '../../simulation/worldSource'
import { trackEvent } from '../../shared/observability'

export type LanguageChoiceFailure = 'reload' | 'storage'

/**
 * The interface language picker's state and action, shared by Settings and the first-launch card.
 * Choosing a language saves it, then saves the world and reloads the game in that language.
 */
export function useLanguageChoice() {
  const current = getLocale()
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<LanguageChoiceFailure | null>(null)

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
    trackEvent('language_change', { from: previous, to: code }, { send_instantly: true })
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

  return { current, pending, failed, choose }
}

/** The message for a failed language change. */
export function languageFailureText(failed: LanguageChoiceFailure): string {
  return failed === 'storage' ? t('settings.language.storageFailed') : t('settings.language.failed')
}
