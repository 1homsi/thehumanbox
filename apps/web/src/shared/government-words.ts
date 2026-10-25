import { hasMessage, t, type MessageKey } from '../i18n'

/** A form of government in the active language, e.g. "monarchy" is "Monarchie" in German. */
export function governmentWord(kind: string): string {
  const key = `model.words.government.${kind}`
  return hasMessage(key) ? t(key as MessageKey) : kind.replace(/[-_]/g, ' ')
}
