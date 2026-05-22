import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

function emitVersionJson(): Plugin {
  return {
    name: 'thb-emit-version-json',
    apply: 'build',
    async closeBundle() {
      const sha = process.env.VITE_GIT_SHA  ?? 'dev'
      const ts  = process.env.VITE_BUILD_TS ?? String(Math.floor(Date.now() / 1000))
      const payload = JSON.stringify({ sha, built_at: Number(ts) })
      const out = path.resolve(__dirname, 'dist', 'version.json')
      await writeFile(out, payload, 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],

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
          // Split the troika/SDF/bidi text rendering stack into its own
          // chunk so the initial WorldView3D paint doesn't pay the
          // download cost up front. Browsers fetch sibling chunks in
          // parallel, so first-paint reaches the canvas sooner.
          if (id.includes('/troika-')
              || id.includes('/webgl-sdf-generator')
              || id.includes('/bidi-js'))                             return 'text-vendor'
          // three.js core into its own chunk for the same parallel-
          // fetch reason — it's stable and rarely changes, so once
          // cached it sticks across deploys.
          if (id.includes('/three/') || id.includes('three-stdlib'))  return 'three-vendor'
        },
      },
    },
  },
})
