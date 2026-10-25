import assert from "node:assert/strict";
import test from "node:test";
import { handleSecondLaunch } from "./single-instance";

function fakes(ready: boolean) {
  const calls: string[] = [];
  let release: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    calls,
    becomeReady: () => release(),
    options: {
      isReady: () => ready,
      whenReady: () => readyPromise,
      showWindow: () => calls.push("showWindow"),
    },
  };
}

test("a second launch shows the running window straight away once the app is ready", () => {
  const { calls, options } = fakes(true);
  handleSecondLaunch(options);
  assert.deepEqual(calls, ["showWindow"]);
});

test("a second launch that arrives before the app is ready waits for ready, then shows the window", async () => {
  const { calls, becomeReady, options } = fakes(false);
  handleSecondLaunch(options);
  // A window cannot be created before ready, so nothing runs yet.
  assert.deepEqual(calls, []);
  becomeReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["showWindow"]);
});

test("a second launch only shows the window, without an app-wide focus request", async () => {
  const ready = fakes(true);
  handleSecondLaunch(ready.options);
  assert.deepEqual(ready.calls, ["showWindow"]);

  const waiting = fakes(false);
  handleSecondLaunch(waiting.options);
  waiting.becomeReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(waiting.calls, ["showWindow"]);
});

test("a failed wait for ready is reported and shows nothing", async () => {
  const errors: unknown[] = [];
  const calls: string[] = [];
  handleSecondLaunch({
    isReady: () => false,
    whenReady: () => Promise.reject(new Error("no app")),
    showWindow: () => calls.push("showWindow"),
    onError: (error) => errors.push(error),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
  assert.equal((errors[0] as Error).message, "no app");
});
