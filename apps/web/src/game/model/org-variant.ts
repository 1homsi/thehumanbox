/**
 * Per-organism cosmetic variant derived from a deterministic hash of
 * the organism id. Used by the WorldView 2D renderer to give each
 * organism a subtly different look (hue shift, accent colour, body
 * radius, hair colour) without needing per-org state on the wire.
 */
export interface OrgVariant {
  hueShift: number
  accent: string
  bodyRadius: number
  hairColor: string
}

export function orgVariant(id: string): OrgVariant {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = (h >>> 0) / 0xffffffff
  const b = ((h ^ 0x9e3779b9) >>> 0) / 0xffffffff
  const c = ((h ^ 0x85ebca6b) >>> 0) / 0xffffffff
  const accents = ['#d4a843', '#e08070', '#7ab0e0', '#9070b0', '#7ebd6a', '#e0c070', '#c08060']
  const hairs = ['#1a1310', '#3a2618', '#5a3a20', '#7a5028', '#a86838', '#cc9844', '#dcdcdc']
  return {
    hueShift: (a - 0.5) * 36,
    accent: accents[Math.floor(b * accents.length)],
    bodyRadius: 4.6 + c * 1.0,
    hairColor: hairs[Math.floor(c * hairs.length)],
  }
}
