import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function emitVersionJson(): Plugin {
  let outDir: string
  return {
    name: 'thb-emit-version-json',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async writeBundle() {
      const sha = process.env.VITE_GIT_SHA ?? 'dev'
      const ts = process.env.VITE_BUILD_TS ?? String(Math.floor(Date.now() / 1000))
      const payload = JSON.stringify({ sha, built_at: Number(ts) })
      const out = path.join(outDir, 'version.json')
      await writeFile(out, payload, 'utf8')
    },
  }
}

/**
 * The simulation WASM (~3.4MB) used to download only after the whole JS
 * bundle parsed, React mounted, and the worker booted - a fully serial
 * chain. Injecting <link rel="preload"> tags into the HTML shell starts
 * the WASM and worker-chunk downloads the moment the HTML arrives, in
 * parallel with everything else. This cuts several seconds off first
 * load on typical connections.
 *
 * Runs in writeBundle (post-build) because rolldown-vite does not fire
 * generateBundle for config-level JS plugins.
 */
const SPRITE_SHEETS = ['sprites/people/people.png', 'sprites/fauna.png']

/**
 * A short hash of every sheet under public/sprites, keyed by its path from public/. The app asks for each sheet with
 * `?v=<hash>` (src/shared/sprite-url.ts): the files keep fixed names and are cached for a day, so a redrawn sheet must
 * be a new URL or players get the old image under the new code that reads it.
 */
function spriteVersions(): Record<string, string> {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')
  const versions: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(publicDir, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (entry.name.endsWith('.png'))
        versions[rel] = createHash('sha256')
          .update(readFileSync(path.join(publicDir, rel)))
          .digest('hex')
          .slice(0, 10)
    }
  }
  walk('sprites')
  return versions
}
const SPRITE_VERSIONS = spriteVersions()

function preloadSimAssets(): Plugin {
  const base = process.env.VITE_DESKTOP === '1' ? './' : '/'
  let outDir: string
  return {
    name: 'thb-preload-sim-assets',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async writeBundle() {
      const distDir = outDir
      const htmlPath = path.join(distDir, 'index.html')
      let html: string
      try {
        html = await readFile(htmlPath, 'utf8')
      } catch {
        return
      }
      if (html.includes('thb-preload-sim')) return
      let names: string[]
      try {
        names = await readdir(path.join(distDir, 'assets'))
      } catch {
        return
      }
      const wasm = names.find((n) => /^sim_core_bg-.*\.wasm$/.test(n))
      const worker = names.find((n) => /^wasmWorker-.*\.js$/.test(n))
      const worldView = names.find((n) => /^WorldView-.*\.js$/.test(n))
      if (!wasm && !worker && !worldView) return
      const join = (p: string) => (base === './' ? `./assets/${p}` : `${base}assets/${p}`)
      const tags: string[] = ['<!-- thb-preload-sim -->']
      // crossorigin matches fetch()'s default cors mode so the preload
      // is reused instead of triggering a second download.
      if (wasm) {
        tags.push(`<link rel="preload" href="${join(wasm)}" as="fetch" crossorigin fetchpriority="high" />`)
      }
      if (worker) {
        tags.push(`<link rel="modulepreload" href="${join(worker)}" />`)
      }
      // The map renderer is lazy-loaded; hint it so it downloads alongside the entry.
      if (worldView) {
        tags.push(`<link rel="modulepreload" href="${join(worldView)}" />`)
      }
      // The sprite sheets are read on the GPU path as soon as WorldView evaluates. Hint them here, after the wasm, at
      // low priority so they queue behind it.
      for (const sheet of SPRITE_SHEETS) {
        // The same URL the app asks for (src/shared/sprite-url.ts), so the preload is the request it uses.
        const href = `${base}${sheet}?v=${SPRITE_VERSIONS[sheet]}`
        tags.push(`<link rel="preload" href="${href}" as="image" fetchpriority="low" />`)
      }
      const next = html.replace('</head>', `  ${tags.join('\n  ')}\n</head>`)
      if (next !== html) await writeFile(htmlPath, next, 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [react(), emitVersionJson(), preloadSimAssets()],
  define: { __SPRITE_VERSIONS__: JSON.stringify(SPRITE_VERSIONS) },

  // Web is served at root with a Cloudflare SPA-fallback (any deep URL
  // returns /index.html), so absolute /assets/... is the only safe form
  // there. Desktop loads index.html over file://, where absolute paths
  // resolve to filesystem root — so the desktop build flips to relative
  // via VITE_DESKTOP=1 (set by desktop/package.json's build:renderer).
  base: process.env.VITE_DESKTOP === '1' ? './' : '/',

  build: {
    chunkSizeWarningLimit: 400,

    // rolldown-vite emits <link rel="modulepreload"> for every chunk in
    // the dependency map, including lazily imported ones. The vendor
    // chunks are static imports of the entry anyway (discovered as soon as
    // the entry downloads), so skipping the hints costs nothing; the
    // wasm/worker preloads above stay.
    modulePreload: false,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/d3-') || id.includes('/d3/')) return 'd3-vendor'
          if (id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
          if (id.includes('/react/')) return 'react-vendor'
          if (
            id.includes('/zustand/') ||
            id.includes('/neverthrow/') ||
            id.includes('/zod/') ||
            id.includes('/clsx/')
          )
            return 'state-vendor'
        },
      },
    },
  },
})
