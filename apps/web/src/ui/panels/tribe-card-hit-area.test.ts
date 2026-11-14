import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The tribe card's × was a bare 14px glyph right beside the follow star, and players pressed it again and again
 * (#952): presses landed on the card around it, or on the star. These pin the hit areas in the stylesheet, which
 * the DOM tests cannot measure.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, '../../styles/app/13-silence-tribe-card.css'), 'utf8')

/** The declarations of the first rule whose whole selector is `selector` (not one shared with others). */
function rule(source: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = [...source.matchAll(new RegExp(`(^|[{};/])\\s*${escaped}\\s*\\{`, 'g'))][0]
  if (!match) throw new Error(`no rule for ${selector}`)
  // The rule's own brace: the match may start on the `{` of an enclosing @media.
  const open = match.index + match[0].length
  const body = source.slice(open, source.indexOf('}', open))
  return Object.fromEntries(
    body
      .split(';')
      .map((d) => d.split(':').map((p) => p.trim()))
      .filter((d) => d.length === 2 && d[0])
      .map(([k, v]) => [k, v]),
  )
}
/** The touch rules for the card's buttons: the first coarse-pointer block after the × is styled. */
const coarse = css.slice(css.indexOf('@media (pointer: coarse)', css.indexOf('.tribe-card-close {')))
const px = (value: string | undefined) => Number.parseFloat(value ?? '0')

describe('the tribe card ×', () => {
  it('is at least 28px square for a mouse', () => {
    const close = rule(css, '.tribe-card-close')
    expect(px(close.width)).toBeGreaterThanOrEqual(28)
    expect(px(close.height)).toBeGreaterThanOrEqual(28)
    expect(close['margin']).toMatch(/ 4px$/)
  })

  it('is bigger still for a finger', () => {
    const close = rule(coarse, '.tribe-card-close')
    expect(px(close.width)).toBeGreaterThanOrEqual(36)
    expect(px(close.height)).toBeGreaterThanOrEqual(36)
  })

  it('does not grow past the card’s padding (8px top and bottom, 10px right)', () => {
    const card = rule(css, '.tribe-card')
    expect(card.padding).toBe('8px 10px 10px')
    for (const source of [css, coarse]) {
      const [top, right] = rule(source, '.tribe-card-close').margin!.split(/\s+/).map(px)
      expect(-top!).toBeLessThanOrEqual(8)
      expect(-right!).toBeLessThanOrEqual(10)
    }
  })
})
