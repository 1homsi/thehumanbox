import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INK, ROCK, SAND, SNOW, hex } from '../src/game/render/art-palette.ts'
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
  HUMAN_HAND_ROW,
} from '../src/game/render/character-visuals.ts'

const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sprites/people')

// Colours the shared palette lacks are defined here for the integrator to move into art-palette.ts: skin and
// hair ramps, cloth dyes and one strong accent per appearance. Ramps are lit, mid, shade.
const SKIN = [
  ['#d5a477', '#b77d56', '#81513b'],
  ['#a97752', '#825538', '#593b2c'],
  ['#edc6a0', '#d4a078', '#a27050'],
  ['#c48b60', '#9e6745', '#704732'],
  ['#916344', '#70492f', '#503528'],
  ['#e0b38b', '#bd8c65', '#8d6044'],
]
const HAIR = [
  ['#7a5438', '#553a28'],
  ['#55463d', '#2f2620'],
  ['#c06a3e', '#934a2b'],
  ['#a87444', '#7a5232'],
  ['#4b3a30', '#2d231d'],
  ['#e2c47c', '#bf9b55'],
]
const GREY_HAIR = [
  ['#e4e1d6', '#b5b1a5'],
  ['#cfc9bb', '#9c968b'],
]
const ACCENT = {
  rust: '#b4492f',
  teal: '#2f8079',
  ochre: '#d9a03a',
  indigo: '#43518f',
  plum: '#83456f',
  moss: '#5d7f34',
  cream: '#f3e8cb',
}
// Six dyes per era bank keep a one-era crowd from looking like clones: each appearance has its own garment ramp,
// trouser tone and accent, all mid to light so people separate from olive, ochre and dark-roof ground.
const DYES = [
  { cloth: ['#efe3c3', '#d9c79d', '#ac9872'], legs: ['#8a6f55', '#69523e'], accent: ACCENT.rust },
  { cloth: ['#e3a07a', '#c87a55', '#94553b'], legs: ['#7e8aa5', '#5d6884'], accent: ACCENT.cream },
  { cloth: ['#b5cfba', '#8eae9b', '#647f70'], legs: ['#9a8d76', '#766a56'], accent: ACCENT.ochre },
  { cloth: ['#ecd08a', '#d0aa5f', '#9d7b40'], legs: ['#6f7f9b', '#53607a'], accent: ACCENT.indigo },
  { cloth: ['#d2a6bb', '#ad8098', '#7e5a6e'], legs: ['#8c826f', '#6b6252'], accent: ACCENT.moss },
  { cloth: ['#aec0da', '#889dc0', '#627495'], legs: ['#8f7458', '#6c553f'], accent: ACCENT.rust },
]
// Hides and furs, each picked to differ from the skin it is paired with: grey wolf, pale doe, red-ochre
// russet, grey-brown, white fur and a dark pelt.
const HIDES = [
  ['#dcd6c8', '#b5ad9d', '#867e70'],
  ['#efe2c4', '#d6c39c', '#a8956f'],
  ['#cf805a', '#ab623f', '#7c472d'],
  ['#bcab90', '#998a72', '#706452'],
  ['#ece8dc', '#c6c0b1', '#948d80'],
  ['#a87e5a', '#86633f', '#5f462d'],
]
const HIDE_ACCENT = [ACCENT.teal, ACCENT.ochre, ACCENT.rust, ACCENT.indigo, ACCENT.cream, ACCENT.plum]
const FUR = '#f1e7cf'
const SUIT = [hex(SNOW.lit), '#d6d9cf', hex(SNOW.shade)]
const CREAM_SUIT = ['#f4ecd6', '#ddd2b4', '#b5aa8c']
const SUIT_ACCENT = [ACCENT.rust, ACCENT.teal, ACCENT.ochre, ACCENT.indigo, ACCENT.plum, ACCENT.moss]
const GLASS = '#d9eee9'
const ink = hex(INK)
const shoe = hex(ROCK.deep)
const shirt = hex(SNOW.lit)
const stick = '#6e4c30'

/** A material's darkest tone: its shade pulled a third of the way toward ink. */
function deepen(color) {
  const c = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  return (
    '#' +
    c
      .map((v, i) =>
        Math.round(v + (INK[i] - v) / 3)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

/**
 * Rows of each body part, counted from the top of the figure (row 0 is the outline above the hair). The head is
 * three pixels wide; the shoulder row is five, one pixel wider on each side, which is what makes the figure read
 * as a person rather than a capsule.
 */
const PLAN = {
  adult: { face: 2, eye: 3, chin: 4, shoulder: 5, hand: HUMAN_HAND_ROW.adult, legs: 11, foot: 15 },
  teen: { face: 2, eye: 3, chin: 4, shoulder: 5, hand: HUMAN_HAND_ROW.teen, legs: 10, foot: 13 },
  elder: { face: 2, eye: 3, chin: 4, shoulder: 5, hand: HUMAN_HAND_ROW.elder, legs: 10, foot: 13 },
  child: { face: 2, eye: 2, chin: 3, shoulder: 4, hand: HUMAN_HAND_ROW.child, legs: 7, foot: 9 },
}

function drawCell(frame, row, sex, stage, appearance, era, facing) {
  const pixels = new Map()
  const put = (x, y, color) => pixels.set(y * CELL + x, color)
  const top = FEET - HUMAN_HEIGHT[stage]
  // Light comes from the top-left in both facings; `dir` only turns hair, toes and the elder's stick.
  const dir = facing ? -1 : 1
  const female = sex === 'female'
  const skin = SKIN[appearance]
  const hair = stage === 'elder' ? GREY_HAIR[appearance % 2] : HAIR[appearance]
  const dye = DYES[appearance]
  const accent = era === 'hide' ? HIDE_ACCENT[appearance] : dye.accent

  if (stage === 'infant') drawInfant(put, top, frame, dir, skin, hair, era, appearance)
  else {
    const plan = PLAN[stage]
    const bob = frame === 2 ? 1 : 0
    // Elders lean toward where they walk, over the stick.
    const lean = stage === 'elder' ? dir : 0
    const at = (x, r, color) => put(16 + x, top + r, color)
    const body = (x, r, color) => at(x, r + bob, color)
    const head = (x, r, color) => body(x + lean, r, color)
    const helmet = era === 'spacesuit' && appearance % 2 === 0 && stage !== 'child'
    const outfit = garment(era, appearance, female, stage)

    // Head: hair, a three-row face with the lit side on the left and two dark eyes.
    for (let r = 1; r <= plan.chin; r++) {
      head(-1, r, skin[0])
      head(0, r, skin[1])
      head(1, r, skin[2])
    }
    head(-1, plan.eye, ink)
    head(1, plan.eye, ink)
    // Ears keep the eyes off the outline, so they read as eyes and not as notches in the head.
    head(-2, plan.eye, skin[1])
    head(2, plan.eye, skin[2])
    if (helmet) {
      // A clear visor: the face stays visible inside a light shell with a glint on the lit side.
      for (const x of [-1, 0, 1]) head(x, 1, x < 0 ? SUIT[0] : x > 0 ? SUIT[2] : SUIT[1])
      head(-1, plan.face, GLASS)
      head(0, plan.face, hair[0])
      for (let r = plan.face; r < plan.chin; r++) {
        head(-2, r, SUIT[0])
        head(2, r, SUIT[2])
      }
    } else drawHair(head, plan, hair, sex, appearance, stage, dir, accent, era)
    if (outfit.cap && stage !== 'child') {
      // A flat cap with its peak toward where the person walks.
      for (const x of [-1, 0, 1]) head(x, 1, x < 0 ? outfit.cap[0] : outfit.cap[1])
      head(dir * 2, 1, outfit.cap[1])
    }

    // Torso, arms and hands. Arms are a step darker than the chest so they separate from it.
    const swing = (side) => (frame === 1 && side > 0) || (frame === 3 && side < 0)
    const lowest = plan.legs - 1
    for (let r = plan.shoulder; r <= lowest; r++) {
      for (const x of [-1, 0, 1]) body(x, r, outfit.chest(x, r - plan.shoulder, r === lowest))
      for (const side of [-1, 1]) {
        const hand = plan.hand - (swing(side) ? 1 : 0)
        if (r > hand) continue
        const x = side * 2
        if (r === hand) body(x, r, side < 0 ? skin[0] : skin[1])
        else body(x, r, outfit.arm(side, r - plan.shoulder))
      }
    }

    // Legs: two columns with a one-pixel gap, or a hem for skirts and robes. Steps lift one foot.
    const footRow = plan.foot
    const legTop = plan.legs + bob
    const hem = outfit.hem ? Math.min(outfit.hem, footRow - legTop - 1) : 0
    for (let r = legTop; r < legTop + hem; r++)
      for (let x = -2; x <= 2; x++) at(x, r, outfit.skirt(x, r - legTop))
    const legW = stage === 'child' ? 1 : hem ? 1 : 2
    for (const side of [-1, 1]) {
      const lift = (frame === 1 && side < 0) || (frame === 3 && side > 0) ? 1 : 0
      const foot = footRow - lift
      for (let r = legTop + hem; r < foot; r++)
        for (let w = 0; w < legW; w++) {
          const x = side * (1 + w)
          at(x, r, outfit.leg(x, r - legTop, footRow - r))
        }
      for (let w = 0; w < legW; w++) at(side * (1 + w), foot, outfit.shoe)
      if (side === dir) at(side * (1 + legW), foot, outfit.shoe)
    }

    if (stage === 'elder' && era !== 'spacesuit') {
      for (let r = plan.shoulder + 1; r <= footRow; r++) at(dir * 4, r, stick)
    }
  }

  // Only the silhouette gets ink. Nothing is outlined below the feet, which stand on the ground, or above the
  // figure's height, where a bun replaces the outline.
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
      if (y + dy < FEET && y + dy >= top && !pixels.has(k)) outline.set(k, ink)
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

/** Six hairstyles per sex, so a crowd of one era still differs at a glance. */
function drawHair(head, plan, [lit, mid], sex, appearance, stage, dir, accent, era) {
  const back = -dir
  const cap = () => {
    head(-1, 1, lit)
    head(0, 1, mid)
    head(1, 1, mid)
  }
  if (stage === 'elder' && appearance % 3 === 2) {
    // Bald crown with grey at the sides.
    head(-1, 1, lit)
    head(1, 1, mid)
    return
  }
  cap()
  if (stage === 'child') {
    if (sex === 'female') head(back * 2, plan.face, mid)
    return
  }
  if (sex === 'male') {
    switch (appearance) {
      case 1:
        head(back, plan.face, mid)
        break
      case 2:
        head(-1, plan.face, lit)
        head(1, plan.face, mid)
        break
      case 3:
        head(back * 2, plan.face, mid)
        break
      case 5:
        // A beard along the chin.
        head(-1, plan.chin, lit)
        head(0, plan.chin, mid)
        head(1, plan.chin, mid)
        break
      default:
        break
    }
    return
  }
  switch (appearance) {
    case 0:
      // Bob framing the face.
      head(-2, plan.face, lit)
      head(2, plan.face, mid)
      head(-2, plan.eye, lit)
      head(2, plan.eye, mid)
      break
    case 1:
      // Ponytail behind.
      head(back, plan.face, mid)
      head(back * 2, plan.face, mid)
      head(back * 2, plan.eye, mid)
      head(back * 2, plan.chin, mid)
      break
    case 2:
      // Bun on top.
      head(0, 0, mid)
      head(back, plan.face, mid)
      break
    case 3:
      // Headscarf in the appearance's accent.
      for (const x of [-1, 0, 1]) head(x, 1, era === 'spacesuit' ? mid : accent)
      head(-2, plan.face, era === 'spacesuit' ? lit : accent)
      head(2, plan.face, era === 'spacesuit' ? mid : accent)
      break
    case 4:
      // Long hair down the back.
      head(back * 2, plan.face, mid)
      head(back * 2, plan.eye, mid)
      head(back * 2, plan.chin, mid)
      head(back * 2, plan.chin + 1, mid)
      break
    default:
      // Fringe.
      head(-1, plan.face, lit)
      head(1, plan.face, mid)
      break
  }
}

/**
 * The clothes of one era bank: chest colours by column, arm colours by side, an optional skirt or robe hem, leg
 * colours and shoes. Rows passed in are counted from the shoulder row or the top of the legs.
 */
function garment(era, appearance, female, stage) {
  const dye = DYES[appearance]
  const [lit, mid, shade] = dye.cloth
  const accent = era === 'hide' ? HIDE_ACCENT[appearance] : dye.accent
  const skin = SKIN[appearance]
  const small = stage === 'child'
  const legs = (ramp) => (x) => (x < 0 ? ramp[0] : ramp[1])
  const skirtOf = (ramp) => (x, r) => (x < 0 ? ramp[0] : x > 0 ? ramp[2] : r > 0 ? ramp[2] : ramp[1])
  const dress = female && !small && appearance % 2 === 0
  // Sleeves sit a step darker than the chest beside them, so arms separate from the body on both sides.
  const sleeve = (side, r) => (r === 0 ? (side < 0 ? lit : mid) : side < 0 ? shade : deepen(shade))
  if (era === 'hide') {
    // Pelts tied over one shoulder, a fur collar, a bead or tooth on a cord, and wrapped legs in another hide.
    const hide = HIDES[appearance]
    const wrap = HIDES[(appearance + 3) % HIDES.length]
    return {
      chest: (x, r, waist) => {
        if (r === 0) return x < 0 ? FUR : x === 0 ? hide[0] : hide[1]
        if (waist) return (x + r) % 2 ? hide[2] : hide[1]
        if (r === 1 && x === 0 && !small) return accent
        return x < 0 ? hide[0] : hide[1]
      },
      arm: (side, r) => (r === 0 ? (side < 0 ? FUR : hide[1]) : side < 0 ? skin[0] : skin[1]),
      hem: female && !small ? 1 : 0,
      skirt: (x) => ((x & 1) === 0 ? hide[2] : x < 0 ? hide[0] : hide[1]),
      leg: (x, r, fromFoot) => (fromFoot === 1 ? wrap[2] : x < 0 ? wrap[0] : wrap[1]),
      shoe: wrap[2],
    }
  }
  if (era === 'robe') {
    // Tunics and robes in a dyed cloth, belted with the accent.
    const robe = (female || appearance % 3 === 1) && !small
    return {
      chest: (x, r, waist) => (waist ? accent : r === 0 && x === 0 ? shade : x < 0 ? lit : x > 0 ? mid : lit),
      arm: sleeve,
      hem: robe ? 3 : 0,
      skirt: skirtOf(dye.cloth),
      leg: legs(dye.legs),
      shoe: hex(SAND.dune),
    }
  }
  if (era === 'coat') {
    // A white shirt and neckerchief under an open coat whose tails hang over the trousers; some men wear caps.
    return {
      chest: (x, r, waist) => (x === 0 ? (r === 0 ? accent : shirt) : waist ? mid : x < 0 ? lit : mid),
      arm: sleeve,
      hem: dress ? 3 : small ? 0 : 1,
      skirt: dress ? skirtOf(dye.cloth) : (x) => (x === 0 ? hex(ROCK.deep) : x < 0 ? lit : shade),
      leg: legs(dye.legs),
      shoe,
      cap: !female && appearance % 3 === 0 ? [hex(ROCK.mid), hex(ROCK.shade)] : null,
    }
  }
  if (era === 'uniform') {
    // Suits with a collar and tie for half the town; the rest wear a plain uniform shirt with a coloured belt.
    const suit = appearance % 2 === 0
    return {
      chest: suit
        ? (x, r, waist) =>
            x === 0 ? (r === 0 ? shirt : waist ? mid : accent) : waist ? mid : x < 0 ? lit : mid
        : (x, r, waist) =>
            waist ? accent : r === 0 ? (x === 0 ? shirt : x < 0 ? lit : mid) : x < 0 ? lit : mid,
      arm: sleeve,
      hem: dress ? 2 : 0,
      skirt: skirtOf(dye.cloth),
      leg: suit ? legs([mid, shade]) : legs(dye.legs),
      shoe,
    }
  }
  // Light suits with one bold stripe or chest panel; helmets have clear visors, or come off.
  const suit = appearance % 2 ? CREAM_SUIT : SUIT
  const stripe = SUIT_ACCENT[appearance]
  const panel = appearance % 2 === 1
  return {
    chest: (x, r, waist) => {
      if (r === 0) return x < 0 ? suit[0] : suit[1]
      if (waist) return x === 0 ? stripe : suit[2]
      if (panel) return r === 1 && x <= 0 ? stripe : x < 0 ? suit[0] : suit[1]
      return x === 0 ? stripe : x < 0 ? suit[0] : suit[1]
    },
    arm: (side, r) => (r === 1 ? stripe : side < 0 ? suit[1] : suit[2]),
    hem: 0,
    skirt: skirtOf(suit),
    leg: (x, r, fromFoot) => (fromFoot === 1 ? stripe : x < 0 ? suit[0] : suit[1]),
    shoe: hex(ROCK.shade),
  }
}

/** Infants are tiny swaddled figures: a head, two arms that wave as they toddle, and a wrap in the era's cloth. */
function drawInfant(put, top, frame, dir, skin, [hairLit, hairMid], era, appearance) {
  const at = (x, r, color) => put(16 + x, top + r, color)
  const dye = DYES[appearance]
  const wrap =
    era === 'hide'
      ? [FUR, HIDES[appearance][1]]
      : era === 'spacesuit'
        ? [SUIT[0], SUIT_ACCENT[appearance]]
        : era === 'uniform'
          ? [dye.cloth[0], dye.accent]
          : era === 'coat'
            ? [shirt, dye.cloth[1]]
            : [dye.cloth[0], dye.cloth[1]]
  at(-1, 1, skin[0])
  at(0, 1, hairMid)
  at(1, 1, skin[2])
  if (appearance % 2) at(-1, 1, hairLit)
  at(-1, 2, ink)
  at(0, 2, skin[1])
  at(1, 2, ink)
  for (const x of [-1, 0, 1]) {
    at(x, 3, x < 0 ? wrap[0] : x > 0 ? wrap[1] : wrap[0])
    at(x, 4, x === 0 ? wrap[1] : x < 0 ? wrap[0] : wrap[1])
  }
  at(-2, frame === 1 || frame === 2 ? 2 : 3, skin[0])
  at(2, frame === 2 || frame === 3 ? 2 : 3, skin[1])
  at(-1, 5, frame === 1 ? wrap[0] : skin[0])
  at(1, 5, frame === 3 ? wrap[1] : skin[1])
  if (frame === 0) at(dir * 2, 5, skin[2])
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
