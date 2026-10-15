import assert from "node:assert/strict";
import test from "node:test";
import { waitForSimulation } from "./sim-ready";

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

test("waits through a long load until the simulation answers", async () => {
  const c = clock();
  let calls = 0;
  await waitForSimulation({
    port: 1,
    timeoutMs: 120_000,
    isAlive: () => true,
    accepts: async () => ++calls > 400, // ~40 s of loading before the bind
    isService: async () => true,
    ...c,
  });
  assert.ok(calls > 400);
});

test("a foreign listener on the port is not mistaken for the simulation", async () => {
  const c = clock();
  let alive = true;
  await assert.rejects(
    waitForSimulation({
      port: 1,
      timeoutMs: 120_000,
      isAlive: () => alive,
      accepts: async () => true,
      isService: async () => {
        // our child eventually dies on EADDRINUSE
        if (c.now() > 1_000) alive = false;
        return false;
      },
      ...c,
    }),
    /exited before binding/,
  );
});

test("gives up after the timeout when the child is alive but never serves", async () => {
  const c = clock();
  await assert.rejects(
    waitForSimulation({
      port: 7,
      timeoutMs: 5_000,
      isAlive: () => true,
      accepts: async () => false,
      isService: async () => false,
      ...c,
    }),
    /did not start listening on 127\.0\.0\.1:7 within 5000ms/,
  );
});

test("a child that died while a stranger answered is reported as dead", async () => {
  const c = clock();
  let checks = 0;
  await assert.rejects(
    waitForSimulation({
      port: 1,
      timeoutMs: 10_000,
      isAlive: () => ++checks < 2,
      accepts: async () => true,
      isService: async () => true,
      ...c,
    }),
    /exited before binding/,
  );
});
