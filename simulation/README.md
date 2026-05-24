# Simulation

Rust simulation engine + WebSocket server. Listens on `ws://0.0.0.0:8000`.

A persistent artificial-life simulation where autonomous humans evolve
behavior, form tribes, build cities, found religions, sign treaties,
declare wars, develop language, and — when an LLM lane is configured —
actually speak. No scripted behaviors. Only world laws.

## Core principle

Define world laws only. Humans figure out everything else.

## How it works

The world is a 600×300 tile grid of biomes (grassland, forest, desert,
wetland, tundra, volcanic) with elevation, rivers, weather, and four
seasons. Humans are born with random traits, inherit a Q-table seed
and a vocabulary from their parents, and learn through reinforcement
over a wide action vocabulary — thousands of distinct actions across
dozens of categories.

Each action category gates on real preconditions: era, discoveries,
age stage, specialty, or proximity to a relevant building. A
pre-stone toddler will never roll "calibrate hydrometer". A brewer
near a brewery, on the other hand, will learn distillation faster
than a brewer in the wilderness, because workshops boost rewards
for matching trades.

## What the world does on its own

| System | Description |
|---|---|
| **Era progression** | 35 eras from PreStone through Information, Atomic, Space, Cyber, Posthuman, Galactic, and onward. Lineages advance when population and discoveries hit the threshold. |
| **Q-learning** | Tabular, per-organism, sparse Q-rows. Inherited from parent on birth. Failed-precondition actions decay so orgs stop trying impossible things. |
| **Perception** | String-encoded state of nearby food/water/fire/animals/orgs. |
| **Specialties** | Adults apprentice into the matching trade when they live near a Forge, Brewery, Tailor, Library, Datacenter, etc. Specialty-matching actions earn larger Q-rewards. |
| **Economy** | Barter and currency trade with era-scaled prices for ~20 goods (food, water, wood, stone, iron, cloth, bread, spirits, garments, articles, drinks, pastries, etc.). Cross-lineage trade at borders. |
| **Buildings** | Lineages build huts, workshops, markets, temples, libraries, factories, datacenters as their era + population unlock them. Buildings emit passive auras — Hospital heals nearby kin, Library raises literacy, Temple grants piety, Bank pays merchants. |
| **Religions** | Found themselves by lineage. Adherents gain piety + comfort near a Temple/Cathedral. Milestone events fire when adherent count crosses 10, 25, 50, 100, 250, 500, 1000. |
| **Governments** | Form per lineage based on era, population, literacy. Tribal → chiefdom → monarchy → republic → democracy → federation → empire. Each elects (or anoints) a leader, collects a treasury, enacts laws. |
| **Diplomacy** | Alliances, treaties, declarations of war, gift exchanges, challenges. |
| **Cross-lineage contact** | Trade across lineages within border range. Knowledge transfer: tech ideas flow from a lineage that has them to one that doesn't, when their populations touch. |
| **Lineage forking** | When a lineage exceeds ~45 alive, an adventurous adult breaks off to found a colony elsewhere, carrying tech with them. |
| **Stigmergy** | Frequently traveled tiles become trails; foraged areas grow fertile. |
| **Social** | Food signals, alarm calls, gift-of-knowledge between strangers, treaties, challenges. |
| **Family** | Partnerships, pregnancies, named friends, grief, ancestry. |
| **Weather** | Rain, storms, lightning strikes, drought, floods, fires. |
| **Disease** | Outbreaks introduced randomly; spread by proximity; immunity accumulates. |
| **Headlines** | 40+ first-of-kind world events (first fire, first writing, first cathedral, first computer, first satellite, …) plus religion / population / government milestones. |
| **Homes** | Each human gradually furnishes their own home over their lifetime — pulling from a pool of 40 furniture types gated on era + discoveries + traits + wealth + specialty. Two siblings end up in visibly different homes. |
| **Live conversations** | Pairs of orgs hold short Groq-generated dialogues that the rest of the lineage can overhear. |
| **Daily narration** | One sentence per organism per day, summarising their life-log. |

## Stack

- **Rust + Tokio + Axum** — simulation engine + async WebSocket server
- **MessagePack** wire format (much faster decode than JSON at 10 Hz)
- **Two LLM lanes**, both reaching out from inside the tokio runtime:
  - **THINK** lane (default: local `llama.cpp` server on the same box,
    `gemma-3-270m-it`) — short first-person thoughts every tick. Fast,
    no per-token cost.
  - **NARRATION** lane (default: Groq, `llama-3.1-8b-instant`) — daily
    life-log summaries and live conversations between organisms.
    Shared rate limiter to stay under Groq's free-tier ceiling.

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
cargo run --release --bin headless -- --ticks 30000 --seed 42

# Multi-seed sweep with growth signals:
cargo run --release --bin headless -- --sweep-seeds 5 --seed 100 --ticks 30000

# Real-time growth trajectory snapshot every N ticks:
cargo run --release --bin headless -- --ticks 30000 --growth-every 2000
```

Default `TICK_MS=100` (10 Hz). Without `GROQ_API_KEY` set, the
narration and conversation workers log Groq failures and the sim
keeps using template text — nothing else degrades.

The headless binary reports civilisation growth across runs:
populations, lineages, religions, governments, buildings, books,
artworks, trade volumes, era progression, action-category coverage,
and partnerships/children. Sweeps verify that the world remains
healthy across seeds.

## Workers

Spawned at startup; each is a `tokio::spawn` running an `mpsc::Receiver`
loop:

- `narration_worker` — daily story per org. Validates output (one
  sentence, past tense, ≤25 words, no preamble), retries once on
  rejection, falls back to a keyword template on second failure.
- `conversation_worker` — N-line dialogue between two orgs. Validates
  output (exact N lines, speakers alternate, 3-12 words each, no
  stage directions), retries once on rejection.
- `think_worker` — terse per-tick thoughts. Talks to the **THINK**
  lane (local llama.cpp by default), not Groq.

Narration and conversation workers share a single token-bucket rate
limiter against the Groq quota.

## Cloudflare / deployment

Runs as a systemd unit on EC2, exposed via a Cloudflare tunnel.
`.github/workflows/pipeline.yml` handles build → bump → publish →
deploy.

In Cloudflare, keep backend routes uncached. Add bypass rules for:

- `/ws`
- `/snapshot`
- `/transport`
- `/version`
- `/org/*`
- `/worlds/*`

`/transport` exposes websocket timing and lag diagnostics. All API
routes should stay `no-store` end-to-end.
