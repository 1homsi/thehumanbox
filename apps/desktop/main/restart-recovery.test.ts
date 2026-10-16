import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_CHECKPOINT_BUTTON,
  isCheckpointFailure,
  restartFailurePrompt,
} from "./restart-recovery";

test("a checkpoint failure offers a restart without a checkpoint", () => {
  const error = new Error(
    "could not checkpoint the active world; it remains open so the operation can be retried",
  );
  assert.equal(isCheckpointFailure(error), true);
  const prompt = restartFailurePrompt(error);
  assert.deepEqual(prompt.buttons, [NO_CHECKPOINT_BUTTON, "Cancel"]);
  assert.match(prompt.detail, /may be hung/);
  assert.match(prompt.detail, /could not checkpoint the active world/);
});

test("any other restart failure is reported with a single OK button", () => {
  const busy = new Error("cannot restart the simulation while a migration is still in progress");
  assert.equal(isCheckpointFailure(busy), false);
  const prompt = restartFailurePrompt(busy);
  assert.deepEqual(prompt.buttons, ["OK"]);
  assert.equal(prompt.detail, busy.message);
});

test("a non-Error rejection is still classified and shown", () => {
  assert.equal(isCheckpointFailure("could not checkpoint the active world"), true);
  assert.equal(restartFailurePrompt("plain failure").detail, "plain failure");
});
