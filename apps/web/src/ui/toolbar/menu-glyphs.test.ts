import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STRATEGY_VISUALS } from '../../game/model/strategy-visuals'

/**
 * Symbols checked against DejaVu Sans, the fallback font stock Linux desktops ship (fc-query of DejaVuSans.ttf).
 * The menus use the system monospace stack and bundle no font, so a symbol outside every installed font shows as
 * an empty box: ⌖ and ⌕ did on Chromium/Linux (#925). Add a symbol here only after checking that font has it;
 * otherwise draw it as a pixel sprite (MenuGlyph).
 */
const COVERED = new Set([...'·✦⬤♥⚠◯⋯⌂✿✶↝★◎⬡⊞▣⊕⇄◆'])

const here = path.dirname(fileURLToPath(import.meta.url))
/** Colour emoji come from the emoji font, not the text font; everything else must be covered. */
const isEmoji = (ch: string) => (ch.codePointAt(0) ?? 0) >= 0x1f000

describe('menu symbols', () => {
  it('every text symbol in the More menu is in the fallback font', () => {
    const source = readFileSync(path.join(here, 'MoreDropdown.tsx'), 'utf8')
    const leading = [...source.matchAll(/^\s+([^\s<{]+) \{t\('dock\.more\./gm)].map((m) => m[1])
    expect(leading.length).toBeGreaterThan(10)
    const missing = leading.flatMap((token) => [...token]).filter((ch) => !isEmoji(ch) && !COVERED.has(ch))
    expect(missing).toEqual([])
  })

  it('every strategy symbol drawn on the map is in the fallback font', () => {
    const missing = Object.values(STRATEGY_VISUALS)
      .map((v) => v.symbol)
      .filter((ch) => !COVERED.has(ch))
    expect(missing).toEqual([])
  })
})
