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
  ownerPredatesBoot,
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

test("a lock whose owner pid was recycled after a reboot is stale", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-lock-test-"));
  try {
    const lockDir = path.join(root, ".thehumanbox-data.lock");
    mkdirSync(lockDir);
    // The recorded owner pid is alive (our own), as a recycled pid would be.
    const writeOwner = (acquiredAt: number) =>
      writeFileSync(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: process.pid, token: "old-token", acquiredAt }),
      );
    const hour = 3_600_000;
    const boot = Date.now() - hour;

    // taken during this boot: genuinely held by a live process
    writeOwner(Date.now() - 1_000);
    assert.throws(
      () => acquireDataRootLock(root, process.pid, false, boot),
      /already open by another/,
    );

    // taken two hours ago, before the machine booted: the pid is a stranger
    writeOwner(Date.now() - 2 * hour);
    const lock = acquireDataRootLock(root, process.pid, false, boot);
    assert.equal(lock.recoveredToken, "old-token");
    lock.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("boot-time staleness needs a recorded time and clears the margin", () => {
  const boot = 1_000_000_000;
  assert.equal(ownerPredatesBoot({ acquiredAt: 0 }, boot), false);
  assert.equal(ownerPredatesBoot({ acquiredAt: boot - 60_000 }, boot), false);
  assert.equal(ownerPredatesBoot({ acquiredAt: boot - 10 * 60_000 }, boot), true);
});
