# The Human Box — Client

React/Vite frontend for [The Human Box](https://thehumanbox.com).
Connects to the simulation server via WebSocket and renders the live
world.

## Stack

- **React + TypeScript + Vite (rolldown)**
- **2D HTML canvas** for the default world view — biome rendering,
  fire/weather overlays, organism markers, 6 heatmap overlays
- **@react-three/fiber + three.js** for the optional 3D world,
  loaded lazily so 2D-only users never pay for the ~1 MB chunk
- **Zustand** for UI + world state (two stores), TanStack Query for
  on-demand org detail fetches
- **MessagePack** decode of binary WS frames (no per-tick JSON parse)
- **Cloudflare Pages** — auto-deploys from `main`

## Running locally

```bash
pnpm install
pnpm run dev
```

Expects the simulation server at `localhost:8000`. See
[../simulation/](../simulation/) to run it.

## Environment

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `localhost:8000` | host[:port] of the simulation, no scheme |

The client derives both the WS URL (`ws://` or `wss://`) and the HTTP
snapshot URL from `VITE_API_BASE`. Examples:

- `VITE_API_BASE=localhost:8000` → `ws://localhost:8000/ws`
- `VITE_API_BASE=api.thehumanbox.com` → `wss://api.thehumanbox.com/ws`
- `VITE_API_BASE=10.0.0.5:8000` → `ws://10.0.0.5:8000/ws`

TLS is auto-detected: localhost and RFC-1918 addresses use `ws://` +
`http://`, everything else gets `wss://` + `https://`.

## Cloudflare Pages + API host

Keep the frontend on Pages, but treat the simulation API host as fully
dynamic. In Cloudflare, set **Bypass cache** rules for:

- `/ws`
- `/snapshot`
- `/transport`
- `/version`
- `/org/*`

Leave API-side performance features off for those routes. The live
stream depends on low-jitter delivery, not CDN-style caching.

## Building

```bash
pnpm run build   # outputs to dist/
```

## Source layout

```
src/
├── App.tsx, main.tsx, App.css, index.css
├── world/         WorldView (2D), WorldView3D (lazy R3F)
├── three/         3D building blocks (terrain, water, sun, weather, ...)
├── components/    UI components + components/stats/ for the stats modal
├── hooks/         useFrozenSnapshot, useOrgDetail
├── simulation/    useSimulation hook, wire decoding, frame merging
├── stores/        UI store (zustand), live world store (zustand)
├── types/         shared types
├── utils/         constants (lineageColor, event icons), sprite atlas
├── lib/           config (API base resolution)
└── assets/
```

## What you're looking at

A live 600×300 world of autonomous organisms that learn, form tribes,
discover fire, build shelters, develop their own language, and (when
the simulation has Groq configured) hold actual conversations — all
through emergence. No scripted behaviors. Toggle to 3D via the `more`
dropdown.
