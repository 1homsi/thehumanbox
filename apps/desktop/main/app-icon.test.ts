import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { appIconPath } from "./app-icon";

test("packaged builds read the icon from the resources folder, outside app.asar", () => {
  const resources = path.join("/Applications", "The Human Box.app", "Contents", "Resources");
  const mainDir = path.join(resources, "app.asar", "dist", "main");
  assert.equal(appIconPath(true, resources, mainDir), path.join(resources, "icon.png"));
});

test("dev runs read the icon from the desktop build folder", () => {
  const mainDir = path.join("/repo", "apps", "desktop", "dist", "main");
  assert.equal(
    appIconPath(false, "/unused", mainDir),
    path.join("/repo", "apps", "desktop", "build", "icon.png"),
  );
});

test("electron-builder copies build/icon.png into the packaged resources", () => {
  const config = readFileSync(path.join(__dirname, "..", "..", "electron-builder.yml"), "utf8");
  assert.match(config, /- from: build\/icon\.png\n\s+to: icon\.png/);
});
