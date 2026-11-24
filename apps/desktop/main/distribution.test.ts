import assert from "node:assert/strict";
import test from "node:test";
import {
  distributionArgument,
  parseDistributionArgument,
  parseSteamAppId,
  readDistribution,
} from "./distribution";

test("a build with no flavour is the direct download", () => {
  assert.deepEqual(readDistribution({}, {}, true), { distribution: "direct", steamAppId: null });
  assert.deepEqual(readDistribution({ distribution: "itch" }, {}, true), { distribution: "direct", steamAppId: null });
});

test("a Steam build reads its app id from the manifest", () => {
  assert.deepEqual(readDistribution({ distribution: "steam", steamAppId: 480 }, {}, true), {
    distribution: "steam",
    steamAppId: 480,
  });
  assert.deepEqual(readDistribution({ distribution: "steam", steamAppId: "1234560" }, {}, true), {
    distribution: "steam",
    steamAppId: 1234560,
  });
});

test("a Steam build without a usable app id has none", () => {
  for (const bad of [undefined, 0, -3, 1.5, "abc", "12 34", 2 ** 40]) {
    assert.equal(parseSteamAppId(bad), null);
  }
});

test("the environment picks the flavour only when running from source", () => {
  const env = { THB_DISTRIBUTION: "steam", THB_STEAM_APP_ID: "480" };
  assert.deepEqual(readDistribution({}, env, false), { distribution: "steam", steamAppId: 480 });
  assert.deepEqual(readDistribution({}, env, true), { distribution: "direct", steamAppId: null });
});

test("the flavour survives the trip to the preload as an argument", () => {
  assert.equal(parseDistributionArgument(["electron", distributionArgument("steam")]), "steam");
  assert.equal(parseDistributionArgument(["electron"]), "direct");
});
