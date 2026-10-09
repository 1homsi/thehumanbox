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
  g: '#86a86a', // zombie skin
  t: '#5b6f8f', // zombie rags
  R: '#b8332a', // demon
  l: '#ffd34d', // glowing eyes, ufo lights
  F: '#ff8a2a', // demon flames
  d: '#3f8f5a', // dragon scales
  e: '#d2d27a', // dragon belly
  a: '#a6e38f', // alien skin
  A: '#5d9a52', // alien suit
  q: '#aab4bf', // ufo hull
  c: '#8fd8ff', // ufo dome
  f: '#c96a2c', // fox red
  n: '#8f8a84', // cat grey
  N: '#4f4a46', // cat stripes, feet
  x: '#c9a46a', // camel tan
  X: '#8a6a3e', // camel shade, legs
  v: '#6aa84f', // frog green
  V: '#3f7a32', // frog shade
  u: '#4b6e8f', // whale blue
  z: '#dfe7ec', // whale belly
  Y: '#f2d45c', // duck yellow
  Q: '#e0803a', // duck bill, feet
  i: '#f5c93d', // bee gold
  I: '#2a2420', // bee stripes
  j: '#dfe9f2', // bee wings
  O: '#8a6a4a', // owl brown
  L: '#eadcc0', // owl face and belly
  E: '#ffc93c', // owl eyes
  G: '#4a3a2a', // owl wing shade
  Z: '#4a3626', // eagle brown
  H: '#f6f2e6', // eagle head
}

/** Poses of a kind: the walk frames, then (for bears) a lying pose for sleeping. */
type Frames = readonly (readonly string[])[]

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
    ['.........DD.', '..BBBBBBBBD.', '.BBBBBBBBBSk', 'BBBBBBBBBBBS', 'BBBBBBBBBBB.', 'DD.D.DD.D.DD'],
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
  fox: [
    [
      '.........f.f',
      '........ffff',
      'wwffffffffoo',
      'wwffffffffff',
      '.ffffffffff.',
      '..ffffffff..',
      '..f.f..f.f..',
      '..k.k..k.k..',
    ],
    [
      '.........f.f',
      '........ffff',
      'wwffffffffoo',
      'wwffffffffff',
      '.ffffffffff.',
      '..ffffffff..',
      '.f..f..f..f.',
      '.k..k..k..k.',
    ],
  ],
  cat: [
    [
      '........n.n.',
      '.......nnnn.',
      'n......nonnn',
      'nn.nnnnnnnnn',
      '.nNnnNnnnnn.',
      '..nnnnnnnn..',
      '..n.n..n.n..',
      '..N.N..N.N..',
    ],
    [
      '........n.n.',
      '.......nnnn.',
      'n......nonnn',
      'nn.nnnnnnnnn',
      '.nNnnNnnnnn.',
      '..nnnnnnnn..',
      '.n..n..n..n.',
      '.N..N..N..N.',
    ],
  ],
  penguin: [
    [
      '...kkkk...',
      '..kkkkkk..',
      '..kkowkk..',
      '..kkwwkky.',
      '..kwwwwk..',
      '..kwwwwk..',
      '..kkkkkk..',
      '..yy..yy..',
    ],
    [
      '...kkkk...',
      '..kkkkkk..',
      '..kkowkk..',
      '..kkwwkky.',
      '..kwwwwk..',
      '..kwwwwk..',
      '..kkkkkk..',
      '.yy....yy.',
    ],
  ],
  duck: [
    ['.....YYY...', '....YYYYY..', '...YYYYYYQQ', '.YYYYYYYYY.', '.YYYYYYYYY.', '..YYYYYYY..', '...Q...Q...'],
    ['.....YYY...', '....YYYYY..', '...YYYYYYQQ', '.YYYYYYYYY.', '.YYYYYYYYY.', '..YYYYYYY..', '..Q....Q...'],
  ],
  owl: [
    [
      '.O.......O.',
      '.OO.....OO.',
      'OOLLLLLLLOO',
      'OLEELLLEELO',
      'OLLLyLLLLLO',
      'OOLLLLLLLOO',
      'OGOOOOOOOGO',
      '..y.....y..',
    ],
    [
      '.O.......O.',
      '.OO.....OO.',
      'OOLLLLLLLOO',
      'OLEELLLEELO',
      'OLLLyLLLLLO',
      'OOLLLLLLLOO',
      'GGOOOOOOOGG',
      '..y.....y..',
    ],
  ],
  eagle: [
    [
      '.ZZ.......ZZ.',
      'ZZZZ.HHH.ZZZZ',
      'ZZZZZHHHHZZZZ',
      'ZZZZZHHyHZZZZ',
      'ZZZZZZZZZZZZZ',
      '.ZZZZZZZZZZZ.',
      '..ZZZ...ZZZ..',
      '..y.....y....',
    ],
    [
      '.............',
      '.ZZ.......ZZ.',
      'ZZZZ.HHH.ZZZZ',
      'ZZZZZHHHHZZZZ',
      'ZZZZZHHyHZZZZ',
      'ZZZZZZZZZZZZZ',
      '.ZZZZZZZZZZZ.',
      '..y.....y....',
    ],
  ],
  bee: [
    ['.jj...jj.', '..jjjjj..', '.iIiIiIi.', '.IiIiIiI.', '....o....'],
    ['.j.....j.', '.jjjjjjj.', '.iIiIiIi.', '.IiIiIiI.', '....o....'],
  ],
  camel: [
    [
      '..xx....xx..',
      '.xxxx..xxxx.',
      '.xxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      '..XX....XX..',
      '..XX....XX..',
      '..X.X..X.X..',
    ],
    [
      '..xx....xx..',
      '.xxxx..xxxx.',
      '.xxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      '..XX....XX..',
      '.XX.....XX..',
      '.X..X.X..X..',
    ],
  ],
  frog: [
    ['.vv....vv.', '.vwv..vwv.', 'vvvvvvvvvv', 'vVvvvvvvVv', '.vvvvvvvv.', 'V.V....V.V'],
    ['.vv....vv.', '.vwv..vwv.', 'vvvvvvvvvv', 'vVvvvvvvVv', '.vvvvvvvv.', 'VV.VVVV.VV'],
  ],
  whale: [
    [
      '......w.........',
      '....uuuuu.......',
      '..uuuuuuuuuu..u.',
      '.uuuuuuuuuuuu.uu',
      'uuouuuuuuuuuuuuu',
      '.uuzzzzzzzzzuu..',
      '...zzzzzzz......',
    ],
    [
      '......w.........',
      '....uuuuu.......',
      '..uuuuuuuuuu..u.',
      '.uuuuuuuuuuuu.uu',
      'uuouuuuuuuuuuuuu',
      '.uuzzzzzzzzzuu..',
      '...zzzzzzz......',
    ],
  ],
  zombie: [
    [
      '...gg.....',
      '..gggg....',
      '..goggg...',
      '..gggg....',
      '...ttgggg.',
      '..tttt....',
      '..tttt....',
      '..t..t....',
      '..k..k....',
    ],
    [
      '...gg.....',
      '..gggg....',
      '..goggg...',
      '..gggg....',
      '...ttgggg.',
      '..tttt....',
      '..tttt....',
      '...tt.....',
      '...kk.....',
    ],
  ],
  demon: [
    [
      '.R......R.',
      '.RR....RR.',
      '..RRRRRR..',
      '..RlRRlR..',
      '..RRRRRR..',
      '...RwwR...',
      '..RRRRRR..',
      '.R.RRRR.R.',
      '...R..R...',
      '..FF..FF..',
    ],
    [
      '.R......R.',
      '.RR....RR.',
      '..RRRRRR..',
      '..RlRRlR..',
      '..RRRRRR..',
      '...RwwR...',
      '..RRRRRR..',
      '.R.RRRR.R.',
      '..R....R..',
      '.FF....FF.',
    ],
  ],
  dragon: [
    [
      '.....d........',
      '....dd....dd..',
      '...ddd...dddd.',
      '..dddd..ddodd.',
      'dddddddddddd..',
      '.deeeeeeedd...',
      '..dddddddd....',
      '..d..d..d.....',
    ],
    [
      '..............',
      '..........dd..',
      '.........dddd.',
      '.........ddodd',
      'dddddddddddd..',
      '.ddeeeeeedd...',
      '..dddddddd....',
      '.dd..d..d.....',
    ],
  ],
  alien: [
    [
      '..aaaa..',
      '.aaaaaa.',
      '.aoaaoa.',
      '.aaaaaa.',
      '..aaaa..',
      '...aa...',
      '..AAAA..',
      '.A.AA.A.',
      '...AA...',
      '..A..A..',
    ],
    [
      '..aaaa..',
      '.aaaaaa.',
      '.aoaaoa.',
      '.aaaaaa.',
      '..aaaa..',
      '...aa...',
      '..AAAA..',
      '.A.AA.A.',
      '...AA...',
      '...AA...',
    ],
  ],
  ufo: [
    ['....cccc....', '...cccccc...', '.qqqqqqqqqq.', 'qqlqqlqqlqqq', '.qqqqqqqqqq.', '...l....l...'],
    ['....cccc....', '...cccccc...', '.qqqqqqqqqq.', 'qqqlqqlqqlqq', '.qqqqqqqqqq.', '....l..l....'],
  ],
}

/** Kinds this module draws; everything else uses the fauna atlas. */
export function hasPixelFauna(kind: string): boolean {
  return kind in SPRITES
}

/** Every kind this module draws, in a stable order. */
export function pixelFaunaKinds(): string[] {
  return Object.keys(SPRITES)
}

/** Sprite size in its own pixels, or null for kinds this module does not draw. */
export function pixelFaunaDims(kind: string): { cols: number; rows: number } | null {
  const frames = SPRITES[kind]
  return frames ? { cols: frames[0][0].length, rows: frames[0].length } : null
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
  const rows = frames[((frame % frames.length) + frames.length) % frames.length]
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
