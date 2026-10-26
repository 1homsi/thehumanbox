import assert from "node:assert/strict";
import test from "node:test";
import * as http from "node:http";
import {
  probeSimulation,
  SIM_WIRE_PROTOCOL,
  tcpAccepts,
  waitForSimulation,
  type SimulationProbe,
} from "./sim-ready";

const matching: () => Promise<SimulationProbe> = async () => ({
  kind: "simulation",
  protocol: SIM_WIRE_PROTOCOL,
  version: "test",
});
const stranger: () => Promise<SimulationProbe> = async () => ({ kind: "other" });

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
    probe: matching,
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
      probe: async () => {
        // our child eventually dies on EADDRINUSE
        if (c.now() > 1_000) alive = false;
        return { kind: "other" };
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
      probe: stranger,
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
      probe: matching,
      ...c,
    }),
    /exited before binding/,
  );
});

test("a simulation of another protocol fails at once, naming its build and what to do", async () => {
  const c = clock();
  let probes = 0;
  await assert.rejects(
    waitForSimulation({
      port: 9,
      timeoutMs: 60_000,
      isAlive: () => true,
      accepts: async () => true,
      probe: async () => {
        probes++;
        return { kind: "simulation", protocol: null, version: "0.6.0" };
      },
      ...c,
    }),
    (error: Error) => {
      assert.match(error.message, /version 0\.6\.0 \(no protocol\)/);
      assert.match(error.message, new RegExp(`needs protocol ${SIM_WIRE_PROTOCOL}\\b`));
      assert.match(error.message, /Quit any other copy of The Human Box/);
      return true;
    },
  );
  assert.equal(probes, 1, "gives up on the first answer rather than waiting out the timeout");
});

test("a simulation of this protocol is accepted, whatever build it reports", async () => {
  await waitForSimulation({
    port: 9,
    timeoutMs: 1_000,
    isAlive: () => true,
    accepts: async () => true,
    probe: async () => ({ kind: "simulation", protocol: SIM_WIRE_PROTOCOL, version: "9.9.9" }),
    now: () => 0,
    sleep: async () => {},
  });
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

test("the real probe reads the simulation's protocol, and treats anything else as a stranger", async () => {
  const json = (body: string, status = 200): http.RequestListener => (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  };
  await withServer(json('{"name":"simulation-rs","version":"1","protocol":1}'), async (port) => {
    assert.equal(await tcpAccepts(port), true);
    assert.deepEqual(await probeSimulation(port), { kind: "simulation", protocol: 1, version: "1" });
  });
  // a build from before the protocol was reported
  await withServer(json('{"name":"simulation-rs","version":"0.6.0"}'), async (port) => {
    assert.deepEqual(await probeSimulation(port), { kind: "simulation", protocol: null, version: "0.6.0" });
  });
  await withServer(json('{"name":"something-else"}'), async (port) => {
    assert.deepEqual(await probeSimulation(port), { kind: "other" });
  });
  await withServer(json("not json"), async (port) => {
    assert.deepEqual(await probeSimulation(port), { kind: "other" });
  });
  await withServer(json('{"name":"simulation-rs","protocol":1}', 503), async (port) => {
    assert.deepEqual(await probeSimulation(port), { kind: "other" });
  });
  // nothing listening at all
  assert.deepEqual(await probeSimulation(1), { kind: "other" });
});
