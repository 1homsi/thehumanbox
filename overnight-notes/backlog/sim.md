# Sim backlog (Rust sim-core, headless, apps/server, wasm build)

Scout: read-only. Profiled on Apple M4 Pro (shared with other workers, so wall-clock numbers are noisy; instruction
counts and counters are exact). Code base: `origin/main` 9f2ebb8a (sampling, counters, frame sizes) and a99d1636 (A/B
builds, wasm, overflow runs). Seed 42 unless stated. Scratch worktrees removed.

How things were measured (reproduce):
- native sample: `CARGO_PROFILE_RELEASE_DEBUG=line-tables-only cargo build --release -p headless --target-dir /tmp/x`, then
  `headless --seed 42 --ticks 30000 --every 30000 &` + `sample <pid> 10 -file out.txt` (macOS; samply/flamegraph not installed).
- deterministic cost metric: `/usr/bin/time -l headless --seed 42 --ticks 9000 --every 9000` -> "instructions retired".
  Use it for A/B (wall time here swings +-30 % with other workers). Baseline: **271.3 G instr / 9000 ticks (30 M instr/tick)**.
- frame sizes: scratch `#[test]` in `apps/server/src/broadcaster.rs` calling `state_frame*` + `encode_frame` (not committed).
- wasm: `scripts/build-wasm.sh` (needs `PATH=$HOME/.cargo/bin:$PATH`; Homebrew rustc has no wasm32 target), driven from node with
  `initSync` (`tickN`, `deltaFrame`, `fullFrame`, `serialize`).

## Where the time goes (baseline numbers all items refer to)

Native, seed 42 (`make profile`, release): mean tick **1.66 ms at 6000 ticks** (164 alive, 604 ticks/s), but it grows with world
maturity at ~constant population: mean per 3000-tick block 1.8 -> 3.7 -> 5.8 -> 6.2 -> 9.5 ms over ticks 0-30000
(~320 alive), p99 36-62 ms, max 124-220 ms. RSS 84 MB at 30000 ticks. Allocations: 3,900/tick (474 KB/tick) at tick 6000,
5,900/tick (728 KB/tick) at tick 20000.

Inclusive share of samples (`organism_tick` = 88-89 % of the tick in both windows):

| function | ticks ~3.5-9k | ticks ~12-17k |
|---|---|---|
| choose_action_with_neighbors | 18 % | 18.8 % |
| available_actions_into | 17 % | 17.4 % |
| Organism::toward -> plan_route | 16.4 % -> 14.4 % | 22.4 % -> 21.0 % |
| perceive_into | 14.5 % | 12.5 % |
| _platform_memcmp (String compares) | 4.9 % | 7.8 % |
| org_vitals / org_act | 5.2 % / 4.8 % | 5.1 % / 5.2 % |
| best_remembered_cell (+ nearby_memory_strength) | 4.2 % (+1.6) | 4.0 % (+1.8) |
| trade_routes dispatch + settlement snapshots | ~0.6 % | ~7 % |
| SpatialIndex::query_into | 4.0 % | 3.6 % |
| PhysicsEngine::tick (every 5th tick) | 3.3 % | 1.2 % |
| malloc/free/realloc (self) | ~6-8 % | ~5 % |

Pathfinding counters (30000 ticks, instrumented build): 570,867 `plan_route` calls (19.0/tick), 926 expansions/plan on average,
**44 % return no route (251k), 25 % exhaust the 3000-expansion budget (143k, = 81 % of all expansions)**; 630k `detour_step`
calls (21/tick). Wall time inside `plan_route` 41.5 s of ~195 s (21 %), of which no-route plans 4.4 s; detours 1.7 s.

Tick-time shape: only ~4 % of time is periodic work (ticks divisible by 60/100/300/500/600/1200 average 10-22 ms vs 5.4 ms
off-cycle). The tail is not periodic: 658 of 30000 ticks (2.2 %) are > 30 ms and hold 11 % of total time; the worst ones
(100-220 ms) are not on any modulus.

Existing perf gate (`scripts/perf-gate.sh`, CI `MAX_TICK_MS=80`, `MAX_RSS_MB=256`): 3 seeds x 8000 ticks, sampling only ticks
divisible by `--profile-every 100`. Measured: mean 6.5-6.9 ms, max 33.7 / 47.8 / 47.3 ms, RSS 51-54 MB. See SIM-09.

Wire sizes (server frames, msgpack + gzip "fast", per client):

| world | full (deep, every 300 ticks) | periodic full (every 30 ticks) | delta (every 5 ticks, 500 ms) |
|---|---|---|---|
| tick 1.1k, 113 alive | 552 KB gz (1.6 MB raw), build 5.4 ms + enc 9.3 ms | 24 KB | avg 27.7 KB, max 91 KB |
| tick 6.1k, 164 alive | 833 KB (2.3 MB raw), 8.1 + 14.6 ms | 143 KB | avg 44 KB, max 148 KB |
| tick 15.1k, 272 alive | 1274 KB (3.3 MB raw), 15.8 + 24.7 ms | 224 KB | avg 90 KB, max 230 KB |

## Correctness / determinism audit result (no bugs found)

- 8 seeds (1, 7, 99, 123, 2024, 31337, 555, 8675309) x 20,000 ticks in a dev-profile (overflow checks on, opt-level 2) headless
  build: no panic, no arithmetic overflow, exit 0 on all.
- Native vs wasm, seed 42, tick 3000: identical (135 alive, 76 animals, native `headless` vs `fullFrame` in node).
- All transcendental float calls go through `math::DetMath` (libm, no platform math); the only raw `atan2` is inside a test
  (`construction.rs:1958`). No `HashMap` with RandomState in sim state, no clock or entropy outside `file_io.rs:92` (save naming).
- Real but minor robustness issue: SIM-17.

## Measured and rejected (do not retry)

- Fat LTO + codegen-units=1 for the native/server build: **+2.7 % instructions** (278.5 G vs 271.3 G) and slower wall; no gain.
  `panic=abort` on top changed instructions by 0.0 % (271.4 G). The `Cargo.toml` default release profile stays.
- wasm-opt v117 `-O`, `-O3`, `-Os`, `-Oz` on the already optimized wasm (4,856,647 B): brotli-11 size 979.7 / 979.8 / 979.7 / 979.8 KB
  vs 977.7 KB for what `build-wasm.sh` ships. `-O4` slower and larger. (`wasm-pack` already runs wasm-opt `-O`.)
- `-C target-feature=+simd128`: 4,822,975 B vs 4,857,558 B (-0.7 %); node timing 2.46 vs 2.83 ms/tick in one pair and 4.62 vs 3.36
  in the next (machine noise); no demonstrable speed gain, 9.5 min build. Not worth a CI change.
- LLVM `opt-level=3` on wasm: already measured in `build-wasm.sh` header (larger, same speed).
- Float text length in frames: only 96 of 1,497 floats in a wasm delta are long (1.8 KB of 164 KB). Nothing to gain.

---

# Items (ordered by value / effort)

## SIM-01  Buildings array is re-sent in every delta once the world is mature
- Files: `crates/sim-core/src/sim/storage/serialize/frame.rs:842-853` (sent whenever `building_state_revision !=
  serialized_building_state_revision`), `crates/sim-core/src/sim/civ/land/building_damage/damage.rs:44` (revision bumped for every
  exposed building every call, including sub-1 % weather/storm wear: `exposure.rs:99` `0.006 * intensity`, age wear `:111`),
  `payload.rs:39-89` (`BuildingJson`), client merge in `apps/web/src/simulation/wire.ts` / `wasmWorker.ts`.
- Change: stop bumping the revision for invisible changes. Cheapest (server-only, S): in `apply_damage` bump only when the
  displayed damage bucket changes (`(damage*100).round()` or the `ruined`/`repairing` flags) and, as a backstop, send buildings in
  a delta at most once per 30 ticks (like `include_static`, `frame.rs:~98`). Better (M): send only buildings whose `BuildingJson`
  changed (id-keyed list, client merges by id; fall back to the whole list in full frames).
- Evidence: tick 15000-18000, 1135 buildings: **600 of 600 deltas carried the whole buildings array**, avg delta 102 KB gz
  (60 MB over 3000 ticks, vs 9.3 MB of periodic fulls). Per-key raw msgpack size of one delta at tick 15020: buildings 245 KB,
  organisms_hot 15 KB, trade_routes 6 KB, vehicles 3.6 KB, animals 2.8 KB -> buildings is ~90 % of every delta. Revision-bump counts by
  call site up to tick 18000: `damage.rs:44` 5,816 (next: `construction.rs:1604` 763, `:1697` 467, `:537` 423). In the wasm path
  (JSON, no gzip) a delta at tick 3000 is 196 KB chars, buildings 95 KB when present (30 % of deltas at 335 buildings).
- Expected gain: server deltas 90-100 KB -> ~10 KB gz (about -85 % steady-state egress per client; ~8 GB/day -> ~1 GB/day per
  always-connected client at 2 frames/s), less encode CPU (delta encode+gz 1.3-1.8 ms at tick 15k), smaller JSON.parse on the web main thread.
- Size: S (server-side throttle) / M (per-building delta + web merge). Deps: none for S; M needs a web change (coordinate with web backlog).
- Determinism: none (wire only). Sim state untouched.

## SIM-02  `settlements::snapshots` rescans the whole world on every call, and trade-route eligibility calls it per nearby person per tick
- Files: `crates/sim-core/src/sim/civ/society/settlements.rs:70-110` (`snapshots`: all organisms + all buildings into a
  `BTreeMap<String,..>`), `trade_routes/routes.rs:47-66` (`settlement_endpoints` calls `snapshots` every time),
  `trade_routes/dispatch.rs:280-311` (`action_is_possible`, action 287: `nearby.iter().any(.. settlement_endpoints ..)`),
  `dispatch.rs:84-110` (`dispatch_route_index` calls it per route), also `merchants.rs:109`, `village_roads.rs:276`, `people.rs:301`.
- Change: compute the snapshot set once per tick (or once per `rebuild_lineage_aggregates`) into a `Simulation` field and have
  `settlement_endpoints` binary-search it; make `action_is_possible` early-out when `trade_routes.len() >= MAX` before touching it
  (already) and when the actor has no settlement.
- Evidence: mature-world sample (ticks ~12-17k): `trade_routes::dispatch::action_is_possible` 2.8 %, `dispatch_route_index` 2.0 %,
  `settlement_endpoints` 2.7 %, `settlements::snapshots` 2.6 % (overlapping call paths, ~5-7 % total). It is O(nearby x (pop + buildings))
  per organism-tick; at tick 15k that is 272 people + 1,135 buildings per call.
- Expected gain: 4-6 % of tick time in mature worlds, none early.
- Size: S. Deps: none.
- Determinism: a start-of-tick cache changes which centre an organism sees mid-tick (resident x/y move during the tick), so
  trajectories shift slightly (still deterministic). To stay bit-identical, cache only per-lineage building sums and recompute the
  resident part from a per-tick lineage position sum updated on move; otherwise accept the shift and re-bless the gate seeds.

## SIM-03  Q-table / perception key is a heap `String` (21 chars of enum digits)
- Files: `crates/sim-core/src/organism/organism/perception.rs:452-476` (`perception_key`), `organism/mod.rs:72`
  (`q_table: FxHashMap<String, QRow>`), `sim/simulation/organism_tick/decide.rs:~71` (`q_table.contains_key(&perception)`),
  `organism/organism/learning.rs`, persistence `sim/storage/persistence/organism.rs`.
- Change: key = `[u8; 21]` (or a packed `u128`) with a custom serde impl that still writes the same string, so save format and
  client are unchanged. No per-tick allocation, hashing a fixed array, equality is a 21-byte compare instead of `memcmp` through `String`.
- Evidence: one `String` allocation per organism per tick (`perception_key` appears under malloc callers; 12 samples) plus the
  `memcmp` traffic (self 4.9 % early, 7.8 % mature; callers include `choose_action_with_neighbors` 37, BTreeMap/String lookups, `tick_organism` 55).
  Q-table is also the biggest per-organism save field (21 KB JSON each, 3.0 MB of the 15.3 MB tick-3000 save).
- Expected gain: 3-6 % of tick time (alloc + memcmp) and a smaller `perceive_into` -> `learn` path.
- Size: M. Deps: none (SIM-11 can then also drop zero rows).
- Determinism: bit-identical if hashing order is not observed (`FxHashMap<String,_>` iteration order changes with the key type; check
  `choose_action`/`learn` for iteration over `q_table`; `FxHashMap` iteration order depends on keys, so a sorted pass may be needed).

## SIM-04  `perceive_into` re-scans ~450 tiles per organism per tick
- Files: `crates/sim-core/src/organism/organism/perception.rs:65-86` (17x17 tile scan with `grid.get`), `:~170` (9x9 campfire scan),
  `grid.detect_trail(..., 5)` x2, `danger_memory.iter()` scan.
- Change: (a) iterate rows with one bounds check per row over `grid.tiles` slices instead of `grid.get` per tile; (b) skip the whole
  perception build when position, tile neighbourhood revision and organism flags are unchanged since last tick (resting under shelter is
  the 2nd most frequent thought: 1.41 M of ~10 M thoughts in 6000 ticks); (c) maintain a per-bucket campfire count instead of the 81-tile warmth scan.
- Evidence: `perceive_into` 14.5 % inclusive early, 12.5 % mature (self 9 % early, 645 samples).
- Expected gain: (a) 3-4 % bit-identical; (b)+(c) up to 8-10 %.
- Size: S for (a), M for (b)/(c). Deps: none.
- Determinism: (a) and (c) bit-identical; (b) bit-identical only if the cache key covers everything read (energy/hydration thresholds,
  infection, memory maps, nearby organisms) - otherwise trajectories change. Cover with the existing A/B-vs-reference test pattern the repo already uses.

## SIM-05  `best_remembered_cell` scans the whole memory map 4x per organism per tick
- Files: `crates/sim-core/src/organism/organism/helpers.rs:3-44`, callers `perception.rs:98-111` (food, water) and `inner.rs:189,196`;
  maps are `FxHashMap<(i32,i32), f32>` (`food_memory`, `water_memory`, `danger_memory`); `sim/simulation/helpers.rs:386-407`
  (`decay_local_resource_memory`, a full `retain` over each map per organism per tick) and `verify_local_resource_memory`.
- Change: remember the last result keyed on (rounded position, urgency bucket, memory/danger mutation counters) and reuse it when
  the organism has not moved or learned; skip `decay_local_resource_memory` when no remembered key is within 1 tile (needs a bounding
  box or a coarse bucket set on the map).
- Evidence: `best_remembered_cell` 295 samples (4.2 %) + `nearby_memory_strength` 115 (1.6 %) early; 581 (4.0 %) + 255 (1.8 %) mature;
  `decay_local_resource_memory` retain 49 samples (0.7 %), `verify_local_resource_memory` 60 (0.9 %).
- Expected gain: 3-5 % (up to ~7 % if decay is also bounded).
- Size: S (memo) / M (indexed memory). Deps: none.
- Determinism: bit-identical if the memo key is exact. Tie-break currently depends on `FxHashMap` iteration order: keep the same map or the
  result can change on equal scores.

## SIM-06  `plan_route_in` does five separate array reads per neighbour; precompute one nav byte per cell
- Files: `crates/sim-core/src/organism/navigation.rs:289-352` (also `detour_step_in` `:114-175`), `world/grid.rs:208-243,514-528`
  (`get`, `road_at`/`is_road`, `is_wet`, `depth_at`, `hazard_at` read `tiles`, `roads`, `depth`, `hazard`).
- Change: maintain a `nav: Vec<u8>` layer (bit0 walkable, bit1 fire, bit2 wet-deep-no-bridge, bit3 road) updated where tiles/roads/depth
  change (`set`, `set_road`, drought/flood/lava/ice paths); the search then does one load + the hazard float read (kept as is, dynamic).
  Keep `wide::` reference and the existing equivalence tests.
- Evidence: `plan_route_in` 1000 self samples (14.4 %) early, 3019 (21.0 %) mature. 8 neighbours x (get + is_wet + depth_at + is_road + hazard_at)
  per expansion; 528 M expansions per 30000 ticks.
- Expected gain: 25-40 % of `plan_route` time = 4-8 % of the tick (more in mature worlds).
- Size: M. Deps: none; do SIM-09 first so the gain is visible.
- Determinism: bit-identical if every mutation site updates the layer (guard with a debug assert comparing `nav` to the slow path in tests).

## SIM-07  Pathfinding does a lot of work whose answer is already known: repeated no-route plans and budget-exhausted partial plans
- Files: `crates/sim-core/src/organism/organism/movement.rs:152-190` (`toward`), `navigation.rs:93,198-205,213-231`
  (`RouteCache::blocked`, `mark_blocked`, `PLAN_BUDGET`).
- Change: (a) share the "no route" result across walkers: a small `FxHashMap<(goal tile, start 8x8 bucket), until_tick>` on `Simulation`
  (cleared on terrain-change events) consulted before `plan_route`; today a walker only remembers its own failure for 60 decisions
  within 3 tiles of the goal. (b) when a plan hits the budget, cache the partial path's far end and re-plan from there instead of
  restarting from scratch each time the cache is exhausted. (c) per-tick expansion budget (see SIM-08) to flatten spikes.
- Evidence: counters above: 44 % of plans return no route (4.4 s of 41.5 s plan time) and 25 % exhaust the budget (81 % of expansions).
  (b) is where the time is.
- Expected gain: (a) ~2 % of tick, (b)/(c) up to 8-10 % plus a lower tail (p99 36-62 ms).
- Size: M. Deps: SIM-06 (cheaper expansions), SIM-09 (to see tail effects).
- Determinism: changes trajectories (deterministic, but golden seeds and the 8-seed alive-mean check in the `ESTIMATE_PER_TILE` comment must be re-run).

## SIM-08  Retune route budget / heuristic with the 8-seed alive check, and cap pathfinding per tick
- Files: `navigation.rs:198-205` (`PLAN_BUDGET = 3000`), `:204-211` (`ESTIMATE_PER_TILE = 14`), per-tick cap in `sim/simulation/tick.rs` around `tick_organism`.
- Change: try `PLAN_BUDGET` 1500/1000 and `ESTIMATE_PER_TILE` 18/20; add a per-tick global expansion cap (walkers over the cap keep their greedy step and plan next tick, in the fixed organism order).
- Evidence (single seed, 12,000 ticks, instructions retired): base 407.3 G, `PLAN_BUDGET=1000` 304.3 G (-25 %) but final alive 241 -> 181 and births 318 -> 244;
  `ESTIMATE_PER_TILE=20` 365.9 G (-10 %), alive 241 -> 224. The instruction drop is confounded by the smaller population; this needs the multi-seed
  comparison the code comment describes before any value is picked.
- Expected gain: up to 10-20 % of tick time if behaviour quality survives; unknown until measured per organism-tick.
- Size: S to try, M to validate (8 seeds x 9000 ticks, compare mean alive and `deaths:` lines). Deps: SIM-09.
- Determinism: changes trajectories (deterministic).

## SIM-09  Perf gate does not see late-game cost or the tail, and samples only periodic ticks
- Files: `scripts/perf-gate.sh` (`TICKS=8000`, budgets), `crates/headless/src/main.rs:~115-130` (profile row only when `tick % profile_every == 0`),
  `.github/workflows/pipeline.yml:114,129`.
- Change: (1) record every tick (cheap) and gate mean and p99 as well as max; (2) add a long seed run (e.g. 25,000 ticks, one seed) or a saved
  mature world, because the cost per tick is 5x higher after tick 15000 than before 6000; (3) add an instructions-retired budget (Linux CI: `perf stat -e instructions`,
  macOS: `time -l`) which is not affected by runner noise; (4) tighten `MAX_TICK_MS` once (1) exists.
- Evidence: the CSV only contains ticks divisible by 100, which are the heavy periodic ticks (mean there 20 ms at tick 15-20k vs 5.4 ms overall), so
  the gate's mean is wrong in both directions; current gate result 33.7-47.8 ms max against an 80 ms budget at 8000 ticks, and it never reaches the
  regime where `plan_route` is 21 % and trade routes cost 7 %. Late game observed max 124-220 ms (not gated).
- Expected gain: no runtime gain; it makes every other item here measurable and catches regressions the gate currently cannot.
- Size: S. Deps: none. Do this first.
- Determinism: none.

## SIM-10  Several spatial queries per organism per tick over the same area
- Files: `sim/simulation/organism_tick/setup.rs:26` (r6), `:~72` (r12 around elder home), `organism/organism/perception.rs:118` (r8),
  `decide.rs:~84` (r16 + `sort_unstable`), `sim/actions/eligibility.rs` `EligibilityContext::gather`.
- Change: one r16 query per organism per tick (already sorted ascending index), filtered by Chebyshev radius for each consumer.
- Evidence: `SpatialIndex::query_into` 278 samples (4.0 %) early / 519 (3.6 %) mature, plus the sort and bucket-aligned superset filtering in each consumer.
- Expected gain: 2-3 %.
- Size: M. Deps: none.
- Determinism: bit-identical if each consumer sees the same ordered set (superset filtered with its original distance test).

## SIM-11  Autosave/serialize size: 15 MB of JSON at tick 3000, written every 30 s by the wasm worker
- Files: `crates/sim-core/src/lib.rs` wasm facade `serialize` (= `serde_json::to_vec(to_save_state())`), `apps/web/src/simulation/wasmWorker.ts:~196-206`
  (`DEFAULT_AUTOSAVE_MS = 30_000`), `crates/sim-core/src/sim/storage/persistence/{to_save.rs,organism.rs}`, server `SAVE_EVERY_TICKS = 600` (`apps/server/src/config.rs:141`).
- Change: (a) store the grid as packed typed arrays (base64/RLE or a binary container) - `grid` is 6.3 MB of the save; (b) skip q_table rows with default values,
  quantize floats; (c) stop saving what can be regenerated (terrain from seed + diff of changed tiles); (d) optionally compress (gzip/deflate via `CompressionStream`) before IndexedDB.
- Evidence: node + wasm, tick 3000: `serialize()` = 15,288,979 B in 82 ms (blocks the sim worker), `fromSerialized` 218 ms. Breakdown: grid 6.30 MB, organisms 6.22 MB
  (q_table 3.02 MB = 21 KB each, vocabulary 7 KB each), buildings 77 KB. It grows with play time.
- Expected gain: save size -60..80 %, serialize stall 82 ms -> ~20 ms, IDB write time and memory spike (JSON string + Vec + Uint8Array copies) down accordingly; matters on phones.
- Size: M. Deps: SIM-03 (key packing) helps; needs a save-version bump and a loader for the old format (`SAVE_SCHEMA_VERSION`).
- Determinism: none for the sim; must round-trip bit-exact (f32 via f64 in JSON is already exact; keep that property).

## SIM-12  wasm frames: build a `serde_json::Value` tree, stringify, then the web parses it again
- Files: `crates/sim-core/src/lib.rs:61-85` (`full_frame`/`delta_frame` use `state_json*` -> `Value` -> `to_string`), `apps/web/src/simulation/wasmWorker.ts:~160-170`
  (`post({type:'frame', frame})` string), `apps/web/src/simulation/wire.ts:313` (`JSON.parse`).
- Change: use `state_frame*` (the typed `FramePayload` the server already uses) and serialize it directly to a `Vec<u8>`/`String`; skip the `stamp` tree insert;
  consider returning bytes and posting them as a transferable.
- Evidence (node, tick 3000-3300, quiet machine): `deltaFrame` 1.9 ms avg for ~183 k chars; `JSON.parse` of it 0.64 ms (2.05 ms under load); `fullFrame` 99-114 ms and 3.48 M chars.
  The server path already moved to typed frames (`frame.rs`, `FramePayload`) for this reason; the wasm facade did not.
- Expected gain: -30..50 % of `deltaFrame` time, less allocation churn in wasm linear memory; combined with SIM-13 removes the main-thread `JSON.parse`.
- Size: S. Deps: SIM-01 first (it dominates payload size).
- Determinism: none (output text must remain byte-identical; `FramePayload` has a test pinning it against the `Value` path).

## SIM-13  wasm: ship msgpack (the server codec) instead of JSON text to the main thread
- Files: `crates/sim-core/src/lib.rs` (wasm facade), `apps/server/src/frame_codec.rs` (move to sim-core or a shared crate), `apps/web/src/simulation/binary-frames.ts` (already decodes msgpack).
- Change: expose `deltaFrameBytes`/`fullFrameBytes` returning msgpack and reuse `binary-frames.ts`; post as a transferable `Uint8Array`.
- Evidence: natively `frame_codec` encodes the 3.3 MB (tick 15k) full frame to msgpack in 3.8-4.7 ms; the wasm JSON-string path took 99-114 ms for a 3.5 MB full frame at tick 3000
  (different worlds and targets, so the ratio is indicative only); the web already has a msgpack decoder for server frames.
- Expected gain: -20..40 % main-thread decode cost and message size on the offline path (phones), at the cost of adding `rmp` to the wasm (+~30-60 KB, unmeasured).
- Size: M. Deps: SIM-12; check wasm size delta (SIM-14).
- Determinism: none.

## SIM-14  wasm module is 4.86 MB (978 KB brotli): find what it is made of
- Files: `scripts/build-wasm.sh`, `crates/sim-core/Cargo.toml`, `crates/sim-core/src/sim/storage/**` (heavy `serde_json::json!`/`Value` use), `organism/vocabulary.rs` (1.5 k lines of data).
- Change: run `twiggy top`/`cargo bloat --target wasm32` (neither installed here) and cut the biggest monomorphization clusters: `serde_json::Value` building for frames (SIM-12 removes the
  second copy), `serde_json` pretty/float paths pulled by both `Value` and typed serializers, `tracing` (gate calls behind a feature in wasm builds), derive(Deserialize) for save structs duplicated per `Vec`/`IndexMap` instantiation.
- Evidence: `build-wasm.sh` output at a99d1636: 4,857,558 B raw (code section 4,512,516 B, data 340,289 B), gzip-9 1,359,217 B, brotli-11 977,685 B; no name section (already stripped).
  wasm-opt variants give no further saving (see rejected list), so size must come from source. Wasm size also dictates parse/compile time on low-end phones (not measured here).
- Expected gain: unmeasured; 10-25 % raw size is typical for this kind of cleanup. Treat as an investigation first.
- Size: L (analysis M). Deps: SIM-12 (do before measuring).
- Determinism: none.

## SIM-15  wasm runs the sim 2-3x slower than native; allocator and call-count are the levers
- Files: `scripts/build-wasm.sh`, `crates/sim-core/Cargo.toml` (no allocator choice; default dlmalloc), hot spots from SIM-02..05.
- Change: first cut allocations per tick (SIM-03, SIM-16, SIM-18: ~3.9-5.9 k allocs/tick, 474-728 KB/tick); only then trial a smaller/faster wasm allocator (`talc`, `lol_alloc`) behind `cfg(target_arch="wasm32")` and measure.
- Evidence: node + wasm 2.83 ms/tick vs native 1.35 ms/tick at the same 3000-tick state (2.1x; a quiet run measured 3.69 ms vs 1.35 ms, 2.7x). Native malloc/free is 5-8 % of samples, so an allocator swap alone is bounded by roughly that.
  A mature world (native 5.4 ms mean) projects to ~12-15 ms/tick in wasm against the 120 ms `WASM_BASE_TICK_MS` budget; the 1x speed has headroom, the fast-forward speeds do not.
- Expected gain: allocator swap <= 3-5 %; reducing allocations helps more.
- Size: M. Deps: SIM-03, SIM-16.
- Determinism: none (allocator).

## SIM-16  Per-tick allocations in the organism loop: cloned `String`s and rebuilt vectors
- Files: `sim/simulation/organism_tick/mod.rs:19-58` (`OrgFrame` holds `lineage: String`, `perception: String`, `next_perception: String`, `new_thought: Option<String>`),
  `setup.rs:~120` (`lineage_id.clone()`, `tile_owner... .cloned()`), `choose_action.rs` (`Vec<usize>` collected per call, 25k big allocs sampled in 6000 ticks),
  `sim/actions/ctx.rs:ActionCtx::new/event/discover`, `try_apply`, `Organism::think`, `sim/simulation/tick.rs:360-368` (SpatialIndex x2, `org_idx_by_id`, `lineage_members` rebuilt each tick).
- Change: borrow instead of clone (`&str`/`Rc<str>`/interned id), reuse scratch `Vec`s (thread-local scratch already exists for Q values), keep `org_idx_by_id`/`lineage_members` between ticks and patch on birth/death.
- Evidence: 3.9-5.9 k allocations and 474-728 KB per tick; sampled allocation sites >= 4 KB (est. over 6000 ticks): `SpatialIndex::build` 205 MB, `build_animals` 129 MB,
  `choose_action_with_neighbors` 103 MB, `available_actions_into` 39 MB, `Vocabulary::words` 43 MB, `decay_memory` sort 21 MB. `String::clone` 2.3 %, malloc/free self 5-8 %, `finish_grow` 1.2 %.
- Expected gain: 3-5 %.
- Size: M (many small edits). Deps: none; SIM-17 below is independent.
- Determinism: none if done as pure refactors; verify with the existing reference-equality tests and `headless` summary diff at three seeds.

## SIM-17  `encode_frame` swallows errors into an empty WebSocket frame
- Files: `apps/server/src/transport.rs:235-238` (`Err(_) => return Vec::new()`), `broadcaster.rs` (sends whatever `encode_frame` returns), `routes.rs:816`.
- Change: return `Option<Vec<u8>>`/`Result` and skip the broadcast (count it in `TransportStats`) instead of sending a 0-byte binary message every client then fails to decode.
- Evidence: read only (no failure reproduced; msgpack encoding of `FramePayload` has not failed in any run here). Trivial but it is the only place a transport failure is silently turned into bad data.
- Expected gain: robustness only. Size: S. Deps: none. Determinism: none.

## SIM-18  Server fan-out copies every frame per client
- Files: `apps/server/src/routes.rs:816` (`Message::Binary(msg.as_ref().clone().into())`), `state.rs:6` (`broadcast::Sender<Arc<Vec<u8>>>`), `routes.rs:833-837` (cached full also cloned).
- Change: make the channel carry `bytes::Bytes` (cheap refcounted clone; axum's `Message::Binary` takes `Bytes`).
- Evidence: read only. At tick 15k a delta is ~90 KB and a periodic full 224 KB, so each connected client costs a heap copy of that per broadcast (e.g. 50 clients x 90 KB x 2/s = 9 MB/s of memcpy + allocator traffic).
- Expected gain: lower server CPU/alloc with many clients; nothing for a single desktop client. Size: S. Deps: none. Determinism: none.

## SIM-19  Tick loop holds the sim mutex for the whole batch of `steps_per_period` ticks
- Files: `apps/server/src/tick_loop.rs:~60-80` (`block_in_place(|| s.tick_n(steps_per_period))` under `sim_clone.lock()`), `apps/server/src/broadcaster.rs` (`cadence.build` takes the same lock).
- Change: lock per tick (or per few ticks) so the broadcaster and command handlers interleave; or double-buffer the frame inputs.
- Evidence: read only; with tick p99 36-62 ms and max 124-220 ms in mature worlds, and `steps_per_period` > 1 at fast-forward speeds, a broadcast build (5-16 ms) or a command waits behind the whole batch.
- Expected gain: lower frame/command latency jitter under fast-forward. Size: M. Deps: none. Determinism: none.

## SIM-20  Periodic full frame (every 30 ticks) re-sends all organisms in full
- Files: `apps/server/src/config.rs:139` (`FULL_FRAME_EVERY_TICKS = 30`), `crates/sim-core/src/sim/storage/serialize/frame.rs:~118-140` (`include_all_entities` every 120 ticks or `force_full`), `apps/server/src/broadcaster.rs:104-125`.
- Change: after SIM-01 this becomes the biggest recurring cost: send per-organism cold fields only when changed (revision per organism) or lengthen the period to 60-120 ticks with the client keeping its last known values.
- Evidence: periodic full is 24 / 143 / 224 KB gz at ticks 1.1k / 6.1k / 15.1k (vs ~10 KB for a delta without buildings); 9.3 MB over 3000 ticks at tick 15k.
- Expected gain: after SIM-01, another -40..60 % of steady-state egress.
- Size: M (needs a web-side merge rule). Deps: SIM-01. Determinism: none.

## SIM-21  Trails and fire physics scan whole-grid layers on the physics tick
- Files: `crates/sim-core/src/physics/engine.rs:105-125` (`decay_trails_strong` every 15 sim ticks over ~540 k floats; `grow_plants`; `register_existing_fires` full grid walk), `world/grid.rs` decay loops.
- Change: keep a dirty-bucket set for trail layers (only decay where non-zero) or decay lazily on read.
- Evidence: `PhysicsEngine::tick` 228 samples (3.3 %) early, 167 (1.2 %) mature; every physics tick is a visible bump in the per-tick histogram (ticks divisible by 5 average 6.4 ms vs 5.1 ms).
- Expected gain: 1-3 %. Size: S/M. Deps: none.
- Determinism: bit-identical if lazy decay applies the same factor `n` times (use `powi` via `DetMath`, not repeated multiply, only if exactness of f32 accumulation is proven by a test).

## SIM-22  Lineage ids are strings everywhere (`lineage_id`, `org_idx_by_id`, `lineage_attitudes`)
- Files: `organism/mod.rs` (`lineage_id: String`, `lineage_attitudes: FxHashMap<String,f32>`), `sim/simulation/organism_tick/setup.rs`, `perception.rs:129-133`, `sim/spatial.rs:first_unknown_nearby_lineage`, `tick.rs:363` (`org_idx_by_id: FxHashMap<String, usize>`).
- Change: intern lineage and organism ids to `u32` handles (keep the string table for serialization).
- Evidence: `memcmp` self 345 samples (4.9 %) early, 1119 (7.8 %) mature; `String::clone` 2.3 %; `first_unknown_nearby_lineage` 29-52 samples. Overlaps SIM-03 and SIM-16.
- Expected gain: 3-5 % beyond SIM-03/16. Size: L (touches save format, JSON payloads, tests). Deps: do after SIM-03 and SIM-16 and only if they leave memcmp above ~3 %.
- Determinism: any `FxHashMap` keyed by the id changes iteration order; audit ordered iteration sites first.

## SIM-23  Memory growth and RSS
- Files: `crates/sim-core/src/organism/organism/inner.rs:decay_memory`, `sim/simulation/mod.rs` (`apply_memory_pressure`), `apps/server/src/memory_watch.rs`.
- Evidence: RSS 39 -> 84 MB over 30000 ticks on native (fine against the 256 MB gate); wasm linear memory in node showed 132-461 MB RSS during the benches (includes the JSON strings and the save buffers; the wasm heap never shrinks).
  No leak found; q_table grows with experience (21 KB JSON per organism at tick 3000).
- Change: bound q_table rows per organism (LRU/min-visit pruning) - also shrinks saves (SIM-11) - and `shrink_to_fit` after large temporary buffers on the wasm side (`serialize`).
- Expected gain: lower memory on phones; no CPU gain. Size: M. Deps: SIM-03.
- Determinism: pruning changes behaviour (deterministic); needs the multi-seed alive check.

## SIM-24  `org_vitals` / `org_act` / `choose_action` inner loops (profile again after SIM-02..06)
- Files: `organism_tick/vitals.rs` (5.1-5.2 %), `organism_tick/act.rs` (4.8-5.2 %), `organism/choose_action.rs` (18 %, includes `QValueScratch` thread-local `with_borrow_mut` 3 %), `sim/actions/available.rs` (17 %; already has the `GATE_PASSES` cache).
- Evidence: top-of-stack self time (first sample): `available_actions_into` 926, `choose_action` 125 + closure 166, `org_vitals` 115, `org_act` 32.
- Change: not enough here to propose a safe edit without a second profile on the post-SIM-02..06 build; `available_actions_into` already caches the era/age gates per slot.
  Next step: add per-phase `Instant` counters behind a `cfg(feature = "phase-timing")` in `tick_organism` so `make profile` can print the phase split without `sample`.
- Expected gain: unknown. Size: S (instrumentation). Deps: SIM-09. Determinism: none.

## SIM-25  Dead duplicate and small cleanups found while reading (no measurable gain; skip unless touching the file)
- `navigation.rs:100-103` `RouteCache::skip_blocked` is identical to `recently_blocked`; `navigation.rs:194-200` duplicates the `PLAN_BUDGET` doc comment.
- Listed so nobody opens a PR for them alone: per the brief, no-gain items are not opened.
