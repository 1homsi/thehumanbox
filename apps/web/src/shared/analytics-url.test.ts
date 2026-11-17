import { describe, expect, it } from 'vitest'
import type { CaptureResult } from 'posthog-js'
import { scrubEventUrls, stripPrivateParams } from './analytics-url'

const DESKTOP_URL =
  'file:///Applications/The%20Human%20Box.app/Contents/Resources/app.asar/dist/renderer/index.html?desktop=1&api=127.0.0.1:39543&token=5f0c1e2a-1111-4222-8333-944455556666&reset=1'

describe('analytics URLs', () => {
  it('takes the desktop API address and token out of a page URL, keeping the rest', () => {
    const clean = stripPrivateParams(DESKTOP_URL)
    expect(clean).not.toContain('token')
    expect(clean).not.toContain('39543')
    expect(clean).toContain('desktop=1')
    expect(clean).toContain('reset=1')
    expect(clean.startsWith('file:///Applications/')).toBe(true)
  })

  it('leaves other values alone', () => {
    expect(stripPrivateParams('https://thehumanbox.com/play?utm_source=tiktok')).toBe(
      'https://thehumanbox.com/play?utm_source=tiktok',
    )
    expect(stripPrivateParams('token=abc but not a URL')).toBe('token=abc but not a URL')
    expect(stripPrivateParams('$direct')).toBe('$direct')
  })

  it('scrubs every URL an event carries, in its properties and the person properties it sets', () => {
    const event = {
      uuid: '1',
      event: '$rageclick',
      properties: {
        $current_url: DESKTOP_URL,
        $referrer: DESKTOP_URL,
        $pathname: '/index.html',
        count: 3,
      },
      $set: { $current_url: DESKTOP_URL },
      $set_once: { $initial_current_url: DESKTOP_URL, $initial_referrer: DESKTOP_URL },
    } as unknown as CaptureResult
    const out = scrubEventUrls(event)!
    expect(JSON.stringify(out)).not.toContain('token=')
    expect(JSON.stringify(out)).not.toContain('api=')
    expect(out.properties.$pathname).toBe('/index.html')
    expect(out.properties.count).toBe(3)
    expect(scrubEventUrls(null)).toBeNull()
  })
})
