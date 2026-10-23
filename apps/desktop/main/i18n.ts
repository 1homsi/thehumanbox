/**
 * Translations for the desktop shell's own text: the menus, the tray, native
 * dialogs and notifications. The game's interface is translated separately
 * (apps/web/src/i18n); the shell follows the language the player picked there.
 *
 * One JSON file per language in ./locales, named by its code. `en.json` is the
 * source: a key a translation lacks falls back to English, and i18n.test.ts
 * checks that every file has the same keys and placeholders.
 *
 * Adding a language: add `locales/<code>.json` and list it in CATALOGS below.
 * Nothing else is needed for packaging: tsc emits the imported JSON into
 * dist/main/locales, and electron-builder ships dist/**.
 *
 * Call `t()` when the text is needed, never at module scope: the language is
 * chosen after this module loads.
 */
import en from "./locales/en.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import pl from "./locales/pl.json";
import ptBR from "./locales/pt-BR.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";
import uk from "./locales/uk.json";
import zhCN from "./locales/zh-CN.json";

export type Messages = { [key: string]: string | Messages };

export type Vars = Record<string, string | number>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every key `en.json` defines, so a typo fails the type check. */
export type MessageKey = Leaves<typeof en>;

export const SOURCE_LOCALE = "en";

const CATALOGS: Readonly<Record<string, Messages>> = {
  en,
  de,
  es,
  fr,
  it,
  ja,
  ko,
  pl,
  "pt-BR": ptBR,
  ru,
  tr,
  uk,
  "zh-CN": zhCN,
};

/** Every shipped language code, English first. */
export const LOCALE_CODES: readonly string[] = Object.keys(CATALOGS);

let active = SOURCE_LOCALE;

/**
 * The shipped locale a language tag names: the same code (ignoring case), else
 * the same base language (`pt-PT` gives `pt-BR`, `en-GB` gives `en`). Null when
 * nothing ships for it.
 */
export function matchLocale(
  tag: string,
  available: readonly string[] = LOCALE_CODES,
): string | null {
  const wanted = tag.toLowerCase();
  const exact = available.find((code) => code.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split("-")[0];
  return (
    available.find((code) => code.toLowerCase().split("-")[0] === base) ?? null
  );
}

/** The first preferred tag that matches a shipped locale, else English. */
export function resolveLocale(
  preferred: readonly (string | null | undefined)[],
): string {
  for (const tag of preferred) {
    const match = tag ? matchLocale(tag) : null;
    if (match) return match;
  }
  return SOURCE_LOCALE;
}

/** Make the first matching language the active one; English when none match. */
export function setLocale(
  preferred: readonly (string | null | undefined)[],
): string {
  active = resolveLocale(preferred);
  return active;
}

export function getLocale(): string {
  return active;
}

function lookup(table: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = table;
  for (const part of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * The text for `key` in `table`, else in `fallback` (English), with `{name}`
 * placeholders filled from `vars`. A key neither has is returned as the key.
 */
export function resolveText(
  table: Messages | undefined,
  key: string,
  vars?: Vars,
  fallback: Messages = en as Messages,
): string {
  const text =
    (table ? lookup(table, key) : undefined) ?? lookup(fallback, key) ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** The shell text for `key` in the active language. */
export function t(key: MessageKey, vars?: Vars): string {
  return resolveText(CATALOGS[active], key, vars);
}
