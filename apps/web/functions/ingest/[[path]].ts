// Forwards the website's analytics to PostHog, so the browser only talks to this origin. The threaded simulation
// needs a cross-origin isolated page (COEP in public/_headers), and on that page PostHog's own cross-origin
// scripts and hosts would be blocked. Routed by public/_routes.json, which is also what keeps the SPA fallback
// from taking /ingest. /static/* comes from the assets host, and every other path from the ingest host.
//
// This is not an open proxy: only the paths posthog-js calls with this site's configuration are forwarded, and
// only with the methods it uses. Everything else is a 404.

const INGEST_HOST = 'https://us.i.posthog.com'
const ASSETS_HOST = 'https://us-assets.i.posthog.com'
const PREFIX = '/ingest'

const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS']

// The paths posthog-js calls here (capture_exceptions and remote config on, session recording off):
//   /e and /e/            event capture
//   /flags and /flags/    feature flags
//   /array/<key>/config   remote config (and its .js form)
//   /static/<name>.js     lazily loaded extensions such as exception autocapture
const ALLOWED_PATHS: RegExp[] = [
  /^\/e\/?$/,
  /^\/flags\/?$/,
  /^\/array\/phc_[A-Za-z0-9_-]+\/config(\.js)?$/,
  /^\/static\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.js$/,
]

// Headers that belong to this site or to the visitor, not to PostHog. CF-Connecting-IP is dropped too: PostHog's
// edge answers 403 to it, and X-Forwarded-For carries the address instead.
const DROPPED_REQUEST_HEADERS = ['cookie', 'authorization', 'proxy-authorization', 'host', 'cf-connecting-ip']

// Headers PostHog sends that the browser must not get from this origin.
const DROPPED_RESPONSE_HEADERS = ['set-cookie', 'set-cookie2', 'access-control-allow-origin']

/** Where a request for this path goes, or null when it is not one of the paths the site uses. */
export function upstreamFor(pathname: string, search: string): URL | null {
  if (!pathname.startsWith(PREFIX)) return null
  const rest = pathname.slice(PREFIX.length)
  if (!ALLOWED_PATHS.some((allowed) => allowed.test(rest))) return null
  const host = rest.startsWith('/static/') ? ASSETS_HOST : INGEST_HOST
  return new URL(host + rest + search)
}

export async function onRequest(context: { request: Request }): Promise<Response> {
  const incoming = new URL(context.request.url)
  const method = context.request.method

  if (!ALLOWED_METHODS.includes(method)) {
    return new Response('method not allowed', { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } })
  }
  if (method === 'OPTIONS')
    return new Response(null, { status: 204, headers: { Allow: ALLOWED_METHODS.join(', ') } })

  const upstream = upstreamFor(incoming.pathname, incoming.search)
  if (!upstream) return new Response('not found', { status: 404 })

  const headers = new Headers(context.request.headers)
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name)
  // PostHog places the visitor by the address it sees; through this proxy that is the proxy, so pass the real one.
  const visitor = context.request.headers.get('CF-Connecting-IP')
  if (visitor) headers.set('X-Forwarded-For', visitor)

  const hasBody = method !== 'GET'
  const response = await fetch(upstream, {
    method,
    headers,
    body: hasBody ? context.request.body : undefined,
    redirect: 'follow',
  })

  const outHeaders = new Headers(response.headers)
  for (const name of DROPPED_RESPONSE_HEADERS) outHeaders.delete(name)
  outHeaders.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  })
}
