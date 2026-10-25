export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
  fullscreen?: boolean;
  alwaysOnTop?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_STATE: WindowState = { width: 1400, height: 900 };

// The window counts as reachable when its title-bar strip (the top 32px) is on
// a display for at least 100px of its width, so it can always be grabbed and
// dragged back. The body being on screen is not enough: a window whose title
// bar sits above the top edge cannot be moved.
const TITLE_BAR_H = 32;
const MIN_VISIBLE_W = 100;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** How much of the window's title-bar strip lies on the display. */
function titleBarOverlap(win: Rect, area: Rect): { w: number; h: number } {
  return {
    w: Math.min(win.x + win.width, area.x + area.width) - Math.max(win.x, area.x),
    h: Math.min(win.y + TITLE_BAR_H, area.y + area.height) - Math.max(win.y, area.y),
  };
}

function overlaps(win: Rect, area: Rect): boolean {
  const { w, h } = titleBarOverlap(win, area);
  return w >= MIN_VISIBLE_W && h >= TITLE_BAR_H;
}

/** The display the window's title bar is most on, or undefined when it is on none. */
function displayFor(win: Rect, areas: Rect[]): Rect | undefined {
  let best: Rect | undefined;
  let bestArea = 0;
  for (const area of areas) {
    if (!overlaps(win, area)) continue;
    const { w, h } = titleBarOverlap(win, area);
    if (w * h > bestArea) {
      best = area;
      bestArea = w * h;
    }
  }
  return best;
}

/**
 * Turn whatever window-state.json held into a state `new BrowserWindow` accepts.
 * A hand-edited or half-written file must never throw (a bad `x` makes the
 * BrowserWindow constructor throw), and a saved position that no connected
 * display shows any more (unplugged monitor) is dropped so the OS places it.
 */
export function sanitizeWindowState(
  parsed: unknown,
  workAreas: Rect[],
): WindowState {
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_STATE };
  const p = parsed as Record<string, unknown>;
  const width = finite(p.width) && p.width >= 800 ? Math.round(p.width) : 1400;
  const height = finite(p.height) && p.height >= 600 ? Math.round(p.height) : 900;
  const state: WindowState = { width, height, maximized: p.maximized === true };
  // Only the modes that were on are written back, so a state file without them
  // keeps its previous shape.
  if (p.fullscreen === true) state.fullscreen = true;
  if (p.alwaysOnTop === true) state.alwaysOnTop = true;
  let x: number | undefined;
  let y: number | undefined;
  // The display the window returns to. With no position kept it is the largest one.
  let display: Rect | undefined;
  if (finite(p.x) && finite(p.y)) {
    const savedX = Math.round(p.x);
    const savedY = Math.round(p.y);
    if (workAreas.length === 0) {
      x = savedX;
      y = savedY;
    } else {
      // The position is checked at the size it will be shown at, not the saved
      // one: narrowing a window can push its title bar off the display it started on.
      const shown = displayFor({ x: savedX, y: savedY, width, height }, workAreas);
      if (
        shown &&
        overlaps(
          {
            x: savedX,
            y: savedY,
            width: Math.min(width, shown.width),
            height: Math.min(height, shown.height),
          },
          shown,
        )
      ) {
        x = savedX;
        y = savedY;
        display = shown;
      }
    }
  }
  // The size was saved on whatever display the window was on then. Fit it to the
  // display it returns to, or to the largest one when its position was dropped,
  // so a window cannot open larger than the screen it is on. The position is
  // kept as saved: a window partly off an edge is still allowed, as above.
  display ??= largestArea(workAreas);
  if (display) {
    state.width = Math.min(width, display.width);
    state.height = Math.min(height, display.height);
  }
  if (x !== undefined && y !== undefined) {
    state.x = x;
    state.y = y;
  }
  return state;
}

function largestArea(areas: Rect[]): Rect | undefined {
  let best: Rect | undefined;
  for (const area of areas) {
    if (!best || area.width * area.height > best.width * best.height) best = area;
  }
  return best;
}
