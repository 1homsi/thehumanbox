import { outline, px } from './kit'
import type { P } from './kit'

export function paintLandscape(p: P) {
  const { x0, y1, w, h, kind } = p
  const top = y1 - h * 0.35
  const water = ['Pond', 'Reservoir', 'Aquaculture', 'Fountain'].includes(kind)
  px(p.ctx, x0, top, w, h * 0.35, water ? '#497e98' : kind === 'Plaza' ? '#aaa08b' : '#637b45')
  outline(p.ctx, x0, top, w, h * 0.35)
  if (water) {
    for (let i = 0; i < 5; i++)
      px(p.ctx, x0 + 2 + p.rng() * (w - 6), top + 2 + p.rng() * (h * 0.35 - 4), 3, 1, '#93bac0')
    if (kind === 'Fountain') {
      px(p.ctx, x0 + w / 2 - 2, top - 7, 4, 10, '#c5bc9f')
      px(p.ctx, x0 + w / 2 - 5, top - 7, 10, 2, '#c5bc9f')
      px(p.ctx, x0 + w / 2, top - 11, 1, 5, '#95d1de')
    }
  } else if (kind === 'Cemetery') {
    for (let i = 0; i < 6; i++) {
      const x = x0 + 3 + ((i % 3) * (w - 6)) / 3
      const y = top + 3 + Math.floor(i / 3) * h * 0.17
      px(p.ctx, x, y - 3, 3, 5, '#b1aaa1')
      px(p.ctx, x + 1, y - 2, 1, 2, '#57544e')
    }
  } else if (kind === 'PlayGround') {
    px(p.ctx, x0 + 3, top - 8, 2, 14, '#a16a3e')
    px(p.ctx, x0 + w - 5, top - 8, 2, 14, '#a16a3e')
    px(p.ctx, x0 + 3, top - 8, w - 6, 2, '#c88e46')
    px(p.ctx, x0 + w / 2, top - 6, 1, 8, '#d1c5a7')
    px(p.ctx, x0 + w / 2 - 3, top + 2, 7, 2, '#bf5143')
  } else {
    px(p.ctx, x0 + w / 2 - 1, top, 3, h * 0.35, '#baa780')
    if (kind !== 'Plaza')
      for (let i = 0; i < 10; i++) {
        const x = x0 + 2 + p.rng() * (w - 4)
        const y = top + 2 + p.rng() * (h * 0.35 - 4)
        px(p.ctx, x, y, 2, 2, kind === 'MushroomFarm' ? '#d8bba0' : ['#d9b653', '#bb7180', '#87a65d'][i % 3])
      }
  }
}

export function paintCrossing(p: P) {
  const { x0, y1, w, h, kind } = p
  const stone = kind === 'Aqueduct'
  const top = y1 - h * (stone ? 0.65 : 0.22)
  px(p.ctx, x0, top, w, 4, stone ? '#b7ad98' : '#98744e')
  for (let x = x0 + 2; x < x0 + w; x += 7) {
    px(p.ctx, x, top + 4, 3, y1 - top - 4, stone ? '#958d7e' : '#614731')
    px(p.ctx, x, top - 3, 1, 5, '#c4ad83')
  }
  px(p.ctx, x0, top - 3, w, 1, stone ? '#cbc2ad' : '#c4ad83')
  if (['Port', 'Marina', 'Dock'].includes(kind)) {
    px(p.ctx, x0 + w * 0.4, top + 7, w * 0.45, 4, '#704735')
    px(p.ctx, x0 + w * 0.64, top - 5, 1, 13, '#ddd0ad')
    px(p.ctx, x0 + w * 0.65, top - 4, 5, 6, '#ddd0ad')
  }
}
