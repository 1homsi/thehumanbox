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
  Hut: [2, 2],
  House: [3, 3],
  Manor: [5, 5],
  TownHouse: [3, 4],
  Apartment: [5, 5],
  School: [5, 4],
  University: [6, 5],
  Library: [4, 3],
  Market: [4, 3],
  Temple: [5, 5],
  Factory: [6, 4],
  Hospital: [5, 4],
  Forge: [3, 3],
  Mill: [3, 3],
  Bakery: [3, 2],
  Inn: [3, 3],
  Bank: [4, 3],
  Workshop: [3, 2],
  Granary: [3, 3],
  Barracks: [4, 3],
  Lighthouse: [2, 3],
  Windmill: [3, 3],
  Watermill: [3, 3],
  Aqueduct: [5, 1],
  Bridge: [4, 1],
  Wall: [1, 1],
  Tower: [2, 2],
  Plaza: [4, 4],
  Statue: [1, 1],
}

function normKind(kind: string): string {
  return kind
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([a-z])/, (_, c) => c.toUpperCase())
}

export function buildingFootprint(kind: string): [number, number] {
  const k = FOOTPRINTS[kind] ?? FOOTPRINTS[normKind(kind)]
  return k ?? [1, 1]
}

export function buildingEmoji(kind: string): string {
  return BUILDING_EMOJI[kind] ?? BUILDING_EMOJI[normKind(kind)] ?? '\u{1F3DA}\u{FE0F}'
}

export interface BuildingLike {
  id?: number
  kind: string
  x: number
  y: number
  condition?: number
}

const WALL_COLORS: Record<string, string> = {
  Hut:        '#8a6a44',
  House:      '#a6845a',
  Manor:      '#c4a070',
  TownHouse:  '#b08868',
  Apartment:  '#8c8c92',
  School:     '#d6c39a',
  University: '#e0cca0',
  Library:    '#b89868',
  Market:     '#c88030',
  Temple:     '#d8b860',
  Factory:    '#6a6a6a',
  Hospital:   '#e8e8e8',
  Forge:      '#5a4030',
  Mill:       '#a07854',
  Bakery:     '#c89060',
  Inn:        '#9a7048',
  Bank:       '#b8a878',
  Workshop:   '#8a6a48',
  Granary:    '#b88848',
  Barracks:   '#5a5a5a',
  Lighthouse: '#e8e0d0',
  Windmill:   '#a07854',
  Watermill:  '#a07854',
  Aqueduct:   '#8a8a8a',
  Bridge:     '#8a8a8a',
  Wall:       '#7a7268',
  Tower:      '#4a4a4a',
  Plaza:      '#a89880',
  Statue:     '#b0b0b0',
}

const ROOF_COLORS: Record<string, string> = {
  Hut:        '#4a3018',
  House:      '#7a3a20',
  Manor:      '#4a2018',
  TownHouse:  '#5a2818',
  Apartment:  '#3a3a3e',
  School:     '#a83020',
  University: '#5a2818',
  Library:    '#3a2818',
  Market:     '#a06030',
  Temple:     '#b88020',
  Factory:    '#2a2a2a',
  Hospital:   '#c83030',
  Forge:      '#2a1a10',
  Mill:       '#4a2818',
  Bakery:     '#5a3018',
  Inn:        '#5a2818',
  Bank:       '#3a2a18',
  Workshop:   '#4a3020',
  Granary:    '#5a3818',
  Barracks:   '#2a2a2a',
  Windmill:   '#4a2818',
  Watermill:  '#4a2818',
}

function wallColor(kind: string): string {
  return WALL_COLORS[kind] ?? WALL_COLORS[normKind(kind)] ?? '#8a7a5a'
}

function roofColor(kind: string): string | null {
  const c = ROOF_COLORS[kind] ?? ROOF_COLORS[normKind(kind)]
  return c ?? null
}

const HOUSE_LIKE = new Set([
  'Hut', 'House', 'Manor', 'TownHouse', 'School', 'University', 'Library',
  'Market', 'Forge', 'Mill', 'Bakery', 'Inn', 'Bank', 'Workshop', 'Granary',
  'Barracks', 'Hospital', 'Windmill', 'Watermill',
])

function isHouseLike(kind: string): boolean {
  return HOUSE_LIKE.has(kind) || HOUSE_LIKE.has(normKind(kind))
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
  const cond = building.condition ?? 1
  const k = normKind(building.kind)

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(
    px + w / 2,
    py + h + tileSize * 0.18,
    w * 0.48,
    tileSize * 0.34,
    0, 0, Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()

  if (isHouseLike(k)) {
    const wallH = h * 0.62
    const roofH = h * 0.42
    const wallY = py + h - wallH
    const wall = wallColor(k)
    const roof = roofColor(k) ?? '#5a2818'

    ctx.fillStyle = wall
    ctx.fillRect(px, wallY, w, wallH)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(px, wallY, w, Math.max(2, wallH * 0.10))
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    ctx.fillRect(px, py + h - Math.max(2, wallH * 0.10), w, Math.max(2, wallH * 0.10))

    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(px - tileSize * 0.18, wallY)
    ctx.lineTo(px + w + tileSize * 0.18, wallY)
    ctx.lineTo(px + w / 2, wallY - roofH)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.beginPath()
    ctx.moveTo(px + w / 2, wallY - roofH)
    ctx.lineTo(px + w + tileSize * 0.18, wallY)
    ctx.lineTo(px + w * 0.62, wallY)
    ctx.closePath()
    ctx.fill()

    const doorW = Math.max(3, tileSize * 0.5)
    const doorH = Math.max(4, wallH * 0.55)
    ctx.fillStyle = '#2a1a10'
    ctx.fillRect(px + w / 2 - doorW / 2, py + h - doorH, doorW, doorH)
    ctx.fillStyle = '#d8c060'
    ctx.fillRect(px + w / 2 + doorW / 2 - 2, py + h - doorH / 2 - 1, 1.5, 1.5)

    const cols = Math.max(1, fw)
    const rows = Math.max(1, Math.floor(wallH / Math.max(6, tileSize * 0.5)))
    const winSize = Math.max(2, tileSize * 0.28)
    const winGapX = w / (cols + 1)
    const winGapY = wallH / (rows + 1)
    ctx.fillStyle = `rgba(220,230,255,${0.55 + cond * 0.30})`
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const wx = px + c * winGapX - winSize / 2
        const wy = wallY + r * winGapY - winSize / 2
        if (Math.abs(wx + winSize / 2 - (px + w / 2)) < doorW / 2 + 2 && wy + winSize > py + h - doorH) continue
        ctx.fillRect(wx, wy, winSize, winSize)
      }
    }
    ctx.strokeStyle = `rgba(0,0,0,${0.30})`
    ctx.lineWidth = 1
    ctx.strokeRect(px + 0.5, wallY + 0.5, w - 1, wallH - 1)
  } else {
    const bgAlpha = 0.45 + (1 - cond) * 0.18
    ctx.fillStyle = `rgba(20,18,28,${bgAlpha})`
    ctx.fillRect(px, py, w, h)
    ctx.strokeStyle = `rgba(255,220,160,${0.22 + cond * 0.22})`
    ctx.lineWidth = 1
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1)
  }

  const emoji = buildingEmoji(building.kind)
  const fontPx = Math.max(8, Math.min(w, h) * 0.32)
  ctx.save()
  ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 0.85
  const ey = isHouseLike(k) ? py + h * 0.18 : py + h / 2
  ctx.fillText(emoji, px + w / 2, ey)
  ctx.restore()
}
