import { Art, C, ROOF, WALL, finish, isLit, legend, rows } from './kit.ts'
import type { Legend, Look } from './kit.ts'

/** A small thing drawn as one stamp: its rows, cut to its pixels and outlined. */
function prop(look: Look, lines: readonly string[], extra: Legend = {}): Art {
  const lit = isLit(look)
  const L = { ...legend(ROOF.tile, WALL.stone, lit), ...extra }
  const a = new Art(lines[0].length + 2, lines.length + 2)
  a.stamp(lines, 1, 1, L)
  return finish(a)
}

/** The colour of a lamp's glass: pale by day, lit from dusk. */
const lamp = (look: Look): Legend => ({
  w: isLit(look) ? C.gold5 : C.grey8,
  x: isLit(look) ? C.gold4 : C.grey7,
})

export const well = (look: Look) =>
  prop(
    look,
    rows(
      'well',
      '.RRRRRR.',
      'RRRRRRrq',
      '.e....e.',
      '.e.oo.e.',
      '.ssttuu.',
      'stjLLjuv',
      'sttttuuv',
      '.ttuuvv.',
    ),
  )

export const lamppost = (look: Look) =>
  prop(look, rows('lamppost', '.o.', 'owo', 'oxo', '.o.', '.o.', '.o.', '.o.', '.o.', 'ooo'), lamp(look))

export const streetLight = (look: Look) =>
  prop(
    look,
    rows(
      'streetlight',
      '.uuuu',
      'u..ww',
      'u....',
      'u....',
      'u....',
      'u....',
      'u....',
      'u....',
      'u....',
      'vv...',
    ),
    lamp(look),
  )

export const marketStall = (look: Look) =>
  prop(look, rows('stall', 'RhRhRhRh', 'rsrsrsrs', 'e......e', 'e.NRYN.e', 'eggggggf', 'e......e'))

export const foodCart = (look: Look) =>
  prop(look, rows('foodcart', 'YhYhYhY.', 'ysysysy.', '.e...e..', '.eggggee', '.eggggf.', '..o..o..'))

export const kiosk = (look: Look) =>
  prop(
    look,
    rows('kiosk', '.LLLLLL.', 'LLLLLLLj', '.hhhhhs.', '.hwxohs.', '.hxxohs.', '.hhhhhs.', '.tttttu.'),
  )

export const graveStone = (look: Look) =>
  prop(look, rows('grave', '.tt.', 'sttu', 'stuu', 'stuu', 'stuu', 'nNNn'))

export const shrine = (look: Look) =>
  prop(look, rows('shrine', '..Y...', '.RRRR.', 'RRRRRq', '.e..e.', '.eyYe.', '.e..e.', 'sttttu'))

export const flagPole = (look: Look) =>
  prop(
    look,
    rows('flag', 'yRRRR', 'uRRRq', 'uRRq.', 'u....', 'u....', 'u....', 'u....', 'u....', 'u....', 'vv...'),
  )

export const fountain = (look: Look) =>
  prop(
    look,
    rows('fountain', '...hh...', '..h..h..', '...ss...', '.ssttuu.', 'slilLLju', 'slLLLjjv', '.ttuuvv.'),
  )

export const grandFountain = (look: Look) =>
  prop(
    look,
    rows(
      'grandfountain',
      '......ii......',
      '.....i.li.....',
      '....i.ss.l....',
      '......tu......',
      '....sssttu....',
      '...silllLju...',
      '....sttuuv....',
      '......tu......',
      '..ssssttttuu..',
      '.sslllllLLLju.',
      'sslllLLLLLjjuv',
      'ssttttttuuuuvv',
      '.ttttttuuuuvv.',
    ),
  )

export const bench = (look: Look) =>
  prop(look, rows('bench', 'eggggggf', 'eggggggf', 'e......f', 'eeeeeeef', 'e......f'))

export const signpost = (look: Look) =>
  prop(
    look,
    rows(
      'signpost',
      'gggggg.',
      'gTTTTgg',
      'gggggg.',
      '..e....',
      'eeeee..',
      'eTTTe..',
      '..e....',
      '..e....',
      '.nen...',
    ),
  )

export const cart = (look: Look) =>
  prop(look, rows('cart', '.YYy....', 'eYYyyge.', 'eggggge.', 'eggggfee', '.oe..oe.', '.oo..oo.'))

export const fence = (look: Look) =>
  prop(look, rows('fence', 'e..e..e.', 'eeeeeeee', 'g..g..g.', 'eeeeeeee', 'f..f..f.'))

export const gallows = (look: Look) =>
  prop(
    look,
    rows(
      'gallows',
      'eeeeeee.',
      'e.e..T..',
      'ee...T..',
      'e...TTT.',
      'e...T.T.',
      'e....T..',
      'e.......',
      'e.......',
      'gggggggg',
      'eeeeeeef',
      'e.gg...f',
      'e.ggg..f',
    ),
  )

export const billBoard = (look: Look) =>
  prop(
    look,
    rows(
      'billboard',
      'oooooooo',
      'oRRhhLLo',
      'oRhhhhLo',
      'oYYhhNNo',
      'oooooooo',
      '.u....u.',
      '.u....u.',
      '.v....v.',
    ),
  )

export const telephonePole = (look: Look) =>
  prop(
    look,
    rows(
      'pole',
      'o.....o',
      'eeeeeee',
      '...e...',
      '.eeeee.',
      '...e...',
      '...e...',
      '...e...',
      '...e...',
      '...e...',
      '...f...',
    ),
  )

export const satelliteDish = (look: Look) =>
  prop(
    look,
    rows(
      'dish',
      '..ssss.',
      '.sssstu',
      'ssostuu',
      'sstuuu.',
      '.tuuu..',
      '..vv...',
      '..vv...',
      '.vvvv..',
      'zzzzzz.',
    ),
  )

export const roboticArm = (look: Look) =>
  prop(
    look,
    rows(
      'arm',
      '..YYY...',
      '.YY.Yy..',
      '.Y...y..',
      'oY...oo.',
      '.Y..o.o.',
      '.Yy.....',
      '.YYy....',
      'ooooo...',
      'uuuuuu..',
      'zzzzzzz.',
    ),
  )

export const drone = (look: Look) =>
  prop(look, rows('drone', 'ooo..ooo', '.u....u.', '.uhhhhu.', '..hRRt..', '..tttt..', '.o....o.'), {
    R: isLit(look) ? C.red4 : C.red3,
  })

export const holoBoard = (look: Look) =>
  prop(
    look,
    rows(
      'holo',
      '.iiiii.',
      'illllli',
      'ilihili',
      'illllli',
      'ilhhlli',
      '.iiiii.',
      '...i...',
      '..ooo..',
      '.ooooo.',
    ),
  )

export const neonSign = (look: Look) =>
  prop(
    look,
    rows(
      'neon',
      'ooooooo',
      'oPPoiio',
      'oPoPioo',
      'oPPoiio',
      'ooooooo',
      '...o...',
      '...o...',
      '...o...',
      '..ooo..',
    ),
  )

export const arcadeBox = (look: Look) =>
  prop(
    look,
    rows(
      'arcade',
      '.pppp.',
      'pYPPYp',
      'pJJJJp',
      'pJiiJp',
      'pJJJJp',
      'pppppp',
      'pRoYop',
      'pppppp',
      'pppppp',
      'o....o',
    ),
  )

export const chargingStation = (look: Look) =>
  prop(
    look,
    rows(
      'charger',
      'hhhhs...',
      'hNNhs...',
      'hNNhs.o.',
      'hhhhsoo.',
      'hRhhs.o.',
      'hhhhs.o.',
      'hhhhsoo.',
      'tttttu..',
    ),
    {
      N: isLit(look) ? C.green4 : C.green3,
    },
  )

export const solarPanel = (look: Look) =>
  prop(look, rows('solar', '.JjJjJjJ', 'JLjLjLjL', 'jJjJjJj.', '...uu...', '...uu...', '..vvvv..'))

export const busStop = (look: Look) =>
  prop(
    look,
    rows('busstop', 'LLLLLLLL', 'jjjjjjjj', 'o.iii..o', 'o.iii..o', 'o......o', 'o.eeee.o', 'o.e..e.o'),
  )

export const dovecote = (look: Look) =>
  prop(
    look,
    rows(
      'dovecote',
      '..RR..',
      '.RRRr.',
      'RRRRrq',
      '.hhhT.',
      '.hohT.',
      '.hhhT.',
      '..ee..',
      '..ee..',
      '..ef..',
    ),
  )

/** A crossing is paint on the road, not a thing standing on it: white bars across a strip of tarmac. */
export function crosswalk(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 2, h + 2)
  a.rect(1, 1, w, h, C.grey4)
  for (let j = 1; j < h; j += 2) a.hline(2, 1 + j, w - 2, C.grey9)
  return a.outline(C.grey3).trim()
}

export const foodTruck = (look: Look) =>
  prop(
    look,
    rows(
      'truck',
      '.RhRhRhRh.....',
      '.rsrsrsrs.....',
      'hhhhhhhhhhiii.',
      'hhYYYYhhhhijih',
      'hhYooYhhhhhhhh',
      'RRRRRRRRRRRRRR',
      'qqoOqqqqqqoOqq',
      '..oo......oo..',
    ),
  )

export const substation = (look: Look) =>
  prop(
    look,
    rows(
      'substation',
      '.o...o...o...',
      '.o...o...o...',
      'ooooooooooooo',
      '.u...u...u...',
      '.Y...Y...Y...',
      'sssstttttuuuu',
      'stttYYtttuuuv',
      'sttoYYotuuuuv',
      'stttttttuuuuv',
      'vvvvvvvvvvvvv',
    ),
  )

export const crane = (look: Look) =>
  prop(
    look,
    rows(
      'crane',
      '....Y.........',
      '...YYYYYYYYYYY',
      '..Y.Y.Y.Y.Y.Yo',
      '.YYYYYYYYYYY.o',
      '...YYY.......o',
      '...Y.Y......oo',
      '...YYY......oo',
      '...Y.Y........',
      '...YYY........',
      '...Y.Y........',
      '...YYY........',
      '...Y.Y........',
      '..uuuuu.......',
      '.uuuuuuu......',
    ),
  )

/** A gazebo, pavilion or bandstand: a roof on posts over a low floor, bigger by footprint. */
export function pavilion(look: Look): Art {
  const big = look.fw >= 3
  const roof = look.kind === 'Bandstand' ? 'R' : look.kind === 'Gazebo' ? 'N' : 'Y'
  const dark = look.kind === 'Bandstand' ? 'q' : look.kind === 'Gazebo' ? 'm' : 'g'
  const mid = look.kind === 'Bandstand' ? 'r' : look.kind === 'Gazebo' ? 'n' : 'Y'
  const small = rows(
    'gazebo',
    '......yy......',
    '.....AAAB.....',
    '...AAAAABBB...',
    '.AAAAAAABBBBB.',
    'AAAAAAAABBBBBD',
    'DDDDDDDDDDDDDD',
    '.h...h..h...h.',
    '.h...h..h...h.',
    '.h...h..h...h.',
    '.hsssssssssst.',
    '.eggggggggggf.',
    'eeeeeeeeeeeeef',
  )
  const large = rows(
    'pavilion',
    '..........yy..........',
    '.........AAAB.........',
    '.......AAAAABBB.......',
    '.....AAAAAAABBBBB.....',
    '...AAAAAAAAABBBBBBB...',
    '.AAAAAAAAAAABBBBBBBBB.',
    'AAAAAAAAAAAABBBBBBBBBD',
    'DDDDDDDDDDDDDDDDDDDDDD',
    '.h.....h......h.....h.',
    '.h.....h......h.....h.',
    '.h.....h......h.....h.',
    '.h.....h......h.....h.',
    '.h.....h......h.....h.',
    '.hsssssssssssssssssst.',
    '.eggggggggggggggggggf.',
    'eeeeeeeeeeeeeeeeeeeeef',
  )
  const base = legend(ROOF.tile, WALL.stone)
  return prop(look, big ? large : small, { A: base[roof], B: base[mid], D: base[dark] })
}
