import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

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

function hideSplash() {
  const splash = document.getElementById('thb-splash')
  if (!splash) return
  splash.classList.add('hide')
  setTimeout(() => splash.parentNode?.removeChild(splash), 400)
}
window.addEventListener('thb-world-ready', hideSplash, { once: true })
setTimeout(hideSplash, 12_000)
