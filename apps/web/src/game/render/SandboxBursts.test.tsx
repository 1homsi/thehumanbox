import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SandboxBursts } from './SandboxBursts'

const html = (kind: 'eruption' | 'meteor') =>
  renderToStaticMarkup(
    <SandboxBursts bursts={[{ id: 1, kind, x: 100, y: 80, r: 30 }]} width={400} height={300} />,
  )

describe('SandboxBursts', () => {
  it('draws an eruption as a vent, lava bombs and an ash column, with no falling rock', () => {
    const out = html('eruption')
    expect(out).toContain('burst-vent')
    expect(out.match(/burst-lava/g)?.length).toBe(6)
    expect(out.match(/burst-ash/g)?.length).toBe(5)
    expect(out).not.toContain('burst-meteor')
  })

  it('still drops a meteor for the meteor tools', () => {
    expect(html('meteor')).toContain('burst-meteor-rock')
  })
})
