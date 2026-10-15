import assert from "node:assert/strict";
import test from "node:test";
import { startWhenReady } from "./startup-lifecycle";

test("startup failures from the boot promise reach the failure handler", async () => {
  const failure = new Error("window creation failed");
  let received: unknown;
  let booted = false;

  startWhenReady(
    Promise.resolve(),
    async () => {
      booted = true;
      throw failure;
    },
    (error) => {
      received = error;
    },
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(booted, true);
  assert.equal(received, failure);
});
