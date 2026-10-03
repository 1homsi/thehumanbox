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

const ACCENTS = ['#d4a843', '#e08070', '#7ab0e0', '#9070b0', '#7ebd6a', '#e0c070', '#c08060']
const HAIRS = ['#1a1310', '#3a2618', '#5a3a20', '#7a5028', '#a86838', '#cc9844', '#dcdcdc']

// A person's variant never changes and is asked for twice per person per frame, so it
// is computed once per id. Callers only read it.
const variantCache = new Map<string, OrgVariant>()
const VARIANT_CACHE_MAX = 20000

export function orgVariant(id: string): OrgVariant {
  const cached = variantCache.get(id)
  if (cached) return cached
  const variant = computeOrgVariant(id)
  if (variantCache.size >= VARIANT_CACHE_MAX) variantCache.clear()
  variantCache.set(id, variant)
  return variant
}

function computeOrgVariant(id: string): OrgVariant {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = (h >>> 0) / 0xffffffff
  const b = ((h ^ 0x9e3779b9) >>> 0) / 0xffffffff
  const c = ((h ^ 0x85ebca6b) >>> 0) / 0xffffffff
  return {
    hueShift: (a - 0.5) * 36,
    accent: ACCENTS[Math.floor(b * ACCENTS.length)],
    bodyRadius: 4.6 + c * 1.0,
    hairColor: HAIRS[Math.floor(c * HAIRS.length)],
  }
}
