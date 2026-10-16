import assert from "node:assert/strict";
import test from "node:test";
import {
  claimErrorDialog,
  currentErrorDialog,
  deferErrorDialog,
  drainDeferredErrorDialog,
  withErrorDialog,
} from "./error-dialog";

test("only one error dialog may be open at a time", () => {
  const release = claimErrorDialog("restart failure");
  assert.ok(release);
  try {
    assert.equal(currentErrorDialog(), "restart failure");
    // The sim crashing while the restart prompt is open must not raise the
    // unexpected-exit prompt on top of it.
    assert.equal(claimErrorDialog("unexpected exit"), null);
    assert.equal(currentErrorDialog(), "restart failure");
  } finally {
    release();
  }
  assert.equal(currentErrorDialog(), null);
});

test("a second claim of the same dialog is denied", () => {
  const release = claimErrorDialog("unexpected exit");
  assert.ok(release);
  try {
    assert.equal(claimErrorDialog("unexpected exit"), null);
  } finally {
    release();
  }
  assert.equal(currentErrorDialog(), null);
});

test("releasing one dialog lets the next one take the slot", () => {
  const releaseFirst = claimErrorDialog("unexpected exit");
  assert.ok(releaseFirst);
  releaseFirst();

  const releaseSecond = claimErrorDialog("restart failure");
  assert.ok(releaseSecond);
  releaseSecond();
  assert.equal(currentErrorDialog(), null);
});

test("a stale release handle cannot clear a newer dialog", () => {
  const releaseFirst = claimErrorDialog("unexpected exit");
  assert.ok(releaseFirst);
  releaseFirst();

  // Same name again: only the token proves this is a different claim.
  const releaseSecond = claimErrorDialog("unexpected exit");
  assert.ok(releaseSecond);
  try {
    releaseFirst();
    assert.equal(currentErrorDialog(), "unexpected exit");
  } finally {
    releaseSecond();
  }
  assert.equal(currentErrorDialog(), null);
});

test("a dialog that loses the slot is offered once the slot frees", () => {
  const release = claimErrorDialog("restart failure");
  assert.ok(release);
  let shown = 0;
  deferErrorDialog({
    show: () => {
      shown += 1;
    },
    isStillRelevant: () => true,
  });

  // Still held: the deferred dialog must not fire.
  drainDeferredErrorDialog();
  assert.equal(shown, 0);

  release();
  drainDeferredErrorDialog();
  assert.equal(shown, 1);
  // Offered exactly once: draining again is a no-op.
  drainDeferredErrorDialog();
  assert.equal(shown, 1);
});

test("a deferred dialog whose state has been resolved is dropped", () => {
  let relevant = true;
  let shown = 0;
  deferErrorDialog({
    show: () => {
      shown += 1;
    },
    isStillRelevant: () => relevant,
  });

  // The sim restarted while the other dialog was open: nothing to nag about.
  relevant = false;
  drainDeferredErrorDialog();
  assert.equal(shown, 0);

  // It was dropped, not merely skipped.
  relevant = true;
  drainDeferredErrorDialog();
  assert.equal(shown, 0);
});

test("a newer deferred dialog supersedes an older one", () => {
  const shown: string[] = [];
  deferErrorDialog({
    show: () => shown.push("restart failure"),
    isStillRelevant: () => true,
  });
  deferErrorDialog({
    show: () => shown.push("unexpected exit"),
    isStillRelevant: () => true,
  });

  drainDeferredErrorDialog();
  assert.deepEqual(shown, ["unexpected exit"]);
});

test("a deferred dialog can claim the slot it was waiting for", () => {
  const release = claimErrorDialog("restart failure");
  assert.ok(release);
  let reclaimed = false;
  deferErrorDialog({
    show: () => {
      const releaseAgain = claimErrorDialog("unexpected exit");
      reclaimed = releaseAgain !== null;
      releaseAgain?.();
    },
    isStillRelevant: () => true,
  });

  release();
  drainDeferredErrorDialog();
  assert.equal(reclaimed, true);
  assert.equal(currentErrorDialog(), null);
});

test("withErrorDialog runs the body while holding the slot and drains after", async () => {
  const events: string[] = [];
  const ran = await withErrorDialog("restart failure", () => {
    events.push(`body:${currentErrorDialog()}`);
    deferErrorDialog({
      show: () => events.push("deferred"),
      isStillRelevant: () => true,
    });
    assert.equal(currentErrorDialog(), "restart failure");
  });

  assert.equal(ran, true);
  // The body saw the slot held; the deferred dialog ran only after release.
  assert.deepEqual(events, ["body:restart failure", "deferred"]);
  assert.equal(currentErrorDialog(), null);
});

test("withErrorDialog declines and runs nothing when the slot is held", async () => {
  const release = claimErrorDialog("unexpected exit");
  assert.ok(release);
  let ran = false;
  const shown = await withErrorDialog("restart failure", () => {
    ran = true;
  });
  assert.equal(shown, false);
  assert.equal(ran, false);
  assert.equal(currentErrorDialog(), "unexpected exit");
  release();
});

test("withErrorDialog releases the slot when the body throws", async () => {
  await assert.rejects(
    withErrorDialog("restart failure", () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(currentErrorDialog(), null);
  // The slot is reusable afterwards.
  const release = claimErrorDialog("unexpected exit");
  assert.ok(release);
  release();
});

test("a deferred dialog re-enters withErrorDialog after the holder releases", async () => {
  // Mirrors production: holder A defers a crash, and its own release drains the
  // deferred prompt, which claims the slot and shows through withErrorDialog.
  const events: string[] = [];
  let deferredRan = false;
  const ranA = await withErrorDialog("restart failure", () => {
    deferErrorDialog({
      show: () => {
        deferredRan = true;
        void withErrorDialog("unexpected exit", () => {
          events.push(`deferred body:${currentErrorDialog()}`);
        });
      },
      isStillRelevant: () => true,
    });
  });

  assert.equal(ranA, true);
  assert.equal(deferredRan, true);
  // The drained prompt held the slot while its body ran, then released it.
  assert.deepEqual(events, ["deferred body:unexpected exit"]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(currentErrorDialog(), null);
});
