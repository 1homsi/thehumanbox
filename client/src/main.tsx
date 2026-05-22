import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>,
)

function hideSplash() {
  const splash = document.getElementById('thb-splash')
  if (!splash) return
  splash.classList.add('hide')
  setTimeout(() => splash.parentNode?.removeChild(splash), 400)
}
window.addEventListener('thb-world-ready', hideSplash, { once: true })
setTimeout(hideSplash, 30_000)

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
    text.textContent = `downloading · ${kb(detail.loaded)} / ${kb(detail.total)} kb`
  } else {
    text.textContent = `downloading · ${kb(detail.loaded)} kb`
  }
})
