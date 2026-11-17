// Contact sheets of the drawn sprites, straight from their pixel grids: no browser and no build.
//
//   node bench/art-sheet.mjs --out /tmp/art [--scale 4] [--night 2] [--only kinds|homes|early] [--kinds Well,Barn]
//
// Writes <out>/kinds-N.png (every drawn building kind once, alphabetical), <out>/homes-<Kind>.png (each home
// kind by era and variant) and <out>/early.png (the first homes by land). Prints every sprite that does not fit
// the cell the map bakes it into (footprint + padding), and exits 1 if any does.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { saveSheet } from './sheet-canvas.mjs'
import { PALETTE_RGB } from '../src/game/render/pixel-art/palette.ts'
import { DRAWN, drawBuildingArt } from '../src/game/render/pixel-art/buildings/index.ts'
import { FOOTPRINTS } from '../src/game/render/building-draw/footprint-table.ts'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const out = path.resolve(opt('out', '/tmp/art-sheets'))
const scale = Number(opt('scale', '4'))
const night = Number(opt('night', '0'))
const only = opt('only', '')
const pick = opt('kinds', '')
const ground = opt('ground', '117,167,67').split(',').map(Number)
mkdirSync(out, { recursive: true })

let misfits = 0
function draw(kind, extra = {}) {
  const [fw, fh] = extra.fp ?? FOOTPRINTS[kind] ?? [1, 1]
  const look = { kind, fw, fh, variant: 0, night, tier: 4, state: '', land: '', ...extra }
  try {
    const art = drawBuildingArt(look)
    if (art && (art.w > fw * 8 + 16 || art.h > fh * 8 + 26)) {
      misfits++
      console.log(`does not fit: ${kind} ${JSON.stringify(extra)} is ${art.w}x${art.h}, cell holds ${fw * 8 + 16}x${fh * 8 + 26}`)
    }
    return art
  } catch (e) {
    misfits++
    console.log(`failed: ${kind} ${JSON.stringify(extra)}: ${e.message}`)
    return null
  }
}

const HOMES = ['Hut', 'House', 'TownHouse', 'Manor', 'Apartment', 'Skyscraper']
const TRIBE_ROOFS = [undefined, 'slate', 'moss', 'straw']

if (!only || only === 'kinds') {
  const kinds = (pick ? pick.split(',') : Object.keys(DRAWN).filter((k) => !HOMES.includes(k))).sort()
  const per = 40
  for (let i = 0, n = 0; i < kinds.length; i += per, n++) {
    const items = kinds.slice(i, i + per).map((kind) => ({ label: kind, art: draw(kind) }))
    saveSheet(path.join(out, `kinds-${n}.png`), `BUILDINGS ${n + 1}`, items, PALETTE_RGB, { scale, cols: 8, ground })
  }
  console.log(`${kinds.length} kinds`)
}

if (!only || only === 'homes') {
  for (const kind of HOMES) {
    const items = []
    for (let tier = 0; tier <= 8; tier++)
      for (const variant of [0, 1, 2, 3])
        items.push({ label: `t${tier} v${variant}`, art: draw(kind, { tier, variant, roof: TRIBE_ROOFS[variant], night: variant === 3 ? 2 : night }) })
    saveSheet(path.join(out, `homes-${kind}.png`), `${kind} BY ERA`, items, PALETTE_RGB, { scale: Math.min(scale, kind === 'Hut' || kind === 'House' ? 4 : 3), cols: 12, ground })
  }
}

if (!only || only === 'early') {
  const items = []
  for (const land of ['', 'round', 'adobe', 'snow', 'turf', 'stilt', 'longhouse'])
    for (const fw of [1, 2, 3])
      for (const variant of [0, 2, 3])
        items.push({ label: `${land || 'plain'} ${fw} v${variant}`, art: draw('Hut', { fp: [fw, fw], tier: 0, variant, land, roof: TRIBE_ROOFS[variant] }) })
  saveSheet(path.join(out, 'early.png'), 'EARLY HOMES BY LAND', items, PALETTE_RGB, { scale, cols: 9, ground })
}

if (misfits) {
  console.log(`${misfits} sprites do not fit or failed`)
  process.exit(1)
}
