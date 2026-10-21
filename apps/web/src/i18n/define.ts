/** Plural forms by Intl.PluralRules category. English uses one/other; Russian one/few/many (and other for fractions). */
export interface PluralForms {
  one?: string
  few?: string
  many?: string
  other: string
}

export type Message = string | PluralForms

/** The Russian catalog must have every English key, with a plural where English has one. */
export type Translation<E extends Record<string, Message>> = {
  [K in keyof E]: E[K] extends string ? string : PluralForms
}

/**
 * One area of the interface: English (the source) and Russian side by side, so a
 * reviewer reads each pair together and a missing translation fails to compile.
 */
export function defineMessages<const E extends Record<string, Message>>(
  en: E,
  ru: Translation<E>,
): { en: E; ru: Translation<E> } {
  return { en, ru }
}
