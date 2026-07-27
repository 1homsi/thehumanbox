# The Human Box — Client

React/Vite frontend for [The Human Box](https://thehumanbox.com). Web
players get a private WebAssembly simulation that runs and saves in the
browser. The standalone site does not connect to a simulation API.

## What you're looking at

A live 600×300 world of autonomous humans who learn, form tribes,
build cities, develop their own language, found religions, sign
treaties, declare wars, choose their own furniture, and live their
own days — all through emergence. No scripted behaviours. The
simulation never stops, even when nobody's watching.

## Stack

- **React + TypeScript + Vite (rolldown)**
- **2D HTML canvas** for the default world view — biome rendering,
  fire/weather overlays, organism markers, heatmap overlays, sprite
  decorations, animated lake shimmer, weather effects
- **@react-three/fiber + three.js** for the optional 3D world,
  loaded lazily so 2D-only users never pay for the chunk
- **Zustand** for UI + world state, **TanStack Query** for on-demand
  organism detail fetches
- **MessagePack** decode of binary WS frames (no per-tick JSON parse)
- **Shepherd.js** for the desktop onboarding tour
- **Cloudflare Pages** — auto-deploys from `main`

## What's on screen

- **Live map** in 2D or 3D. Pan, zoom, click to follow an organism.
- **World pulse** in the header: day/night, season, era, weather,
  active fires, sick count.
- **Lineage and population panels** — every tribe alive right now,
  birth/death history, recent events.
- **Per-organism inspector** — life log, vocabulary, ancestry,
  friends, partner, beliefs, religion, specialty, wealth, what they
  own, what they're thinking.
- **Civilization modal** with deep breakdowns by lineage:
  - eras, governments and their leaders, religions and adherents
  - currencies in circulation
  - buildings raised, books written, artworks made
  - per-good circulation totals and recent trades
  - headlines (founding events, first-of-kind milestones, milestones
    like "the faith of X reached 50 followers")
- **Interior scenes** — click a tavern or temple button on a lineage
  to step inside that room; click an organism's home to see how
  they've furnished it (the AI picks the furniture).
- **Overlays** — hazard, fertility, structures, trails, age, threat
  density.
- **Modes** — photo mode, action ticker, mini-map, random tour,
  slow/fast-mo, color-blind palette, immersive.

## Running locally

```bash
pnpm install
pnpm run dev
```

The browser world needs no server. Electron injects a loopback API address
at runtime for the native simulation bundled with the downloadable app;
standalone browser builds ignore API query parameters and environment
overrides.

Private worlds checkpoint in IndexedDB. Settings can export the active save,
confirm and archive it before starting over, and list, export, or restore
recovery copies. Recovery candidates are deserialized and tick-checked in the
WASM simulation before replacing the primary save; transient IndexedDB failures
are retried without treating a read failure as an empty world.

## Deployment

Cloudflare Pages serves only the static browser build. There are no Pages
Functions or hosted simulation routes.

## Mobile

The desktop tour is suppressed on mobile (panel selectors don't
exist when the layout collapses, and the popovers attach awkwardly).
The 2D renderer halves its frame rate on mobile and skips the most
expensive per-frame loops so navigation stays smooth on phones.

## Building

```bash
pnpm run build   # outputs to dist/
```

## Source layout

```
src/
├── App.tsx, main.tsx, App.css, index.css
├── 2d/               2D world rendering (WorldView), 2D scenes (home, tavern, temple)
├── 3d/               3D world rendering (WorldView3D), 3D scenes, terrain, water, sun
├── scenes/           Shared scene types, registry, core resolver
├── components/       Modals, panels, inspectors, civ stats, family tree
├── tour/             Shepherd-based desktop onboarding
├── hooks/            useIsMobile, useFrozenSnapshot, useOrgDetail
├── simulation/       useSimulation hook, wire decoding, frame merging
├── stores/           UI store (zustand slices), live world store, scene store
├── types/            shared types
├── utils/            constants, sprite atlas, era utils, lineage colour
└── lib/              config (API base resolution)
```
