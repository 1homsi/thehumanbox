import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputDir = resolve(scriptDir, '../public/sprites/people')
const outputPath = resolve(outputDir, 'people.svg')

const CELL = 32
const FRAMES = 4
const APPEARANCES = 3
const STAGES = ['infant', 'child', 'teen', 'adult', 'elder']
const SEXES = ['male', 'female']
const ROWS = SEXES.length * STAGES.length * APPEARANCES
const WIDTH = CELL * FRAMES
const HEIGHT = CELL * ROWS
const OUTLINE = '#211914'

const STAGE_METRICS = {
  infant: { headW: 8, headH: 7, bodyW: 8, torsoH: 5, legH: 3, armH: 4 },
  child: { headW: 10, headH: 8, bodyW: 10, torsoH: 7, legH: 6, armH: 6 },
  teen: { headW: 10, headH: 9, bodyW: 12, torsoH: 8, legH: 8, armH: 7 },
  adult: { headW: 10, headH: 9, bodyW: 12, torsoH: 9, legH: 9, armH: 8 },
  elder: { headW: 10, headH: 9, bodyW: 12, torsoH: 9, legH: 7, armH: 7 },
}

const PALETTES = [
  {
    skin: '#d8a070',
    skinShade: '#a96f4f',
    hair: '#34231d',
    shirt: '#537c9b',
    shirtLight: '#76a4be',
    pants: '#293b55',
  },
  {
    skin: '#8f5b3f',
    skinShade: '#65402f',
    hair: '#171413',
    shirt: '#4f8755',
    shirtLight: '#71a66c',
    pants: '#4c3a2b',
  },
  {
    skin: '#efc49e',
    skinShade: '#bd8b6c',
    hair: '#8c542d',
    shirt: '#a94f4c',
    shirtLight: '#d37368',
    pants: '#57456e',
  },
]

const ELDER_HAIR = ['#b9b5aa', '#807c76', '#d6d0c4']

const rect = (x, y, width, height, fill) =>
  width > 0 && height > 0
    ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`
    : ''

function drawOutlinedRect(parts, x, y, width, height, fill, highlight) {
  parts.push(rect(x, y, width, height, OUTLINE))
  parts.push(rect(x + 1, y + 1, width - 2, height - 2, fill))
  if (highlight && width >= 5 && height >= 4) {
    parts.push(rect(x + 2, y + 1, width - 4, 1, highlight))
  }
}

function drawHead(parts, x, y, width, height, sex, stage, palette, appearance) {
  const hair = stage === 'elder' ? ELDER_HAIR[appearance] : palette.hair

  parts.push(rect(x + 1, y, width - 2, height, OUTLINE))
  parts.push(rect(x, y + 2, width, height - 4, OUTLINE))
  parts.push(rect(x + 2, y + 1, width - 4, height - 2, palette.skin))
  parts.push(rect(x + 1, y + 3, width - 2, height - 5, palette.skin))
  parts.push(rect(x + 2, y + height - 2, width - 4, 1, palette.skinShade))

  if (stage === 'infant') {
    parts.push(rect(x + 3, y, Math.max(2, width - 6), 2, hair))
  } else if (sex === 'female') {
    parts.push(rect(x + 1, y, width - 2, 3, hair))
    parts.push(rect(x, y + 2, 2, Math.max(3, height - 2), hair))
    parts.push(rect(x + width - 2, y + 2, 2, Math.max(3, height - 2), hair))
  } else {
    parts.push(rect(x + 1, y, width - 2, 3, hair))
    parts.push(rect(x, y + 2, 2, 2, hair))
    parts.push(rect(x + width - 2, y + 2, 2, 2, hair))
  }

  const eyeY = y + Math.max(4, height - 4)
  parts.push(rect(x + 2, eyeY, 1, 1, '#181515'))
  parts.push(rect(x + width - 3, eyeY, 1, 1, '#181515'))

  if (stage === 'elder') {
    parts.push(rect(x + 2, y + height - 2, width - 4, 1, hair))
  }
}

function drawLeg(parts, x, top, height, palette) {
  drawOutlinedRect(parts, x, top, 4, height, palette.pants)
  parts.push(rect(x, top + height - 2, 4, 2, OUTLINE))
}

function drawArm(parts, x, top, height, shirtOnLeft, palette) {
  drawOutlinedRect(parts, x, top, 3, height, palette.skin)
  const shirtX = shirtOnLeft ? x + 1 : x + 1
  parts.push(rect(shirtX, top + 1, 1, Math.min(3, height - 2), palette.shirt))
}

function framePose(frame) {
  switch (frame) {
    case 1:
      return {
        bob: 0,
        leftLegX: -2,
        rightLegX: 1,
        leftLegShorten: 0,
        rightLegShorten: 2,
        leftArmY: 0,
        rightArmY: 2,
      }
    case 2:
      return {
        bob: -1,
        leftLegX: -1,
        rightLegX: 2,
        leftLegShorten: 1,
        rightLegShorten: 1,
        leftArmY: 2,
        rightArmY: 0,
      }
    case 3:
      return {
        bob: 0,
        leftLegX: 1,
        rightLegX: -2,
        leftLegShorten: 2,
        rightLegShorten: 0,
        leftArmY: 2,
        rightArmY: 0,
      }
    default:
      return {
        bob: 0,
        leftLegX: 0,
        rightLegX: 0,
        leftLegShorten: 0,
        rightLegShorten: 0,
        leftArmY: 1,
        rightArmY: 1,
      }
  }
}

function drawCell(col, row, sex, stage, appearance) {
  const originX = col * CELL
  const originY = row * CELL
  const centerX = originX + CELL / 2
  const feetY = originY + 30
  const metrics = STAGE_METRICS[stage]
  const palette = PALETTES[appearance]
  const pose = framePose(col)
  const bodyBottom = feetY - metrics.legH + pose.bob
  const bodyTop = bodyBottom - metrics.torsoH
  const bodyX = centerX - metrics.bodyW / 2
  const headX = centerX - metrics.headW / 2
  const headY = bodyTop - metrics.headH + 1
  const parts = []

  const leftLegHeight = Math.max(3, metrics.legH - pose.leftLegShorten)
  const rightLegHeight = Math.max(3, metrics.legH - pose.rightLegShorten)
  drawLeg(parts, centerX - 5 + pose.leftLegX, feetY - leftLegHeight + pose.bob, leftLegHeight, palette)
  drawLeg(parts, centerX + 1 + pose.rightLegX, feetY - rightLegHeight + pose.bob, rightLegHeight, palette)

  drawArm(parts, bodyX - 3, bodyTop + pose.leftArmY, Math.max(4, metrics.armH - pose.leftArmY), true, palette)
  drawArm(
    parts,
    bodyX + metrics.bodyW,
    bodyTop + pose.rightArmY,
    Math.max(4, metrics.armH - pose.rightArmY),
    false,
    palette,
  )

  drawOutlinedRect(parts, bodyX, bodyTop, metrics.bodyW, metrics.torsoH, palette.shirt, palette.shirtLight)
  parts.push(rect(bodyX + 1, bodyTop + metrics.torsoH - 2, metrics.bodyW - 2, 1, OUTLINE))

  if (sex === 'female' && stage !== 'infant') {
    parts.push(rect(bodyX + 1, bodyTop + metrics.torsoH - 3, metrics.bodyW - 2, 2, palette.shirtLight))
  }

  drawHead(parts, headX, headY, metrics.headW, metrics.headH, sex, stage, palette, appearance)

  if (stage === 'elder') {
    const caneX = bodyX + metrics.bodyW + 3
    parts.push(rect(caneX, bodyTop + 3, 2, feetY - bodyTop - 2, OUTLINE))
    parts.push(rect(caneX - 2, bodyTop + 3, 4, 2, OUTLINE))
    parts.push(rect(caneX - 1, bodyTop + 4, 1, 1, '#a77945'))
    parts.push(rect(caneX, bodyTop + 5, 1, feetY - bodyTop - 5, '#a77945'))
  }

  return parts.join('')
}

let body = ''
let row = 0
for (const sex of SEXES) {
  for (const stage of STAGES) {
    for (let appearance = 0; appearance < APPEARANCES; appearance++) {
      for (let frame = 0; frame < FRAMES; frame++) {
        body += drawCell(frame, row, sex, stage, appearance)
      }
      row += 1
    }
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges" image-rendering="pixelated">
<rect width="${WIDTH}" height="${HEIGHT}" fill="none"/>
${body}
</svg>
`

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputPath, svg, 'utf8')
console.log('wrote', outputPath, `${WIDTH}x${HEIGHT}`)
