import assert from "node:assert/strict";
import test from "node:test";
import { HIDDEN_ARG, loginItemSettings, shouldStartHidden } from "./login-launch";

test("start-minimized is carried by a launch argument", () => {
  assert.deepEqual(loginItemSettings(true, true), {
    openAtLogin: true,
    args: [HIDDEN_ARG],
  });
  assert.deepEqual(loginItemSettings(true, false).args, []);
  assert.deepEqual(loginItemSettings(false, true).args, []);
});

test("only a login launch with both settings on starts hidden", () => {
  const base = {
    autoLaunch: true,
    startMinimized: true,
    argv: ["app"],
    wasOpenedAtLogin: false,
    platform: "win32" as const,
  };
  assert.equal(shouldStartHidden(base), false); // manual launch
  assert.equal(shouldStartHidden({ ...base, argv: ["app", HIDDEN_ARG] }), true);
  // the user turned the setting off after registering the login item
  assert.equal(
    shouldStartHidden({ ...base, startMinimized: false, argv: ["app", HIDDEN_ARG] }),
    false,
  );
  // macOS ignores login-item arguments, so it relies on the login-launch flag
  assert.equal(
    shouldStartHidden({ ...base, platform: "darwin", wasOpenedAtLogin: true }),
    true,
  );
  assert.equal(
    shouldStartHidden({ ...base, platform: "win32", wasOpenedAtLogin: true }),
    false,
  );
  // no login item registered: a session restore that looks like a login launch
  // must not hide the window
  assert.equal(
    shouldStartHidden({
      ...base,
      autoLaunch: false,
      platform: "darwin",
      wasOpenedAtLogin: true,
    }),
    false,
  );
  assert.equal(
    shouldStartHidden({ ...base, autoLaunch: false, argv: ["app", HIDDEN_ARG] }),
    false,
  );
});
