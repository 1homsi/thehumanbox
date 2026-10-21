import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/fork.css'
import App from './App.tsx'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { initAnalytics } from './shared/observability'
import { reloadAppSafely } from './simulation/worldSource'
import { isDesktopStartupPending } from './shared/desktopStartup'
import { applyDocumentLocale, t } from './i18n'

initAnalytics()
applyDocumentLocale()
localizeSplash()

/** index.html carries the Russian loading screen; put it in the chosen language before it is noticed. */
function localizeSplash() {
  const set = (id: string, text: string) => {
    const el = document.getElementById(id)
    if (el) el.textContent = text
  }
  document.getElementById('thb-splash')?.setAttribute('aria-label', t('splash.label'))
  set('thb-progress-text', t('splash.waking'))
  set('thb-splash-slow', t('splash.slow'))
  set('thb-splash-reload', t('common.reload'))
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)

function hideSplash() {
  const splash = document.getElementById('thb-splash')
  if (!splash) return
  splash.classList.add('hide')
  setTimeout(() => splash.parentNode?.removeChild(splash), 400)
}
window.addEventListener('thb-world-ready', hideSplash, { once: true })
// A local WebAssembly world routinely needs several seconds to boot, so the
// reload hint waits long enough that it only appears when startup is stuck.
setTimeout(() => {
  const hint = document.getElementById('thb-splash-hint')
  const reload = document.getElementById('thb-splash-reload')
  if (hint && !document.getElementById('thb-splash')?.classList.contains('hide')) {
    hint.classList.add('show')
  }
  const startupPending = isDesktopStartupPending(!!window.thbDesktop, window.location.search)
  if (startupPending && reload) reload.hidden = true
  if (!startupPending) reload?.addEventListener('click', () => reloadAppSafely())
}, 15_000)
if (!isDesktopStartupPending(!!window.thbDesktop, window.location.search)) {
  setTimeout(hideSplash, 30_000)
}

type SnapshotProgress = { loaded: number; total: number | null }
window.addEventListener('thb-snapshot-progress', (e: Event) => {
  const detail = (e as CustomEvent<SnapshotProgress>).detail
  const bar = document.getElementById('thb-progress-bar')
  const text = document.getElementById('thb-progress-text')
  const wrap = bar?.parentElement
  if (!bar || !text || !wrap) return

  const kb = (n: number) => (n / 1024).toFixed(0)
  if (detail.total) {
    wrap.classList.remove('indeterminate')
    const pct = Math.min(100, Math.round((detail.loaded / detail.total) * 100))
    bar.style.width = pct + '%'
    text.textContent = t('splash.downloadingOf', { loaded: kb(detail.loaded), total: kb(detail.total) })
  } else {
    text.textContent = t('splash.downloading', { loaded: kb(detail.loaded) })
  }
})
