// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { AtlasHost } from './atlas-host'
import { GlyphAtlas } from './glyph-atlas'

const host: AtlasHost = { register() {}, unregister() {}, dirty() {} }

describe('GlyphAtlas', () => {
  it('holds every glyph a Russian map label can mix without drawing blanks', () => {
    const atlas = new GlyphAtlas(host, 'bold', 14)
    const latin = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const cyrillic = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
    const rest = '0123456789 .,:;!?-–—·…«»"\'()[]{}<>/\\|+=*&%#@$^_~×⚠⚔☠✝☀⚑'
    for (const ch of [...latin, ...cyrillic, ...rest]) expect(atlas.frame(ch), ch).toBeGreaterThanOrEqual(0)
    expect(atlas.overflow).toBe(0)
  })
})
