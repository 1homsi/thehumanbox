import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INK, ROCK, SAND, FOREST, OCEAN, SNOW, BIOME_TONES, hex } from '../src/game/render/art-palette.ts'
import {
  HUMAN_ATLAS_CELL as CELL,
  HUMAN_ATLAS_FRAMES as FRAMES,
  HUMAN_APPEARANCES as APPEARANCES,
  HUMAN_STAGE_ORDER as STAGES,
  HUMAN_SEX_ORDER as SEXES,
  HUMAN_CLOTHING_ERAS as ERAS,
  HUMAN_ATLAS_WIDTH as WIDTH,
  HUMAN_ATLAS_HEIGHT as HEIGHT,
  HUMAN_FEET_ROW as FEET,
  HUMAN_HEIGHT,
} from '../src/game/render/character-visuals.ts'

const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sprites/people')
// Skin needs its own warm ramps; all cloth, hair and outlines use the shared palette.
const SKIN = [
  ['#d5a477', '#b77d56', '#81513b'],
  ['#a97752', '#825538', '#593b2c'],
  ['#edc6a0', '#d4a078', '#a27050'],
  ['#c48b60', '#9e6745', '#704732'],
  ['#916344', '#70492f', '#503528'],
  ['#e0b38b', '#bd8c65', '#8d6044'],
]
const cloth = [
  [SAND.light, SAND.desert, SAND.dune],
  [FOREST.light, FOREST.mid, FOREST.dark],
  [ROCK.lit, ROCK.mid, ROCK.shade],
  [SAND.light, BIOME_TONES.badlands, ROCK.shade],
  [OCEAN.surf, OCEAN.shallows, OCEAN.deep],
  [SNOW.lit, SNOW.shade, ROCK.mid],
].map((ramp) => ramp.map(hex))
const hairs = [ROCK.deep, INK, SAND.dune, ROCK.shade, INK, SAND.desert].map(hex)
const ink = hex(INK)
const deep = hex(ROCK.deep)
const white = hex(SNOW.lit)

function drawCell(frame, row, sex, stage, appearance, era, facing) {
  const pixels = new Map()
  const put = (x, y, color) => pixels.set(y * CELL + x, color)
  const box = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, color)
  }
  const height = HUMAN_HEIGHT[stage]
  const top = FEET - height
  const small = stage === 'infant' || stage === 'child'
  const [skinLight, skin, skinShade] = SKIN[appearance]
  const [lit, mid, shade] = cloth[appearance]
  const hair = stage === 'elder' ? hex(appearance % 2 ? ROCK.lit : SNOW.shade) : hairs[appearance]
  const headY = top + 1
  const headH = small ? 2 : 3
  const bodyY = headY + headH + 1
  const legY = FEET - (stage === 'infant' ? 2 : stage === 'child' ? 3 : 4)
  const leftStep = frame === 1 ? -1 : frame === 3 ? 1 : 0
  const rightStep = -leftStep

  // Feet trade places without moving the ground anchor or rescaling the figure.
  for (const [x, step, color] of [
    [14, leftStep, hex(ROCK.mid)],
    [17, rightStep, deep],
  ]) {
    box(x, legY, 1, FEET - 1 - legY - (frame === 2 && x === 14 ? 1 : 0), color)
    put(x + (small ? 0 : step), FEET - 2 - (frame === 2 && x === 14 ? 1 : 0), color)
  }
  box(14, bodyY, 4, Math.max(1, legY - bodyY + 1), mid)
  box(14, bodyY, 1, Math.max(1, legY - bodyY + 1), lit)
  box(17, bodyY + 1, 1, Math.max(0, legY - bodyY), shade)
  const armY = Math.min(legY, bodyY + (frame === 1 ? 1 : 0))
  box(13, armY, 1, Math.max(1, legY - armY), lit)
  put(13, Math.max(armY, legY), skinLight)
  box(18, Math.min(legY, bodyY + (frame === 3 ? 1 : 0)), 1, Math.max(1, legY - bodyY), shade)
  put(18, legY, skinShade)

  if (!small) {
    if (era === 'hide') {
      // Uneven fur collar and hem, a leather strap instead of a modern shirt.
      box(14, bodyY, 4, 1, hex(SAND.wet))
      put(14, bodyY + 1, hex(SAND.light))
      put(16, bodyY + 1, hex(SAND.dune))
      put(15, legY + 1, mid)
      box(16, bodyY + 2, 1, Math.max(1, legY - bodyY - 1), hex(ROCK.shade))
    } else if (era === 'robe') {
      box(14, legY, 4, sex === 'female' || appearance % 2 ? 2 : 1, mid)
      box(14, bodyY, 1, FEET - bodyY - 2, lit)
      box(17, bodyY + 1, 1, FEET - bodyY - 3, shade)
      box(14, legY - 1, 4, 1, hex(SAND.dune))
      put(15, bodyY, hex(SAND.light))
    } else if (era === 'coat') {
      box(15, bodyY, 2, 2, white)
      box(14, legY, 1, 2, lit)
      box(17, legY, 1, 2, shade)
      put(16, legY - 1, hex(SAND.desert))
    } else if (era === 'uniform') {
      box(14, bodyY, 4, legY - bodyY + 1, appearance % 2 ? hex(FOREST.dark) : hex(OCEAN.deep))
      box(14, bodyY, 1, legY - bodyY, appearance % 2 ? hex(FOREST.light) : hex(OCEAN.shallows))
      box(15, bodyY, 2, 2, white)
      put(16, bodyY + 1, hex(BIOME_TONES.badlands))
      put(17, bodyY + 2, hex(SAND.desert))
    } else {
      const space = appearance % 2 === 0
      box(14, bodyY, 4, legY - bodyY + 1, space ? hex(SNOW.shade) : hex(OCEAN.deep))
      box(14, bodyY, 1, legY - bodyY + 1, space ? white : hex(OCEAN.shallows))
      box(15, bodyY + 1, 2, 1, hex(OCEAN.open))
      put(15, bodyY + 1, hex(OCEAN.surf))
      if (space) box(19, bodyY + 1, 1, 3, hex(ROCK.shade))
    }
  }

  if (small && era !== 'hide') {
    const color = era === 'spacesuit' ? white : era === 'uniform' ? hex(OCEAN.deep) : mid
    box(14, bodyY, 4, Math.max(1, legY - bodyY + 1), color)
    put(14, bodyY, era === 'uniform' ? hex(OCEAN.shallows) : lit)
    if (era === 'robe') put(15, legY, hex(SAND.dune))
    if (era === 'coat') put(16, bodyY, white)
    if (era === 'spacesuit') put(16, bodyY, hex(OCEAN.open))
  }

  // Three-quarter heads: one eye and a nose, with the light fixed in world space.
  box(15, headY, 3, headH, skin)
  box(15, headY, 1, headH, skinLight)
  box(17, headY + 1, 1, headH - 1, skinShade)
  const faceX = facing ? 14 : 18
  if (!small) put(faceX, headY + 2, facing ? skinLight : skinShade)
  box(15, headY, stage === 'infant' ? 1 : 3, 1, hair)
  if (!small) {
    put(facing ? 15 : 17, headY + 1, deep)
    const backX = facing ? 18 : 14
    box(backX, headY + 1, 1, sex === 'female' ? headH + 1 : 1, hair)
    if (appearance % 3 === 1) put(backX, headY, hair)
    if (stage === 'elder') box(15, headY + headH, 3, 1, hair)
    if (era === 'spacesuit' && appearance % 2 === 0) {
      box(14, headY, 5, 1, white)
      box(14, headY, 1, headH + 1, white)
      box(18, headY, 1, headH + 1, hex(SNOW.shade))
      box(15, headY, 3, 1, hex(OCEAN.surf))
    }
  }

  if (small) {
    put(facing ? 15 : 17, headY + 1, deep)
    if (stage === 'child' && sex === 'female') put(facing ? 18 : 14, headY + 2, hair)
  }

  if (stage === 'elder' && era !== 'spacesuit') {
    box(20, FEET - 6, 1, 5, hex(SAND.dune))
    put(19, FEET - 6, hex(SAND.light))
  }

  if (stage === 'infant') {
    put(13, FEET - 2, mid)
    put(18, FEET - 2, shade)
    put(13, FEET - 2 - (frame === 1 || frame === 2 ? 1 : 0), skinLight)
    put(18, FEET - 2 - (frame === 2 || frame === 3 ? 1 : 0), skinShade)
  }

  // Only the silhouette gets ink; internal seams use the material's shade.
  const outline = new Map()
  for (const key of pixels.keys()) {
    const x = key % CELL
    const y = Math.floor(key / CELL)
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const k = (y + dy) * CELL + x + dx
      if (!pixels.has(k)) outline.set(k, ink)
    }
  }
  const col = ERAS.indexOf(era) * FRAMES * 2 + facing * FRAMES + frame
  const colored = new Map([...outline, ...pixels])
  const paths = new Map()
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL;) {
      const color = colored.get(y * CELL + x)
      if (!color) {
        x++
        continue
      }
      let w = 1
      while (x + w < CELL && colored.get(y * CELL + x + w) === color) w++
      const d = `M${col * CELL + x} ${row * CELL + y}h${w}v1h-${w}z`
      paths.set(color, (paths.get(color) ?? '') + d)
      x += w
    }
  return [...paths].map(([color, d]) => `<path fill="${color}" d="${d}"/>`).join('')
}

let body = ''
let row = 0
for (const sex of SEXES)
  for (const stage of STAGES)
    for (let appearance = 0; appearance < APPEARANCES; appearance++) {
      body += `\n<!-- sex ${sex}, stage ${stage}, appearance ${appearance} -->\n`
      for (const era of ERAS)
        for (let facing = 0; facing < 2; facing++)
          for (let frame = 0; frame < FRAMES; frame++) {
            body += drawCell(frame, row, sex, stage, appearance, era, facing)
          }
      row++
    }
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges">
${body}
</svg>
`
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'people.svg'), svg)
console.log(`wrote people.svg ${WIDTH}x${HEIGHT}; rasterise in Chrome as described in ART_NOTES.md`)

// Chrome is the reference rasterizer; other SVG decoders disagree on transparent pixels.
if (process.argv.includes('--raster')) {
  const { launchChrome } = await import('../bench/cdp.mjs')
  const { execFileSync } = await import('node:child_process')
  const { readFileSync, renameSync } = await import('node:fs')
  const portArg = process.argv.indexOf('--port')
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 9786
  const chrome = await launchChrome({ port, width: WIDTH, height: 800, dpr: 1, headless: true })
  const pngPath = resolve(outputDir, 'people.png')
  try {
    const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    const data = await chrome.page.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(uri)}; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      window.peoplePixels = ctx.getImageData(0, 0, c.width, c.height).data;
      return c.toDataURL('image/png').split(',')[1];
    })()`)
    writeFileSync(pngPath, Buffer.from(data, 'base64'))
    const optimized = resolve(outputDir, 'people.optimized.png')
    execFileSync('magick', [
      pngPath,
      '-strip',
      '-define',
      'png:compression-level=9',
      '-define',
      'png:compression-filter=5',
      optimized,
    ])
    renameSync(optimized, pngPath)
    const pngUri = 'data:image/png;base64,' + readFileSync(pngPath).toString('base64')
    const mismatches = await chrome.page.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(pngUri)}; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let bad = 0; for (let i = 0; i < pixels.length; i++) if (pixels[i] !== window.peoplePixels[i]) bad++;
      return bad;
    })()`)
    if (mismatches) throw new Error(`SVG/PNG RGBA mismatch: ${mismatches} bytes`)
    console.log('wrote people.png; optimized PNG and SVG have identical RGBA bytes')
  } finally {
    chrome.killNow()
  }
}
