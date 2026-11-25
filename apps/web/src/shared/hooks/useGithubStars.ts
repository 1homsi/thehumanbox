import { useEffect, useState } from 'react'
import { REPO_URL } from '../links'

/** Cache the public star count for an hour so every tab doesn't hit GitHub. */
export const GITHUB_STARS_CACHE_KEY = 'thb-github-stars'
export const GITHUB_STARS_CACHE_MS = 60 * 60_000

const REPO_API_URL = 'https://api.github.com/repos/1homsi/thehumanbox'

type Cache = { count: number; at: number }

function readCache(): number | null {
  try {
    const raw = window.localStorage.getItem(GITHUB_STARS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cache
    if (typeof parsed.count !== 'number' || !Number.isFinite(parsed.count) || parsed.count < 0) return null
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > GITHUB_STARS_CACHE_MS) return null
    return Math.floor(parsed.count)
  } catch {
    return null
  }
}

function writeCache(count: number): void {
  try {
    window.localStorage.setItem(GITHUB_STARS_CACHE_KEY, JSON.stringify({ count, at: Date.now() }))
  } catch {
    // Private mode or a full store; the button still works without a count.
  }
}

/** The live stargazer count for the public repo, or null until we have one. */
export function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : readCache(),
  )

  useEffect(() => {
    const cached = readCache()
    if (cached !== null) {
      setStars(cached)
      return
    }
    if (typeof fetch !== 'function') return
    const controller = new AbortController()
    void fetch(REPO_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { stargazers_count?: unknown }) => {
        if (controller.signal.aborted) return
        const count = data.stargazers_count
        if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return
        const stars = Math.floor(count)
        writeCache(stars)
        setStars(stars)
      })
      .catch((error: unknown) => {
        // Leave the button up without a number rather than showing a stale guess.
        if (error instanceof DOMException && error.name === 'AbortError') return
      })
    return () => {
      controller.abort()
    }
  }, [])

  return stars
}

/** The repository URL with a campaign tag for the header button. */
export function starHudHref(): string {
  return `${REPO_URL}?utm_source=thehumanbox&utm_medium=star_hud&utm_campaign=star_button`
}
