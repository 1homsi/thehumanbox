// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConfirmHost } from './ConfirmDialog'
import { askConfirm, settleConfirm } from '../../shared/confirm'
import { t } from '../../i18n'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  settleConfirm(false)
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

/** Opens a question and waits for its dialog (the modal is lazy-loaded). */
async function openQuestion(options: Parameters<typeof askConfirm>[0]) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<ConfirmHost />))
  act(() => {
    void askConfirm(options)
  })
  await vi.waitFor(() => expect(document.querySelector('.confirm-actions')).not.toBeNull())
}

describe('ConfirmHost focus', () => {
  it('starts a dialog that deletes for good on Cancel, so a reflex Enter does not delete', async () => {
    await openQuestion({ title: 'Delete it?', danger: true, confirmLabel: 'delete' })

    expect(document.activeElement?.textContent).toBe(t('dialogs.confirm.cancel'))
  })

  it('starts an ordinary question on its confirm button', async () => {
    await openQuestion({ title: 'Move it?', confirmLabel: 'move' })

    expect(document.activeElement?.textContent).toBe('move')
  })

  it('moves focus to Cancel when a destructive question replaces an ordinary one', async () => {
    await openQuestion({ title: 'Move it?', confirmLabel: 'move' })
    expect(document.activeElement?.textContent).toBe('move')

    act(() => {
      void askConfirm({ title: 'Delete it?', danger: true, confirmLabel: 'delete' })
    })

    expect(document.activeElement?.textContent).toBe(t('dialogs.confirm.cancel'))
  })
})
