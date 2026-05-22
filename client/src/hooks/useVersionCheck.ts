import { useEffect, useRef, useState } from 'react'

const FE_GIT_SHA  = (import.meta.env.VITE_GIT_SHA  ?? 'dev') as string
const FE_BUILD_TS = Number(import.meta.env.VITE_BUILD_TS ?? 0)
const VERSION_URL = '/version.json'
const POLL_MS     = 5 * 60 * 1000
const RECENT_BUILD_GRACE_MS = 30 * 60 * 1000

interface VersionFile {
  sha?:      string
  built_at?: number
}

interface State {
  newVersionAvailable: boolean
  remoteSha:           string | null
  remoteBuiltAt:       number | null
}

export function useVersionCheck(): State {
  const [state, setState] = useState<State>({
    newVersionAvailable: false,
    remoteSha: null,
    remoteBuiltAt: null,
  })
  const settledRef = useRef(false)

  useEffect(() => {
    if (FE_GIT_SHA === 'dev') return
    let destroyed = false

    async function check() {
      if (destroyed) return
      try {
        const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const data = await r.json() as VersionFile
        if (destroyed) return
        const remoteSha = typeof data.sha === 'string' ? data.sha : null
        const remoteBuiltAt = typeof data.built_at === 'number' ? data.built_at : null
        if (!remoteSha) return
        if (remoteSha === FE_GIT_SHA) {
          if (settledRef.current) {
            setState({ newVersionAvailable: false, remoteSha, remoteBuiltAt })
          }
          return
        }
        if (remoteBuiltAt && FE_BUILD_TS && remoteBuiltAt <= FE_BUILD_TS) return
        if (remoteBuiltAt && Date.now() - remoteBuiltAt * 1000 < RECENT_BUILD_GRACE_MS && !settledRef.current) {
          settledRef.current = true
        }
        setState({ newVersionAvailable: true, remoteSha, remoteBuiltAt })
      } catch {
        /* ignore - network blip, try again next interval */
      }
    }

    const initial = window.setTimeout(check, 8000)
    const interval = window.setInterval(check, POLL_MS)
    const onFocus = () => check()
    window.addEventListener('focus',           onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      destroyed = true
      window.clearTimeout(initial)
      window.clearInterval(interval)
      window.removeEventListener('focus',           onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  return state
}
