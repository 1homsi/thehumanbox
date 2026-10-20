import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { RESTART_SIMULATION_OPERATION } from "./exclusive-operation";
import { restartFailureStillRelevant, simExitStillRelevant } from "./prompt-relevance";

const sim = { port: 4000 };

test("a restart-failure prompt is moot once its hung sim was replaced or the app quits", () => {
  assert.equal(
    restartFailureStillRelevant({ quitting: false, activeSim: sim, failedSim: sim }),
    true,
  );
  assert.equal(
    restartFailureStillRelevant({ quitting: false, activeSim: { port: 4001 }, failedSim: sim }),
    false,
  );
  assert.equal(
    restartFailureStillRelevant({ quitting: true, activeSim: sim, failedSim: sim }),
    false,
  );
});

test("a sim-exit prompt waits out a restart in flight but not a migration", () => {
  const dead = { quitting: false, activeSim: null };
  assert.equal(simExitStillRelevant({ ...dead, operation: null }), true);
  assert.equal(
    simExitStillRelevant({ ...dead, operation: "move the save folder" }),
    true,
  );
  assert.equal(
    simExitStillRelevant({ ...dead, operation: RESTART_SIMULATION_OPERATION }),
    false,
  );
});

test("a sim-exit prompt is moot once a sim is back or the app quits", () => {
  assert.equal(
    simExitStillRelevant({ quitting: false, activeSim: sim, operation: null }),
    false,
  );
  assert.equal(
    simExitStillRelevant({ quitting: true, activeSim: null, operation: null }),
    false,
  );
});

test("the File-menu and IPC restarts run under the operation name the predicate checks", () => {
  const mainDir = path.join(__dirname, "..", "..", "main");
  const ipc = fs.readFileSync(path.join(mainDir, "ipc.ts"), "utf8");
  const index = fs.readFileSync(path.join(mainDir, "index.ts"), "utf8");
  assert.ok(ipc.includes("exclusiveIpcHandler(RESTART_SIMULATION_OPERATION"));
  assert.ok(!ipc.includes('"restart the simulation"'));
  assert.ok(!index.includes('"restart the simulation"'));
  assert.equal(RESTART_SIMULATION_OPERATION, "restart the simulation");
});
