# The Human Box - Client

React/Vite frontend for [The Human Box](https://thehumanbox.com). Connects to the simulation server via WebSocket and renders the live world in real time.

## Stack

- **React + TypeScript + Vite**
- **WebGL canvas** - pan/zoom world view with biome rendering, fire/weather overlays, organism markers
- **Cloudflare Pages** - auto-deploys from `main` via Wrangler

## Running locally

```bash
npm install
npm run dev
```

Expects the simulation server running at `ws://localhost:8000/ws`. See [thehumanbox](https://github.com/stackxio/thehumanbox) to run it.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | `ws://localhost:8000/ws` | WebSocket endpoint |

Set `VITE_WS_URL=wss://api.thehumanbox.com/ws` in Cloudflare Pages build settings for production.

## Cloudflare Pages + API host

Keep the frontend on Pages, but treat the simulation API host as fully dynamic.
In Cloudflare, set **Bypass cache** rules for:

- `/ws`
- `/snapshot`
- `/transport`
- `/version`
- `/org/*`

Also leave API-side performance features off for those routes. The live stream
depends on low-jitter delivery, not CDN-style caching.

## Building

```bash
npm run build   # outputs to dist/
```

## What you're looking at

A live 160×160 world of autonomous organisms that learn, form tribes, discover fire, build shelters, and develop their own language - all through emergence. No scripted behaviors.
