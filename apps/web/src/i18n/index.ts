/**
 * Interface translations.
 *
 * Every language is a folder in `./locales`, named by its BCP 47 code (`es`,
 * `pt-BR`), holding one JSON file per area of the interface (`settings.json`,
 * `dock.json`). Adding a folder is all it takes to add a language: it is found
 * at build time, offered in Settings, and loaded only when chosen. English
 * (`locales/en`) is the source every other folder follows; a key a translation
 * lacks falls back to English.
 *
 * Only the interface is translated. Names, invented languages and everything
 * the simulation writes (thoughts, chronicles, event text) stay as they are.
 *
 * Call `t()` while rendering, never at module scope: the chosen language is
 * loaded before the app first renders, and changing it reloads the page, so a
 * render-time call always sees the right language.
 */
import en from './locales/en'

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

const areaLoaders = import.meta.glob<{ default: Messages }>(['./locales/*/*.json', '!./locales/en/*.json'])

/** `./locales/es/settings.json` → `['es', 'settings']`. */
function splitPath(path: string): [string, string] {
  const [code, file] = path.split('/').slice(-2)
  return [code, file.slice(0, -'.json'.length)]
}

type AreaLoader = () => Promise<{ default: Messages }>
const loaderByCode = new Map<string, [string, AreaLoader][]>()
for (const [path, load] of Object.entries(areaLoaders)) {
  const [code, area] = splitPath(path)
  loaderByCode.set(code, [...(loaderByCode.get(code) ?? []), [area, load]])
}

/** Every area file of one language, merged under its area's name. */
async function loadAreas(areas: [string, AreaLoader][]): Promise<Messages> {
  const loaded = await Promise.all(areas.map(async ([area, load]) => [area, (await load()).default] as const))
  return Object.fromEntries(loaded)
}

/** Every language a file exists for, English first, the rest by code. */
export const LOCALES: readonly string[] = [SOURCE_LOCALE, ...[...loaderByCode.keys()].sort()]

let active = SOURCE_LOCALE
let messages: Messages = en as Messages
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

/**
 * A language tag as browsers and operating systems write it, reduced to the form matched below:
 * `en-US`, `en_US` and `en_US.UTF-8` all give `en-US`. Null for an entry that names no language
 * (`C`, `POSIX`, an empty or non-text value), which the matcher skips.
 */
function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const tag = raw.trim().split(/[.@]/)[0].replace(/_/g, '-')
  if (!tag || tag.toUpperCase() === 'C' || tag.toUpperCase() === 'POSIX') return null
  return tag
}

/**
 * The first preferred tag the game ships a language for, or null. An exact tag wins over the same
 * language in another region (`pt-PT` gives `pt-BR` only when no `pt-PT` ships), and the list's order
 * decides between languages: the browser's first preferred language that the game has wins.
 */
export function matchLocale(
  preferred: readonly unknown[],
  available: readonly string[] = LOCALES,
): string | null {
  const byLower = new Map(available.map((code) => [code.toLowerCase(), code]))
  for (const raw of preferred) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    const lower = tag.toLowerCase()
    const exact = byLower.get(lower)
    if (exact) return exact
    const base = lower.split('-')[0]
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

/** The languages the browser asks for, most preferred first. */
function browserLanguages(): readonly unknown[] {
  if (typeof navigator === 'undefined') return []
  const list: unknown = navigator.languages
  return Array.isArray(list) && list.length > 0 ? list : [navigator.language]
}

/**
 * The language the browser's own list asks for first that the game ships, or null when it asks for
 * none of them. Ignores a saved choice, so the first-launch card can show what the browser asked for;
 * English as the fallback is `preferredLocale`'s business, not a detection.
 */
export function detectedLocale(): string | null {
  return matchLocale(browserLanguages())
}

/** The language to start in: the saved choice, else the browser's, else English. */
export function preferredLocale(): string {
  const saved = readSaved()
  if (saved && LOCALES.includes(saved)) return saved
  return detectedLocale() ?? SOURCE_LOCALE
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
/** Bumped by every load and by a start-up timeout; a load that finishes after it was overtaken changes nothing. */
let loadGeneration = 0

export async function loadLocale(code: string): Promise<string> {
  const generation = ++loadGeneration
  const areas = loaderByCode.get(code)
  let next: Messages = en as Messages
  let chosen = SOURCE_LOCALE
  if (areas) {
    try {
      next = await loadAreas(areas)
      chosen = code
    } catch {
      // A missing chunk (offline, stale cache) leaves the game in English.
    }
  }
  if (generation !== loadGeneration) return active
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
  // When the timeout wins the game starts in English, and this late load is
  // dropped so it cannot switch formats and document language under a render.
  // A load started since then is left alone.
  const load = loadLocale(wanted)
  const generation = loadGeneration
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      if (loadGeneration === generation) loadGeneration += 1
      resolve(active)
    }, timeoutMs)
  })
  try {
    return await Promise.race([load, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Remember the player's choice; the caller reloads to apply it. False when storage refused it. */
export function saveLocale(code: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, code)
    return localStorage.getItem(STORAGE_KEY) === code
  } catch {
    return false
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

/** Whether `key` names a text in the English source. Every language has the same keys, so this holds in each one. */
export function hasMessage(key: string): boolean {
  return typeof lookup(en as Messages, key) === 'string'
}

function isPlural(node: string | Messages | undefined): node is PluralForms {
  return typeof node === 'object' && typeof node.other === 'string'
}

/**
 * The number a `count` stands for. Callers usually pass `formatNumber(n)`, so the text is read back
 * with the active language's grouping and decimal marks ("1,021", "1 021", "1.021"); a plain number
 * is used as it is.
 */
export function countValue(raw: string | number | undefined, locale: string): number {
  if (raw === undefined) return 0
  if (typeof raw === 'number') return raw
  // A probe with more digits than any locale's minimum grouping: at 1,111.5 Spanish and Polish write no
  // group mark, so 10,000 and 1,000,000 (which they do group) would read back as NaN.
  const parts = new Intl.NumberFormat(locale).formatToParts(-1111111.5)
  const group = parts.find((p) => p.type === 'group')?.value ?? ''
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  // Spaces include the no-break ones some languages group with.
  let digits = raw.replace(/\s/g, '')
  if (group.trim()) digits = digits.split(group).join('')
  if (decimal !== '.') digits = digits.split(decimal).join('.')
  return digits === '' ? Number.NaN : Number(digits)
}

function pick(table: Messages, key: string, count: number, rules: Intl.PluralRules): string | undefined {
  const node = lookup(table, key)
  if (typeof node === 'string') return node
  // Japanese, Korean and Chinese put one in their "other" form, so a count of one takes the "one" form when it has one.
  if (isPlural(node) && count === 1 && node.one !== undefined) return node.one
  if (isPlural(node)) return node[rules.select(count)] ?? node.other
  return undefined
}

function interpolate(text: string, vars: Vars | undefined): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

/** The interface text for `key` in the active language, with `{name}` placeholders filled. */
export function t(key: MessageKey, vars?: Vars): string {
  const count = countValue(vars?.count, active)
  const text =
    pick(messages, key, count, pluralRules) ??
    pick(en as Messages, key, count, new Intl.PluralRules(SOURCE_LOCALE)) ??
    key
  return interpolate(text, vars)
}

/** Format a number the way the active language writes it. */
export function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  // Frames do not always carry every field (cold fields arrive with full
  // frames), so a missing number shows as a dash instead of taking the
  // interface down.
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–'
  return value.toLocaleString(active, options)
}

/** Format a date and time the way the active language writes it. */
export function formatDateTime(value: number | Date): string {
  return new Date(value).toLocaleString(active)
}
