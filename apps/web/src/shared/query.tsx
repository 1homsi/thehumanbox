import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Only the person detail panel and the conversations dialog fetch with react-query, and both
// are lazy chunks, so the client and its provider live here and are wrapped around those two
// instead of the whole app. That keeps react-query (about 40 kB) out of the first download.
// One shared client, so both see the same cache.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
})

export function WithQueryClient({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
