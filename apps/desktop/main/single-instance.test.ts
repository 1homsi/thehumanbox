import assert from "node:assert/strict";
import test from "node:test";
import { handleSecondLaunch } from "./single-instance";

function fakes(platform: NodeJS.Platform, ready: boolean) {
  const calls: string[] = [];
  let release: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    calls,
    becomeReady: () => release(),
    options: {
      platform,
      isReady: () => ready,
      whenReady: () => readyPromise,
      showWindow: () => calls.push("showWindow"),
      focusApp: (options?: { steal: boolean }) => calls.push(`focusApp:${JSON.stringify(options)}`),
    },
  };
}

test("a second launch shows the running window straight away once the app is ready", () => {
  const { calls, options } = fakes("linux", true);
  handleSecondLaunch(options);
  assert.deepEqual(calls, ["showWindow"]);
});

test("a second launch that arrives before the app is ready waits for ready, then shows the window", async () => {
  const { calls, becomeReady, options } = fakes("linux", false);
  handleSecondLaunch(options);
  // A window cannot be created before ready, so nothing runs yet.
  assert.deepEqual(calls, []);
  becomeReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["showWindow"]);
});

test("on Windows the second launch also asks for focus, so the window comes to the front", async () => {
  const windows = fakes("win32", true);
  handleSecondLaunch(windows.options);
  assert.deepEqual(windows.calls, ["showWindow", 'focusApp:{"steal":true}']);

  const other = fakes("darwin", true);
  handleSecondLaunch(other.options);
  assert.deepEqual(other.calls, ["showWindow"]);
});

test("a second launch that arrives before ready and is then shown also gets the Windows focus request", async () => {
  const { calls, becomeReady, options } = fakes("win32", false);
  handleSecondLaunch(options);
  becomeReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["showWindow", 'focusApp:{"steal":true}']);
});

test("a failed wait for ready is reported and shows nothing", async () => {
  const errors: unknown[] = [];
  const calls: string[] = [];
  handleSecondLaunch({
    platform: "linux",
    isReady: () => false,
    whenReady: () => Promise.reject(new Error("no app")),
    showWindow: () => calls.push("showWindow"),
    focusApp: () => calls.push("focusApp"),
    onError: (error) => errors.push(error),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
  assert.equal((errors[0] as Error).message, "no app");
});
