import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Single client for the whole app. Defaults are quiet on errors and don't
// over-refetch - sim hooks set their own intervals where polling matters.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:                1,
      staleTime:            5_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)

// Fade out the inline splash screen as soon as the WebSocket delivers the
// first world frame. The App component dispatches `thb-world-ready` on its
// first non-null render so the splash hides exactly when there's something
// real to show - instead of the user seeing a blank "waiting…" gap between
// React mounting and the first WS frame arriving.
//
// Failsafe: hide the splash after 12 s no matter what so a backend that's
// down doesn't trap the user behind a permanent spinner.
function hideSplash() {
  const splash = document.getElementById('thb-splash')
  if (!splash) return
  splash.classList.add('hide')
  setTimeout(() => splash.parentNode?.removeChild(splash), 400)
}
window.addEventListener('thb-world-ready', hideSplash, { once: true })
setTimeout(hideSplash, 12_000)
