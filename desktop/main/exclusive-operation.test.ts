import assert from "node:assert/strict";
import test from "node:test";
import {
  currentDesktopOperation,
  runExclusiveDesktopOperation,
} from "./exclusive-operation";

test("rejects overlapping desktop transactions before the second one runs", async () => {
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let secondRan = false;

  const first = runExclusiveDesktopOperation("import a world", async () => {
    await gate;
    return "done";
  });
  assert.equal(currentDesktopOperation(), "import a world");

  await assert.rejects(
    runExclusiveDesktopOperation("reset the world", () => {
      secondRan = true;
    }),
    /cannot reset the world while import a world is still in progress/,
  );
  assert.equal(secondRan, false);

  releaseFirst();
  assert.equal(await first, "done");
  assert.equal(currentDesktopOperation(), null);
});

test("releases desktop transaction ownership after a failure", async () => {
  await assert.rejects(
    runExclusiveDesktopOperation("move the save folder", () => {
      throw new Error("copy failed");
    }),
    /copy failed/,
  );
  assert.equal(
    await runExclusiveDesktopOperation("restart the simulation", () => 42),
    42,
  );
});
