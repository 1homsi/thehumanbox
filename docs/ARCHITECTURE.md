# Architecture

A map of the code for someone who has just cloned it: what runs where, how a
tick is put together, how one organism decides what to do, and where each kind
of change goes. For commands, checks and measuring performance see
[DEVELOPMENT.md](DEVELOPMENT.md); for adding an action see
[ADDING_ACTIONS.md](ADDING_ACTIONS.md).

## The picture

```
              ┌────────────────────────── crates/sim-core ──────────────────────────┐
              │  Simulation::tick(): world, civilisation, then every organism's turn │
              └───────────┬───────────────────────────────────────────┬─────────────┘
          native (Rust)   │                                           │   WebAssembly (wasm-pack)
   ┌──────────────────────┴───────────────┐                ┌──────────┴───────────────┐
   │ apps/server  (simulation-rs)         │                │ apps/web  (browser)       │
   │  tick loop, WebSocket/HTTP, saves    │                │  runs the sim in a Worker │
   └──────────────┬───────────────────────┘                │  and draws it             │
                  │ spawned by                              └──────────────────────────┘
   ┌──────────────┴───────────────┐
   │ apps/desktop  (Electron)     │  wraps apps/web and the native server
   └──────────────────────────────┘
   crates/headless: the same engine, no I/O: sweeps, profiles, the CI perf gate
```

The simulation is one library with no I/O. Everything else is a host for it:
the server keeps a world ticking and streams frames, the browser build runs a
private world in WebAssembly, `headless` runs it flat out for measurement.

## Repository map

| Path | What lives there |
|---|---|
| `crates/sim-core/src/sim/` | the simulation: `simulation/` (the `Simulation` struct and its tick), `actions/`, `civ/`, `agents/`, `tech/`, `command/`, `storage/`, `world_events.rs`, `seasons.rs`, `spatial.rs` |
| `crates/sim-core/src/organism/` | one person: `organism/` (state, perception, learning, movement, JSON view), `choose_action.rs`, `navigation.rs`, `traits.rs`, `vocabulary.rs`, animals |
| `crates/sim-core/src/world/` | the tile grid (`grid.rs`, `tiles.rs`) and its layers |
| `crates/sim-core/src/physics/` | fire, water and weather physics on the grid |
| `crates/headless/` | `headless` binary: deterministic runs, `--profile`, `--sweep-seeds`, gates |
| `apps/server/src/` | `main`, `config`, `tick_loop`, `broadcaster`, `router`/`routes`, `transport`, `world_store`/`world_archive`, `rollover`, `memory_watch` |
| `apps/web/src/` | `game/render` (canvas renderer in layers), `game/model`, `game/scenes`, `simulation` (wasm worker, frame decode, runtime controls), `ui/` (panels, modals, toolbar), `state`, `styles/app/*.css` |
| `apps/desktop/` | Electron main process (`main/`), preload, installer config |
| `scripts/` | perf gate, installer, helpers; `docs/` is this folder |

`sim/civ/` is grouped as `society/` (economy, government, warfare, trade routes,
settlements, graves), `divine/`, `land/` (fields, building damage, smog),
`progress/` (the era ladder) and `moments/` (ceremonies, inner life, mood),
plus `civ_tick/` which schedules them. Old paths such as
`crate::sim::civ::graves` still resolve through re-exports.

## One tick

`Simulation::tick` in `sim/simulation/tick.rs` runs, in order: bookkeeping and
strategy objectives; lineage aggregates; the civilisation pass (`civ_tick`);
seasons and physics; drought, outbreaks and weather; farms and fields; slow
world evolution (every 300 ticks); animals; then the organisms.

Each living organism takes a turn in `tick_organism`
(`sim/simulation/organism_tick/`), one module per phase:

| Phase | Does |
|---|---|
| `setup` | remember the vitals this tick is judged against, take stock of kin and hostile neighbours, territory pressure |
| `threats` | scan for dangerous animals, **perceive** the surroundings, note an emergency storm shelter |
| `decide` | list the available actions and choose one (learned policy, directives, storm needs), drop unreachable goals, retreat from danger |
| `act` | carry out the choice: a step, or a skill action through `actions::try_apply` |
| `vitals` | bodily upkeep and the environment: fire, carried goods, shelter, hunger, thirst, cold, infection |
| `ageing` | ageing and senescence, the base reward for how the body fared |
| `bonds` | kin, crowding, attitudes toward neighbours, the final shaped reward and next perception |
| `learning` | the reinforcement update, then sharing knowledge with kin |
| `routines` | feed and teach kin, remember places, seasonal migration, inventing new things |
| `pairing` | friend-seeking, courtship, partners, reproduction |
| `mortality` | death, graves, grief, effects on the living |

Values that outlive one phase travel in `OrgFrame`; a phase binds the ones it
needs on entry and writes back the ones it changed.

## How an organism decides

1. **Perceive** (`organism/organism/perception.rs`, called from the `threats`
   phase): look at the surroundings and build a short string key of the
   situation (hunger, thirst, nearest food and water, nearby kin, shelter,
   hazard …). This is the Q-table state.
2. **Available actions** (`sim/actions/available.rs`): the ids the organism may
   consider now. A fixed set of base ranges, plus *bands* (`band_table.rs`,
   `base_bands.rs`) that gate on era, age, who is nearby, place, resources and
   qualifications. `resolved.rs` turns each band's gates into bit masks;
   `eligibility.rs` evaluates them against a `ctx_bits` summary of the
   situation. Registered actions (`registered/`) join the same pipeline.
3. **Choose** (`organism/choose_action.rs`): survival needs first, then
   epsilon-greedy over learned Q values with novelty seeds and directives.
4. **Apply** (`actions/mod.rs`, one module per action family): returns a reward.
5. **Learn** (`organism/organism/learning.rs`): Q-learning update.

Action ids live in a space of 6144 (`ACTION_ID_SPACE`). Ids below 5930 are
dispatched by id range in `actions/mod.rs` and gated by the band tables; ids
5930..=6143 are *registered* actions that carry their own definition.

## Where does my change go?

| I want to … | Start here |
|---|---|
| add an action | [ADDING_ACTIONS.md](ADDING_ACTIONS.md): one file in `actions/registered/` plus one line |
| change when actions are available | the band for that id in `actions/band_table.rs` / `base_bands.rs` |
| add an era | `sim/civ/progress/eras/<era>.rs` (an `EraSpec`) and the `Era` enum and the `LADDER` array (its length is part of the type) in `eras/mod.rs`; the compiler lists every `match` that needs the new variant |
| add a building kind | `BuildingKind` in `sim/tech/buildings/` (`kind.rs` lists it; `profile.rs` has footprint, function and era, `costs.rs` the material bill), then its sprite in `apps/web/src/game/render/building-sprites.ts` / `buildings2d.ts` |
| add a tile | `Tile` in `world/tiles.rs` (`from_i8`, `walkable`), grid rules in `world/grid`, palette in the web renderer |
| add a discovery or technology | `sim/tech/tech_tree.rs`, `tech_progress.rs`; era specs list the discoveries that open an era |
| add a world event or disaster | `sim/world_events.rs`; player-triggered ones in `sim/command/` |
| add a god power | `sim/command/` (`blessings`, `disasters`, `creation`, `tribes`), then the toolbar in `apps/web/src/ui/toolbar` |
| add a server route | `apps/server/src/routes.rs`, wired in `router.rs` |
| add a UI panel or modal | `apps/web/src/ui/panels` or `ui/modals`; lazy-load rarely used ones |
| draw something new on the map | a layer in `apps/web/src/game/render/layers/` and one line in `draw-world.ts` |
| change what is saved | `sim/storage/serialize.rs` and `persistence.rs`; bump `SAVE_SCHEMA_VERSION` if old saves need migrating (unknown fields are ignored on load) |

## Rules that keep a world reproducible

The same seed must give the same world, on every machine and across native and
WebAssembly builds.

- Use the simulation's seeded RNG, in a fixed order. Adding or removing a draw
  changes everything after it.
- Do not depend on `HashMap`/`HashSet` iteration order unless the hasher is the
  fixed `FxHasher` the code already uses and the order cannot reach the result.
- Floats are compared and accumulated in a fixed order; do not "simplify"
  arithmetic in a way that changes rounding.
- No wall-clock time, threads or global mutable state in the simulation
  (thread-local scratch buffers that are cleared between uses are fine).

## Code conventions

- Big types are split into folders of small modules: a `mod.rs` that declares
  children and re-exports, children that `use super::*;` and expose items as
  `pub(super)`. Keep files under roughly 600 lines; split by responsibility, not
  by size.
- A new gameplay system is a module under the feature folder it belongs to, not
  a new section in a large file.
- Tests live next to the code (`tests.rs` or a `tests` module). A test that must
  run a long simulation should be deterministic and short; the CI suite runs in
  release mode.
