import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    chunkSizeWarningLimit: 400,

    rollupOptions: {
      output: {
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
