// Forwards the website's analytics to PostHog, so the browser only talks to this origin. The threaded simulation
// needs a cross-origin isolated page (COEP in public/_headers), and on that page PostHog's own cross-origin
// scripts and hosts would be blocked. Routed by public/_routes.json, which is also what keeps the SPA fallback
// from taking /ingest. Follows PostHog's Cloudflare reverse-proxy guide: /ingest/static/* comes from the assets
// host, and every other path from the ingest host.

const INGEST_HOST = 'https://us.i.posthog.com'
const ASSETS_HOST = 'https://us-assets.i.posthog.com'
const PREFIX = '/ingest'

// Headers that belong to this site, not to PostHog: the visitor's cookies and this site's own host name. Cloudflare's
// CF-Connecting-IP is dropped too: PostHog's edge answers 403 to it, and X-Forwarded-For carries the address instead.
const DROPPED_HEADERS = ['cookie', 'host', 'cf-connecting-ip']

export async function onRequest(context: { request: Request }): Promise<Response> {
  const incoming = new URL(context.request.url)
  const rest = incoming.pathname.slice(PREFIX.length)
  const upstream = new URL((rest.startsWith('/static/') ? ASSETS_HOST : INGEST_HOST) + rest + incoming.search)

  const headers = new Headers(context.request.headers)
  for (const name of DROPPED_HEADERS) headers.delete(name)
  // PostHog places the visitor by the address it sees; through this proxy that is the proxy, so pass the real one.
  const visitor = context.request.headers.get('CF-Connecting-IP')
  if (visitor) headers.set('X-Forwarded-For', visitor)

  const method = context.request.method
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const response = await fetch(upstream, {
    method,
    headers,
    body: hasBody ? context.request.body : undefined,
    redirect: 'follow',
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
