import {
  BIOME_TONES,
  FOREST,
  FRESH_WATER,
  GRASS,
  INK,
  OCEAN,
  ROCK,
  SAND,
  SNOW,
  hex,
  type Rgb,
} from './art-palette'

// Local earthy hide, feather, and creature accent colours beyond art-palette.ts.
const HIDE_LIT: Rgb = [142, 102, 66]
const HIDE_MID: Rgb = [110, 77, 48]
const HIDE_SHADE: Rgb = [78, 54, 34]
const FOX_LIT: Rgb = [196, 104, 62]
const FOX_MID: Rgb = [168, 74, 44]
const GOLD_LIT: Rgb = [214, 174, 78]
const GOLD_MID: Rgb = [184, 138, 54]
const GOLD_SHADE: Rgb = [138, 96, 36]
const CRIMSON_MID: Rgb = [176, 66, 52]
const CRIMSON_SHADE: Rgb = [118, 48, 30]
const SNOUT_PINK: Rgb = [206, 148, 136]

/**
 * Hand-drawn 1:1 native pixel sprites for animals and monsters outside the main
 * 8-cell fauna atlas. Every sprite uses `INK` (`o`) for its outer outline, a
 * top-left light source, and 2–3 earthy tones per material. Sprites face right;
 * `flip` mirrors them.
 */
const PALETTE: Record<string, string> = {
  o: hex(INK), // warm dark outline, eyes, hooves
  B: hex(HIDE_LIT), // warm brown lit
  b: hex(HIDE_MID), // warm brown mid
  D: hex(HIDE_SHADE), // warm brown shade
  S: hex(SAND.light), // light muzzle / cream
  s: hex(SAND.wet), // shaded cream
  w: hex(SNOW.lit), // wool / white lit
  W: hex(SNOW.shade), // wool / white shade
  k: hex(ROCK.deep), // dark spots / face
  p: hex(SNOUT_PINK), // snout
  h: hex(HIDE_LIT), // chestnut lit
  m: hex(HIDE_SHADE), // mane, tail
  r: hex(CRIMSON_MID), // comb / demon mid
  R: hex(CRIMSON_SHADE), // demon shade
  y: hex(GOLD_LIT), // beak / gold lit
  Y: hex(GOLD_MID), // duck / gold mid
  Q: hex(FOX_LIT), // orange bill / flame
  f: hex(FOX_LIT), // fox lit
  F: hex(FOX_MID), // fox mid
  n: hex(ROCK.lit), // grey lit
  N: hex(ROCK.mid), // grey mid
  2: hex(ROCK.shade), // grey shade
  x: hex(SAND.desert), // camel / tan lit
  X: hex(SAND.dune), // camel / tan shade
  v: hex(GRASS.light), // frog / alien lit
  V: hex(FOREST.mid), // frog / dragon mid
  d: hex(FOREST.dark), // dragon / croc shade
  e: hex(SAND.light), // underbelly
  u: hex(OCEAN.shelf), // whale lit
  U: hex(OCEAN.open), // whale shade
  z: hex(SNOW.lit), // whale belly
  i: hex(GOLD_LIT), // bee gold
  I: hex(INK), // bee stripe
  j: hex(SNOW.shade), // bee wing
  O: hex(HIDE_MID), // owl mid
  L: hex(SAND.light), // owl face
  E: hex(GOLD_LIT), // glowing eye
  G: hex(HIDE_SHADE), // owl shade
  Z: hex(HIDE_MID), // eagle mid
  H: hex(SNOW.lit), // eagle head
  K: hex(GRASS.lush), // snake lit
  J: hex(SAND.desert), // snake band
  C: hex(FOREST.mid), // crocodile mid
  P: hex(SAND.wet), // crocodile belly
  1: hex(ROCK.lit), // elephant lit
  3: hex(GOLD_MID), // lion mid
  4: hex(GOLD_SHADE), // lion mane
  M: hex(HIDE_LIT), // monkey lit
  T: hex(SAND.light), // monkey face
  g: hex(BIOME_TONES.wetland), // zombie skin
  t: hex(FRESH_WATER.deep), // zombie rags
  l: hex(GOLD_LIT), // ufo / demon lights
  a: hex(GRASS.light), // alien lit
  A: hex(FOREST.mid), // alien suit
  q: hex(ROCK.lit), // ufo hull lit
  c: hex(FRESH_WATER.edge), // ufo dome
}

/** Poses of a kind: the walk frames, then (for bears/grazers) a resting pose. */
type Frames = readonly (readonly string[])[]

const SPRITES: Record<string, Frames> = {
  bear: [
    [
      '..ooooooo...',
      '.oBBBBbbbo..',
      'oBBBBbbbbSo.',
      'oBBBbbbbbbSo',
      'oBBbbbbDDDbo',
      '.obbbbDDDDo.',
      '.oDo.oDo.oDo',
      '.ooo.ooo.ooo',
    ],
    [
      '..ooooooo...',
      '.oBBBBbbbo..',
      'oBBBBbbbbSo.',
      'oBBBbbbbbbSo',
      'oBBbbbbDDDbo',
      '.obbbbDDDDo.',
      '..oDo..oDo..',
      '..ooo..ooo..',
    ],
    [
      '............',
      '............',
      '..ooooooo...',
      '.oBBBBbbbo..',
      'oBBBBbbbbSo.',
      'oBBbbbbDDSSo',
      'oDDDDDDDDDDo',
      '.oooooooooo.',
    ],
  ],
  sheep: [
    [
      '..ooooooo...',
      '.owwwwwWwo..',
      'owwwwwWWwkko',
      'owwwwWWWWkko',
      '.oWWWWWWWwo.',
      '..oko..oko..',
      '..ooo..ooo..',
    ],
    [
      '..ooooooo...',
      '.owwwwwWwo..',
      'owwwwwWWwkko',
      'owwwwWWWWkko',
      '.oWWWWWWWwo.',
      '.oko....oko.',
      '.ooo....ooo.',
    ],
    [
      '..ooooooo...',
      '.owwwwwWwo..',
      'owwwwwWWWwo.',
      'owwwwWWWWkko',
      '.oWWWWWWwkko',
      '..oko..okko.',
      '..ooo..oooo.',
    ],
  ],
  cow: [
    [
      '........o.o.',
      '.oooooooooo.',
      'owwwkkwwkkko',
      'owwkkwwWWkpo',
      'owwWWWWWWppo',
      '.oWWWWWWWwo.',
      '.oko.oko.oko',
      '.ooo.ooo.ooo',
    ],
    [
      '........o.o.',
      '.oooooooooo.',
      'owwwkkwwkkko',
      'owwkkwwWWkpo',
      'owwWWWWWWppo',
      '.oWWWWWWWwo.',
      '..oko...oko.',
      '..ooo...ooo.',
    ],
    [
      '............',
      '.ooooooooo..',
      'owwwkkwwWwo.',
      'owwkkwwWWWoo',
      'owwWWWWWWkko',
      '.oWWWWWWwkpo',
      '.oko.oko.ooo',
      '.ooo.ooo....',
    ],
  ],
  horse: [
    [
      '........ooo.',
      '.......omhho',
      '......omhhbo',
      '.ooooohhhbo.',
      'omhhhhbbbb..',
      'omhhbbbbDo..',
      '.obDo..obDo.',
      '.obDo..obDo.',
      '.oooo..oooo.',
    ],
    [
      '........ooo.',
      '.......omhho',
      '......omhhbo',
      '.ooooohhhbo.',
      'omhhhhbbbb..',
      'omhhbbbbDo..',
      '..obDo.obDo.',
      '..obDo.obDo.',
      '..oooo.oooo.',
    ],
  ],
  chicken: [
    ['....ooo.', '...orwo.', '..owwwoo', '.owwwWyo', 'owwwWWo.', '.oWWWoo.', '..oyo...', '..ooo...'],
    ['....ooo.', '...orwo.', '..owwwoo', '.owwwWyo', 'owwwWWo.', '.oWWWoo.', '..o.yo..', '..o.oo..'],
  ],
  fox: [
    ['.......ooo.', '.oo...offfo', 'owfo.offFoo', 'owffffFFDFo', '.offFFFDDDo', '..oFDo.oFDo', '..oooo.oooo'],
    ['.......ooo.', '.oo...offfo', 'owfo.offFoo', 'owffffFFDFo', '.offFFFDDDo', '.oFDo...oDo', '.oooo...ooo'],
  ],
  cat: [
    ['......ooo.', 'oo...onnno', 'ono..onNoo', '.onnnnNNNo', '.onNN222o.', '..oNo..o2o', '..ooo..ooo'],
    ['......ooo.', 'oo...onnno', 'ono..onNoo', '.onnnnNNNo', '.onNN222o.', '.oNo...o2o', '.ooo...ooo'],
  ],
  penguin: [
    ['..oooo..', '.okkkko.', '.okwwko.', 'ookwwkQo', 'okwwwwko', 'okwWWwko', '.okkkko.', '.oQo.oQo'],
    ['..oooo..', '.okkkko.', '.okwwko.', 'ookwwkQo', 'okwwwwko', 'okwWWwko', '.okkkko.', 'oQo..oQo'],
  ],
  duck: [
    [
      '....oooo..',
      '...oyyyyo.',
      '..oyyyYYQo',
      '.oyyyYYYYo',
      'oyyYYYYYo.',
      '.oYYYYYo..',
      '..oQo.oQo.',
      '..ooo.ooo.',
    ],
    [
      '....oooo..',
      '...oyyyyo.',
      '..oyyyYYQo',
      '.oyyyYYYYo',
      'oyyYYYYYo.',
      '.oYYYYYo..',
      '.oQo...oQo',
      '.ooo...ooo',
    ],
  ],
  snake: [
    ['.ooooooo....', 'oKJKJKKKooo.', '.ooooooKKVdo', '......ooooo.'],
    ['..ooooooo...', '.oKJKJKKKooo', 'oooooooKKVdo', '.......oooo.'],
  ],
  crocodile: [
    [
      '..oooo..oooo..',
      '.oCCCCooCCCCo.',
      'oCCCCCCCddddddo',
      'oPPPPPPPPddddo',
      '.oCdo....oCdo.',
      '.oooo....oooo.',
    ],
    [
      '..oooo..oooo..',
      '.oCCCCooCCCCo.',
      'oCCCCCCCddddddo',
      'oPPPPPPPPddddo',
      '..oCdo..oCdo..',
      '..oooo..oooo..',
    ],
  ],
  monkey: [
    [
      '.....oooo..',
      '....oMMMMo.',
      '...oMMMTTo.',
      '...oMMbbTo.',
      '.ooMMMbbbo.',
      'oMo.oMbbDo.',
      '.oo..oDo.oDo',
      '.....ooo.ooo',
    ],
    [
      '.....oooo..',
      '....oMMMMo.',
      '...oMMMTTo.',
      '...oMMbbTo.',
      '.ooMMMbbbo.',
      'oMo.oMbbDo.',
      '.oo.oDo..oDo',
      '....ooo..ooo',
    ],
  ],
  goat: [
    ['.......oo..', '......oSSo.', '.ooooobbbbo', 'oSbbbbbbDDo', 'obbbbbDDDDo', '.obDo..obDo', '.oooo..oooo'],
    ['.......oo..', '......oSSo.', '.ooooobbbbo', 'oSbbbbbbDDo', 'obbbbbDDDDo', '..obDo.obDo', '..oooo.oooo'],
  ],
  elephant: [
    [
      '..oooooooo..',
      '.o11111NNNo.',
      'o11111NNNNNo',
      'o111NNNN22so',
      'o11NNNN22o.o',
      '.oN2o..o2o..',
      '.oooo..ooo..',
    ],
    [
      '..oooooooo..',
      '.o11111NNNo.',
      'o11111NNNNNo',
      'o111NNNN22so',
      'o11NNNN22o.o',
      '..oN2o.o2o..',
      '..oooo.ooo..',
    ],
  ],
  lion: [
    ['......oooo.', '.....o4444o', '.oooo44334o', 'oyyy333444o', 'oyy3333XXo.', '.o3Xo..oXo.', '.oooo..ooo.'],
    ['......oooo.', '.....o4444o', '.oooo44334o', 'oyyy333444o', 'oyy3333XXo.', '..o3Xo.oXo.', '..oooo.ooo.'],
  ],
  zebra: [
    ['.......ooo.', '......owkwo', '.ooooowkwko', 'owkwkwkWWo.', 'owkWkWkwWo.', '.okWo..okWo', '.oooo..oooo'],
    ['.......ooo.', '......owkwo', '.ooooowkwko', 'owkwkwkWWo.', 'owkWkWkwWo.', '..okWo.okWo', '..oooo.oooo'],
  ],
  polar_bear: [
    [
      '..ooooooo...',
      '.owwwwwWwo..',
      'owwwwwwWWwo.',
      'owwwwwWWWWwo',
      'owwWWWWsssWo',
      '.oWWo..oWWo.',
      '.oooo..oooo.',
    ],
    [
      '..ooooooo...',
      '.owwwwwWwo..',
      'owwwwwwWWwo.',
      'owwwwwWWWWwo',
      'owwWWWWsssWo',
      '..oWWo.oWWo.',
      '..oooo.oooo.',
    ],
  ],
  kangaroo: [
    [
      '.....ooo...',
      '....ohhbo..',
      '...ohhhbo..',
      '..ohhhbbbo.',
      'ooohbbbbDo.',
      'ohbbbbDDDo.',
      '..oDDo.oDDo',
      '..oooo.oooo',
    ],
    [
      '.....ooo...',
      '....ohhbo..',
      '...ohhhbo..',
      '..ohhhbbbo.',
      'ooohbbbbDo.',
      'ohbbbbDDDo.',
      '.oDDo..oDDo',
      '.oooo..oooo',
    ],
  ],
  owl: [
    [
      '.oo.....oo.',
      'oOOoooooOOo',
      'oOLLLLLLLOo',
      'oOLEoLoELOo',
      'oOLLLyLLGOo',
      '.oOLLLGGGo.',
      '.oGGGGGGGo.',
      '..oyo.oyo..',
    ],
    [
      '.oo.....oo.',
      'oOOoooooOOo',
      'oOLLLLLLLOo',
      'oOLEoLoELOo',
      'oOLLLyLLGOo',
      'ooOLLLGGGoo',
      '.oGGGGGGGo.',
      '..oyo.oyo..',
    ],
  ],
  eagle: [
    [
      '.oo.......oo.',
      'oZZoo.ooo.oZo',
      'oZZZZoHHHoZZo',
      'oZZZZoHHyoZZo',
      '.oZZZZGGGZZo.',
      '..oGGGGGGGo..',
      '...oyo.oyo...',
      '...ooo.ooo...',
    ],
    [
      '.............',
      '.oo.......oo.',
      'oZZoo.ooo.oZo',
      'oZZZZoHHHoZZo',
      'oZZZZoHHyoZZo',
      '.oZZZZGGGZZo.',
      '..oGGGGGGGo..',
      '...oyo.oyo...',
    ],
  ],
  bee: [
    ['.oo...oo.', 'ojjo.ojjo', 'oiIiIiIio', '.oIiIiIo.', '..ooooo..'],
    ['..oo.oo..', '.ojjjjjo.', 'oiIiIiIio', '.oIiIiIo.', '..ooooo..'],
  ],
  camel: [
    [
      '..ooo..ooo..',
      '.oxxxooxxxo.',
      '.oxxxxxXXXoo',
      'oxxxxxXXXXXo',
      'oxxxXXXXXXo.',
      '.oXXo..oXXo.',
      '.oXXo..oXXo.',
      '.oooo..oooo.',
    ],
    [
      '..ooo..ooo..',
      '.oxxxooxxxo.',
      '.oxxxxxXXXoo',
      'oxxxxxXXXXXo',
      'oxxxXXXXXXo.',
      '..oXXo.oXXo.',
      '..oXXo.oXXo.',
      '..oooo.oooo.',
    ],
  ],
  frog: [
    ['.ooo..ooo.', 'ovwvoovwvo', 'ovvvvvVVVo', 'ovVVVVdddo', '.ovVVdddo.', '.oVo..oVo.'],
    ['.ooo..ooo.', 'ovwvoovwvo', 'ovvvvvVVVo', 'ovVVVVdddo', '.ovVVdddo.', 'oVVo..oVVo'],
  ],
  whale: [
    [
      '.....oo........',
      '...ouuuoo......',
      '.ouuuuuuUUo.oo.',
      'ouuuuuUUUUUouUo',
      'ououuUUUUUUUUo.',
      '.ozzzzzzzzzUo..',
      '..oooooooooo...',
    ],
    [
      '.....oo........',
      '...ouuuoo......',
      '.ouuuuuuUUo.oo.',
      'ouuuuuUUUUUouUo',
      'ououuUUUUUUUUo.',
      '.ozzzzzzzzzUo..',
      '..oooooooooo...',
    ],
  ],
  zombie: [
    [
      '..oooo....',
      '.oggggo...',
      '.ogoggo...',
      '..ogggo...',
      '.ootttggo.',
      '.ottttto..',
      '..otttto..',
      '..oto.oto.',
      '..ooo.ooo.',
    ],
    [
      '..oooo....',
      '.oggggo...',
      '.ogoggo...',
      '..ogggo...',
      '.ootttggo.',
      '.ottttto..',
      '..otttto..',
      '...ototo..',
      '...ooooo..',
    ],
  ],
  demon: [
    [
      '.oo....oo.',
      'orro..orro',
      '.orrrrrro.',
      '.orlrRlro.',
      '.orrRRRro.',
      '..oRwwRo..',
      '.orrRRRro.',
      'oroRRRRoro',
      '..oRo.oRo.',
      '..oQo.oQo.',
    ],
    [
      '.oo....oo.',
      'orro..orro',
      '.orrrrrro.',
      '.orlrRlro.',
      '.orrRRRro.',
      '..oRwwRo..',
      '.orrRRRro.',
      'oroRRRRoro',
      '.oRo...oRo',
      '.oQo...oQo',
    ],
  ],
  dragon: [
    [
      '....ooo.......',
      '...oVVVo..ooo.',
      '..oVVVddooVVVo',
      '.oVVVdddoVVelo',
      'oVVVddddddddo.',
      '.odeeeeeeddo..',
      '..odddddddo...',
      '..odo..odo....',
    ],
    [
      '..............',
      '..........ooo.',
      '..oooo...oVVVo',
      '.oVVVVoooVVelo',
      'oVVVddddddddo.',
      '.odeeeeeeddo..',
      '..odddddddo...',
      '.odo...odo....',
    ],
  ],
  alien: [
    [
      '..oooo..',
      '.ovvvvo.',
      'ovoaavao',
      'ovvaaavo',
      '.ovaavo.',
      '..ovvo..',
      '.oAAAAo.',
      'oAoAAoAo',
      '..oAoAo.',
      '..ooooo.',
    ],
    [
      '..oooo..',
      '.ovvvvo.',
      'ovoaavao',
      'ovvaaavo',
      '.ovaavo.',
      '..ovvo..',
      '.oAAAAo.',
      'oAoAAoAo',
      '..oAAo..',
      '..oooo..',
    ],
  ],
  ufo: [
    ['...oooooo...', '..occcccco..', '.oqqqqqqNNo.', 'oqlqqlqqlNNo', '.oNNNNNNNNo.', '..olo..olo..'],
    ['...oooooo...', '..occcccco..', '.oqqqqqqNNo.', 'oqlqqlqqlNNo', '.oNNNNNNNNo.', '...oloolo...'],
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

/** Draws `kind` centred on (cx, cy) at 1:1 native pixel scale. Returns false if unknown. */
export function drawPixelFauna(
  ctx: CanvasRenderingContext2D,
  kind: string,
  cx: number,
  cy: number,
  _size: number,
  flip: boolean,
  frame: number,
): boolean {
  const frames = SPRITES[kind]
  if (!frames) return false
  const rows = frames[((frame % frames.length) + frames.length) % frames.length]
  const cols = rows[0].length
  const w = cols
  const h = rows.length
  const x0 = Math.round(cx - w / 2)
  const y0 = Math.round(cy - h / 2)
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < cols; x++) {
      const c = row[x]
      if (c === '.') continue
      ctx.fillStyle = PALETTE[c]
      const dx = flip ? cols - 1 - x : x
      ctx.fillRect(x0 + dx, y0 + y, 1, 1)
    }
  }
  return true
}
