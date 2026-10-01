// Player-planted crops, orchards and saplings. The sim sends them as a flat
// [x, y, kind, stage, ...] list; stage runs 0-3 while growing and 4 when ripe.

export const PLANT_KIND = { CROP: 0, ORCHARD: 1, SAPLING: 2 } as const

export interface PlantingCell {
  x: number
  y: number
  kind: number
  stage: number
}

export function decodePlantings(flat: readonly number[] | undefined): PlantingCell[] {
  if (!flat || flat.length < 4) return []
  const out: PlantingCell[] = []
  for (let i = 0; i + 3 < flat.length; i += 4) {
    out.push({ x: flat[i]!, y: flat[i + 1]!, kind: flat[i + 2]!, stage: flat[i + 3]! })
  }
  return out
}

type Ctx = CanvasRenderingContext2D

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(x, y, w, h)
}

// A tilled 8×8 plot: three ridges with darker furrows between them, so a
// field of neighbouring plots reads as one ploughed patch.
function drawCrop(ctx: Ctx, x: number, y: number, stage: number) {
  px(ctx, x, y, 8, 8, '#5a3c27')
  for (const r of [1, 4, 7]) px(ctx, x, y + r, 8, 1, '#7a5536')
  if (stage === 4) {
    // Ripe grain: a golden carpet with shaded rows and pale heads scattered
    // by position, so a big field reads as wheat rather than a grid.
    px(ctx, x, y, 8, 8, '#c79a3e')
    for (const r of [2, 5]) px(ctx, x, y + r, 8, 1, '#a97f31')
    let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b)) >>> 0
    for (let n = 0; n < 9; n++) {
      h ^= h >>> 15
      h = Math.imul(h, 0x2c1b3c6d) >>> 0
      h ^= h >>> 12
      h = Math.imul(h, 0x297a2d39) >>> 0
      h ^= h >>> 15
      const hx = h & 7
      const hy = (h >>> 3) & 7
      px(ctx, x + hx, y + hy, 1, 1, n % 3 === 0 ? '#e0b650' : '#f2d77e')
    }
    return
  }
  const leaf = stage >= 3 ? '#9dbb48' : '#76a94a'
  const height = stage <= 0 ? 0 : stage
  for (const r of [1, 4, 7]) {
    for (let c = 1; c < 8; c += 2) {
      if (height === 0) {
        px(ctx, x + c, y + r, 1, 1, '#b9a067')
        continue
      }
      px(ctx, x + c, y + r - height + 1, 1, height, leaf)
      if (height >= 2) px(ctx, x + c - 1, y + r - height + 2, 1, 1, '#5f9440')
    }
  }
}

function drawShadow(ctx: Ctx, x: number, y: number, w: number) {
  px(ctx, x + 4 - Math.ceil(w / 2), y + 7, w, 1, 'rgba(0,0,0,0.22)')
}

// A fruit tree grows from a staked twig to a full crown hung with fruit.
function drawOrchard(ctx: Ctx, x: number, y: number, stage: number) {
  const trunk = '#6e4a2e'
  if (stage <= 0) {
    drawShadow(ctx, x, y, 2)
    px(ctx, x + 3, y + 4, 1, 3, trunk)
    px(ctx, x + 4, y + 4, 1, 1, '#76a94a')
    return
  }
  if (stage === 1) {
    drawShadow(ctx, x, y, 3)
    px(ctx, x + 3, y + 4, 1, 3, trunk)
    px(ctx, x + 2, y + 2, 3, 2, '#5f9440')
    px(ctx, x + 3, y + 2, 1, 1, '#86b55a')
    return
  }
  drawShadow(ctx, x, y, 5)
  px(ctx, x + 3, y + 5, 2, 2, trunk)
  const full = stage >= 3
  px(ctx, x + 1, y + 1, 6, full ? 4 : 3, '#4f8a3c')
  px(ctx, x + 2, y + 0, 4, 1, '#4f8a3c')
  px(ctx, x + 2, y + 1, 3, 2, '#6fa64c')
  px(ctx, x + 2, y + 1, 1, 1, '#8cc061')
  if (full) px(ctx, x + 5, y + 3, 2, 2, '#3f7432')
  if (stage === 4) {
    px(ctx, x + 2, y + 3, 1, 1, '#d6453a')
    px(ctx, x + 5, y + 2, 1, 1, '#d6453a')
    px(ctx, x + 4, y + 4, 1, 1, '#e8603f')
    px(ctx, x + 1, y + 2, 1, 1, '#e8603f')
    px(ctx, x + 6, y + 6, 1, 1, '#c33c32')
  }
}

// A young tree: sprout, seedling, sapling, then a small crown before it
// joins the forest proper.
function drawSapling(ctx: Ctx, x: number, y: number, stage: number) {
  const trunk = '#6b4a30'
  if (stage <= 0) {
    px(ctx, x + 3, y + 5, 1, 2, '#5f9440')
    px(ctx, x + 2, y + 5, 1, 1, '#86b55a')
    px(ctx, x + 4, y + 4, 1, 1, '#86b55a')
    return
  }
  if (stage === 1) {
    drawShadow(ctx, x, y, 2)
    px(ctx, x + 3, y + 4, 1, 3, trunk)
    px(ctx, x + 2, y + 3, 3, 1, '#5f9440')
    px(ctx, x + 3, y + 2, 1, 1, '#86b55a')
    return
  }
  drawShadow(ctx, x, y, stage === 2 ? 3 : 4)
  px(ctx, x + 3, y + 5, 1, 2, trunk)
  if (stage === 2) {
    px(ctx, x + 2, y + 2, 3, 3, '#4f8a3c')
    px(ctx, x + 3, y + 1, 1, 1, '#4f8a3c')
    px(ctx, x + 2, y + 2, 1, 1, '#7fb04e')
    return
  }
  px(ctx, x + 1, y + 2, 5, 3, '#447c36')
  px(ctx, x + 2, y + 1, 3, 1, '#447c36')
  px(ctx, x + 3, y + 0, 1, 1, '#447c36')
  px(ctx, x + 2, y + 2, 2, 1, '#6fa64c')
  px(ctx, x + 5, y + 3, 1, 2, '#36672c')
}

export function drawPlanting(ctx: Ctx, x: number, y: number, kind: number, stage: number) {
  if (kind === PLANT_KIND.CROP) drawCrop(ctx, x, y, stage)
  else if (kind === PLANT_KIND.ORCHARD) drawOrchard(ctx, x, y, stage)
  else drawSapling(ctx, x, y, stage)
}
