import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

// The page's bridge can listen for events. Only the events the main process
// sends are allowed, so a page cannot subscribe to a channel that carries
// something else.

type Listener = (event: unknown, payload: unknown) => void;

function loadBridge() {
  let bridge: Record<string, unknown> = {};
  const listeners = new Map<string, Set<Listener>>();
  const ipcRenderer = {
    on(channel: string, listener: Listener) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
    },
    removeListener(channel: string, listener: Listener) {
      listeners.get(channel)?.delete(listener);
    },
    invoke: async () => undefined,
  };
  const context = vm.createContext({
    exports: {},
    __dirname: path.join(__dirname, "..", "preload"),
    process: { argv: [], platform: "linux" },
    console,
    require: (id: string) => {
      if (id === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld(_name: string, value: Record<string, unknown>) {
              bridge = value;
            },
          },
          ipcRenderer,
        };
      }
      throw new Error(`unexpected require in preload: ${id}`);
    },
  });
  vm.runInContext(readFileSync(path.join(__dirname, "..", "preload", "index.js"), "utf8"), context);
  return {
    on: bridge.on as (channel: string, cb: (payload: unknown) => void) => () => void,
    listeners,
  };
}

/** Channels the main process sends to the page, found in the TypeScript source. */
function channelsSentByMain(): string[] {
  const mainDir = path.join(__dirname, "..", "..", "main");
  const channels = new Set<string>();
  for (const file of readdirSync(mainDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(path.join(mainDir, file), "utf8");
    for (const match of source.matchAll(/\.send\(\s*(['"`])([^'"`]+)\1/g)) {
      channels.add(match[2]);
    }
  }
  return [...channels].sort();
}

test("the page can listen for every event the main process sends", () => {
  const sent = channelsSentByMain();
  assert.ok(sent.length >= 5, `found only ${sent.join(", ")}`);
  const { on } = loadBridge();
  for (const channel of sent) {
    assert.doesNotThrow(() => on(channel, () => {}), channel);
  }
});

test("the page cannot listen on a channel the main process does not send events on", () => {
  const { on, listeners } = loadBridge();
  assert.throws(() => on("settings:set", () => {}), /not a desktop event/);
  assert.throws(() => on("world:exportActive", () => {}), /not a desktop event/);
  assert.equal(listeners.has("settings:set"), false);
});

test("a listener is removed by the function on returns", () => {
  const { on, listeners } = loadBridge();
  const off = on("app:visibility", () => {});
  assert.equal(listeners.get("app:visibility")?.size, 1);
  off();
  assert.equal(listeners.get("app:visibility")?.size, 0);
});
