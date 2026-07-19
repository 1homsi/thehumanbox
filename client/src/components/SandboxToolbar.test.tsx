import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../simulation/sandbox'
import { isRuntimeControlActive } from '../simulation/runtimeControls'
import { SandboxToolbar } from './SandboxToolbar'

function renderSaveButton(saveError: boolean, saveRetryable: boolean, saveBusy = false): string {
  return renderToStaticMarkup(
    <SandboxToolbar
      armedToolId={null}
      brush={2}
      onBrush={() => {}}
      onPick={() => {}}
      onClearArmed={() => {}}
      onSave={() => {}}
      saveError={saveError}
      saveRetryable={saveRetryable}
      saveBusy={saveBusy}
      saveStatus={saveError ? 'temporary storage failure' : undefined}
    />,
  )
}

describe('SandboxToolbar local save recovery', () => {
  it('keeps a retryable failed save actionable', () => {
    const markup = renderSaveButton(true, true)
    expect(markup).toContain('↻ retry save')
    expect(markup).not.toContain('disabled=""')
    expect(markup).toContain('temporary storage failure')
  })

  it('still blocks nonretryable conflicts and saves already in progress', () => {
    expect(renderSaveButton(true, false)).toContain('disabled=""')
    expect(renderSaveButton(false, false, true)).toContain('disabled=""')
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
    expect(isRuntimeControlActive(tool('fast').time, false, 3)).toBe(true)
    expect(isRuntimeControlActive(tool('normal').time, false, 3)).toBe(false)
    expect(isRuntimeControlActive(tool('slow').time, true, 0.5)).toBe(true)
  })
})
