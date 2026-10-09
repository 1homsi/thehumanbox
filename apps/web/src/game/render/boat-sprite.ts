/**
 * The hulls the eras build, oldest first: a log raft (the stone age), a dugout canoe (bronze and iron),
 * a sailing boat (classical to renaissance) and a steamship (industrial and after). Each is painted with
 * the same warm wood palette as the canoe, plus its own parts (sail, funnel).
 */
export const BOAT_HULLS = ['raft', 'canoe', 'sail', 'steam'] as const
export type BoatHull = (typeof BOAT_HULLS)[number]

/** Pixel hulls share the world's warm wood palette and need no extra textures. */
export function drawBoat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  moving: boolean,
  building = false,
) {
  drawBoatHull(ctx, x, y, time, moving, building, 'canoe', false)
}

/**
 * One boat of the given hull. `moving` draws the wake and the stroke; `building` draws only the hull;
 * `cargo` stacks goods on the deck (crates at the bow and stern).
 */
export function drawBoatHull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  moving: boolean,
  building: boolean,
  hull: BoatHull,
  cargo: boolean,
) {
  x = Math.round(x)
  y = Math.round(y)
  const wake = Math.floor(time / 180) % 3
  const stroke = moving ? Math.floor(time / 220) % 2 : 0
  if (moving) {
    ctx.fillStyle = '#99c6c6'
    ctx.fillRect(x - 12 - wake, y + 4, 5, 1)
    ctx.fillRect(x + 9 + wake, y + 3, 4, 1)
  }
  if (hull === 'raft') drawRaft(ctx, x, y)
  else if (hull === 'sail') drawCanoeHull(ctx, x, y)
  else if (hull === 'steam') drawSteamHull(ctx, x, y, moving, wake)
  else drawCanoeHull(ctx, x, y)
  if (!building && cargo) drawCrates(ctx, x, y)
  if (building) return
  if (hull === 'raft') drawPole(ctx, x, y, stroke)
  else if (hull === 'sail') drawSail(ctx, x, y, moving, stroke)
  else if (hull === 'steam') return
  else drawPaddles(ctx, x, y, moving, stroke)
}

function drawCanoeHull(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#38271d'
  ctx.fillRect(x - 10, y + 1, 20, 4)
  ctx.fillRect(x - 8, y + 5, 16, 2)
  ctx.fillStyle = '#a07843'
  ctx.fillRect(x - 9, y, 18, 3)
  ctx.fillStyle = '#d0a668'
  ctx.fillRect(x - 7, y - 1, 14, 1)
  ctx.fillStyle = '#5a3d27'
  ctx.fillRect(x - 5, y, 2, 4)
  ctx.fillRect(x + 4, y, 2, 4)
}

function drawPaddles(ctx: CanvasRenderingContext2D, x: number, y: number, moving: boolean, stroke: number) {
  const s = moving ? stroke : 0
  ctx.fillStyle = '#c39a5c'
  ctx.fillRect(x - 13 + s * 2, y - 2, 8, 1)
  ctx.fillRect(x + 5, y + 3 + s, 8, 1)
  ctx.fillRect(x - 14 + s * 2, y - 3, 3, 3)
  ctx.fillRect(x + 12, y + 2 + s, 3, 3)
}

/** Three logs lashed side by side, lying flat on the water. */
function drawRaft(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#4b3420'
  ctx.fillRect(x - 11, y + 3, 22, 4)
  ctx.fillStyle = '#8c6234'
  ctx.fillRect(x - 11, y, 22, 3)
  ctx.fillStyle = '#b08250'
  ctx.fillRect(x - 10, y, 20, 1)
  ctx.fillStyle = '#3d2a1a'
  for (const lx of [x - 7, x, x + 6]) ctx.fillRect(lx, y + 1, 1, 2)
}

/** A long pole that dips to one side and back as the raft is pushed along. */
function drawPole(ctx: CanvasRenderingContext2D, x: number, y: number, stroke: number) {
  ctx.fillStyle = '#c39a5c'
  ctx.fillRect(x + 12 + stroke, y - 4, 1, 9)
  ctx.fillRect(x + 13 + stroke, y + 4, 2, 1)
}

/** A canoe hull with a mast and a cream sail that bellies out in the wind. */
function drawSail(ctx: CanvasRenderingContext2D, x: number, y: number, moving: boolean, stroke: number) {
  ctx.fillStyle = '#5a3d27'
  ctx.fillRect(x - 1, y - 12, 1, 11)
  ctx.fillRect(x - 1, y - 3, 9, 1)
  const belly = moving ? stroke : 0
  for (let r = 0; r < 9; r++) {
    const width = 2 + Math.round((r / 8) * 6) + (r >= 4 ? belly : 0)
    ctx.fillStyle = r >= 7 ? '#d8c49a' : '#f2e6c4'
    ctx.fillRect(x, y - 11 + r, width, 1)
  }
}

/** An iron hull with a white cabin, a red band and a funnel that puffs smoke while under way. */
function drawSteamHull(ctx: CanvasRenderingContext2D, x: number, y: number, moving: boolean, wake: number) {
  ctx.fillStyle = '#2b2d31'
  ctx.fillRect(x - 13, y + 1, 26, 4)
  ctx.fillRect(x + 13, y + 2, 2, 3)
  ctx.fillRect(x + 15, y + 3, 1, 1)
  ctx.fillStyle = '#4a4e55'
  ctx.fillRect(x - 12, y, 24, 2)
  ctx.fillStyle = '#9b2c2c'
  ctx.fillRect(x - 13, y + 3, 26, 1)
  ctx.fillStyle = '#e6e0d0'
  ctx.fillRect(x - 7, y - 4, 9, 4)
  ctx.fillStyle = '#3a3d44'
  ctx.fillRect(x + 3, y - 7, 3, 4)
  ctx.fillStyle = '#9b2c2c'
  ctx.fillRect(x + 3, y - 5, 3, 1)
  if (moving) {
    ctx.fillStyle = '#b9bcc2'
    ctx.fillRect(x + 4 + wake, y - 9 - wake, 2, 2)
    ctx.fillRect(x + 6 + wake * 2, y - 13 + wake, 2, 2)
  }
}

/** Goods on deck: crates at the bow and the stern, a second one stacked at the bow. */
function drawCrates(ctx: CanvasRenderingContext2D, x: number, y: number) {
  for (const [cx, cy] of [
    [x - 8, y - 3],
    [x + 5, y - 3],
    [x + 5, y - 6],
  ] as const) {
    ctx.fillStyle = '#8a6236'
    ctx.fillRect(cx, cy, 3, 3)
    ctx.fillStyle = '#5c3f20'
    ctx.fillRect(cx, cy + 2, 3, 1)
  }
}
