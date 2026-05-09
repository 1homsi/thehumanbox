import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // Push the chunk-size warning higher; we hand-split the heavy deps below
    // and the remaining "main" chunk should sit comfortably under 300 KB.
    chunkSizeWarningLimit: 400,

    rollupOptions: {
      output: {
        // Hand-split vendor chunks. Two goals:
        //  1) Keep d3 isolated - it's only used by FamilyTreeModal which is
        //     lazy-loaded, so this chunk is never fetched on first paint.
        //  2) Cache vendor code separately from app code so a bug-fix in
        //     src/* doesn't bust the React/Radix/d3 cache for returning users.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/d3-') || id.includes('/d3/'))            return 'd3-vendor'
          if (id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
          if (id.includes('/react/'))                                 return 'react-vendor'
          if (id.includes('@radix-ui'))                               return 'radix-vendor'
          if (id.includes('@tanstack'))                               return 'query-vendor'
          if (id.includes('/zustand/') || id.includes('/neverthrow/') ||
              id.includes('/zod/')     || id.includes('/clsx/'))      return 'state-vendor'
        },
      },
    },
  },
})
