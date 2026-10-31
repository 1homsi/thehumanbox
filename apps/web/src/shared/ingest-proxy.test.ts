import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest, upstreamFor } from '../../functions/ingest/[[path]]'

const SITE = 'https://thehumanbox.com'

/** Runs the proxy on a request and returns what it sent upstream. */
async function forward(path: string, init: RequestInit = {}) {
  const upstream = vi.fn(
    async () =>
      new Response('ok', {
        status: 202,
        headers: { 'x-upstream': '1', 'set-cookie': 'ph=secret; Path=/', 'access-control-allow-origin': '*' },
      }),
  )
  vi.stubGlobal('fetch', upstream)
  const response = await onRequest({ request: new Request(SITE + path, init) })
  const [url, sent] = (upstream.mock.calls[0] ?? [undefined, undefined]) as unknown as [URL, RequestInit]
  return { response, url: String(url), headers: new Headers(sent?.headers), method: sent?.method }
}

afterEach(() => vi.unstubAllGlobals())

describe('the allowlist', () => {
  it('forwards the paths posthog-js calls with this configuration', () => {
    expect(upstreamFor('/ingest/e/', '')?.href).toBe('https://us.i.posthog.com/e/')
    expect(upstreamFor('/ingest/e', '?ip=1')?.href).toBe('https://us.i.posthog.com/e?ip=1')
    expect(upstreamFor('/ingest/flags/', '?v=2')?.href).toBe('https://us.i.posthog.com/flags/?v=2')
    expect(upstreamFor('/ingest/array/phc_abc123/config.js', '')?.href).toBe(
      'https://us.i.posthog.com/array/phc_abc123/config.js',
    )
    expect(upstreamFor('/ingest/static/1.438.12/exception-autocapture.js', '')?.href).toBe(
      'https://us-assets.i.posthog.com/static/1.438.12/exception-autocapture.js',
    )
  })

  it('refuses every other path', () => {
    expect(upstreamFor('/ingest/decide/', '')).toBeNull()
    expect(upstreamFor('/ingest/s/', '')).toBeNull()
    expect(upstreamFor('/ingest/i/v0/e/', '')).toBeNull()
    expect(upstreamFor('/ingest/array/phc_abc/../../admin', '')).toBeNull()
    expect(upstreamFor('/ingest/static/../secret.js', '')).toBeNull()
    expect(upstreamFor('/ingest/static/a.html', '')).toBeNull()
    expect(upstreamFor('/ingest/array/notakey/config', '')).toBeNull()
    expect(upstreamFor('/elsewhere/e/', '')).toBeNull()
  })
})

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

  it('answers a path it does not forward with a 404 and contacts nothing', async () => {
    const { response, url } = await forward('/ingest/decide/', { method: 'POST', body: '{}' })
    expect(response.status).toBe(404)
    expect(url).toBe('undefined')
  })

  it('answers methods other than GET, POST and OPTIONS with a 405', async () => {
    const { response, url } = await forward('/ingest/e/', { method: 'PUT', body: '{}' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, POST, OPTIONS')
    expect(url).toBe('undefined')
  })

  it('answers OPTIONS itself', async () => {
    const { response, url } = await forward('/ingest/e/', { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(url).toBe('undefined')
  })

  it('drops the visitor cookies, authorization and host, and passes the real address on', async () => {
    const { headers } = await forward('/ingest/e/', {
      method: 'POST',
      body: '{}',
      headers: {
        cookie: 'sid=secret',
        authorization: 'Bearer secret',
        host: 'thehumanbox.com',
        'CF-Connecting-IP': '203.0.113.7',
      },
    })
    expect(headers.has('cookie')).toBe(false)
    expect(headers.has('authorization')).toBe(false)
    expect(headers.has('host')).toBe(false)
    expect(headers.has('cf-connecting-ip')).toBe(false)
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
  })

  it('returns PostHog status and headers to the browser, minus cookies, with nosniff', async () => {
    const { response } = await forward('/ingest/flags/', { method: 'POST', body: '{}' })
    expect(response.status).toBe(202)
    expect(response.headers.get('x-upstream')).toBe('1')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
