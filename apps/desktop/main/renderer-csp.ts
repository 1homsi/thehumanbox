import type { Session } from "electron";

/**
 * The desktop renderer is a `file://` page: it loads its own bundle, talks to
 * the local simulation over loopback, and sends analytics to PostHog. Nothing
 * in the desktop app loads script, styles or frames from elsewhere, so a
 * script injected into the page cannot reach the network or the preload
 * bridge's `world.migrateDataRoot`.
 *
 * `'wasm-unsafe-eval'` is required by the WebAssembly sim; PostHog is the only
 * remote origin (and its failure is not fatal). The loopback forms are the
 * ones `apps/web/src/shared/config.ts` accepts for an `?api=` override.
 */
export function rendererContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    [
      "connect-src 'self'",
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*",
      "http://localhost:*",
      "ws://localhost:*",
      "http://[::1]:*",
      "ws://[::1]:*",
      "https://*.posthog.com",
    ].join(" "),
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * Attach the policy to every response of the app's own session: the renderer
 * document is a `file://` load, and Chromium ignores a CSP header on any
 * non-document response, so no URL filter is needed (and a filter would have
 * to get the file:// match-pattern semantics right).
 */
export function installRendererCsp(session: Pick<Session, "webRequest">): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [rendererContentSecurityPolicy()],
      },
    });
  });
}
