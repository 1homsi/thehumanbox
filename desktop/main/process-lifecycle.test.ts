import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  waitForChildTermination,
  type ChildTerminationObservable,
} from "./process-lifecycle";

class FakeChild extends EventEmitter implements ChildTerminationObservable {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
}

test("waits for an actual child exit before confirming termination", async () => {
  const child = new FakeChild();
  const waiting = waitForChildTermination(child, 100);
  setTimeout(() => {
    child.signalCode = "SIGKILL";
    child.emit("exit");
  }, 5);
  assert.equal(await waiting, true);
});

test("reports an unconfirmed child without pretending ownership is safe to release", async () => {
  const child = new FakeChild();
  assert.equal(await waitForChildTermination(child, 5), false);
});
