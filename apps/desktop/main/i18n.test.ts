import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadUiLocale, setUiLocale, tr, uiLocale } from "./i18n";

test("menus are English under the test runner and Russian once the game reports it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thb-locale-"));
  assert.equal(loadUiLocale(dir), "en");
  assert.equal(tr("menuFile"), "File");
  assert.equal(setUiLocale("ru"), true);
  assert.equal(setUiLocale("ru"), false);
  assert.equal(tr("menuFile"), "Файл");
  assert.equal(tr("updateReady", { version: "0.2.0" }), "Версия 0.2.0 готова к установке.");
  assert.equal(fs.readFileSync(path.join(dir, "ui-locale"), "utf8"), "ru");
  setUiLocale("en");
  assert.equal(uiLocale(), "en");
});
