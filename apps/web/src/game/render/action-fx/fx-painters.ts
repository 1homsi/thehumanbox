/**
 * The pixel painters of the action effects. Each draws one frame of its effect from how far along it
 * is, so nothing is kept between frames: every particle's path comes from a generator seeded by the
 * effect, and the same frame always draws the same pixels.
 *
 * Painters work in world pixels around the effect's centre (one art pixel = one world pixel, y down)
 * and stay on the earthy palette of `art-palette.ts`, lit from the top-left: puffs of smoke and dust
 * carry a lighter tone up and to the left of their shade.
 */
import { FRESH_WATER, INK, OCEAN, ROCK, SNOW, type Rgb } from '../art-palette'
import type { FxKind } from './fx-kinds'

export interface Painter {
  /** A square of `size` art pixels with its top-left corner at (x, y), in world pixels from the centre. */
  px(x: number, y: number, color: string, size?: number): void
  /** A filled run of art pixels: `w` wide, `h` tall. */
  rect(x: number, y: number, w: number, h: number, color: string): void
  /** Opacity for what is drawn next (0..1). */
  alpha(a: number): void
  /** A flat tint over the whole view, for flashes and weather. */
  screen(color: string, a: number): void
}

export interface FxFrame {
  /** 0 when the effect starts, 1 when it ends. */
  t: number
  /** Milliseconds since it started. */
  ms: number
  /** Its reach in world pixels. */
  r: number
  /** A generator that restarts from the same seed every frame. */
  rand: () => number
  /** The player asked for less motion: no strobing flashes. */
  reduced: boolean
  /** For whole-view effects: the half-size of the view in world pixels. */
  viewW: number
  viewH: number
}

export type FxPainter = (p: Painter, f: FxFrame) => void

const css = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`

/** Effect colours beyond the map's own palette, kept muted like it. */
const C = {
  ink: css(INK),
  white: 'rgb(255,248,226)',
  flash: 'rgb(255,244,210)',
  boltGlow: 'rgb(186,204,226)',
  fireY: 'rgb(244,206,92)',
  fireO: 'rgb(222,136,52)',
  fireR: 'rgb(176,68,38)',
  ember: 'rgb(110,44,28)',
  smokeL: 'rgb(140,130,116)',
  smokeM: 'rgb(104,96,86)',
  smokeD: 'rgb(70,64,58)',
  ash: css(ROCK.deep),
  dustL: 'rgb(196,174,132)',
  dustM: 'rgb(160,136,98)',
  dustD: 'rgb(116,96,70)',
  rockL: css(ROCK.lit),
  rockM: css(ROCK.mid),
  rockD: css(ROCK.shade),
  waterL: css(OCEAN.surf),
  waterM: css(FRESH_WATER.edge),
  waterD: css(FRESH_WATER.mid),
  rain: 'rgb(170,196,204)',
  cloudL: 'rgb(150,158,160)',
  cloudD: 'rgb(98,106,112)',
  snow: css(SNOW.lit),
  ice: 'rgb(170,204,214)',
  iceD: css(SNOW.shade),
  healL: 'rgb(214,236,160)',
  heal: 'rgb(132,186,92)',
  goldL: 'rgb(255,234,168)',
  gold: 'rgb(226,186,84)',
  bulb: 'rgb(250,226,120)',
  heart: 'rgb(204,88,96)',
  heartL: 'rgb(236,150,150)',
  blood: 'rgb(160,50,40)',
  steel: 'rgb(206,206,196)',
  plague: 'rgb(142,152,78)',
  plagueD: 'rgb(92,102,54)',
  plagueL: 'rgb(186,192,118)',
  blight: 'rgb(118,84,96)',
  blightL: 'rgb(160,124,120)',
  rad: 'rgb(196,206,72)',
  radD: 'rgb(122,138,44)',
  acid: 'rgb(170,196,70)',
  acidL: 'rgb(214,226,138)',
  voidC: 'rgb(26,18,34)',
  voidM: 'rgb(70,48,96)',
  voidL: 'rgb(150,120,190)',
  leaf: 'rgb(110,150,66)',
  leafL: 'rgb(160,190,92)',
  locust: 'rgb(122,110,52)',
  sun: 'rgb(255,226,150)',
}

const ease = (t: number) => 1 - (1 - t) * (1 - t)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
/** Progress of a stage running from `a` to `b` of the effect's life. */
const stage = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
/** Fades in over the first part of a life and out over the last. */
const fade = (t: number, inEnd = 0.1, outStart = 0.6) =>
  t < inEnd ? t / inEnd : t > outStart ? Math.max(0, 1 - (t - outStart) / (1 - outStart)) : 1
const pick = <T>(list: readonly T[], v: number) =>
  list[Math.min(list.length - 1, Math.floor(v * list.length))]

/** A pixel ellipse outline, squashed for the ground seen from above. */
function ring(p: Painter, radius: number, color: string, thick = 1, squash = 0.72) {
  if (radius < 1) return
  const steps = Math.max(16, Math.ceil(radius * 6))
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    p.px(Math.round(Math.cos(a) * radius), Math.round(Math.sin(a) * radius * squash), color, thick)
  }
}

/** A filled pixel ellipse, row by row. */
function disc(p: Painter, cx: number, cy: number, radius: number, color: string, squash = 1) {
  const ry = Math.max(1, Math.round(radius * squash))
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(radius * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    if (w > 0) p.rect(Math.round(cx) - w, Math.round(cy) + y, w * 2, 1, color)
  }
}

/** A puff of smoke or dust lit from the top-left: shade, then a smaller lit disc up and to the left. */
function puff(p: Painter, x: number, y: number, radius: number, shade: string, lit: string) {
  disc(p, x, y, radius, shade)
  if (radius >= 2) disc(p, x - radius * 0.25, y - radius * 0.3, radius * 0.62, lit)
}

/** Particles thrown out from the centre, falling back under gravity as a short arc. */
function debris(
  p: Painter,
  f: FxFrame,
  n: number,
  o: { speed: number; lift: number; colors: readonly string[]; size?: number; start?: number; end?: number },
) {
  const local = stage(f.t, o.start ?? 0, o.end ?? 1)
  for (let i = 0; i < n; i++) {
    const a = f.rand() * Math.PI * 2
    const v = (0.35 + f.rand() * 0.65) * o.speed
    const lift = (0.4 + f.rand()) * o.lift
    const color = pick(o.colors, f.rand())
    if (local <= 0 || local >= 1) continue
    const x = Math.cos(a) * v * local
    const ground = Math.sin(a) * v * local * 0.72
    const hop = lift * 4 * local * (1 - local)
    p.px(Math.round(x), Math.round(ground - hop), color, o.size ?? 1)
  }
}

/** Particles that rise from the ground inside the reach, drifting and fading. */
function risers(
  p: Painter,
  f: FxFrame,
  n: number,
  o: { area: number; height: number; colors: readonly string[]; size?: number; wobble?: number },
) {
  for (let i = 0; i < n; i++) {
    const a = f.rand() * Math.PI * 2
    const d = Math.sqrt(f.rand()) * o.area
    const delay = f.rand() * 0.45
    const color = pick(o.colors, f.rand())
    const phase = f.rand() * 6
    const life = stage(f.t, delay, Math.min(1, delay + 0.55))
    if (life <= 0 || life >= 1) continue
    const x = Math.cos(a) * d + Math.sin(phase + life * 7) * (o.wobble ?? 1)
    const y = Math.sin(a) * d * 0.72 - life * o.height
    p.alpha(life > 0.7 ? (1 - life) / 0.3 : 1)
    p.px(Math.round(x), Math.round(y), color, o.size ?? 1)
  }
  p.alpha(1)
}

/** Streaks that fall from above onto the reach: rain, hail, acid. */
function fallers(
  p: Painter,
  f: FxFrame,
  n: number,
  o: {
    area: number
    drop: number
    length: number
    colors: readonly string[]
    slant?: number
    splash?: string
  },
) {
  for (let i = 0; i < n; i++) {
    const x0 = (f.rand() * 2 - 1) * o.area
    const y0 = (f.rand() * 2 - 1) * o.area * 0.72
    const delay = f.rand() * 0.6
    const color = pick(o.colors, f.rand())
    const life = stage(f.t, delay, delay + 0.3)
    if (life <= 0) continue
    if (life >= 1) {
      if (o.splash && f.t - delay < 0.42) p.px(Math.round(x0) - 1, Math.round(y0), o.splash, 1)
      continue
    }
    const y = y0 - (1 - life) * o.drop
    const x = x0 - (1 - life) * o.drop * (o.slant ?? 0.25)
    for (let k = 0; k < o.length; k++) p.px(Math.round(x - k * (o.slant ?? 0.25)), Math.round(y - k), color)
  }
}

/** A jagged bolt from above the view down to (x, y), the same each frame for the same seed. */
function bolt(p: Painter, seed: number, x: number, y: number, height: number) {
  const rand = seeded(seed)
  const steps = Math.max(5, Math.round(height / 10))
  let px = x + (rand() - 0.5) * 30
  let py = y - height
  for (let i = 1; i <= steps; i++) {
    const nx = i === steps ? x : x + (rand() - 0.5) * 22 * (1 - i / steps)
    const ny = y - height + (height * i) / steps
    const len = Math.max(Math.abs(nx - px), Math.abs(ny - py))
    for (let k = 0; k <= len; k++) {
      const bx = Math.round(px + ((nx - px) * k) / len)
      const by = Math.round(py + ((ny - py) * k) / len)
      p.px(bx - 1, by, C.boltGlow, 3)
      p.px(bx, by, C.white, 1)
    }
    px = nx
    py = ny
  }
}

/** A flash over the whole view: a single soft one for players who asked for less motion. */
function flash(p: Painter, f: FxFrame, strength: number, until: number) {
  const k = stage(f.t, 0, until)
  if (k >= 1) return
  const a = f.reduced ? strength * 0.3 * (1 - k) : strength * (1 - k) * (k < 0.2 && f.ms % 120 < 60 ? 1 : 0.8)
  p.screen(C.flash, a)
}

/** A scorch mark on the ground: ash with burnt edges, fading at the end. */
function scorch(p: Painter, f: FxFrame, radius: number) {
  p.alpha(0.75 * fade(f.t, 0.05, 0.7))
  disc(p, 0, 0, radius, C.ash, 0.72)
  for (let i = 0; i < radius * 3; i++) {
    const a = f.rand() * Math.PI * 2
    const d = radius * (0.8 + f.rand() * 0.5)
    p.px(Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d * 0.72), C.ember)
  }
  p.alpha(1)
}

/** Flames licking up across the reach: little columns of red, orange and yellow, with embers and smoke. */
function flames(p: Painter, f: FxFrame, area: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = f.rand() * Math.PI * 2
    const d = Math.sqrt(f.rand()) * area
    const delay = f.rand() * 0.35
    const tall = 3 + Math.floor(f.rand() * 5)
    const seed = f.rand() * 10
    const life = stage(f.t, delay, Math.min(1, delay + 0.6))
    if (life <= 0 || life >= 1) continue
    const x = Math.round(Math.cos(a) * d)
    const y = Math.round(Math.sin(a) * d * 0.72)
    const h = Math.max(
      1,
      Math.round(tall * Math.sin(life * Math.PI) * (0.8 + 0.2 * Math.sin(f.ms / 60 + seed))),
    )
    p.rect(x, y - h + 1, 2, h, C.fireR)
    if (h > 1) p.rect(x, y - h + 1, 1, h - 1, C.fireO)
    if (h > 3) p.px(x, y - h + 1, C.fireY)
  }
  risers(p, f, Math.round(n / 2), { area, height: 26, colors: [C.fireY, C.fireO, C.ember], wobble: 2 })
  risers(p, f, Math.round(n / 3), {
    area: area * 0.8,
    height: 34,
    colors: [C.smokeM, C.smokeD],
    size: 2,
    wobble: 3,
  })
}

/** A mushroom-shaped pall of smoke over the point: a stem of puffs and a broad cap, rising and spreading. */
function mushroom(p: Painter, f: FxFrame, r: number, grow: number, glow: number) {
  const height = r * 1.25 * ease(grow)
  const capW = r * (0.35 + 0.55 * ease(grow))
  const stemW = Math.max(3, r * 0.14)
  const shade = glow > 0.4 ? C.fireR : C.smokeD
  const lit = glow > 0.6 ? C.fireY : glow > 0.3 ? C.fireO : C.smokeL
  const mid = glow > 0.5 ? C.fireO : C.smokeM
  // The stem.
  for (let y = 0; y < height; y += stemW * 0.8) {
    const wobble = Math.sin(y * 0.3 + f.ms / 300) * 1.2
    puff(p, wobble, -y, stemW * (1 + 0.15 * Math.sin(y)), shade, mid)
  }
  // The cap: a ring of puffs around its top, darker underneath.
  const top = -height
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const pr = capW * (0.18 + 0.1 * Math.sin(i * 2.3))
    puff(p, Math.cos(a) * capW * 0.62, top + Math.sin(a) * capW * 0.28, pr, shade, mid)
  }
  puff(p, 0, top - capW * 0.1, capW * 0.42, mid, lit)
  // The skirt where the stem meets the cap.
  puff(p, 0, top + capW * 0.32, capW * 0.3, shade, mid)
}

export const PAINTERS: Record<FxKind, FxPainter> = {
  bolt: (p, f) => {
    if (f.t < 0.35) {
      flash(p, f, 0.35, 0.25)
      if (f.reduced || f.ms % 140 < 100) bolt(p, 1, 0, 0, Math.max(120, f.viewH * 1.2))
    }
    scorch(p, f, 3)
    debris(p, f, 14, { speed: 14, lift: 8, colors: [C.fireY, C.white, C.fireO], end: 0.5 })
    risers(p, f, 6, { area: 3, height: 18, colors: [C.smokeM, C.smokeL], size: 2 })
  },
  storm_bolts: (p, f) => {
    for (let k = 0; k < 4; k++) {
      const at = k * 0.18
      const x = (f.rand() * 2 - 1) * f.r
      const y = (f.rand() * 2 - 1) * f.r * 0.72
      const local = f.t - at
      if (local > 0 && local < 0.18) {
        if (f.reduced || f.ms % 140 < 100) bolt(p, k + 2, x, y, Math.max(120, f.viewH * 1.2))
        p.screen(C.flash, f.reduced ? 0.08 : 0.22 * (1 - local / 0.18))
      }
      if (local > 0) {
        p.alpha(0.7 * clamp01(1 - (local - 0.3) / 0.5))
        disc(p, x, y, 2, C.ash, 0.72)
        p.alpha(1)
      }
    }
  },
  fire: (p, f) => {
    const area = Math.max(4, f.r)
    flames(p, f, area, Math.min(160, 14 + area * 3))
  },
  meteor: (p, f) => {
    const hit = 0.22
    if (f.t < hit) {
      // A burning rock streaking down from the top-left, where the light comes from.
      const k = f.t / hit
      const sx = -f.viewH * 0.9 * (1 - k)
      const sy = -f.viewH * 1.1 * (1 - k)
      for (let i = 0; i < 26; i++) {
        const tx = sx - i * 2.2
        const ty = sy - i * 2.6
        p.px(Math.round(tx), Math.round(ty), i < 4 ? C.fireY : i < 12 ? C.fireO : C.smokeM, i < 8 ? 3 : 2)
      }
      disc(p, sx, sy, 3, C.rockD)
      p.px(Math.round(sx) - 2, Math.round(sy) - 2, C.fireY, 2)
      return
    }
    const g = (f.t - hit) / (1 - hit)
    const sub: FxFrame = { ...f, t: g }
    flash(p, sub, 0.55, 0.18)
    scorch(p, sub, f.r * 0.8)
    p.alpha(clamp01(1 - g * 1.4))
    ring(p, f.r * (0.5 + ease(g) * 1.6), C.dustL, 2)
    ring(p, f.r * (0.3 + ease(g) * 1.1), C.white, 1)
    p.alpha(1)
    disc(p, 0, 0, f.r * 0.45 * clamp01(1 - g * 1.6), C.fireY, 0.72)
    debris(p, sub, 40, {
      speed: f.r * 2.2,
      lift: f.r * 1.4,
      colors: [C.rockM, C.rockD, C.fireO, C.ember],
      size: 2,
      end: 0.7,
    })
    risers(p, sub, 22, { area: f.r, height: 40, colors: [C.dustM, C.dustD, C.smokeM], size: 3, wobble: 3 })
  },
  meteor_shower: (p, f) => {
    for (let k = 0; k < 5; k++) {
      const at = k * 0.12
      const x = (f.rand() * 2 - 1) * f.r
      const y = (f.rand() * 2 - 1) * f.r * 0.72
      const local = (f.t - at) / 0.6
      if (local <= 0 || local >= 1) continue
      const sub: FxFrame = { ...f, t: local, r: 6, rand: seeded(k * 977 + 13) }
      p.alpha(1)
      const ox = x
      const oy = y
      PAINTERS.meteor(offset(p, ox, oy), sub)
    }
  },
  comet: (p, f) => {
    // A bright head crossing the sky with a long tail, and motes of awe settling below.
    const k = ease(stage(f.t, 0, 0.7))
    const x = -f.viewW * 1.1 + k * f.viewW * 2.2
    const y = -f.viewH * 0.6 + k * f.viewH * 0.25
    p.alpha(fade(f.t, 0.05, 0.75))
    for (let i = 0; i < 40; i++) {
      p.px(
        Math.round(x - i * 3),
        Math.round(y - i * 0.35),
        i < 3 ? C.white : i < 14 ? C.goldL : C.boltGlow,
        i < 10 ? 2 : 1,
      )
    }
    p.alpha(1)
    risers(p, f, 18, { area: f.r, height: 22, colors: [C.goldL, C.boltGlow, C.white] })
  },
  nuke: (p, f) => {
    const r = f.r
    // The white flash, then the fireball, the shockwaves, the mushroom cloud and the fallout glow.
    flash(p, f, 0.95, 0.12)
    const fireball = stage(f.t, 0, 0.16)
    if (f.t < 0.3) {
      const fr = r * 0.55 * ease(fireball) * (1 - stage(f.t, 0.16, 0.3) * 0.5)
      disc(p, 0, 0, fr, C.fireR, 0.72)
      disc(p, -fr * 0.12, -fr * 0.12, fr * 0.8, C.fireO, 0.72)
      disc(p, -fr * 0.2, -fr * 0.2, fr * 0.5, f.t < 0.08 ? C.white : C.fireY, 0.72)
    }
    // Shockwaves: two rings racing out over the ground.
    for (const [delay, color, thick] of [
      [0.02, C.white, 2],
      [0.06, C.dustL, 3],
    ] as const) {
      const w = stage(f.t, delay, delay + 0.3)
      if (w > 0 && w < 1) {
        p.alpha(1 - w)
        ring(p, r * (0.3 + 2.6 * ease(w)), color, thick)
        p.alpha(1)
      }
    }
    // The fallout settling: a sickly glow over the ground that lingers.
    p.alpha(0.35 * fade(f.t, 0.25, 0.8))
    disc(p, 0, 0, r * 1.15, C.radD, 0.72)
    p.alpha(1)
    scorch(p, { ...f, t: stage(f.t, 0.05, 1) }, r * 0.5)
    // The ground skirt of dust rolling outward.
    const skirt = stage(f.t, 0.1, 0.7)
    if (skirt > 0 && skirt < 1) {
      p.alpha(1 - skirt)
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        const d = r * (0.4 + 1.3 * ease(skirt))
        puff(p, Math.cos(a) * d, Math.sin(a) * d * 0.72, 3 + skirt * 4, C.dustD, C.dustM)
      }
      p.alpha(1)
    }
    // The mushroom cloud.
    const rise = stage(f.t, 0.08, 0.7)
    if (rise > 0) {
      p.alpha(fade(f.t, 0.1, 0.78))
      mushroom(p, f, r, rise, 1 - stage(f.t, 0.1, 0.55))
      p.alpha(1)
    }
    debris(p, { ...f, t: stage(f.t, 0.02, 0.5) }, 60, {
      speed: r * 3,
      lift: r * 1.8,
      colors: [C.rockM, C.rockD, C.fireO, C.ember, C.fireY],
      size: 2,
    })
  },
  eruption: (p, f) => {
    const r = Math.max(5, f.r)
    p.alpha(fade(f.t, 0.05, 0.8))
    disc(p, 0, 0, r * 0.35, C.fireR, 0.72)
    disc(p, -1, -1, r * 0.2, C.fireY, 0.72)
    p.alpha(1)
    // Lava bombs arcing out and an ash column climbing.
    debris(p, f, 34, { speed: r * 2.4, lift: r * 3, colors: [C.fireY, C.fireO, C.fireR], size: 2, end: 0.75 })
    risers(p, f, 40, {
      area: r * 0.3,
      height: r * 4,
      colors: [C.smokeD, C.smokeM, C.ash],
      size: 4,
      wobble: 4,
    })
    risers(p, f, 18, { area: r * 0.25, height: r * 2.5, colors: [C.fireO, C.fireY], size: 1, wobble: 2 })
    p.alpha(clamp01(1 - f.t * 2))
    ring(p, r * (0.6 + ease(f.t) * 1.4), C.dustM, 2)
    p.alpha(1)
  },
  quake: (p, f) => {
    // Cracks running out from the centre, dust kicked up along them.
    const r = Math.max(4, f.r)
    const grow = ease(stage(f.t, 0, 0.35))
    p.alpha(fade(f.t, 0.02, 0.7))
    for (let k = 0; k < 7; k++) {
      let a = f.rand() * Math.PI * 2
      let x = 0
      let y = 0
      const len = r * (0.6 + f.rand() * 0.6) * grow
      for (let s = 0; s < len; s++) {
        a += (f.rand() - 0.5) * 0.5
        x += Math.cos(a)
        y += Math.sin(a) * 0.72
        p.px(Math.round(x), Math.round(y), C.ink)
        if (s % 3 === 0) p.px(Math.round(x) + 1, Math.round(y) + 1, C.rockD)
      }
    }
    p.alpha(1)
    debris(p, f, 30, { speed: r * 1.5, lift: 10, colors: [C.rockM, C.dustD, C.rockD], end: 0.6 })
    risers(p, f, 26, { area: r, height: 18, colors: [C.dustL, C.dustM], size: 3, wobble: 2 })
  },
  sinkhole: (p, f) => {
    // The ground slumps inward: dark pit growing, rings of earth sliding in, dust rising from the rim.
    const r = Math.max(3, f.r)
    const k = ease(stage(f.t, 0, 0.45))
    p.alpha(fade(f.t, 0.02, 0.75))
    disc(p, 0, 0, r * k, C.rockD, 0.72)
    disc(p, 0, 1, r * k * 0.75, C.ash, 0.72)
    disc(p, 0, 2, r * k * 0.45, C.voidC, 0.72)
    for (let i = 0; i < 3; i++) {
      const w = (f.t * 2 + i / 3) % 1
      ring(p, r * (1.5 - w) * k, C.dustD, 1)
    }
    p.alpha(1)
    risers(p, f, 30, { area: r * 1.1, height: 22, colors: [C.dustL, C.dustM, C.dustD], size: 3, wobble: 2 })
  },
  black_hole: (p, f) => {
    // A dark core with a violet rim; motes spiral in from far out and vanish.
    const r = Math.max(4, f.r)
    const on = fade(f.t, 0.1, 0.75)
    const core = r * 0.35 * on
    p.alpha(on)
    disc(p, 0, 0, core * 1.5, C.voidM, 0.8)
    disc(p, 0, 0, core, C.voidC, 0.8)
    ring(p, core * 1.6, C.voidL, 1, 0.8)
    for (let i = 0; i < 70; i++) {
      const a0 = f.rand() * Math.PI * 2
      const d0 = r * (0.6 + f.rand() * 1.8)
      const speed = 0.6 + f.rand()
      const color = pick([C.voidL, C.white, C.dustL, C.voidM], f.rand())
      const k = (f.t * speed * 1.6 + f.rand()) % 1
      const d = d0 * (1 - k)
      if (d < core) continue
      const a = a0 + k * 5
      p.px(Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d * 0.8), color)
    }
    p.alpha(1)
  },
  acid: (p, f) => {
    const r = Math.max(4, f.r)
    p.alpha(fade(f.t, 0.1, 0.8))
    for (let i = 0; i < 6; i++) {
      const x = (f.rand() * 2 - 1) * r * 0.8
      puff(p, x, -r * 1.3 - f.rand() * 6, 5 + f.rand() * 4, C.plagueD, C.plague)
    }
    p.alpha(1)
    fallers(p, f, Math.min(140, 30 + r * 4), {
      area: r,
      drop: r * 1.3,
      length: 3,
      colors: [C.acid, C.acidL],
      slant: 0.15,
      splash: C.acidL,
    })
    risers(p, { ...f, t: stage(f.t, 0.3, 1) }, 24, {
      area: r,
      height: 10,
      colors: [C.plagueL, C.acid],
      size: 2,
    })
  },
  tornado: (p, f) => {
    // A funnel of dust spinning in place, wider at the top, with debris whirling around it.
    const r = Math.max(4, f.r)
    const on = fade(f.t, 0.1, 0.75)
    const drift = Math.sin(f.t * 3) * r * 0.25
    p.alpha(on)
    const h = r * 3
    for (let y = 0; y < h; y += 2) {
      const w = 2 + (y / h) * r * 0.6
      const spin = f.ms / 70 + y * 0.4
      const x = drift * (y / h) + Math.sin(y * 0.2 + f.ms / 200) * 1.5
      for (let s = 0; s < 3; s++) {
        const a = spin + (s / 3) * Math.PI * 2
        p.px(Math.round(x + Math.cos(a) * w), -y, s === 0 ? C.dustL : s === 1 ? C.dustM : C.dustD, 2)
      }
    }
    for (let i = 0; i < 24; i++) {
      const a = f.rand() * Math.PI * 2 + f.ms / 120
      const d = r * (0.3 + f.rand() * 0.5)
      p.px(
        Math.round(Math.cos(a) * d + drift),
        Math.round(-f.rand() * h * 0.6),
        pick([C.rockD, C.leaf, C.dustD], f.rand()),
        2,
      )
    }
    p.alpha(1)
  },
  wave: (p, f) => {
    // A wall of water rolling in from the sea side, then breaking into foam.
    const r = Math.max(6, f.r)
    const k = ease(stage(f.t, 0, 0.6))
    p.alpha(fade(f.t, 0.05, 0.7))
    // The face of the wave: foam on the crest, lit water under it, deep water behind.
    const rows = [C.white, C.waterL, C.waterL, C.waterM, C.waterM, C.waterD, C.waterD, C.waterD]
    for (let row = 0; row < rows.length; row++) {
      const y = -r + k * r * 1.6 - row * 2
      for (let x = -r; x <= r; x += 1) {
        const crest = Math.round(Math.sin(x * 0.35 + f.ms / 90) * 1.5 + Math.sin(x * 0.11) * 2)
        p.px(x, Math.round(y) + crest, rows[row], 2)
      }
    }
    p.alpha(1)
    debris(p, { ...f, t: stage(f.t, 0.4, 1) }, 40, {
      speed: r,
      lift: 10,
      colors: [C.waterL, C.white, C.waterM],
    })
  },
  water: (p, f) => {
    const r = Math.max(3, f.r)
    for (let i = 0; i < 3; i++) {
      const w = stage(f.t, i * 0.12, i * 0.12 + 0.6)
      if (w <= 0 || w >= 1) continue
      p.alpha(1 - w)
      ring(p, r * ease(w), i === 0 ? C.waterL : C.waterM, 1)
    }
    p.alpha(1)
    debris(p, f, 24, { speed: r * 0.8, lift: 14, colors: [C.waterL, C.waterM, C.white], end: 0.6 })
  },
  rain: (p, f) => {
    const r = Math.max(3, f.r)
    p.alpha(fade(f.t, 0.12, 0.75))
    for (let i = 0; i < 7; i++) {
      const x = (f.rand() * 2 - 1) * r * 0.9
      puff(p, x, -r * 1.2 - f.rand() * 5, 4 + f.rand() * 4, C.cloudD, C.cloudL)
    }
    p.alpha(1)
    fallers(p, f, Math.min(160, 30 + r * 5), {
      area: r,
      drop: r * 1.2,
      length: 3,
      colors: [C.rain, C.waterL],
      slant: 0.2,
      splash: C.waterL,
    })
  },
  swarm: (p, f) => {
    // A dark buzzing cloud of locusts drifting off along a heading.
    const r = Math.max(6, f.r)
    const heading = f.rand() * Math.PI * 2
    const travel = ease(f.t) * r
    const cx = Math.cos(heading) * travel
    const cy = Math.sin(heading) * travel * 0.72
    p.alpha(fade(f.t, 0.1, 0.8))
    const spread = Math.max(9, r * 0.3)
    for (let i = 0; i < 160; i++) {
      const a = f.rand() * Math.PI * 2 + f.ms / (200 + f.rand() * 300)
      const d = Math.sqrt(f.rand()) * spread
      p.px(
        Math.round(cx + Math.cos(a) * d),
        Math.round(cy + Math.sin(a) * d * 0.7 - 4),
        f.rand() < 0.7 ? C.locust : C.ink,
      )
    }
    p.alpha(1)
  },
  plague: (p, f) => {
    const r = Math.max(3, f.r)
    p.alpha(0.6 * fade(f.t, 0.1, 0.6))
    for (let i = 0; i < 8; i++) {
      const a = f.rand() * Math.PI * 2
      const d = f.rand() * r * 0.8
      puff(p, Math.cos(a) * d, Math.sin(a) * d * 0.72 - f.t * 6, 3 + f.rand() * 3, C.plagueD, C.plague)
    }
    p.alpha(1)
    risers(p, f, 30, { area: r, height: 20, colors: [C.plagueL, C.plague, C.plagueD], size: 2, wobble: 3 })
  },
  blight: (p, f) => {
    const r = Math.max(3, f.r)
    p.alpha(0.5 * fade(f.t, 0.1, 0.6))
    disc(p, 0, 0, r, C.blight, 0.72)
    p.alpha(1)
    risers(p, f, 36, { area: r, height: 14, colors: [C.blight, C.blightL, C.dustD], wobble: 2 })
  },
  frost: (p, f) => {
    const r = Math.max(3, f.r)
    p.alpha(0.45 * fade(f.t, 0.1, 0.6))
    disc(p, 0, 0, r, C.ice, 0.72)
    p.alpha(1)
    // Little six-armed flakes settling.
    for (let i = 0; i < Math.min(40, 8 + r * 2); i++) {
      const x = Math.round((f.rand() * 2 - 1) * r)
      const y0 = (f.rand() * 2 - 1) * r * 0.72
      const delay = f.rand() * 0.5
      const life = stage(f.t, delay, delay + 0.5)
      if (life <= 0 || life >= 1) continue
      const y = Math.round(y0 - (1 - life) * 20)
      p.px(x, y, C.snow)
      p.px(x - 1, y, C.ice)
      p.px(x + 1, y, C.ice)
      p.px(x, y - 1, C.ice)
      p.px(x, y + 1, C.iceD)
    }
  },
  hail: (p, f) => {
    const r = Math.max(4, f.r)
    p.alpha(fade(f.t, 0.1, 0.75))
    for (let i = 0; i < 6; i++)
      puff(p, (f.rand() * 2 - 1) * r, -r * 1.3 - f.rand() * 5, 5 + f.rand() * 3, C.cloudD, C.cloudL)
    p.alpha(1)
    fallers(p, f, Math.min(120, 24 + r * 4), {
      area: r,
      drop: r * 1.4,
      length: 2,
      colors: [C.snow, C.ice],
      slant: 0.1,
      splash: C.iceD,
    })
  },
  heal: (p, f) => {
    const r = Math.max(2, f.r)
    p.alpha(clamp01(1 - f.t * 1.6))
    ring(p, r * ease(f.t), C.heal, 1)
    p.alpha(1)
    // Rising crosses and motes.
    for (let i = 0; i < 16; i++) {
      const a = f.rand() * Math.PI * 2
      const d = Math.sqrt(f.rand()) * r
      const delay = f.rand() * 0.4
      const life = stage(f.t, delay, delay + 0.6)
      if (life <= 0 || life >= 1) continue
      const x = Math.round(Math.cos(a) * d)
      const y = Math.round(Math.sin(a) * d * 0.72 - life * 18)
      p.alpha(life > 0.7 ? (1 - life) / 0.3 : 1)
      p.rect(x - 1, y, 3, 1, C.heal)
      p.rect(x, y - 1, 1, 3, C.heal)
      p.px(x, y, C.healL)
    }
    p.alpha(1)
    risers(p, f, 28, { area: r, height: 22, colors: [C.healL, C.goldL, C.heal], size: 2 })
  },
  bless: (p, f) => {
    const r = Math.max(2, f.r)
    // Rays of light falling from above, and golden motes.
    p.alpha(0.55 * fade(f.t, 0.1, 0.5))
    for (let i = -2; i <= 2; i++) p.rect(i * 3 - 1, -40, 2, 40, i === 0 ? C.goldL : C.gold)
    p.alpha(clamp01(1 - f.t * 1.5))
    ring(p, r * ease(f.t), C.gold, 1)
    p.alpha(1)
    risers(p, f, 26, { area: r, height: 24, colors: [C.goldL, C.gold, C.white] })
  },
  inspire: (p, f) => {
    const r = Math.max(2, f.r)
    // A burst of bright rays from the centre.
    const k = ease(stage(f.t, 0, 0.5))
    p.alpha(clamp01(1 - f.t * 1.3))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      for (let s = 2; s < 4 + k * r; s += 1.5)
        p.px(Math.round(Math.cos(a) * s), Math.round(Math.sin(a) * s * 0.8) - 6, C.bulb)
    }
    p.alpha(1)
    risers(p, f, 14, { area: r, height: 16, colors: [C.bulb, C.goldL] })
  },
  hearts: (p, f) => {
    const r = Math.max(2, f.r)
    for (let i = 0; i < 6; i++) {
      const x0 = (f.rand() * 2 - 1) * r
      const y0 = (f.rand() * 2 - 1) * r * 0.5
      const delay = f.rand() * 0.35
      const life = stage(f.t, delay, delay + 0.65)
      if (life <= 0 || life >= 1) continue
      const x = Math.round(x0 + Math.sin(life * 6 + i) * 2)
      const y = Math.round(y0 - life * 20)
      p.alpha(life > 0.7 ? (1 - life) / 0.3 : 1)
      // A five-pixel-wide heart.
      p.rect(x - 2, y - 1, 2, 1, C.heart)
      p.rect(x + 1, y - 1, 2, 1, C.heart)
      p.rect(x - 2, y, 5, 1, C.heart)
      p.rect(x - 1, y + 1, 3, 1, C.heart)
      p.px(x, y + 2, C.heart)
      p.px(x - 2, y - 1, C.heartL)
    }
    p.alpha(1)
  },
  peace: (p, f) => {
    const r = Math.max(2, f.r)
    p.alpha(clamp01(1 - f.t * 1.4))
    ring(p, r * ease(f.t), C.white, 1)
    ring(p, r * ease(f.t) * 0.6, C.healL, 1)
    p.alpha(1)
    risers(p, f, 18, { area: r, height: 20, colors: [C.white, C.healL, C.goldL] })
  },
  war: (p, f) => {
    const r = Math.max(2, f.r)
    // Crossed blades and sparks of the clash.
    p.alpha(fade(f.t, 0.05, 0.6))
    for (let i = -4; i <= 4; i++) {
      p.px(i, i - 6, C.steel)
      p.px(i, -i - 6, C.steel)
    }
    p.px(-5, -11, C.ink, 2)
    p.px(4, -11, C.ink, 2)
    p.alpha(1)
    debris(p, f, 24, { speed: r * 1.5 + 8, lift: 10, colors: [C.fireY, C.white, C.blood], end: 0.6 })
  },
  spawn: (p, f) => {
    const r = Math.max(2, f.r)
    p.alpha(clamp01(1 - f.t * 1.5))
    ring(p, (r + 2) * ease(f.t), C.dustL, 1)
    p.alpha(1)
    debris(p, f, 14, { speed: 10 + r, lift: 6, colors: [C.dustL, C.dustM], end: 0.7 })
    risers(p, f, 8, { area: r, height: 12, colors: [C.goldL, C.white] })
  },
  summon: (p, f) => {
    const r = Math.max(2, f.r)
    p.alpha(0.8 * fade(f.t, 0.05, 0.6))
    disc(p, 0, 0, (r + 3) * ease(stage(f.t, 0, 0.3)), C.voidM, 0.72)
    ring(p, (r + 4) * ease(f.t), C.voidL, 1)
    p.alpha(1)
    risers(p, f, 30, { area: r + 2, height: 26, colors: [C.voidM, C.smokeD, C.voidL], size: 2, wobble: 2 })
  },
  grow: (p, f) => {
    const r = Math.max(2, f.r)
    // Sprouts popping up across the reach.
    for (let i = 0; i < Math.min(50, 8 + r * 3); i++) {
      const x = Math.round((f.rand() * 2 - 1) * r)
      const y = Math.round((f.rand() * 2 - 1) * r * 0.72)
      const delay = f.rand() * 0.5
      const life = stage(f.t, delay, delay + 0.35)
      if (life <= 0) continue
      p.alpha(fade(f.t, 0, 0.75))
      const h = Math.round(1 + life * 2)
      p.rect(x, y - h, 1, h, C.leaf)
      if (life > 0.6) {
        p.px(x - 1, y - h, C.leafL)
        p.px(x + 1, y - h + 1, C.leaf)
      }
    }
    p.alpha(1)
    risers(p, f, 8, { area: r, height: 12, colors: [C.leafL, C.goldL] })
  },
  paint: (p, f) => {
    const r = Math.max(1, f.r)
    p.alpha(clamp01(1 - f.t * 1.4))
    ring(p, r + ease(f.t) * 3, C.dustL, 1)
    p.alpha(1)
    debris(p, f, 8, { speed: 6 + r, lift: 4, colors: [C.dustL, C.dustM] })
  },
  dust: (p, f) => {
    const r = Math.max(2, f.r)
    risers(p, f, 30, { area: r, height: 16, colors: [C.dustL, C.dustM, C.dustD], size: 3, wobble: 2 })
    debris(p, f, 16, { speed: r * 1.2, lift: 8, colors: [C.rockM, C.dustD] })
  },
  sky_rain: (p, f) => {
    p.screen('rgb(60,72,80)', 0.12 * fade(f.t, 0.15, 0.6))
    fallers(p, f, 220, {
      area: Math.max(f.viewW, f.viewH),
      drop: f.viewH,
      length: 4,
      colors: [C.rain, C.waterL],
      slant: 0.25,
    })
  },
  sky_storm: (p, f) => {
    p.screen('rgb(40,46,56)', 0.22 * fade(f.t, 0.1, 0.7))
    fallers(p, f, 260, {
      area: Math.max(f.viewW, f.viewH),
      drop: f.viewH,
      length: 5,
      colors: [C.rain, C.waterL],
      slant: 0.4,
    })
    const strike = stage(f.t, 0.22, 0.34)
    if (strike > 0 && strike < 1) {
      const x = (f.rand() * 2 - 1) * f.viewW * 0.6
      const y = (f.rand() * 2 - 1) * f.viewH * 0.4
      if (f.reduced || f.ms % 140 < 100) bolt(p, 7, x, y, f.viewH * 1.5)
      p.screen(C.flash, f.reduced ? 0.08 : 0.3 * (1 - strike))
    }
  },
  sky_snow: (p, f) => {
    p.screen('rgb(200,210,214)', 0.1 * fade(f.t, 0.15, 0.6))
    for (let i = 0; i < 160; i++) {
      const x0 = (f.rand() * 2 - 1) * f.viewW
      const y0 = (f.rand() * 2 - 1) * f.viewH
      const speed = 0.3 + f.rand() * 0.4
      const sway = f.rand() * 6
      const y = ((y0 + f.ms * 0.04 * speed + f.viewH) % (f.viewH * 2)) - f.viewH
      p.alpha(fade(f.t, 0.1, 0.7))
      p.px(Math.round(x0 + Math.sin(f.ms / 400 + sway) * 3), Math.round(y), f.rand() < 0.7 ? C.snow : C.ice)
    }
    p.alpha(1)
  },
  sky_heat: (p, f) => {
    p.screen('rgb(222,150,70)', 0.16 * fade(f.t, 0.2, 0.6))
    // Shimmer: short wavy lines rising off the ground.
    p.alpha(0.5 * fade(f.t, 0.2, 0.6))
    for (let i = 0; i < 70; i++) {
      const x = (f.rand() * 2 - 1) * f.viewW
      const y = (f.rand() * 2 - 1) * f.viewH - f.t * 20
      for (let k = 0; k < 6; k++)
        p.px(Math.round(x + Math.sin(k + f.ms / 150) * 1.5), Math.round(y - k), C.goldL)
    }
    p.alpha(1)
  },
  sky_fog: (p, f) => {
    p.screen('rgb(190,192,184)', 0.22 * fade(f.t, 0.25, 0.6))
    p.alpha(0.35 * fade(f.t, 0.25, 0.6))
    for (let i = 0; i < 14; i++) {
      const x = (f.rand() * 2 - 1) * f.viewW + f.t * 30
      const y = (f.rand() * 2 - 1) * f.viewH
      puff(p, x, y, 10 + f.rand() * 16, 'rgb(176,178,170)', 'rgb(206,206,198)')
    }
    p.alpha(1)
  },
  sky_sun: (p, f) => {
    // Warm light breaking through from the top-left.
    p.screen(C.sun, 0.18 * fade(f.t, 0.15, 0.5))
    p.alpha(0.35 * fade(f.t, 0.15, 0.5))
    for (let i = 0; i < 6; i++) {
      const x0 = -f.viewW + i * f.viewW * 0.3
      for (let k = 0; k < f.viewH * 1.6; k += 2)
        p.px(Math.round(x0 + k * 0.6), Math.round(-f.viewH + k), C.goldL, 2)
    }
    p.alpha(1)
  },
  sky_wind: (p, f) => {
    p.alpha(0.7 * fade(f.t, 0.1, 0.6))
    for (let i = 0; i < 60; i++) {
      const y = (f.rand() * 2 - 1) * f.viewH
      const speed = 0.5 + f.rand()
      const x = ((f.rand() * 2 * f.viewW + f.ms * 0.5 * speed) % (f.viewW * 2.4)) - f.viewW * 1.2
      const len = 6 + Math.floor(f.rand() * 14)
      p.rect(
        Math.round(x),
        Math.round(y + Math.sin(x * 0.05) * 2),
        len,
        1,
        f.rand() < 0.5 ? C.white : C.cloudL,
      )
    }
    p.alpha(1)
  },
}

/** A painter that draws everything shifted by (dx, dy) world pixels. */
function offset(p: Painter, dx: number, dy: number): Painter {
  const ox = Math.round(dx)
  const oy = Math.round(dy)
  return {
    px: (x, y, color, size) => p.px(x + ox, y + oy, color, size),
    rect: (x, y, w, h, color) => p.rect(x + ox, y + oy, w, h, color),
    alpha: (a) => p.alpha(a),
    screen: (color, a) => p.screen(color, a),
  }
}

/** A small fast generator (mulberry32): the same seed gives the same particles every frame. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = s
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
