import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../i18n'
import { showNotice } from '../shared/confirm'
import { requestOwnWorldRecovery } from './worldSource'

vi.mock('../shared/confirm', () => ({ showNotice: vi.fn(() => Promise.resolve()) }))

describe('world notices in the active language', () => {
  afterEach(async () => {
    vi.clearAllMocks()
    await loadLocale('en')
  })

  it('says why a save cannot be restored, in English', () => {
    requestOwnWorldRecovery('not-this-world')
    expect(showNotice).toHaveBeenCalledWith(
      'Can’t restore that save',
      'That recovery save is not valid for this local world.',
    )
  })

  it('says why a save cannot be restored, in German', async () => {
    await loadLocale('de')
    requestOwnWorldRecovery('not-this-world')
    expect(showNotice).toHaveBeenCalledWith(
      'Dieser Spielstand kann nicht wiederhergestellt werden',
      'Dieser Wiederherstellungsstand passt nicht zu dieser lokalen Welt.',
    )
  })
})
