# The Human Box

A persistent artificial life simulation — a living world where organisms think, remember, form cultures, and shape the land they walk on.

## Structure

```
thehumanbox/
├── simulation/   # Rust simulation engine (WebSocket server)
└── client/       # React/Vite frontend
```

## Quick Start

**Simulation** (Rust, port 8000):
```bash
cd simulation
cargo run --release
```

**Client** (Vite dev server):
```bash
cd client
npm install
npm run dev
```

## Overview

The simulation runs a world of autonomous organisms with:
- Emergent language and vocabulary
- Memory, traits, and emotional states
- Tribal lineages and inter-group relations
- Soil fertility, hazard memory, and migration trails
- Dynamic biome drift and world era progression
- AI-driven thought via Groq LLM

The world is the character — organisms adapt to it, not the other way around.
