import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../public/sprites/people')
const OUT_PATH = resolve(OUT_DIR, 'people.svg')

const CELL = 32
const COLS = 4
const ROWS = 8
const W = CELL * COLS
const H = CELL * ROWS

const ROW_DEFS = [
  { sex: 'male',   stage: 'infant', skin: '#f0c8a8', hair: '#b07f44', shirt: '#7cb6ff', pants: '#3a5b8c', scale: 0.55 },
  { sex: 'male',   stage: 'child',  skin: '#eabf99', hair: '#8a5a2b', shirt: '#5aa84a', pants: '#3e6a2a', scale: 0.72 },
  { sex: 'male',   stage: 'teen',   skin: '#e3b48a', hair: '#5a3a1f', shirt: '#c44c4c', pants: '#2a3a55', scale: 0.88 },
  { sex: 'male',   stage: 'adult',  skin: '#d8a473', hair: '#3a261a', shirt: '#4a6b8a', pants: '#222a36', scale: 1.0  },
  { sex: 'female', stage: 'infant', skin: '#f3cdb0', hair: '#c08850', shirt: '#ffb1d6', pants: '#a04a7a', scale: 0.55 },
  { sex: 'female', stage: 'child',  skin: '#edc59f', hair: '#a06030', shirt: '#f0a040', pants: '#a05a20', scale: 0.72 },
  { sex: 'female', stage: 'teen',   skin: '#e6b893', hair: '#6a3818', shirt: '#b94aa0', pants: '#5a2050', scale: 0.88 },
  { sex: 'female', stage: 'adult',  skin: '#dba47a', hair: '#2a1810', shirt: '#9a5ac8', pants: '#3a2050', scale: 1.0  },
]

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff
  const dr = clamp(Math.round(r * (1 - f)), 0, 255)
  const dg = clamp(Math.round(g * (1 - f)), 0, 255)
  const db = clamp(Math.round(b * (1 - f)), 0, 255)
  return '#' + ((dr << 16) | (dg << 8) | db).toString(16).padStart(6, '0')
}

function legSwing(frame) {
  const phases = [0, 1, 0, -1]
  return phases[frame % 4]
}
function armSwing(frame) {
  const phases = [0, -1, 0, 1]
  return phases[frame % 4]
}

function drawCell(col, row, def, frame) {
  const cx = col * CELL + CELL / 2
  const baseY = row * CELL + CELL - 2
  const s = def.scale
  const headR = 4.2 * s
  const headCY = baseY - 22 * s
  const bodyTop = headCY + headR - 0.5
  const bodyBottom = baseY - 9 * s
  const bodyHalf = 4.8 * s * (def.sex === 'female' ? 0.92 : 1.0)
  const hipY = bodyBottom
  const footY = baseY
  const legSpread = 2.2 * s
  const ls = legSwing(frame) * 1.4 * s
  const as = armSwing(frame) * 1.6 * s
  const skinDk = darken(def.skin, 0.18)
  const shirtDk = darken(def.shirt, 0.25)
  const pantsDk = darken(def.pants, 0.25)
  const hairDk = darken(def.hair, 0.25)
  const hipWaist = bodyTop + (bodyBottom - bodyTop) * 0.45
  const parts = []
  parts.push(`<rect x="${cx - bodyHalf - 1.8 * s}" y="${bodyTop + 1.5 * s + as}" width="${1.8 * s}" height="${(bodyBottom - bodyTop) * 0.7}" fill="${def.skin}" stroke="${skinDk}" stroke-width="0.4"/>`)
  parts.push(`<rect x="${cx + bodyHalf}" y="${bodyTop + 1.5 * s - as}" width="${1.8 * s}" height="${(bodyBottom - bodyTop) * 0.7}" fill="${def.skin}" stroke="${skinDk}" stroke-width="0.4"/>`)
  parts.push(`<polygon points="${cx - bodyHalf},${bodyTop} ${cx + bodyHalf},${bodyTop} ${cx + bodyHalf * 1.1},${hipWaist} ${cx + bodyHalf * 0.95},${bodyBottom} ${cx - bodyHalf * 0.95},${bodyBottom} ${cx - bodyHalf * 1.1},${hipWaist}" fill="${def.shirt}" stroke="${shirtDk}" stroke-width="0.5"/>`)
  parts.push(`<rect x="${cx - legSpread - 1.6 * s}" y="${hipY}" width="${1.8 * s}" height="${footY - hipY - 0.5 + ls}" fill="${def.pants}" stroke="${pantsDk}" stroke-width="0.4"/>`)
  parts.push(`<rect x="${cx + legSpread - 0.2 * s}" y="${hipY}" width="${1.8 * s}" height="${footY - hipY - 0.5 - ls}" fill="${def.pants}" stroke="${pantsDk}" stroke-width="0.4"/>`)
  parts.push(`<circle cx="${cx}" cy="${headCY}" r="${headR}" fill="${def.skin}" stroke="${skinDk}" stroke-width="0.5"/>`)
  if (def.sex === 'female') {
    parts.push(`<path d="M ${cx - headR} ${headCY - headR * 0.2} Q ${cx} ${headCY - headR * 1.4} ${cx + headR} ${headCY - headR * 0.2} L ${cx + headR * 0.9} ${headCY + headR * 0.9} L ${cx - headR * 0.9} ${headCY + headR * 0.9} Z" fill="${def.hair}" stroke="${hairDk}" stroke-width="0.4"/>`)
  } else {
    parts.push(`<path d="M ${cx - headR} ${headCY - headR * 0.1} Q ${cx} ${headCY - headR * 1.3} ${cx + headR} ${headCY - headR * 0.1} L ${cx + headR * 0.95} ${headCY + headR * 0.1} L ${cx - headR * 0.95} ${headCY + headR * 0.1} Z" fill="${def.hair}" stroke="${hairDk}" stroke-width="0.4"/>`)
  }
  parts.push(`<circle cx="${cx - headR * 0.35}" cy="${headCY + headR * 0.15}" r="0.55" fill="#1a1a1a"/>`)
  parts.push(`<circle cx="${cx + headR * 0.35}" cy="${headCY + headR * 0.15}" r="0.55" fill="#1a1a1a"/>`)
  if (def.stage === 'adult' && def.sex === 'male') {
    parts.push(`<rect x="${cx - headR * 0.5}" y="${headCY + headR * 0.55}" width="${headR}" height="0.7" fill="${hairDk}"/>`)
  }
  return parts.join('')
}

let body = ''
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    body += drawCell(c, r, ROW_DEFS[r], c)
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" image-rendering="pixelated">
<rect width="${W}" height="${H}" fill="rgba(0,0,0,0)"/>
${body}
</svg>
`

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_PATH, svg, 'utf8')
console.log('wrote', OUT_PATH, `${W}x${H}`)
