import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeWindowState } from "./window-state";

const primary = { x: 0, y: 0, width: 1920, height: 1080 };
const second = { x: 1920, y: 0, width: 1920, height: 1080 };

test("a saved position on a connected display is kept", () => {
  const s = sanitizeWindowState({ x: 100, y: 80, width: 1200, height: 800, maximized: true }, [primary]);
  assert.deepEqual(s, { x: 100, y: 80, width: 1200, height: 800, maximized: true });
});

test("a position on a display that is no longer connected is dropped", () => {
  const s = sanitizeWindowState({ x: 2500, y: 100, width: 1400, height: 900 }, [primary]);
  assert.equal(s.x, undefined);
  assert.equal(s.y, undefined);
  assert.equal(s.width, 1400);
  assert.equal(sanitizeWindowState({ x: 2500, y: 100, width: 1400, height: 900 }, [primary, second]).x, 2500);
});

test("a window with only a sliver on screen is treated as off-screen", () => {
  const s = sanitizeWindowState({ x: 1910, y: 100, width: 1400, height: 900 }, [primary]);
  assert.equal(s.x, undefined);
});

test("a window whose title bar is off the top of the display is dropped", () => {
  // the body overlaps the display but the title bar cannot be grabbed
  const s = sanitizeWindowState({ x: 100, y: -850, width: 1400, height: 900 }, [primary]);
  assert.equal(s.x, undefined);
  assert.equal(sanitizeWindowState({ x: -1300, y: 10, width: 1400, height: 900 }, [primary]).x, -1300);
  assert.equal(sanitizeWindowState({ x: -1301, y: 10, width: 1400, height: 900 }, [primary]).x, undefined);
  assert.equal(sanitizeWindowState({ x: 5, y: 5, width: 1400, height: 900 }, []).x, 5);
});

test("malformed state never produces values the BrowserWindow constructor rejects", () => {
  for (const bad of [null, "x", 3, [], { x: "10", y: 5 }, { x: NaN, y: 0 }, { x: 5 }, { width: Infinity, height: -1 }]) {
    const s = sanitizeWindowState(bad, [primary]);
    assert.ok(Number.isFinite(s.width) && Number.isFinite(s.height));
    assert.ok(s.x === undefined || Number.isFinite(s.x));
    assert.ok((s.x === undefined) === (s.y === undefined));
  }
  assert.deepEqual(sanitizeWindowState({ x: "10", y: 5 }, [primary]), {
    width: 1400,
    height: 900,
    maximized: false,
  });
});
