// Fork: analytics are removed. Upstream sends PostHog events from the desktop
// app; this fork sends nothing anywhere. Nothing imports posthog-js any more, so
// it never reaches the bundle (it stays in package.json only to keep the
// lockfile identical to upstream's). The two functions stay as no-ops so
// upstream's call sites merge without conflicts.

export function initAnalytics(): void {}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  void name
  void props
}
