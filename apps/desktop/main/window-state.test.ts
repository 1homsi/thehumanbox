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

test("a window saved larger than the display it returns to is fitted to that display", () => {
  // Saved on a big external monitor, restored on a laptop screen.
  const laptop = { x: 0, y: 0, width: 1440, height: 900 };
  const s = sanitizeWindowState({ x: 100, y: 50, width: 2600, height: 1500 }, [laptop]);
  assert.equal(s.width, 1440);
  assert.equal(s.height, 900);
  assert.equal(s.x, 100);
  assert.equal(s.y, 50);
});

test("a window whose display is gone is fitted to the display that remains", () => {
  const s = sanitizeWindowState({ x: 2500, y: 100, width: 2600, height: 1500 }, [primary]);
  assert.equal(s.x, undefined);
  assert.equal(s.y, undefined);
  assert.equal(s.width, 1920);
  assert.equal(s.height, 1080);
});

test("a window on a second display is fitted to that display, not the first", () => {
  const smallSecond = { x: 1920, y: 0, width: 1280, height: 800 };
  const s = sanitizeWindowState({ x: 2000, y: 40, width: 1900, height: 1000 }, [primary, smallSecond]);
  assert.equal(s.x, 2000);
  assert.equal(s.width, 1280);
  assert.equal(s.height, 800);
});

test("a window is fitted to the display its title bar is mostly on, not the first one listed", () => {
  // The title bar is 120px on the primary display and 1400px on the smaller second one.
  const smallSecond = { x: 1920, y: 0, width: 1280, height: 800 };
  const s = sanitizeWindowState({ x: 1800, y: 40, width: 2600, height: 1500 }, [primary, smallSecond]);
  assert.equal(s.x, 1800);
  assert.equal(s.width, 1280);
  assert.equal(s.height, 800);
});

test("a position is checked at the fitted size, so a window narrowed off its display is dropped", () => {
  // At 2600px wide the title bar reaches 100px onto the display, but the window is
  // shown at 1920px, which leaves it entirely off screen.
  const s = sanitizeWindowState({ x: -2500, y: 10, width: 2600, height: 1500 }, [primary]);
  assert.equal(s.x, undefined);
  assert.equal(s.y, undefined);
  assert.equal(s.width, 1920);
  assert.equal(s.height, 1080);
});

test("full screen and always on top are kept when they were saved on", () => {
  const s = sanitizeWindowState(
    { x: 100, y: 80, width: 1200, height: 800, fullscreen: true, alwaysOnTop: true },
    [primary],
  );
  assert.equal(s.fullscreen, true);
  assert.equal(s.alwaysOnTop, true);
});

test("full screen and always on top stay off unless saved as true", () => {
  const s = sanitizeWindowState({ width: 1200, height: 800, fullscreen: "yes", alwaysOnTop: 1 }, [primary]);
  assert.equal(s.fullscreen, undefined);
  assert.equal(s.alwaysOnTop, undefined);
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
