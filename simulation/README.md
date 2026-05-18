# Simulation

Rust simulation engine + WebSocket server. Listens on `ws://0.0.0.0:8000`.

A persistent artificial-life simulation where autonomous organisms evolve
behavior, form tribes, develop language, and — when an LLM lane is
configured — actually speak. No scripted behaviors. Only world laws.

## How it works

The world is a 600×300 tile grid of biomes (grassland, forest, desert,
wetland, tundra, volcanic). Organisms are born with random traits and
learn entirely through Q-learning over a 536-action space — they
discover fire, build shelters, form alliances, wage wars, and develop
their own vocabulary because the environment makes it worth doing, not
because it was programmed.

**Core principle:** define world laws only. Organisms figure out
everything else.

## Stack

- **Rust + Tokio + Axum** — simulation engine + async WebSocket server
- **MessagePack** wire format (3-5× faster decode than JSON at 10 Hz)
- **Two LLM lanes**, both reaching out from inside the tokio runtime:
  - **THINK** lane (default: local `llama.cpp` server on the same box,
    `gemma-3-270m-it`) — short first-person thoughts every tick.
    Fast, no per-token cost.
  - **NARRATION** lane (default: Groq, `llama-3.1-8b-instant`) — daily
    life-log summaries AND live conversations between organisms. Shared
    rate limiter at 28 req/min to stay under Groq's free-tier ceiling.

## Running locally

```bash
cp .env.example .env
# fill in GROQ_API_KEY (or LLM_KEY) if you want narration / dialogue.
# the sim runs fine without — text falls back to templates.

cargo run --release --bin simulation-rs

# Tuning:
TICK_MS=50  cargo run --release --bin simulation-rs   # 20 Hz
GROQ_RPM=10 cargo run --release --bin simulation-rs   # tighter cap

# Headless (no server, batch tick a world to disk):
cargo run --bin headless -- --ticks 30000 --seed 42
```

Default `TICK_MS=100` (10 Hz). Without `GROQ_API_KEY` set, the
narration and conversation workers log Groq failures and the sim
keeps using template text — nothing else degrades.

## Key mechanics

| System | Description |
|---|---|
| Q-learning | Tabular, α=0.15 γ=0.9, 536 actions per organism, sparse Q-rows |
| Perception | String-encoded state of nearby food/water/fire/animals/orgs |
| Social | Food signals, alarm calls, gift exchanges, treaties, challenges |
| Weather | Rain, storms, lightning strikes, drought |
| Seasons | Four seasons affecting food growth, drought probability, energy drain |
| Lineages | Inherited attitudes, vocabulary, and Q-table seeds |
| Stigmergy | Frequently traveled tiles become trails; foraged areas grow fertile |
| Era progression | World era shifts (genesis / abundance / scarcity / equilibrium) |
| Live conversations | Pairs of orgs hold short Groq-generated dialogues |
| Daily narration | One sentence per org per day, summarising their life-log |

## Workers

Spawned at startup; each is a `tokio::spawn` running an `mpsc::Receiver`
loop:

- `narration_worker` — daily story per org. Validates output (one
  sentence, past tense, ≤25 words, no preamble), retries once on
  rejection, falls back to a keyword template on second failure.
- `conversation_worker` — N-line dialogue between two orgs. Validates
  output (exact N lines, speakers alternate, 3-12 words each, no
  stage directions), retries once on rejection. Stores results into
  a shared map keyed by a UUID on each `ConversationEntry`; the sim
  drains the map each tick and patches the live entries.
- `think_worker` — terse per-tick thoughts. Talks to the **THINK** lane
  (local llama.cpp by default), not Groq.

Both narration and conversation workers share a single token-bucket
rate limiter against the Groq quota.

## Cloudflare / deployment

Runs as a systemd unit on EC2, exposed via a Cloudflare tunnel.
`.github/workflows/pipeline.yml` handles build → bump → publish → deploy.

In Cloudflare, keep backend routes uncached. Add bypass rules for:

- `/ws`
- `/snapshot`
- `/transport`
- `/version`
- `/org/*`

`/transport` exposes websocket timing and lag diagnostics. All API
routes should stay `no-store` end-to-end.
