import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import {
  APP_VERSION_ARG_PREFIX,
  appVersionArgument,
  parseAppVersionArgument,
} from "./app-version-arg";

test("the app version round-trips through a renderer argument", () => {
  const argv = ["electron", "--flag", appVersionArgument("0.5.77"), "--other=1"];
  assert.equal(parseAppVersionArgument(argv), "0.5.77");
  assert.equal(parseAppVersionArgument(["electron"]), "");
});

test("the preload parses the same argument the main process passes", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "preload", "index.ts"),
    "utf8",
  );
  assert.ok(source.includes(JSON.stringify(APP_VERSION_ARG_PREFIX)));
  assert.ok(!source.includes("npm_package_version"));
});
