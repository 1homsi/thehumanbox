import { FRESH_WATER, INK, ROCK, SAND, SNOW, hex, type Rgb } from './art-palette'

export const FAUNA_ATLAS_WIDTH = 64
export const FAUNA_ATLAS_HEIGHT = 32

// Local hide, beak, and collar tones beyond art-palette.ts.
const HIDE_LIT: Rgb = [142, 102, 66]
const HIDE_MID: Rgb = [110, 77, 48]
const HIDE_SHADE: Rgb = [78, 54, 34]
const GOLD_LIT: Rgb = [214, 174, 78]
const GOLD_MID: Rgb = [184, 138, 54]
const BEAK_ORANGE: Rgb = [196, 104, 62]
const COLLAR_RED: Rgb = [176, 66, 52]

export const FAUNA_PALETTE: Record<string, string> = {
  k: hex(INK),
  w: hex(SNOW.lit),
  s: hex(SAND.light),
  S: hex(SAND.wet),
  d: hex(SAND.desert),
  a: hex(SAND.dune),
  l: hex(ROCK.lit),
  m: hex(ROCK.mid),
  n: hex(ROCK.shade),
  t: hex(HIDE_LIT),
  T: hex(HIDE_MID),
  b: hex(HIDE_SHADE),
  y: hex(GOLD_LIT),
  Y: hex(GOLD_MID),
  r: hex(BEAK_ORANGE),
  c: hex(COLLAR_RED),
  f: hex(FRESH_WATER.edge),
  U: hex(FRESH_WATER.mid),
  v: hex(FRESH_WATER.deep),
}

export const FAUNA_GRIDS = {
  rabbit: ['..kkk.', '..kskk', '.kssSk', 'kwssSk', '.kSSSk', '..kkkk'],
  deer: [
    '......kk.kk.',
    '......ksksk.',
    '.......ksk..',
    '......kddkk.',
    '......kdddkk',
    '.kkkk.kddtk.',
    'kwdddkddtTk.',
    'kddddttttTk.',
    '.ktttTTTTk..',
    '..kTk..kTk..',
    '..kTk..kTk..',
    '..kkk..kkk..',
  ],
  boar: [
    '..kkkkkk..',
    '.kttttTTk.',
    'ktttTTTTkk',
    'kttTTTTkwk',
    'kTTTTbbbbk',
    '.kbbbbbbk.',
    '.kbbk.kbk.',
    '.kkkk.kkk.',
  ],
  bird: ['.kkk.', 'kttky', '.kTTk', '..kk.'],
  wolf: [
    '........kkk.',
    '.......klllk',
    '.kkk..klllkk',
    'kllkkllmmmlk',
    'kllllmmmmmnk',
    '.kmmmnnnnnk.',
    '..knnnnnnk..',
    '..knk...knk.',
    '..kkk...kkk.',
  ],
  dog: [
    '......kkk.',
    'kk...kdddk',
    'kdk..kddkk',
    '.kdddkcck.',
    '.kddaaaaTk',
    '..kaTTTTk.',
    '..kak..kTk',
    '..kkk..kkk',
  ],
  fish: ['..kkk.', 'kkffk.', 'kfUUUk', 'kkvvUk', '..kkk.'],
  goldBird: ['.kkk.', 'kyykr', '.kYYk', '..kk.'],
} as const

// Native pixel bounds in the 64x32 fauna atlas. Antlers, tails and ears have
// transparent padding around every cell so nothing is ever clipped.
export const FAUNA_RECTS = {
  rabbit: [5, 5, 6, 6],
  deer: [18, 2, 12, 12],
  boar: [35, 4, 10, 8],
  bird: [53, 6, 5, 4],
  wolf: [2, 19, 12, 9],
  dog: [19, 20, 10, 8],
  fish: [37, 21, 6, 5],
  goldBird: [53, 22, 5, 4],
} as const

export type FaunaAtlasKey = keyof typeof FAUNA_RECTS

export function faunaRect(kind: string, id: number): readonly [number, number, number, number] | null {
  if (kind === 'bird') return id % 2 === 0 ? FAUNA_RECTS.bird : FAUNA_RECTS.goldBird
  return FAUNA_RECTS[kind as FaunaAtlasKey] ?? null
}

/** Paint one native fauna sprite grid at (x0, y0) at 1:1 world pixels. */
export function paintFaunaGrid(
  ctx: CanvasRenderingContext2D,
  key: FaunaAtlasKey,
  x0: number,
  y0: number,
): void {
  const rows = FAUNA_GRIDS[key]
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      ctx.fillStyle = FAUNA_PALETTE[ch]
      ctx.fillRect(x0 + x, y0 + y, 1, 1)
    }
  }
}
