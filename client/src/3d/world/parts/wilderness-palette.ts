import { Color } from 'three'

export type WildernessWeather = 'clear' | 'rain' | 'storm' | 'wet'

export interface WildernessPalette {
  skyTop: string
  skyMid: string
  skyHorizon: string
  fog: string
  sun: string
  ambient: string
  hemiSky: string
  hemiGround: string
  ridgeFar: string
  ridgeMid: string
  ridgeNear: string
  cloud: string
  exposure: number
}

interface PaletteStop extends WildernessPalette {
  at: number
}

const STOPS: PaletteStop[] = [
  {
    at: 0,
    skyTop: '#10172c',
    skyMid: '#202842',
    skyHorizon: '#4c3b4b',
    fog: '#29283b',
    sun: '#91a5cf',
    ambient: '#657398',
    hemiSky: '#596884',
    hemiGround: '#1b2528',
    ridgeFar: '#5d5669',
    ridgeMid: '#3b3b4c',
    ridgeNear: '#202a2c',
    cloud: '#2b3040',
    exposure: 0.82,
  },
  {
    at: 0.2,
    skyTop: '#315b76',
    skyMid: '#b55f4d',
    skyHorizon: '#f2a45f',
    fog: '#d99668',
    sun: '#ffad58',
    ambient: '#d79672',
    hemiSky: '#d68a67',
    hemiGround: '#34352c',
    ridgeFar: '#bb755f',
    ridgeMid: '#7b4d50',
    ridgeNear: '#2e3934',
    cloud: '#efb088',
    exposure: 1.14,
  },
  {
    at: 0.36,
    skyTop: '#4f7f9b',
    skyMid: '#82a9ae',
    skyHorizon: '#d0c2a0',
    fog: '#a7bbb0',
    sun: '#ffe0a0',
    ambient: '#d8ceb0',
    hemiSky: '#9db7b2',
    hemiGround: '#344331',
    ridgeFar: '#929588',
    ridgeMid: '#5c7062',
    ridgeNear: '#293c31',
    cloud: '#f2dfbf',
    exposure: 1,
  },
  {
    at: 0.66,
    skyTop: '#4c7891',
    skyMid: '#b47763',
    skyHorizon: '#e5b66d',
    fog: '#c38b62',
    sun: '#ffbd68',
    ambient: '#d6a879',
    hemiSky: '#c6926d',
    hemiGround: '#453a2b',
    ridgeFar: '#a87b67',
    ridgeMid: '#6b5a4d',
    ridgeNear: '#2d3930',
    cloud: '#edbd91',
    exposure: 1.08,
  },
  {
    at: 0.78,
    skyTop: '#3f506d',
    skyMid: '#b9524b',
    skyHorizon: '#f39a4f',
    fog: '#d78358',
    sun: '#ff8738',
    ambient: '#d28b62',
    hemiSky: '#d67a58',
    hemiGround: '#3a3428',
    ridgeFar: '#b96857',
    ridgeMid: '#704249',
    ridgeNear: '#26322f',
    cloud: '#ec9b75',
    exposure: 1.18,
  },
  {
    at: 0.9,
    skyTop: '#18233c',
    skyMid: '#56354b',
    skyHorizon: '#a7554d',
    fog: '#754653',
    sun: '#ff7840',
    ambient: '#795464',
    hemiSky: '#68485d',
    hemiGround: '#25272a',
    ridgeFar: '#754d5e',
    ridgeMid: '#483442',
    ridgeNear: '#20282b',
    cloud: '#785461',
    exposure: 0.96,
  },
  {
    at: 1,
    skyTop: '#10172c',
    skyMid: '#202842',
    skyHorizon: '#4c3b4b',
    fog: '#29283b',
    sun: '#91a5cf',
    ambient: '#657398',
    hemiSky: '#596884',
    hemiGround: '#1b2528',
    ridgeFar: '#5d5669',
    ridgeMid: '#3b3b4c',
    ridgeNear: '#202a2c',
    cloud: '#2b3040',
    exposure: 0.82,
  },
]

const COLOR_KEYS: Array<Exclude<keyof WildernessPalette, 'exposure'>> = [
  'skyTop',
  'skyMid',
  'skyHorizon',
  'fog',
  'sun',
  'ambient',
  'hemiSky',
  'hemiGround',
  'ridgeFar',
  'ridgeMid',
  'ridgeNear',
  'cloud',
]

function mixHex(a: string, b: string, t: number): string {
  return `#${new Color(a).lerp(new Color(b), t).getHexString()}`
}

function weatherGrade(color: string, weather: WildernessWeather): string {
  if (weather === 'clear') return color
  const target = weather === 'storm' ? '#4b5360' : weather === 'rain' ? '#687277' : '#7d8075'
  const amount = weather === 'storm' ? 0.48 : weather === 'rain' ? 0.28 : 0.14
  return mixHex(color, target, amount)
}

export function getWildernessPalette(
  dayProgress: number,
  weather: WildernessWeather = 'clear',
): WildernessPalette {
  const progress = Math.max(0, Math.min(1, dayProgress))
  let lo = STOPS[0]
  let hi = STOPS[STOPS.length - 1]
  for (let index = 0; index < STOPS.length - 1; index++) {
    if (progress >= STOPS[index].at && progress <= STOPS[index + 1].at) {
      lo = STOPS[index]
      hi = STOPS[index + 1]
      break
    }
  }
  const span = hi.at - lo.at
  const t = span === 0 ? 0 : (progress - lo.at) / span
  const palette = {} as WildernessPalette
  for (const key of COLOR_KEYS) palette[key] = weatherGrade(mixHex(lo[key], hi[key], t), weather)
  const weatherExposure =
    weather === 'storm' ? 0.76 : weather === 'rain' ? 0.86 : weather === 'wet' ? 0.94 : 1
  palette.exposure = (lo.exposure + (hi.exposure - lo.exposure) * t) * weatherExposure
  return palette
}
