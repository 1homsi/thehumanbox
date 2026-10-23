import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import {
  LOCALE_CODES,
  getLocale,
  matchLocale,
  resolveLocale,
  resolveText,
  setLocale,
  t,
  type Messages,
} from "./i18n";

const LOCALES_DIR = path.join(__dirname, "locales");

function loadLocale(code: string): Messages {
  return JSON.parse(readFileSync(path.join(LOCALES_DIR, `${code}.json`), "utf8"));
}

/** Every leaf key with its text, e.g. `menu.file` → `File`. */
function flatten(table: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(table)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(full, value);
    else for (const [k, v] of flatten(value, full)) out.set(k, v);
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

test("the catalog lists exactly the locale files on disk", () => {
  const onDisk = readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
  assert.deepEqual([...LOCALE_CODES].sort(), onDisk);
  assert.equal(LOCALE_CODES[0], "en");
  assert.deepEqual(
    [...LOCALE_CODES].sort(),
    ["de", "en", "es", "fr", "it", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "zh-CN"],
  );
});

test("every locale has the same keys and placeholders as en.json, with no empty text", () => {
  const source = flatten(loadLocale("en"));
  assert.ok(source.size > 0);
  for (const [key, text] of source) {
    assert.ok(text.trim().length > 0, `en ${key} is empty`);
  }
  for (const code of LOCALE_CODES) {
    const translated = flatten(loadLocale(code));
    assert.deepEqual([...translated.keys()].sort(), [...source.keys()].sort(), `${code} keys`);
    for (const [key, sourceText] of source) {
      const text = translated.get(key) ?? "";
      assert.ok(text.trim().length > 0, `${code} ${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(sourceText), `${code} ${key} placeholders`);
    }
  }
});

test("a key a translation lacks falls back to English, and an unknown key shows as the key", () => {
  const english = loadLocale("en") as Messages;
  const partial: Messages = { menu: { file: "Datei" } };
  assert.equal(resolveText(partial, "menu.file"), "Datei");
  assert.equal(resolveText(partial, "menu.reload", undefined, english), "Reload");
  assert.equal(resolveText(undefined, "menu.file", undefined, english), "File");
  assert.equal(resolveText(partial, "menu.nope", undefined, english), "menu.nope");
});

test("placeholders are filled, and an unfilled one is left visible", () => {
  const english = loadLocale("en") as Messages;
  assert.equal(
    resolveText(undefined, "update.readyMessage", { version: "1.2.3" }, english),
    "Version 1.2.3 is ready to install.",
  );
  assert.equal(resolveText(undefined, "update.readyMessage", {}, english), "Version {version} is ready to install.");
});

test("English text is unchanged for the strings the desktop tests and players see", () => {
  setLocale([]);
  assert.equal(t("tray.showWindow"), "Show window");
  assert.equal(t("tray.hideWindow"), "Hide window");
  assert.equal(t("menu.alwaysOnTop"), "Always on top");
  assert.equal(t("startFailed.rendererFailed"), "Renderer failed to load.");
  assert.equal(
    t("simStopped.detail", { status: "code 1" }).startsWith("Exit code 1. Your world was last saved"),
    true,
  );
});

test("language tags match the same code, else the same base language, else nothing", () => {
  assert.equal(matchLocale("pt-BR"), "pt-BR");
  assert.equal(matchLocale("pt-br"), "pt-BR");
  assert.equal(matchLocale("zh-cn"), "zh-CN");
  assert.equal(matchLocale("pt-PT"), "pt-BR");
  assert.equal(matchLocale("en-GB"), "en");
  assert.equal(matchLocale("de-AT"), "de");
  assert.equal(matchLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(matchLocale("xx-YY"), null);
  assert.equal(matchLocale("fr", ["en", "fr-CA"]), "fr-CA");
});

test("the first preferred tag that ships wins, and English is the last resort", () => {
  assert.equal(resolveLocale([null, undefined, "ja-JP"]), "ja");
  assert.equal(resolveLocale(["xx", "fr-CA", "de"]), "fr");
  assert.equal(resolveLocale(["", "xx"]), "en");
  assert.equal(resolveLocale([]), "en");
});

test("setLocale changes the text t() returns, and an unknown code falls back to English", () => {
  try {
    assert.equal(setLocale(["de-DE"]), "de");
    assert.equal(getLocale(), "de");
    assert.equal(t("menu.file"), "Datei");
    assert.match(t("notify.about", { version: "1.2.3" }), /^v1\.2\.3\n/);
    assert.equal(setLocale(["xx"]), "en");
    assert.equal(t("menu.file"), "File");
  } finally {
    setLocale([]);
  }
});
