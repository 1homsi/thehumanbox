import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/ingest/[[path]]'

const SITE = 'https://thehumanbox.com'

/** Runs the proxy on a request and returns what it sent upstream. */
async function forward(path: string, init: RequestInit = {}) {
  const upstream = vi.fn(async () => new Response('ok', { status: 202, headers: { 'x-upstream': '1' } }))
  vi.stubGlobal('fetch', upstream)
  const response = await onRequest({ request: new Request(SITE + path, init) })
  const [url, sent] = upstream.mock.calls[0] as unknown as [URL, RequestInit]
  return { response, url: String(url), headers: new Headers(sent.headers), method: sent.method }
}

afterEach(() => vi.unstubAllGlobals())

describe('the /ingest proxy', () => {
  it('sends capture requests to the PostHog ingest host', async () => {
    const { url, method } = await forward('/ingest/e/?ip=1&_=2', { method: 'POST', body: '{}' })
    expect(url).toBe('https://us.i.posthog.com/e/?ip=1&_=2')
    expect(method).toBe('POST')
  })

  it('sends the static assets PostHog lazy-loads to the assets host', async () => {
    const { url } = await forward('/ingest/static/surveys.js')
    expect(url).toBe('https://us-assets.i.posthog.com/static/surveys.js')
  })

  it('drops the visitor cookies and host, and passes the real address on', async () => {
    const { headers } = await forward('/ingest/e/', {
      method: 'POST',
      body: '{}',
      headers: { cookie: 'sid=secret', host: 'thehumanbox.com', 'CF-Connecting-IP': '203.0.113.7' },
    })
    expect(headers.has('cookie')).toBe(false)
    expect(headers.has('host')).toBe(false)
    expect(headers.has('cf-connecting-ip')).toBe(false)
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
  })

  it('returns PostHog status and headers to the browser', async () => {
    const { response } = await forward('/ingest/decide/', { method: 'POST', body: '{}' })
    expect(response.status).toBe(202)
    expect(response.headers.get('x-upstream')).toBe('1')
  })
})
