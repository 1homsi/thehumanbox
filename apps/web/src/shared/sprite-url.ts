/** Hashes of the sheets under public/sprites, filled in by vite.config.ts at build time. */
declare const __SPRITE_VERSIONS__: Record<string, string> | undefined

const VERSIONS: Record<string, string> = typeof __SPRITE_VERSIONS__ === 'undefined' ? {} : __SPRITE_VERSIONS__

/**
 * The URL of a sheet in public/ (`sprites/people/people.png`). Sheets keep fixed names and are cached for a day, so
 * the URL carries a hash of the file: a sheet redrawn alongside the code that reads its layout is a new URL, never
 * a stale copy. After the art overhaul a cached old people sheet drew everyone as empty cells for a day.
 */
export function spriteUrl(file: string): string {
  const version = VERSIONS[file]
  return `${import.meta.env.BASE_URL}${file}${version ? `?v=${version}` : ''}`
}
