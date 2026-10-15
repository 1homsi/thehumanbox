import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  acquireDataRootLock,
  pidWasRecycled,
  processIsAlive,
  removePidRecordIfOwned,
  writePidRecordAtomically,
} from "./data-lock";

test("does not mistake an unprobeable process for a dead lock owner", () => {
  const error = Object.assign(new Error("operation not permitted"), {
    code: "EPERM",
  });
  assert.equal(
    processIsAlive(42, () => {
      throw error;
    }),
    true,
  );
  assert.equal(
    processIsAlive(42, () => {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    }),
    false,
  );
});

test("data-root ownership is exclusive and releasable", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-lock-test-"));
  try {
    const first = acquireDataRootLock(root);
    assert.throws(() => acquireDataRootLock(root), /already open/);
    first.release();
    const second = acquireDataRootLock(root);
    second.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pid records are atomic and only their owner removes them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-pid-test-"));
  const pidPath = path.join(root, "sim.pid");
  try {
    writePidRecordAtomically(pidPath, { pid: 42, port: 9876, token: "owner" });
    assert.deepEqual(JSON.parse(readFileSync(pidPath, "utf8")), {
      pid: 42,
      port: 9876,
      token: "owner",
    });
    removePidRecordIfOwned(pidPath, "someone-else");
    assert.equal(existsSync(pidPath), true);
    removePidRecordIfOwned(pidPath, "owner");
    assert.equal(existsSync(pidPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a fresh lock from a crashed launcher is not stolen before the child can claim it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-launch-lock-test-"));
  const lockDir = path.join(root, ".thehumanbox-data.lock");
  try {
    mkdirSync(lockDir);
    writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid: 2_147_483_647,
        token: "launch-token",
        acquiredAt: Date.now(),
      }),
    );

    assert.throws(() => acquireDataRootLock(root), /retry in a few seconds/);

    writeFileSync(
      path.join(lockDir, "child.json"),
      JSON.stringify({ pid: 2_147_483_647, token: "launch-token" }),
    );
    const recovered = acquireDataRootLock(root);
    assert.equal(recovered.recoveredToken, "launch-token");
    recovered.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("data operations cannot steal a lock from a live orphan simulation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-live-child-lock-test-"));
  const lockDir = path.join(root, ".thehumanbox-data.lock");
  try {
    mkdirSync(lockDir);
    writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid: 2_147_483_647,
        token: "child-token",
        acquiredAt: 1,
      }),
    );
    writeFileSync(
      path.join(lockDir, "child.json"),
      JSON.stringify({ pid: process.pid, token: "child-token" }),
    );

    assert.throws(() => acquireDataRootLock(root), /orphan simulation process/);

    const recovered = acquireDataRootLock(root, process.pid, true);
    assert.equal(recovered.recoveredToken, "child-token");
    assert.equal(recovered.recoveredChildPid, process.pid);
    recovered.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("data operations refuse a live pid record even when its lock directory was lost", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-live-pid-without-lock-"));
  try {
    writeFileSync(
      path.join(root, "sim.pid"),
      JSON.stringify({ pid: process.pid, port: 9999, token: "lost-lock" }),
    );
    assert.throws(
      () => acquireDataRootLock(root),
      /live simulation pid record.*reopen the app/,
    );
    assert.equal(existsSync(path.join(root, ".thehumanbox-data.lock")), false);

    const recoveryLock = acquireDataRootLock(root, process.pid, true);
    recoveryLock.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("data operations preserve a stale lock when its child has a live pid record", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-live-pid-in-lock-"));
  const lockDir = path.join(root, ".thehumanbox-data.lock");
  try {
    mkdirSync(lockDir);
    const owner = { pid: 2_147_483_647, token: "old-owner", acquiredAt: 1 };
    writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify(owner));
    writeFileSync(
      path.join(root, "sim.pid"),
      JSON.stringify({ pid: process.pid, token: owner.token }),
    );
    assert.throws(() => acquireDataRootLock(root), /live simulation pid record/);
    assert.deepEqual(JSON.parse(readFileSync(path.join(lockDir, "owner.json"), "utf8")), owner);
    const recovered = acquireDataRootLock(root, process.pid, true);
    assert.equal(recovered.recoveredToken, owner.token);
    recovered.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recovery refuses a live pid whose token differs from the stale lock", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-mismatched-pid-lock-"));
  const lockDir = path.join(root, ".thehumanbox-data.lock");
  try {
    mkdirSync(lockDir);
    writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: 2_147_483_647, token: "old-owner", acquiredAt: 1 }),
    );
    writeFileSync(
      path.join(root, "sim.pid"),
      JSON.stringify({ pid: process.pid, token: "different-owner" }),
    );
    assert.throws(
      () => acquireDataRootLock(root, process.pid, true),
      /does not match the stale save-folder lock/,
    );
    assert.equal(existsSync(path.join(lockDir, "owner.json")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lock owner pid recycled by an unrelated program is stale", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-lock-test-"));
  try {
    const lockDir = path.join(root, ".thehumanbox-data.lock");
    mkdirSync(lockDir);
    const acquiredAt = Date.now() - 3_600_000;
    // The recorded owner pid is alive (our own), as a recycled pid would be.
    writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "old-token", acquiredAt }),
    );
    const own = path.basename(process.execPath).replace(/\.exe$/i, "");
    const identity = (name: string, startedAt: number) => () => ({ name, startedAt });

    // started before the lock, same program: really another instance
    assert.throws(
      () => acquireDataRootLock(root, process.pid, false, identity(own, acquiredAt - 5_000)),
      /already open by another/,
    );
    // identity unknown: fail closed
    assert.throws(
      () => acquireDataRootLock(root, process.pid, false, () => null),
      /already open by another/,
    );
    // different name but it started before the lock: could be a wrapper/alias, keep refusing
    assert.throws(
      () => acquireDataRootLock(root, process.pid, false, identity("chrome", acquiredAt - 5_000)),
      /already open by another/,
    );
    // started long after the lock and runs another program: a recycled pid
    const lock = acquireDataRootLock(root, process.pid, false, identity("chrome", Date.now()));
    assert.equal(lock.recoveredToken, "old-token");
    lock.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pid recycling needs a later start time AND a different program", () => {
  const exe = "/Applications/The Human Box.app/Contents/MacOS/The Human Box";
  const t = 1_700_000_000_000;
  const later = t + 30 * 60_000;
  const id = (name: string, startedAt: number) => () => ({ name, startedAt });
  assert.equal(pidWasRecycled(7, t, id("firefox", later), exe), true);
  assert.equal(pidWasRecycled(7, t, id("The Human Box", later), exe), false);
  assert.equal(pidWasRecycled(7, t, id("the human box", later), exe), false);
  assert.equal(pidWasRecycled(7, t, id("The Human Box.exe", later), exe), false);
  assert.equal(pidWasRecycled(7, t, id("firefox", t + 30_000), exe), false);
  assert.equal(pidWasRecycled(7, t, id("firefox", t - 1), exe), false);
  assert.equal(pidWasRecycled(7, 0, id("firefox", later), exe), false);
  assert.equal(pidWasRecycled(7, t, () => null, exe), false);
  // ps truncates comm to 15 characters on Linux
  assert.equal(
    pidWasRecycled(7, t, id("the-human-box-a", later), "/opt/the-human-box-app/the-human-box-app"),
    false,
  );
});
