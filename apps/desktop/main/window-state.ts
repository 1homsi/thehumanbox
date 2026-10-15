export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
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

function overlaps(a: Rect, b: Rect): boolean {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + TITLE_BAR_H, b.y + b.height) - Math.max(a.y, b.y);
  return w >= MIN_VISIBLE_W && h >= TITLE_BAR_H;
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
  if (finite(p.x) && finite(p.y)) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (workAreas.length === 0 || workAreas.some((a) => overlaps({ x, y, width, height }, a))) {
      state.x = x;
      state.y = y;
    }
  }
  return state;
}
