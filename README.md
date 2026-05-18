# The Human Box

A persistent artificial-life simulation. A 600×300 world of autonomous
organisms that learn, form tribes, discover fire, build shelters,
develop their own language, and — when wired to an LLM — actually speak.
Nothing is scripted. Only world laws.

Live: [thehumanbox.com](https://thehumanbox.com)

## Structure

```
thehumanbox/
├── simulation/   Rust simulation engine + WebSocket server (port 8000)
├── client/       React/Vite frontend (2D canvas + lazy R3F 3D world)
└── lab/          Python workspace for model experiments and eval tooling
```

## Quick start

**Simulation** (Rust):
```bash
cd simulation
cp .env.example .env        # set GROQ_API_KEY for narration / dialogue
cargo run --release --bin simulation-rs
```
Listens on `ws://0.0.0.0:8000`. Without any LLM env vars set, organisms
still think and act — narration and live dialogue just fall back to
templated text.

**Client** (Vite):
```bash
cd client
pnpm install
pnpm run dev
```
Expects the simulation at `localhost:8000`. Override with
`VITE_API_BASE=api.example.com` for prod.

## How it works

The world is a 600×300 tile grid of biomes (grassland, forest, desert,
wetland, tundra, volcanic) with elevation, rivers, weather, seasons,
and migration trails. Organisms are born with random traits, learn
through Q-learning over 536 possible actions, and inherit Q-table seeds
+ vocabulary from their parents.

Two LLM lanes drive what comes out of an org's head:
- **THINK** (local llama.cpp, gemma-3-270m by default) — terse
  first-person thoughts every tick. On the visible path, wants sub-50ms.
- **NARRATION** (Groq, llama-3.1-8b-instant by default) — daily life-log
  summaries AND live dialogue between organisms. Off the critical path,
  rate-limited to 28 req/min (configurable via `GROQ_RPM`) to stay
  under Groq's free-tier ceiling.

The sim never blocks on either lane. Templates seed the rendered text
instantly; the LLM rewrites in place when it returns.

## Features

- Q-learning agents, 536-action space, sparse Q-tables, inherited seeds
- Emergent vocabulary; orgs invent words for concepts (food, water,
  fire, danger, friend, shelter, …) and pass them down
- Tribal lineages with attitudes, alliances, treaties, wars
- Live conversations driven by Groq with tribe-word sprinkling
- Daily narration of each org's day
- World evolution: biome drift, dynamic fertility, drought, hazard scars
- Real-time 2D canvas with 6 heatmap overlays (hazard / fertility /
  structures / trails / age / threat) and 8 experiment modes
  (photo mode, action ticker, mini-map, random tour, slow/fast-mo,
  color-blind palette, 3D world, immersive)
- Optional 3D world via @react-three/fiber, free-fly camera

## Deployment

EC2 c7g.medium, 2 GB RAM. Backend behind a Cloudflare tunnel; frontend
on Cloudflare Pages. CF Pages auto-deploys from `main`. Backend deploys
via `.github/workflows/pipeline.yml` — build → bump → publish release →
deploy. See [simulation/README.md](simulation/README.md) for env vars
and Cloudflare cache-bypass routes.
