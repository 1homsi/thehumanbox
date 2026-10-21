// Traffic on the trade roads. The roads themselves are tile roads (cf/roads), planned over the land in
// trade-paths.ts; this draws what moves on them: cars on the asphalt of the modern ages, and caravans as ox
// carts or trucks.

import { pointAlong, type PathPoint, type PlannedPath } from './trade-paths'

type Ctx = CanvasRenderingContext2D

function hash(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39)
  h ^= h >>> 15
  return (Math.imul(h, 0x85ebca6b) >>> 0) / 4294967296
}

const CAR_COLORS = ['#c8392b', '#2f4f8a', '#e9e4d8', '#3f7a3a', '#d9a23a']
const carAt: PathPoint = { x: 0, y: 0, angle: 0 }

/** Cars on a modern road, each with its own pace and colour, following the road's tiles in the right-hand lane. */
export function drawTraffic(
  ctx: Ctx,
  path: PlannedPath,
  tier: number,
  tile: number,
  t: number,
  seed: number,
) {
  if (tier < 6) return
  const len = path.total * tile
  if (len < tile * 4) return
  const cars = Math.min(4, Math.floor(len / (tile * 8)))
  for (let i = 0; i < cars; i++) {
    const speed = 0.02 + hash(seed + i) * 0.02
    const forward = i % 2 === 0
    const at = (t * speed + hash(seed * 7 + i) * len) % len
    pointAlong(path, at / len, !forward, carAt)
    const cos = Math.cos(carAt.angle)
    const sin = Math.sin(carAt.angle)
    const lane = -tile * 0.17
    const x = (carAt.x + 0.5) * tile - sin * lane
    const y = (carAt.y + 0.5) * tile + cos * lane
    // The road's tiles run north-south or east-west: a car lies along whichever it is heading.
    const horizontal = Math.abs(cos) >= Math.abs(sin)
    const long = Math.max(2, Math.round(tile * 0.5))
    const wide = Math.max(1, Math.round(tile * 0.2))
    const w = horizontal ? long : wide
    const h = horizontal ? wide : long
    ctx.fillStyle = CAR_COLORS[Math.floor(hash(seed + i * 13) * CAR_COLORS.length)]!
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), w, h)
    // The windscreen at the front.
    ctx.fillStyle = 'rgba(180, 220, 255, 0.85)'
    const front = horizontal ? (cos > 0 ? w - 1 : 0) : sin > 0 ? h - 1 : 0
    ctx.fillRect(
      Math.round(x - w / 2) + (horizontal ? front : 0),
      Math.round(y - h / 2) + (horizontal ? 0 : front),
      horizontal ? 1 : w,
      horizontal ? h : 1,
    )
  }
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
  load = '#8a6a48',
) {
  // Sized to read beside a person at close zoom: the cart is about one and a half tiles long.
  const u = Math.max(1, tile / 5)
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  // Face the way it travels, but never upside down.
  const flip = Math.cos(angle) < 0
  if (flip) ctx.scale(-1, 1)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(-u * 9, u * 2, u * 21, u)
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
    // The ox, from the front: a brown body on four legs, a head with horns, a yoke to the cart.
    ctx.fillStyle = '#5a3a22'
    ctx.fillRect(u * 4, u, u, u * 2)
    ctx.fillRect(u * 7, u, u, u * 2)
    ctx.fillStyle = '#8a5a34'
    ctx.fillRect(u * 3, -u * 2, u * 6, u * 3)
    ctx.fillStyle = '#6e4424'
    ctx.fillRect(u * 3, 0, u * 6, u)
    ctx.fillStyle = '#8a5a34'
    ctx.fillRect(u * 9, -u * 3, u * 2, u * 3)
    ctx.fillStyle = '#e8dcc0'
    ctx.fillRect(u * 9, -u * 4, u, u)
    ctx.fillStyle = '#5a3a22'
    ctx.fillRect(u, -u, u * 2, u)
    // The cart: the bed, the load in the goods' colour under the sender's cloth, the wheel.
    ctx.fillStyle = '#7a5636'
    ctx.fillRect(-u * 6, -u, u * 7, u * 2)
    ctx.fillStyle = load
    ctx.fillRect(-u * 6, -u * 4, u * 6, u * 3)
    ctx.fillStyle = color
    ctx.fillRect(-u * 6, -u * 4, u * 6, u)
    ctx.fillStyle = '#3a2a1c'
    ctx.fillRect(-u * 4, 0, u * 2, u * 2)
    // The driver walks at the rear: a head, a tunic in the sender's colour, two legs.
    ctx.fillStyle = '#e0b48a'
    ctx.fillRect(-u * 9, -u * 3, u * 2, u * 2)
    ctx.fillStyle = color
    ctx.fillRect(-u * 9, -u, u * 2, u * 2)
    ctx.fillStyle = '#3a2a1c'
    ctx.fillRect(-u * 9, u, u, u)
    ctx.fillRect(-u * 8, u, u, u)
  }
  ctx.restore()
}
