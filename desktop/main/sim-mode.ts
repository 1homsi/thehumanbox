/** Convert a settings URL into the host format consumed by the renderer. */
export function remoteApiHost(remoteUrl: string): string {
  return remoteUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}
