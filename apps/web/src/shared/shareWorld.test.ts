// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from './observability'
import { SHARE_URL } from './shareCard'
import { chooseShareMethod, shareWorldCard } from './shareWorld'
import type { WorldState } from './types'

vi.mock('./observability', () => ({ trackEvent: vi.fn() }))

const blob = new Blob(['png'], { type: 'image/png' })
const world = {
  tick: 24_000,
  lineage_sizes: [{ id: 'a', count: 4 }],
  headlines: [{ tick: 24_000, text: '🔥 A meteor stunned the people.' }],
  organisms: [],
} as unknown as WorldState

beforeEach(() => {
  vi.mocked(trackEvent).mockClear()
})

describe('choosing how to share', () => {
  it('prefers the system share sheet, then the clipboard, then a download', () => {
    expect(chooseShareMethod(true, true)).toBe('native_share')
    expect(chooseShareMethod(true, false)).toBe('native_share')
    expect(chooseShareMethod(false, true)).toBe('copy')
    expect(chooseShareMethod(false, false)).toBe('download')
  })
})

describe('sharing a world card', () => {
  it('shares the picture, words and link natively, and counts it once', async () => {
    const share = vi.fn(async (data: ShareData) => {
      void data
    })
    const canShare = vi.fn((data: ShareData) => {
      void data
      return true
    })
    const copy = vi.fn()
    const download = vi.fn()
    const notify = vi.fn()

    const method = await shareWorldCard(world, {
      buildCard: async () => blob,
      canShare,
      canCopy: () => true,
      share,
      copy,
      download,
      notify,
    })

    expect(method).toBe('native_share')
    expect(canShare).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }))
    const data = share.mock.calls[0]?.[0] as ShareData
    expect(data.files?.[0]).toBeInstanceOf(File)
    expect(data.files?.[0]?.type).toBe('image/png')
    expect(data.url).toBe(SHARE_URL)
    expect(data.text).toContain('A meteor stunned the people.')
    expect(copy).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('share_card_clicked', { method: 'native_share' })
  })

  it('asks the browser about files, as Web Share Level 2 defines', async () => {
    const canShare = vi.fn((data: ShareData) => {
      void data
      return true
    })
    const original = Object.getOwnPropertyDescriptor(navigator, 'canShare')
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare })
    try {
      const method = await shareWorldCard(world, {
        buildCard: async () => blob,
        share: vi.fn(async (data: ShareData) => {
          void data
        }),
        canCopy: () => false,
      })
      expect(method).toBe('native_share')
      expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] })
    } finally {
      if (original) Object.defineProperty(navigator, 'canShare', original)
      else delete (navigator as Navigator & { canShare?: unknown }).canShare
    }
  })

  it('copies the image and offers the words and link when the share sheet cannot take files', async () => {
    const share = vi.fn(async (data: ShareData) => {
      void data
    })
    const copy = vi.fn(async (blob: Blob, text: string) => {
      void blob
      void text
    })
    const download = vi.fn()
    const notify = vi.fn()

    const method = await shareWorldCard(world, {
      buildCard: async () => blob,
      canShare: () => false,
      canCopy: () => true,
      share,
      copy,
      download,
      notify,
    })

    expect(method).toBe('copy')
    expect(copy).toHaveBeenCalledWith(blob, expect.stringContaining(SHARE_URL))
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('A meteor stunned the people.'))
    expect(share).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('share_card_clicked', { method: 'copy' })
  })

  it('downloads when neither the share sheet nor the clipboard takes the picture', async () => {
    const share = vi.fn()
    const copy = vi.fn()
    const download = vi.fn()

    const method = await shareWorldCard(world, {
      buildCard: async () => blob,
      canShare: () => false,
      canCopy: () => false,
      share,
      copy,
      download,
    })

    expect(method).toBe('download')
    expect(download).toHaveBeenCalledWith(blob, 'the-human-box-tick-24000.png')
    expect(share).not.toHaveBeenCalled()
    expect(copy).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('share_card_clicked', { method: 'download' })
  })

  it('falls back to a copy when the system share sheet refuses', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    const copy = vi.fn(async (blob: Blob, text: string) => {
      void blob
      void text
    })

    const method = await shareWorldCard(world, {
      buildCard: async () => blob,
      canShare: () => true,
      canCopy: () => true,
      share,
      copy,
      download: vi.fn(),
    })

    expect(method).toBe('copy')
    expect(copy).toHaveBeenCalledTimes(1)
    // A fallback is counted as the method the player really got, and only once.
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('share_card_clicked', { method: 'copy' })
  })

  it('counts a cancelled system sheet as the native share it was', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const copy = vi.fn()

    const method = await shareWorldCard(world, {
      buildCard: async () => blob,
      canShare: () => true,
      canCopy: () => true,
      share,
      copy,
      download: vi.fn(),
    })

    expect(method).toBe('native_share')
    expect(copy).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('share_card_clicked', { method: 'native_share' })
  })

  it('sends nothing when there is no map to make a card from', async () => {
    const method = await shareWorldCard(world, {
      buildCard: async () => null,
      canShare: () => true,
      canCopy: () => true,
      share: vi.fn(),
      copy: vi.fn(),
      download: vi.fn(),
    })

    expect(method).toBeNull()
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
