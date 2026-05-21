/**
 * Cloudflare Pages Function — proxies /og.png to the live simulation
 * server's /og.png renderer so the OG image appears on the same host
 * as the page (thehumanbox.com/og.png instead of
 * api.thehumanbox.com/og.png).
 *
 * Why bother with the proxy when the API endpoint already works?
 * Several SEO / social-share preview tools flag any og:image URL
 * whose host differs from og:url as "invalid or unreachable" even
 * when the cross-host fetch succeeds. WhatsApp, Facebook, X, etc.
 * all follow cross-host og:image fine in practice — the warning is
 * a quality heuristic, not a real failure — but serving from the
 * same host silences the lint and makes the validator green.
 *
 * Pages Functions run on Cloudflare's edge and cache the upstream
 * response per the upstream Cache-Control header (we set
 * `public, max-age=300` on the API side). First request after a
 * cache miss takes ~400ms cold; everything within 5 min is edge-
 * served.
 */

export const onRequestGet: PagesFunction = async () => {
  const upstream = 'https://api.thehumanbox.com/og.png'
  const resp = await fetch(upstream, {
    // Cloudflare honours these for edge caching across the
    // Pages-Function fetch. Keep the same 5-min TTL the upstream
    // advertises so we don't double-stale-cache.
    cf: { cacheTtl: 300, cacheEverything: true },
  })

  // Re-emit the body but force a sane content-type and cache header
  // in case the upstream ever drifts. Strip the upstream's `vary`
  // (which references CORS headers Cloudflare doesn't need).
  const headers = new Headers()
  headers.set('Content-Type', resp.headers.get('Content-Type') ?? 'image/png')
  headers.set('Cache-Control', 'public, max-age=300')
  // Empty body on upstream failure → return 502 instead of an empty
  // PNG so social crawlers fall back to no-image instead of caching
  // a zero-byte response.
  if (!resp.ok) {
    return new Response('upstream OG endpoint failed', { status: 502 })
  }
  return new Response(resp.body, { status: 200, headers })
}
