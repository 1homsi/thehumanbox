// Page code for buildings-sheet.mjs: paints buildings exactly the way the map bakes them (drawBuilding
// into a padded cell) and lays them out in labelled grids at 3x.
import { PAD, PAD_TOP } from '../src/game/render/building-painters/kit'
import { BUILDING_SPRITE_KINDS } from '../src/game/render/building-painters/registry'
import { drawBuilding } from '../src/game/render/building-draw/draw'
import { resolveBuildingFootprint } from '../src/game/render/building-draw/footprints'
import { TILE } from '../src/game/model/palette'

const params = new URLSearchParams(location.search)
const SCALE = Number(params.get('scale') ?? 3)
const ONLY = params.get('only')
const HOMES = ['Hut', 'House', 'Manor', 'TownHouse', 'Apartment', 'Skyscraper']

interface Spec {
  kind: string
  tier: number
  variant: number
  night: number
  tint?: string
  snow?: boolean
  cond?: number
}

// The sim sends snake_case kinds; normKind rebuilds the CamelCase name the painters are keyed by.
const wireKind = (kind: string) => kind.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

function cell(spec: Spec): HTMLCanvasElement {
  const probe = { id: 1, kind: wireKind(spec.kind), x: 0, y: 0 } as never
  const [fw, fh] = resolveBuildingFootprint(probe)
  const canvas = document.createElement('canvas')
  canvas.width = fw * TILE + PAD * 2
  canvas.height = fh * TILE + PAD_TOP + 4
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.translate(PAD, PAD_TOP)
  // Variant lives in the id: drawBuilding hashes id, x and y and keeps the low three bits.
  const id = findId(spec.variant)
  const record = {
    id,
    kind: wireKind(spec.kind),
    x: 0,
    y: 0,
    condition: spec.cond ?? 1,
    tier: spec.tier,
    roofTint: spec.tint,
    snow: spec.snow,
  } as never
  drawBuilding(ctx, record, 0, 0, TILE, spec.night, 'standard')
  return canvas
}

const idForVariant = new Map<number, number>()
function findId(variant: number): number {
  let id = idForVariant.get(variant)
  if (id !== undefined) return id
  for (id = 1; id < 1000; id++) {
    const v = ((((id * 2654435761) ^ 0 ^ 0) >>> 0) & 7) as number
    if (v === variant) break
  }
  idForVariant.set(variant, id)
  return id
}

function section(title: string, ground: string, cells: { label: string; spec: Spec }[], cols: number) {
  if (ONLY && !title.startsWith(ONLY)) return
  const wrap = document.createElement('section')
  wrap.style.cssText = `background:${ground};padding:8px;display:inline-block;margin:0 0 6px 0;font:10px monospace;color:#f0e6cc`
  const h = document.createElement('div')
  h.textContent = title
  h.style.cssText = 'font:bold 12px monospace;margin:0 0 6px'
  wrap.appendChild(h)
  const grid = document.createElement('div')
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${Number(params.get('cols')) || cols},max-content);gap:6px 10px;align-items:end`
  for (const { label, spec } of cells) {
    const box = document.createElement('div')
    const c = cell(spec)
    c.style.cssText = `width:${c.width * SCALE}px;height:${c.height * SCALE}px;image-rendering:pixelated;display:block`
    box.appendChild(c)
    const l = document.createElement('div')
    l.textContent = label
    box.appendChild(l)
    grid.appendChild(box)
  }
  wrap.appendChild(grid)
  document.body.appendChild(wrap)
  document.body.appendChild(document.createElement('br'))
  return wrap
}

const GROUND = '#7d8b4a'
const night = Number(params.get('night') ?? 0)
const tierForKinds = Number(params.get('tier') ?? 4)
document.body.style.cssText = 'margin:0;background:#3a2c1c'

// Homes: one row per era tier, a few variants of each home kind.
for (const kind of HOMES) {
  const cells: { label: string; spec: Spec }[] = []
  for (let tier = 0; tier <= 8; tier++) {
    for (let variant = 0; variant < 4; variant++) {
      cells.push({ label: `t${tier} v${variant}`, spec: { kind, tier, variant, night } })
    }
  }
  section(`${kind} by era`, GROUND, cells, 12)
}

// Every other kind once.
const rest = BUILDING_SPRITE_KINDS.filter((k) => !HOMES.includes(k)).sort()
const per = Math.ceil(rest.length / 3)
for (let i = 0; i < 3; i++) {
  const slice = rest.slice(i * per, (i + 1) * per)
  section(
    `kinds ${i + 1}/3 at era tier ${tierForKinds}`,
    GROUND,
    slice.map((kind) => ({ label: kind, spec: { kind, tier: tierForKinds, variant: 0, night } })),
    10,
  )
}

// Condition and snow on a few homes.
section(
  'damaged and snowy homes',
  GROUND,
  ['House', 'TownHouse', 'Manor', 'Hut'].flatMap((kind) => [
    { label: `${kind} damaged`, spec: { kind, tier: 3, variant: 1, night, cond: 0.1 } },
    { label: `${kind} snow`, spec: { kind, tier: 3, variant: 1, night, snow: true } },
  ]),
  8,
)
;(window as unknown as { __sheetDone: boolean }).__sheetDone = true
