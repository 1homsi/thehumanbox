# Simulation

Rust WebSocket server running the world. Listens on `ws://0.0.0.0:8000`.

A persistent artificial life simulation where autonomous organisms evolve behavior, form tribes, develop language, and build civilizations - entirely through emergence. No scripted behaviors. Only physics.

## How it works

The world is a 160×160 grid of biomes (grassland, forest, desert, volcanic, tundra, wetland). Organisms are born with random traits and learn entirely through Q-learning and reward signals. They discover fire, build shelters, form alliances, wage wars, and develop their own vocabulary - because the environment makes it worth doing, not because it was programmed.

**Core principle:** define world laws only. Organisms figure out everything else.

## Stack

- **Rust** - simulation engine, Q-learning, physics
- **Axum + Tokio** - async WebSocket server (port 8000)
- **Ollama** - local LLM for organism narration and tribal decisions (`gemma3:270m`)

## Running locally

```bash
# Default: 50ms/tick (fan-friendly)
cargo run --bin simulation-rs

# Fast mode
TICK_MS=10 cargo run --bin simulation-rs

# Headless test (no server)
cargo run --bin headless -- --ticks 30000 --seed 42
```

Requires [Ollama](https://ollama.com) running locally with `gemma3:270m` pulled. Narration falls back gracefully if Ollama is unavailable.

## Key mechanics

| System | Description |
|---|---|
| Q-learning | Tabular, α=0.15 γ=0.9, 17 actions per organism |
| Perception | 10-char string encoding hunger, thirst, nearby food/water/fire/organisms |
| Social | Food signals, alarm calls, gifting knowledge, tribal challenges |
| Weather | Rain, storms, lightning strikes |
| Seasons | 4 seasons affecting food growth, drought probability, energy drain |
| Lineages | Inherited attitudes, vocabulary, and Q-table seeds |
| Emergent cultivation | Frequently foraged areas grow food faster via trail system |

## Deployment

See deploy script at `deploy.sh`. Runs as a systemd service on EC2, exposed via Cloudflare tunnel.

For Cloudflare, keep backend routes uncached. Add bypass rules for:

- `/ws`
- `/snapshot`
- `/transport`
- `/version`
- `/org/*`

The server now exposes `/transport` for websocket timing and lag diagnostics,
and all of the API routes above should stay `no-store` end to end.
