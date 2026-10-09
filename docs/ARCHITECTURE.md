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
| `crates/sim-core/src/sim/` | the simulation: `simulation/` (the `Simulation` struct and its tick), `actions/`, `civ/`, `agents/`, `tech/`, `command/`, `storage/`, `world_events/`, `seasons.rs`, `spatial.rs` |
| `crates/sim-core/src/organism/` | one person: `organism/` (state, perception, learning, movement, JSON view), `choose_action.rs`, `navigation.rs`, `traits.rs`, `vocabulary.rs`, animals |
| `crates/sim-core/src/world/` | the tile grid (`grid.rs`, `tiles.rs`) and its layers |
| `crates/sim-core/src/physics/` | fire, water and weather physics on the grid |
| `crates/headless/` | `headless` binary: deterministic runs, `--profile`, `--sweep-seeds`, gates |
| `apps/server/src/` | `main`, `config`, `tick_loop`, `broadcaster`, `router`/`routes`, `transport`, `world_store`/`world_archive`, `rollover`, `memory_watch` |
| `apps/web/src/` | `game/render` (the world view on cubeforge layers, see below), `game/model`, `game/scenes`, `simulation` (wasm worker, frame decode, runtime controls), `ui/` (panels, modals, toolbar), `state`, `styles/app/*.css` |
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

## The world view

The map in `apps/web/src/game/render/` runs on the [cubeforge](https://github.com/1homsi/cubeforge)
engine (WebGL2). `WorldView.tsx` mounts one `<Game mode="onDemand">`: the engine sleeps until a
layer asks for a frame, so a paused world costs nothing. Inside its `<World>` the map is a stack of
layers, bottom to top (z is the engine's `zIndex`):

| z | What | Lives in | Fed by |
|---|---|---|---|
| 0 | ground: one `TileLayer` tile per grid cell, tinted per tile | `terrain-tiles/` | `CfWorld` |
| 1.5 | roads the people built, joined to their neighbours (a dirt track, cobbled from the bronze age) | `cf/roads/` | `CfWorld` registry |
| 2.2 | roads the people built, joined to their neighbours (a dirt track, cobbled from the bronze age) | `cf/roads/` | `CfWorld` registry |
| 2 to 4.5 | ground decor, shore banks and reeds, mountains, trees (and their wind) | `cf/vegetation/`, `cf/ground/` | `CfWorld` registry |
| 5 | day/night, season and weather tint (translucent quads: darkens the land, not what stands on it) | `cf/overlays/` | overlay renderer |
| 5.2 to 5.6 | shore foam, food and mineral patches, settlement marks | `cf/ground/` | `CfWorld` registry |
| 6, 10 | rain and snow; the heat map (one nearest-sampled sprite, 1 px per tile) | `cf/overlays/` | overlay renderer |
| 11 to 15 | territory borders, clouds, water glints, trade roads, rails and trains, farms | `cf/overlays/`, `cf/landuse/` | |
| 18 to 20 | fires, huts, buildings (and a hidden layer of footprints for picking) | `cf/buildings/` | `CfWorld` registry |
| 25 | caravans | `cf/overlays/` | |
| 29 to 31 | animals | `cf/animals/` | 60 Hz sprite clock |
| 39 to 41.5 | people: shadows and rings, bodies and boats, crowns and bars, thought bubbles | `cf/people/` | 60 Hz sprite clock |
| 45 | names, thoughts, work poses and prayer glyphs above the people | `cf/people/people-labels.ts` | overlay renderer |
| 50, 60 | battles, wards, festivals, smog, beacons; settlement names, prayers, world moments, grid | `cf/overlays/` | overlay renderer |

`cf/CfWorld.tsx` owns the terrain and every "static world" driver. A driver is a small class with
`update(frame)`; `CfRegistry` runs them at 30 Hz on the current world and each rewrites only what
changed (the terrain revision from `TerrainWatch`, the wire frame id, the camera window). Sprites
are baked once into atlas pages (`cf/atlas/cell-atlas.ts`) using the same canvas painters the old
renderer used (`building-draw/`, `decorations.ts`, `plantings.ts` ...), so the art has one source.
`cf/overlays/CfOverlays.tsx` runs `CfOverlayRenderer`: weather, heat, effects and labels are written
through `SpriteRecorder`, a stand-in `CanvasRenderingContext2D` that turns `fillRect`, arcs, lines,
gradients and text into sprites of a shape atlas and a glyph atlas, so painters such as
`battles.ts` or `wards.ts` still draw with canvas calls but the GPU draws the result.

People and animals are written from typed arrays by `cf/people/people-sprites.ts` and
`cf/animals/animal-sprites.ts`: `rebuild` when a simulation frame or the UI changes (about 10 Hz),
`animate` every display frame for interpolation, walk frame and depth sort. Everything stops when
the simulation pauses (`render-timing.ts` `isSettled`).

Input and picking: `cf/input/CfMapCameraController.tsx` wires cubeforge's `useCameraPanZoom` to
the map (clamping, fit, focus, follow, keyboard) and keeps `cameraStateRef` for the HUD.
`cf/input/map-click.ts` holds the click rules; a tap asks `cf/picking.ts` for the person under the
pointer (`SpriteLayer.pick` on the body layer), then the nearest person in reach, then the building
under it (the footprint layer: it opens the home of someone who lives there), then the ground rules. Room and home
interiors are `cf/scenes/CfRoomView.tsx`. "Save a picture of the world" reads the canvas in the
frame that drew it (`cf/capture.ts`).

The only other path is `world-view/CanvasWorldFallback.tsx`, used when the browser has no WebGL2
(or the context is lost): a 2D canvas painter in `draw-world.ts` and `layers/` for the ground,
buildings, animals and people, with `CanvasCameraController`. It is not kept at parity: no
weather, heat maps, effects or labels. `?renderer=canvas` forces it.

Dev builds expose `window.__thbCf` (the engine and the driver registry) and `window.__thbDev`
(UI store, camera focus, current world) for checking the map in a browser.

Performance is measured with `apps/web/bench` (see its README): a production build in headless Chrome with
the GPU, on two fixed saved worlds (seed 42 at tick 9000, and the same with 3,000 more people), at three zooms,
paused and playing. It reports frames delivered, main-thread busy time, JS per frame, GPU process time, GC,
heap and GPU memory, and writes CPU and allocation profiles mapped back to `src/`. The address `?bench` makes
the app publish `window.__thbBench` so the script can place the camera at an exact zoom.

## Where does my change go?

| I want to … | Start here |
|---|---|
| add an action | [ADDING_ACTIONS.md](ADDING_ACTIONS.md): one file in `actions/registered/` plus one line |
| change when actions are available | the band for that id in `actions/band_table.rs` / `base_bands.rs` |
| add an era | `sim/civ/progress/eras/<era>.rs` (an `EraSpec`) and the `Era` enum and the `LADDER` array (its length is part of the type) in `eras/mod.rs`; the compiler lists every `match` that needs the new variant |
| add a building kind | `BuildingKind` in `sim/tech/buildings/` (`kind.rs` lists it; `profile.rs` has footprint, function and era, `costs.rs` the material bill), then its sprite in `apps/web/src/game/render/building-sprites.ts` / `buildings2d.ts` |
| add a tile | `Tile` in `world/tiles.rs` (`from_i8`, `walkable`), grid rules in `world/grid`, palette in the web renderer |
| add a discovery or technology | `sim/tech/tech_tree/` (a node goes in the table module for its era span; table order feeds the discovery rolls), `tech_progress.rs`; era specs list the discoveries that open an era |
| add a world event or disaster | `sim/world_events/` (weather, disasters, evolution, the event log); player-triggered ones in `sim/command/` |
| add a god power | `sim/command/` (`blessings`, `disasters`, `creation`, `tribes`), then the toolbar in `apps/web/src/ui/toolbar` |
| add a server route | `apps/server/src/routes.rs`, wired in `router.rs` |
| add a UI panel or modal | `apps/web/src/ui/panels` or `ui/modals`; lazy-load rarely used ones |
| draw something new on the map | a sprite layer or driver under `apps/web/src/game/render/cf/` (see [The world view](#the-world-view)), registered in `CfWorld`; the 2D fallback in `render/layers/` only draws the ground, buildings, animals and people |
| change what is saved | the `serialize` and `persistence` modules in `sim/storage/`; bump `SAVE_SCHEMA_VERSION` if old saves need migrating (unknown fields are ignored on load) |

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
