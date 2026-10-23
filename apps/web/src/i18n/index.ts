/**
 * Interface translations.
 *
 * Every language is one JSON file in `./locales`, named by its BCP 47 code
 * (`es.json`, `pt-BR.json`). Dropping a new file there is all it takes to add
 * a language: the file is found at build time, offered in Settings, and loaded
 * only when chosen. `en.json` is the source every other file follows; a key a
 * translation lacks falls back to English.
 *
 * Only the interface is translated. Names, invented languages and everything
 * the simulation writes (thoughts, chronicles, event text) stay as they are.
 *
 * Call `t()` while rendering, never at module scope: the chosen language is
 * loaded before the app first renders, and changing it reloads the page, so a
 * render-time call always sees the right language.
 */
import en from './locales/en.json'

export type Messages = { [key: string]: string | Messages }

/** A plural form: `{ "one": "{count} person", "other": "{count} people" }`. */
type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends PluralForms
      ? `${P}${K}`
      : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

/** Every key `en.json` defines, so a typo fails the type check. */
export type MessageKey = Leaves<typeof en>

export type Vars = Record<string, string | number>

export const SOURCE_LOCALE = 'en'
const STORAGE_KEY = 'thb-locale'
const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur'])

const loaders = import.meta.glob<{ default: Messages }>(['./locales/*.json', '!./locales/en.json'])

function codeFromPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.json'.length)
}

const loaderByCode = new Map(Object.entries(loaders).map(([path, load]) => [codeFromPath(path), load]))

/** Every language a file exists for, English first, the rest by code. */
export const LOCALES: readonly string[] = [SOURCE_LOCALE, ...[...loaderByCode.keys()].sort()]

let active = SOURCE_LOCALE
let messages: Messages = en
let pluralRules = new Intl.PluralRules(SOURCE_LOCALE)

/** The language's own name for itself, e.g. "Español" for `es`. */
export function nativeName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code)
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
  } catch {
    // An engine without DisplayNames data for the code falls through.
  }
  return code
}

/** The best shipped locale for a list of preferred tags, or null. */
export function matchLocale(
  preferred: readonly string[],
  available: readonly string[] = LOCALES,
): string | null {
  const byLower = new Map(available.map((code) => [code.toLowerCase(), code]))
  for (const tag of preferred) {
    const exact = byLower.get(tag.toLowerCase())
    if (exact) return exact
    const base = tag.split('-')[0].toLowerCase()
    const sameBase = byLower.get(base) ?? available.find((code) => code.toLowerCase().split('-')[0] === base)
    if (sameBase) return sameBase
  }
  return null
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The language to start in: the saved choice, else the browser's, else English. */
export function preferredLocale(): string {
  const saved = readSaved()
  if (saved && LOCALES.includes(saved)) return saved
  const browser = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return matchLocale(browser) ?? SOURCE_LOCALE
}

export function getLocale(): string {
  return active
}

function applyToDocument(code: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code
  document.documentElement.dir = RTL_LANGUAGES.has(code.split('-')[0]) ? 'rtl' : 'ltr'
}

/** Make `code` the active language. Unknown codes and failed loads keep English. */
export async function loadLocale(code: string): Promise<string> {
  const load = loaderByCode.get(code)
  let next: Messages = en
  let chosen = SOURCE_LOCALE
  if (load) {
    try {
      next = (await load()).default
      chosen = code
    } catch {
      // A missing chunk (offline, stale cache) leaves the game in English.
    }
  }
  active = chosen
  messages = next
  pluralRules = new Intl.PluralRules(chosen)
  applyToDocument(chosen)
  return chosen
}

/** Load the preferred language. Settles within `timeoutMs` so a slow chunk never blocks start-up. */
export async function initI18n(timeoutMs = 4000): Promise<string> {
  const wanted = preferredLocale()
  if (wanted === SOURCE_LOCALE) {
    applyToDocument(SOURCE_LOCALE)
    return SOURCE_LOCALE
  }
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(active), timeoutMs))
  return Promise.race([loadLocale(wanted), timeout])
}

/** Remember the player's choice. The caller reloads the page to apply it. */
export function saveLocale(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Private mode: the choice lasts until the reload only.
  }
}

function lookup(table: Messages, key: string): string | Messages | undefined {
  let node: string | Messages | undefined = table
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined
    node = node[part]
  }
  return node
}

function isPlural(node: string | Messages | undefined): node is PluralForms {
  return typeof node === 'object' && typeof node.other === 'string'
}

function pick(
  table: Messages,
  key: string,
  vars: Vars | undefined,
  rules: Intl.PluralRules,
): string | undefined {
  const node = lookup(table, key)
  if (typeof node === 'string') return node
  if (isPlural(node)) {
    const count = Number(vars?.count ?? 0)
    return node[rules.select(count)] ?? node.other
  }
  return undefined
}

function interpolate(text: string, vars: Vars | undefined): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

/** The interface text for `key` in the active language, with `{name}` placeholders filled. */
export function t(key: MessageKey, vars?: Vars): string {
  const text =
    pick(messages, key, vars, pluralRules) ?? pick(en, key, vars, new Intl.PluralRules(SOURCE_LOCALE)) ?? key
  return interpolate(text, vars)
}

/** Format a number the way the active language writes it. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(active, options)
}

/** Format a date and time the way the active language writes it. */
export function formatDateTime(value: number | Date): string {
  return new Date(value).toLocaleString(active)
}
