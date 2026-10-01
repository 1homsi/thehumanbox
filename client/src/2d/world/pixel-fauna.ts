/**
 * Hand-drawn pixel sprites for animals the fauna atlas does not cover. Each
 * kind has two frames whose legs swap, so walking animals step instead of
 * sliding. Sprites face right; `flip` mirrors them.
 */
const PALETTE: Record<string, string> = {
  B: '#6b4a2e', // bear fur
  D: '#4a3220', // dark fur, legs
  S: '#c9a77a', // muzzle
  o: '#1a120b', // eyes, nose, hooves
  w: '#f1ece0', // wool, white hide
  W: '#d6cfbf', // wool shade
  k: '#3b3430', // dark face, legs, spots
  p: '#e8a0a0', // pink snout
  h: '#8a5a34', // chestnut coat
  m: '#3a2616', // mane, tail
  r: '#d8463a', // comb
  y: '#e9b949', // beak, feet
}

type Frames = [string[], string[]]

const SPRITES: Record<string, Frames> = {
  bear: [
    [
      '.........DD.',
      '..BBBBBBBBD.',
      '.BBBBBBBBBSo',
      '.BBBBBBBBBSS',
      '.BBBBBBBBBB.',
      '..BBBBBBBB..',
      '..DD.DD.DD..',
      '..DD....DD..',
    ],
    [
      '.........DD.',
      '..BBBBBBBBD.',
      '.BBBBBBBBBSo',
      '.BBBBBBBBBSS',
      '.BBBBBBBBBB.',
      '..BBBBBBBB..',
      '...DD..DD...',
      '...DD..DD...',
    ],
  ],
  sheep: [
    [
      '..WwwWwW....',
      '.wwwwwwwwkk.',
      'Wwwwwwwwwkok',
      'wwwwwwwwwkk.',
      '.wWwwwWww...',
      '..k..k.k....',
      '..k..k.k....',
    ],
    [
      '..WwwWwW....',
      '.wwwwwwwwkk.',
      'Wwwwwwwwwkok',
      'wwwwwwwwwkk.',
      '.wWwwwWww...',
      '...k.k..k...',
      '...k.k..k...',
    ],
  ],
  cow: [
    [
      '.........o.o',
      '.wwwwwwwwkkk',
      'wkkwwwwkwkok',
      'wkkwwwwwwppp',
      'wwwwwkkwww..',
      '.wwwwkkwww..',
      '.k..k..k.k..',
      '.o..o..o.o..',
    ],
    [
      '.........o.o',
      '.wwwwwwwwkkk',
      'wkkwwwwkwkok',
      'wkkwwwwwwppp',
      'wwwwwkkwww..',
      '.wwwwkkwww..',
      '..k.k...kk..',
      '..o.o...oo..',
    ],
  ],
  horse: [
    [
      '.........hh.',
      '........mhhh',
      '.......mhhoh',
      'm.hhhhhhhh..',
      'mhhhhhhhhh..',
      '.hhhhhhhh...',
      '.h.h...h.h..',
      '.h.h...h.h..',
      '.o.o...o.o..',
    ],
    [
      '.........hh.',
      '........mhhh',
      '.......mhhoh',
      'm.hhhhhhhh..',
      'mhhhhhhhhh..',
      '.hhhhhhhh...',
      '..hh...hh...',
      '..hh...hh...',
      '..oo...oo...',
    ],
  ],
  chicken: [
    ['.....rr.', '....www.', '....wowy', '.wwwwww.', 'wwwwwww.', '.wwwww..', '..y.y...'],
    ['.....rr.', '....www.', '....wowy', '.wwwwww.', 'wwwwwww.', '.wwwww..', '...yy...'],
  ],
}

/** Kinds this module draws; everything else uses the fauna atlas. */
export function hasPixelFauna(kind: string): boolean {
  return kind in SPRITES
}

/** Draws `kind` centred on (cx, cy) about `size` px wide. Returns false if unknown. */
export function drawPixelFauna(
  ctx: CanvasRenderingContext2D,
  kind: string,
  cx: number,
  cy: number,
  size: number,
  flip: boolean,
  frame: number,
): boolean {
  const frames = SPRITES[kind]
  if (!frames) return false
  const rows = frames[frame & 1]
  const cols = rows[0].length
  const px = Math.max(1, Math.round(size / cols))
  const w = cols * px
  const h = rows.length * px
  const x0 = Math.round(cx - w / 2)
  const y0 = Math.round(cy - h / 2)
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < cols; x++) {
      const c = row[x]
      if (c === '.') continue
      ctx.fillStyle = PALETTE[c]
      const dx = flip ? cols - 1 - x : x
      ctx.fillRect(x0 + dx * px, y0 + y * px, px, px)
    }
  }
  return true
}
