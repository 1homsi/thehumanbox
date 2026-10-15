import assert from "node:assert/strict";
import test from "node:test";
import * as http from "node:http";
import { isSimulationService, tcpAccepts, waitForSimulation } from "./sim-ready";

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

test("waits through a long load until the simulation answers", async () => {
  const c = clock();
  let calls = 0;
  await waitForSimulation({
    port: 1,
    timeoutMs: 60_000,
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
      timeoutMs: 60_000,
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
    /did not start serving on 127\.0\.0\.1:7 within 5000ms/,
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

async function withServer(
  handler: http.RequestListener,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run((server.address() as { port: number }).port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("the real probe accepts only a listener that identifies as the simulation", async () => {
  const json = (body: string, status = 200): http.RequestListener => (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  };
  await withServer(json('{"name":"simulation-rs","version":"1"}'), async (port) => {
    assert.equal(await tcpAccepts(port), true);
    assert.equal(await isSimulationService(port), true);
  });
  await withServer(json('{"name":"something-else"}'), async (port) => {
    assert.equal(await isSimulationService(port), false);
  });
  await withServer(json("not json"), async (port) => {
    assert.equal(await isSimulationService(port), false);
  });
  await withServer(json('{"name":"simulation-rs"}', 503), async (port) => {
    assert.equal(await isSimulationService(port), false);
  });
  // nothing listening at all
  assert.equal(await isSimulationService(1), false);
});
