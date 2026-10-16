export function isDesktopStartupPending(
  desktop: boolean,
  search: string,
): boolean {
  if (!desktop) return false
  return !new URLSearchParams(search).get('api')?.trim()
}
