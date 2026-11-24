import assert from "node:assert/strict";
import test from "node:test";
import { setSteamClient, startSteam, unlockSteamAchievement, type SteamClient, type SteamLibrary } from "./steam";

function library(overrides: Partial<SteamLibrary> = {}, calls: string[] = []): SteamLibrary {
  const client: SteamClient = {
    achievement: { activate: () => true, isActivated: () => false },
  };
  return {
    restartAppIfNecessary: () => {
      calls.push("restart-check");
      return false;
    },
    init: () => {
      calls.push("init");
      return client;
    },
    electronEnableSteamOverlay: () => {
      calls.push("overlay");
    },
    ...overrides,
  };
}

test("Steam starts, then turns the overlay on", () => {
  const calls: string[] = [];
  const result = startSteam(480, () => library({}, calls));
  assert.equal(result.status, "ready");
  assert.deepEqual(calls, ["restart-check", "init", "overlay"]);
});

test("a launch from outside Steam hands over to Steam and does not start", () => {
  const calls: string[] = [];
  const result = startSteam(480, () => library({ restartAppIfNecessary: () => true }, calls));
  assert.equal(result.status, "relaunching");
  assert.deepEqual(calls, []);
});

test("a build without an app id, a missing library and a refused start all leave the game without Steam", () => {
  assert.equal(startSteam(null, () => library()).status, "unavailable");
  const missing = startSteam(480, () => {
    throw new Error("no native module");
  });
  assert.equal(missing.status, "unavailable");
  const refused = startSteam(480, () =>
    library({
      init: () => {
        throw new Error("Steam is not running");
      },
    }),
  );
  assert.deepEqual(refused, { status: "unavailable", reason: "Steam did not start: Steam is not running" });
});

test("an achievement unlocks once and only by a plain name", () => {
  const activated: string[] = [];
  setSteamClient({
    achievement: {
      activate: (name) => {
        activated.push(name);
        return true;
      },
      isActivated: (name) => activated.includes(name),
    },
  });
  assert.deepEqual(unlockSteamAchievement("first_village"), { unlocked: true });
  assert.deepEqual(unlockSteamAchievement("first_village"), { unlocked: true });
  assert.deepEqual(activated, ["first_village"]);
  assert.equal(unlockSteamAchievement("../etc").unlocked, false);
  assert.equal(unlockSteamAchievement(42).unlocked, false);
  setSteamClient(null);
  assert.equal(unlockSteamAchievement("first_village").unlocked, false);
});
