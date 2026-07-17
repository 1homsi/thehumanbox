<p align="center">
  <img src="client/public/favicon-32x32.png" alt="The Human Box" width="64" height="64" />
</p>

# The Human Box

An artificial-life game built first for private, downloadable worlds.
Run one locally, shape it with sandbox controls, or watch the online world
where autonomous humans learn, form tribes, develop language, build
cities, found religions, declare wars, sign treaties, invent computers,
and pass culture across generations. Nothing is scripted. Only world
laws.

Live: [thehumanbox.com](https://thehumanbox.com)

## Structure

```
thehumanbox/
├── simulation/   Rust simulation engine + WebSocket server
├── client/       React/Vite frontend (2D + optional 3D world)
└── lab/          Python workspace for model experiments and eval tooling
```

## Desktop app

macOS one-liner (downloads the latest release and strips the quarantine
flag so the unsigned app opens normally):

```bash
curl -fsSL https://raw.githubusercontent.com/1homsi/thehumanbox/main/scripts/install-desktop.sh | bash
```

Windows + Linux: grab the installer from
[Releases](https://github.com/1homsi/thehumanbox/releases/latest)
— Windows users click "More info → Run anyway" on the SmartScreen
prompt, Linux users `chmod +x` the AppImage or install the `.deb`.

The app is **not code-signed yet**, which is why the bypass step is
needed. Source: [`desktop/`](desktop/).

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
Starts with a private in-browser world and needs no server. Choose the
Shared World in Settings to use the simulation at `localhost:8000`.
Override that host with `VITE_API_BASE=api.example.com` for production.

## What's in the world

Humans are born with traits and learn through reinforcement. They
inherit a Q-table seed, a vocabulary, and a set of attitudes from
their parents — and then they get to live.

**The world they live in**

- 600×300 tile grid of biomes: grassland, forest, desert, wetland,
  tundra, volcanic. Elevation, rivers, lakes, weather, four seasons.
- 35 historical eras from PreStone through Stone, Bronze, Iron,
  Classical, Medieval, Renaissance, Industrial, Modern, Information,
  and onward to Atomic, Space, Digital, Quantum, Genetic, Orbital,
  Lunar, Martian, Cyber, Neural, Posthuman, Interstellar, Singularity,
  Galactic, Dyson, Kardashev2/3, and a handful of speculative endgame
  eras. Lineages reach each era when their discoveries and the living
  world's civilization capacity cross the threshold; late-era gates scale
  to the chosen local world size so the full ladder remains reachable.
- Several thousand distinct actions an organism can choose. Each
  category — agriculture, hunting, weaving, brewing, distillation,
  journalism, fashion, retail, cafe work, tech_devops, religion,
  warfare, diplomacy, governance, childhood, elder life, and dozens
  more — gates on real preconditions: era, discoveries, age, specialty.
- Real economy. Goods are produced (mash → wash → spirit → bottle),
  traded within and across lineages, and priced per era. Currency,
  barter, wealth distribution, banks, governments with treasuries.
- Religions found themselves, gain adherents, cross milestones, and
  fade. Followers near their temple feel it. Governments form
  matching the lineage's era and literacy — tribal, monarchy,
  republic, democracy, federation, empire.
- Cross-lineage contact at borders: trade and knowledge transfer
  flow where two tribes touch. Overcrowded lineages spawn
  breakaway colonies that carry parent tech to new biomes.
- Each home is unique. Humans choose their own furniture over their
  lifetime based on era, traits, wealth, and specialty — a brewer
  collects a wine jug, a scholar fills bookshelves, a programmer
  ends up with a monitor and a smart speaker.
- Buildings are not props. Living near a Library raises your
  literacy. Living near a Hospital lowers your infection.
  Apprenticing near a Workshop routes you into the matching trade.

**The minds inside**

Two LLM lanes drive what comes out of an organism's head:
- **THINK** (local llama.cpp, gemma-3-270m by default) — terse
  first-person thoughts every tick. Wants sub-50ms.
- **NARRATION** (Groq, llama-3.1-8b-instant by default) — daily
  life-log summaries and live dialogue between organisms. Off the
  critical path, rate-limited to stay under Groq's free tier.

The sim never blocks on either lane. Templates seed the rendered
text instantly; the LLM rewrites in place when it returns.

## What you can do

- Watch the live 2D map and follow any organism through their day.
- Toggle to a 3D world for a flyover (lazy-loaded so 2D-only users
  pay nothing).
- Open the Civilization modal to see lineages, religions,
  governments, buildings, books, artworks, headlines, trades, and
  the goods each tribe is producing right now.
- Click a tavern or temple to step inside that scene and see who's
  there.
- Click a home and see how that human has furnished it.
- Tap an organism to read their life log, vocabulary, ancestry,
  thoughts, and the chronicle of their day.
- Use overlays (hazard, fertility, density, age, threat, structures,
  trails) to look at the world by lens.
- Run photo mode, slow-mo, fast-mo, immersive mode, random tour.
