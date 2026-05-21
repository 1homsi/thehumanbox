export const BUILDING_EMOJI: Record<string, string> = {
  Hut: '\u{1F6D6}',
  House: '\u{1F3E0}',
  Manor: '\u{1F3F0}',
  TownHouse: '\u{1F3D8}\u{FE0F}',
  Apartment: '\u{1F3E2}',
  School: '\u{1F3EB}',
  University: '\u{1F393}',
  Library: '\u{1F4DA}',
  Market: '\u{1F3EA}',
  Temple: '\u{26EA}',
  Factory: '\u{1F3ED}',
  Hospital: '\u{1F3E5}',
  Forge: '\u{1F9F1}',
  Mill: '\u{2699}\u{FE0F}',
  Bakery: '\u{1F35E}',
  Inn: '\u{1F37B}',
  Bank: '\u{1F3E6}',
  Workshop: '\u{1F528}',
  Granary: '\u{1F33E}',
  Barracks: '\u{1F6E1}\u{FE0F}',
  Lighthouse: '\u{1F5FC}',
  Windmill: '\u{1F4A8}',
  Watermill: '\u{1F4A7}',
  Aqueduct: '\u{1F3DB}\u{FE0F}',
  Bridge: '\u{1F309}',
  Wall: '\u{1F9F1}',
  Tower: '\u{1F5FC}',
  Plaza: '\u{1F3DE}\u{FE0F}',
  Statue: '\u{1F5FF}',
}

const FOOTPRINTS: Record<string, [number, number]> = {
  Hut: [1, 1],
  House: [2, 2],
  Manor: [3, 3],
  TownHouse: [2, 3],
  Apartment: [4, 4],
  School: [3, 3],
  University: [4, 4],
  Library: [3, 2],
  Market: [2, 2],
  Temple: [3, 3],
  Factory: [4, 3],
  Hospital: [3, 3],
  Forge: [2, 2],
  Mill: [2, 2],
  Bakery: [2, 2],
  Inn: [2, 2],
  Bank: [3, 2],
  Workshop: [2, 2],
  Granary: [2, 2],
  Barracks: [3, 2],
  Lighthouse: [1, 3],
  Windmill: [2, 2],
  Watermill: [2, 2],
  Aqueduct: [4, 1],
  Bridge: [3, 1],
  Wall: [1, 1],
  Tower: [1, 2],
  Plaza: [3, 3],
  Statue: [1, 1],
}

export function buildingFootprint(kind: string): [number, number] {
  return FOOTPRINTS[kind] ?? [1, 1]
}

export interface BuildingLike {
  id?: number
  kind: string
  x: number
  y: number
  condition?: number
}

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  ox: number,
  oy: number,
  tileSize: number,
) {
  const [fw, fh] = buildingFootprint(building.kind)
  const px = (building.x - ox) * tileSize
  const py = (building.y - oy) * tileSize
  const w = fw * tileSize
  const h = fh * tileSize
  const isBig = fw >= 2 || fh >= 2
  if (isBig) {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(
      px + w / 2,
      py + h + tileSize * 0.15,
      w * 0.45,
      tileSize * 0.32,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.restore()
  }
  const cond = building.condition ?? 1
  const bgAlpha = 0.32 + (1 - cond) * 0.18
  ctx.fillStyle = `rgba(20,18,28,${bgAlpha})`
  ctx.fillRect(px, py, w, h)
  ctx.strokeStyle = `rgba(255,220,160,${0.18 + cond * 0.20})`
  ctx.lineWidth = 1
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1)
  const emoji = BUILDING_EMOJI[building.kind] ?? '\u{1F3DA}\u{FE0F}'
  const fontPx = Math.max(10, Math.min(w, h) * 0.78)
  ctx.save()
  ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 0.55 + cond * 0.45
  ctx.fillText(emoji, px + w / 2, py + h / 2)
  ctx.restore()
}
