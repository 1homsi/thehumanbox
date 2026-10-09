// Trade routes as real roads on the ground, built to the age of the tribes
// they join: a trodden dirt track, then a cobbled road, then asphalt with a
// painted line and traffic on it. Caravans travel them as ox carts or trucks.
// They were dashed overlay lines with an emoji in a circle.

type Ctx = CanvasRenderingContext2D

export interface RoadStyle {
  kind: 'track' | 'cobble' | 'asphalt'
  /** Width in tiles. */
  width: number
  surface: string
  edge: string
}

/** The road two tribes build between them, by the more advanced one's age. */
export function roadStyle(tier: number): RoadStyle {
  if (tier >= 5) return { kind: 'asphalt', width: 0.7, surface: '#43474c', edge: '#6b7076' }
  if (tier >= 2) return { kind: 'cobble', width: 0.6, surface: '#8d877b', edge: '#6a6458' }
  return { kind: 'track', width: 0.45, surface: 'rgba(132, 104, 70, 0.75)', edge: 'rgba(96, 74, 48, 0.6)' }
}

/** One road between (ax, ay) and (bx, by) in map pixels. */
export function drawRoad(
  ctx: Ctx,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tier: number,
  tile: number,
) {
  const len = Math.hypot(bx - ax, by - ay)
  if (len < 1) return
  const style = roadStyle(tier)
  const w = style.width * tile
  ctx.save()
  ctx.translate(ax, ay)
  ctx.rotate(Math.atan2(by - ay, bx - ax))
  ctx.fillStyle = style.edge
  ctx.fillRect(0, -w / 2 - 1, len, w + 2)
  ctx.fillStyle = style.surface
  ctx.fillRect(0, -w / 2, len, w)
  if (style.kind === 'track') {
    // Two wheel ruts worn into the dirt.
    ctx.fillStyle = 'rgba(80, 60, 38, 0.55)'
    ctx.fillRect(0, -w * 0.22, len, Math.max(1, w * 0.12))
    ctx.fillRect(0, w * 0.12, len, Math.max(1, w * 0.12))
  } else if (style.kind === 'cobble') {
    // Setts laid in courses.
    ctx.fillStyle = 'rgba(70, 64, 56, 0.5)'
    const step = Math.max(2, tile * 0.25)
    for (let s = 0; s < len; s += step) ctx.fillRect(s, -w / 2, 1, w)
    ctx.fillRect(0, -0.5, len, 1)
  } else {
    // A dashed centre line.
    ctx.fillStyle = '#e9c45a'
    const dash = Math.max(3, tile * 0.5)
    for (let s = dash / 2; s < len; s += dash * 2) ctx.fillRect(s, -0.5, dash, 1)
  }
  ctx.restore()
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39)
  h ^= h >>> 15
  return (Math.imul(h, 0x85ebca6b) >>> 0) / 4294967296
}

/** Cars on an asphalt road, each with its own pace and colour. */
export function drawTraffic(
  ctx: Ctx,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tier: number,
  tile: number,
  t: number,
  seed: number,
) {
  if (tier < 6) return
  const len = Math.hypot(bx - ax, by - ay)
  if (len < tile * 4) return
  const cars = Math.min(4, Math.floor(len / (tile * 8)))
  const colors = ['#c8392b', '#2f4f8a', '#e9e4d8', '#3f7a3a', '#d9a23a']
  ctx.save()
  ctx.translate(ax, ay)
  ctx.rotate(Math.atan2(by - ay, bx - ax))
  for (let i = 0; i < cars; i++) {
    const speed = 0.02 + hash(seed + i) * 0.02
    const forward = i % 2 === 0
    const at = (t * speed + hash(seed * 7 + i) * len) % len
    const x = forward ? at : len - at
    const lane = (forward ? -1 : 1) * tile * 0.17
    ctx.fillStyle = colors[Math.floor(hash(seed + i * 13) * colors.length)]!
    ctx.fillRect(
      Math.round(x - tile * 0.25),
      Math.round(lane - tile * 0.1),
      Math.max(2, tile * 0.5),
      Math.max(1, tile * 0.2),
    )
    ctx.fillStyle = 'rgba(180, 220, 255, 0.85)'
    ctx.fillRect(
      Math.round(x + (forward ? tile * 0.1 : -tile * 0.2)),
      Math.round(lane - tile * 0.1),
      Math.max(1, tile * 0.1),
      Math.max(1, tile * 0.2),
    )
  }
  ctx.restore()
}

/** A caravan in pixels: an ox cart in early ages, a truck from industry on. */
export function drawCaravanSprite(
  ctx: Ctx,
  x: number,
  y: number,
  angle: number,
  tier: number,
  color: string,
  tile: number,
) {
  // Sized to read beside a person at close zoom: the cart is about one and a half tiles long.
  const u = Math.max(1, tile / 5)
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  // Face the way it travels, but never upside down.
  const flip = Math.cos(angle) < 0
  if (flip) ctx.scale(-1, 1)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(-u * 5, u * 2, u * 11, u)
  if (tier >= 5) {
    // Truck: a box in the sender's colour behind a cab.
    ctx.fillStyle = color
    ctx.fillRect(-u * 5, -u * 4, u * 7, u * 5)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(-u * 5, -u * 1, u * 7, u)
    ctx.fillStyle = '#d8dde2'
    ctx.fillRect(u * 2, -u * 3, u * 3, u * 4)
    ctx.fillStyle = '#8fc4e8'
    ctx.fillRect(u * 3, -u * 3, u * 2, u * 2)
    ctx.fillStyle = '#222'
    ctx.fillRect(-u * 4, u, u * 2, u * 2)
    ctx.fillRect(u * 2, u, u * 2, u * 2)
  } else {
    // Ox cart: a load under a tribe-coloured cloth, wheels, and the ox.
    ctx.fillStyle = '#7a5636'
    ctx.fillRect(-u * 5, -u * 2, u * 6, u * 3)
    ctx.fillStyle = color
    ctx.fillRect(-u * 5, -u * 4, u * 6, u * 2)
    ctx.fillStyle = '#3a2a1c'
    ctx.fillRect(-u * 4, u, u * 2, u * 2)
    ctx.fillRect(-u, u, u * 2, u * 2)
    ctx.fillStyle = '#8a6a48'
    ctx.fillRect(u * 2, -u * 2, u * 4, u * 3)
    ctx.fillRect(u * 5, -u * 3, u * 2, u * 2)
    ctx.fillStyle = '#3a2a1c'
    ctx.fillRect(u * 2, u, u, u * 2)
    ctx.fillRect(u * 5, u, u, u * 2)
    // The driver walks at the rear, with a head and a tunic in the sender's colour.
    ctx.fillStyle = '#e0b48a'
    ctx.fillRect(-u * 8, -u * 6, u * 2, u * 2)
    ctx.fillStyle = color
    ctx.fillRect(-u * 8, -u * 4, u * 2, u * 3)
    ctx.fillStyle = '#3a2a1c'
    ctx.fillRect(-u * 8, -u, u, u * 2)
    ctx.fillRect(-u * 7, -u, u, u * 2)
  }
  ctx.restore()
}
