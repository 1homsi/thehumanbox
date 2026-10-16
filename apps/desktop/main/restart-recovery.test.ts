import assert from "node:assert/strict";
import test from "node:test";
import { CHECKPOINT_FAILED_ERROR } from "./sim-errors";
import {
  NO_CHECKPOINT_BUTTON,
  isCheckpointFailure,
  restartFailurePrompt,
} from "./restart-recovery";

test("a checkpoint failure offers a restart without a checkpoint", () => {
  const error = new Error(CHECKPOINT_FAILED_ERROR);
  assert.equal(isCheckpointFailure(error), true);
  const prompt = restartFailurePrompt(error);
  assert.deepEqual(prompt.buttons, [NO_CHECKPOINT_BUTTON, "Cancel"]);
  assert.equal(prompt.canRetryWithoutCheckpoint, true);
  // Cancel is focused: Enter must not discard play.
  assert.equal(prompt.defaultId, prompt.cancelId);
  assert.equal(prompt.buttons[prompt.defaultId], "Cancel");
  assert.match(prompt.detail, /may be hung/);
  assert.match(prompt.detail, new RegExp(CHECKPOINT_FAILED_ERROR.slice(0, 20)));
});

test("any other restart failure is reported with a single OK button", () => {
  const busy = new Error("cannot restart the simulation while a migration is still in progress");
  assert.equal(isCheckpointFailure(busy), false);
  const prompt = restartFailurePrompt(busy);
  assert.deepEqual(prompt.buttons, ["OK"]);
  assert.equal(prompt.canRetryWithoutCheckpoint, false);
  assert.equal(prompt.defaultId, 0);
  assert.equal(prompt.cancelId, 0);
  assert.equal(prompt.detail, busy.message);
});

test("a non-Error rejection is still classified and shown", () => {
  assert.equal(isCheckpointFailure(CHECKPOINT_FAILED_ERROR), true);
  assert.equal(restartFailurePrompt("plain failure").detail, "plain failure");
});
