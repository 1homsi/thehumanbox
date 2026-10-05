/**
 * Switches for the cubeforge-backed renderer pieces. Each piece ships behind a
 * name so the default game is unchanged until the owner flips it on.
 *
 *   ?cf=camera,scenes   in the URL (wins), or
 *   localStorage['thb-cf'] = 'camera,scenes'
 *
 * `all` (or `1`) turns every flag on. Unknown names are simply never asked for.
 */
const STORAGE_KEY = 'thb-cf'

function names(): Set<string> {
  const found = new Set<string>()
  const add = (raw: string | null | undefined) => {
    for (const part of (raw ?? '').split(',')) {
      const name = part.trim().toLowerCase()
      if (name) found.add(name)
    }
  }
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('cf')
    if (fromUrl !== null) {
      add(fromUrl)
      return found
    }
  } catch {
    /* no window (tests, SSR) */
  }
  try {
    add(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    /* storage blocked */
  }
  return found
}

export function cfFlag(name: string): boolean {
  const on = names()
  return on.has('all') || on.has('1') || on.has(name.toLowerCase())
}
