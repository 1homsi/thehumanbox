import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  resolveOwnedOrphanPid,
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

test("only an exact recovered lock claim authorizes orphan termination", () => {
  assert.throws(
    () => resolveOwnedOrphanPid({ pid: 101, token: "old-token" }, null, null),
    /no matching recovered data-lock claim/,
  );
  assert.throws(
    () =>
      resolveOwnedOrphanPid(
        { pid: 101, token: "other-token" },
        "old-token",
        101,
      ),
    /does not match the recovered save-folder lock/,
  );
  assert.throws(
    () =>
      resolveOwnedOrphanPid({ pid: 202, token: "old-token" }, "old-token", 101),
    /pid changed after claiming/,
  );
  assert.deepEqual(resolveOwnedOrphanPid(null, "old-token", 101), {
    pid: 101,
    token: "old-token",
  });
  assert.deepEqual(
    resolveOwnedOrphanPid(
      { pid: 101, port: 9876, token: "old-token" },
      "old-token",
      101,
    ),
    { pid: 101, port: 9876, token: "old-token" },
  );
});
