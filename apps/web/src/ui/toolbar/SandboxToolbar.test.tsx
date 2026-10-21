import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'
import { isRuntimeControlActive } from '../../simulation/runtimeControls'
import { SandboxToolbar } from './SandboxToolbar'

function renderBar(overrides: Partial<Parameters<typeof SandboxToolbar>[0]> = {}): string {
  return renderToStaticMarkup(
    <SandboxToolbar
      armedToolId={null}
      brush={2}
      onBrush={() => {}}
      onPick={() => {}}
      onClearArmed={() => {}}
      {...overrides}
    />,
  )
}

describe('SandboxToolbar quiet bar', () => {
  it('presents one labeled bar with category words, group chips, one row of tools, and one time control', () => {
    const markup = renderBar()
    expect(markup).toContain('aria-label="World controls"')
    expect(markup).toContain('aria-label="World tools"')
    expect(markup).toContain('aria-label="life groups"')
    expect(markup).toContain('aria-label="people tools"')
    expect(markup).toContain('class="time-control')
    expect(markup).toContain('aria-label="Speed 1×, choose a speed"')
  })

  it('no longer carries find or save, which live in the ⋯ menu', () => {
    const markup = renderBar()
    expect(markup).not.toContain('Search all world tools')
    expect(markup).not.toContain('save world')
  })

  it('shows the speed list only once the speed is clicked', () => {
    expect(renderBar()).not.toContain('time-speed-list')
  })
})

describe('SandboxToolbar runtime state', () => {
  const tools = SANDBOX_CATEGORIES.find((category) => category.id === 'time')?.tools ?? []
  const tool = (id: string) => {
    const match = tools.find((candidate) => candidate.id === id)
    if (!match) throw new Error(`missing time tool ${id}`)
    return match
  }

  it('marks pause or play from the acknowledged pause state', () => {
    expect(isRuntimeControlActive(tool('pause').time, true, 1)).toBe(true)
    expect(isRuntimeControlActive(tool('play').time, true, 1)).toBe(false)
    expect(isRuntimeControlActive(tool('pause').time, false, 1)).toBe(false)
    expect(isRuntimeControlActive(tool('play').time, false, 1)).toBe(true)
  })

  it('marks only the acknowledged speed', () => {
    expect(isRuntimeControlActive(tool('fast4').time, false, 4)).toBe(true)
    expect(isRuntimeControlActive(tool('normal').time, false, 4)).toBe(false)
    expect(isRuntimeControlActive(tool('slow').time, true, 0.5)).toBe(true)
  })
})

describe('persistent transport controls', () => {
  it('offers pause outside the time category', () => {
    expect(renderBar()).toContain('aria-label="Pause simulation"')
  })
  it('offers resume when the acknowledged world state is paused', () => {
    const markup = renderBar({ runtimePaused: true })
    expect(markup).toContain('aria-label="Resume simulation"')
    expect(markup).not.toContain('aria-label="Pause simulation"')
  })
})
