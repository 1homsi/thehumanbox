# Large-crowd performance

Reproduce the isolated canvas benchmark with `cd client && npm run dev`, then open
`/crowd-benchmark.html` in the in-app browser and click Run. It creates a private,
synthetic moving crowd from a new seed; it never reads or writes saved worlds.
The page calls the real world painter without CubeForge, React frame publication,
or a running simulation. Every person is rendered. It measures synchronous canvas
painting, not end-to-end FPS or GPU presentation time. Five warm-up frames and ten
measured frames run for each population/zoom pair. To test a specific population
(up to 50,000), open `/crowd-benchmark.html?count=50000`.

Local macOS in-app-browser results, September 20, 2026 (mean milliseconds):

| Moving people | Zoom | Before | After |
|---:|---:|---:|---:|
| 1,000 | 0.25 | 3.0 | 1.7 |
| 1,000 | 2 | 3.5 | 1.4 |
| 5,000 | 0.25 | 8.9 | 5.3 |
| 5,000 | 2 | 16.5 | 5.7 |
| 10,000 | 0.25 | 24.7 | 11.2 |
| 10,000 | 2 | 45.1 | 11.5 |

The dense case places all people within a 64 by 48 tile area. These are short
local comparisons, not a device-independent frame-rate guarantee. Pixel shadows
and decorative rings are omitted in large crowds; names are bounded by screen
space. Sprites, movement, explicit health/age overlays, and selected-person
inspection remain. Mirrored sprite cells use a cached atlas instead of changing
canvas transforms for every person.

Run the separate native simulation stress test with:

```sh
cargo run --manifest-path simulation/Cargo.toml -p sim-core --release --example crowd_profile -- 5000
```

That fixture distributes 5,000 adults over repeated deterministic coordinates
(including water), with 20 lineages, and advances 30 ticks. It is an intentionally
synthetic stress test, not a mature saved civilization. Before changes it averaged
492 ms/tick locally; subsequent optimized runs were approximately 329–348 ms/tick.
Serialization was approximately 5 ms for a 588 KB incremental frame. Native
numbers do not measure WASM speed. Large simulations still have substantial CPU
cost: this patch does not establish real-time 5,000-person simulation on every
laptop.

Sampling identified whole-population scans for bounded social checks and action
eligibility work. Nearby decisions now reuse the existing spatial index, preserve
population order, and retain full-population access for long-distance relationships.
A regression test compares 1,200 indexed and full-scan decisions and their RNG
state. Eligibility membership uses bounded action-ID tables without changing
candidate order.

CubeForge receives the game's rendered canvas as a dynamic texture, rather than
one CubeForge entity per resident. Its dirty-texture upload path already skips
unchanged canvases. The measured population-dependent painter bottleneck occurs
before CubeForge, so this change does not modify that repository.

## 50,000-person stress test

The native fixture accepts a second argument for tick count, allowing a bounded
run at populations beyond the game's 5,000-person limit:

```sh
cargo run --manifest-path simulation/Cargo.toml -p sim-core --release --example crowd_profile -- 50000 3
```

The fixture inserts residents directly, bypassing the normal population cap; it
prints the surviving population after each tick. These tests do not enable 50,000
people in the game or change any saved world.

September 20 local results after the previous performance patch:

| Test | Mean | p95 |
|---|---:|---:|
| Canvas, 50,000 moving people, zoom 0.25 | 105.7 ms/frame | 110.0 ms |
| Canvas, 50,000 moving people, zoom 2 | 99.4 ms/frame | 104.1 ms |
| Native simulation, 50,000 people, three ticks | 71,967 ms/tick | — |

Rendering was rerun after the native stress process exited. The three native
ticks took 67,973, 70,138, and 77,790 ms; all 50,000 residents survived each tick.
The native run overlapped brief browser/check activity, so its timings are an
approximate stress baseline, not a controlled comparison. Incremental serialization
then took 45.45 ms for 4,812,166 bytes. A two-second native sample was dominated by
`tick_organism` and string comparisons. Further profiling should target repeated
population scans and lineage/relationship lookups before increasing the game cap.

50,000 is not real-time-ready: canvas painting alone uses around 100 ms per frame,
and the native simulation is far slower still. These are isolated synthetic tests,
not an end-to-end browser/WASM frame-rate measurement or a mature-world benchmark.

## September 24 lineage-reward pass

The per-person wellbeing reward previously summed every living relative's
energy for every person, making this one reward quadratic within large lineages.
It now reads the lineage aggregate already collected at the start of each tick.
This makes the reward a consistent tick-start signal for everyone in that
lineage; a lineage formed during the tick still uses a live scan until its first
aggregate exists. The aggregate ignores dead residents and refreshes each tick.

On the same Mac, using the same release `crowd_profile` fixture before and after
the change, with no concurrent benchmark process:

| Native fixture | First comparison, before → after | Repeat, before → after |
|---|---:|---:|
| 5,000 people, mean of 8 ticks | 267.31 → 159.82 ms/tick | 162.10 → 199.00 ms/tick |
| 50,000 people, first tick | 13,454.95 → 8,671.12 ms | 10,926.98 → 9,313.31 ms |

The 5,000-person result is inconsistent across repeats, so this does not
establish a gain at that size. Both 50,000-person comparisons were faster, but
the size of the gain varied substantially with machine conditions. These are
short synthetic native runs, not browser/WASM timings or a promise of real-time
simulation at either population. The 50,000-person fixture bypasses the game's
population cap.

## Local predator danger lookup

Danger-memory verification now queries the existing animal spatial index for
nearby predators. It keeps the same five-tile distance rule and checks each
animal's current liveness, since hunting can kill an animal after the index is
built. This avoids scanning every animal for every person as the ecosystem
approaches its 400-animal cap.

The `crowd_profile` fixture accepts an optional third argument for animal
count (0–400). It creates a deterministic mix of wolves and rabbits without
loading a saved world. For example:

```sh
cargo run --manifest-path simulation/Cargo.toml -p sim-core --release --example crowd_profile -- 50000 1 400
```

One paired native run on the lineage-reward baseline measured 7,486.70 ms
before and 7,352.14 ms after for a first 50,000-person tick. That difference
is too small, given machine variability, to claim a repeatable whole-tick
speedup. The scaling improvement is the removal of the per-person scan across
all animals; this benchmark does not measure browser performance.

## Local human queries for wildlife

The animal tick previously handed every animal a full list of living people,
then searched that list for a person to chase or flee. It now builds a human
spatial index after human movement and passes each animal only nearby people.
The query radius follows that animal's existing chase or flee distance, and
candidates retain population order so nearest-target ties resolve as before.
A reference test compares movement and RNG results for all seven animal kinds.

Two paired native first-tick runs with 50,000 people and 400 animals measured
7,224.90 → 6,166.49 ms and 6,862.27 → 6,070.00 ms. This is a synthetic
stress result beyond the game's human population cap, not a browser or WASM
frame-rate measurement. The improvement varied across runs and does not show
how much a mature 5,000-person world will gain.

## Local wolf encounters

Wolf taming and bite checks previously scanned every resident for every wolf;
pack-defence checks then scanned everyone again for each nearby victim. They now
reuse the human index built for wildlife movement, retain population order for
random encounter rolls, and apply the same exact-distance and kin predicates.
A reference test covers fractional positions at spatial bucket edges, deaths,
taming eligibility, bite order, and pack-defence counts.

The 5,000-person, 400-animal fixture averaged 171.85 ms/tick before and
170.49 ms/tick after over ten ticks, which does not establish a measurable
whole-tick improvement. Two paired 50,000-person first-tick comparisons went
in opposite directions (6,421 → 9,063 ms and 8,749 → 6,590 ms), showing that
machine variability dominates this short stress comparison. The benefit here
is bounding encounter work by nearby residents as the population grows; these
native figures do not measure browser frame rate or WASM execution.

## Bonded dog owner lookup

Each dog previously searched the whole resident list by ID every tick to
follow its owner and improve the owner's comfort. The animal tick now reuses
the ID-to-index map already built for human decisions. It checks current
liveness before acting and refreshes indices if archive cleanup removes dead
residents and shifts their positions. A regression test covers that rare
cleanup path and another covers comfort while the owner is alive and after
death.

The native fixture accepts an optional fourth argument for bonded dogs within
the requested animal count, for example:

```sh
cargo run --manifest-path simulation/Cargo.toml -p sim-core --release --example crowd_profile -- 5000 10 400 40
```

Alternating saved baseline and changed binaries on the same Mac produced
5,000-person ten-tick means of 155.47/174.14 ms before and 173.17/171.11 ms
after. First ticks with 50,000 people and 40 dogs were 9,152.90/9,110.46 ms
before and 9,094.53/9,024.65 ms after. The small, inconsistent whole-tick
differences do not establish a practical speedup at the game's population
cap. The change removes the dog-count-times-population search; 50,000 people
remain a synthetic, beyond-cap native fixture rather than browser/WASM proof.

## Reused action eligibility buffers

The simulation calculates available actions twice per person per tick: once to
choose an action and again to learn from the resulting state. Both calls now
reuse a tick-local action vector and the existing spatial-query vector instead
of allocating new vectors for every call. Eligibility rules and candidate order
are unchanged; a regression test checks fresh and reused results across terrain
and era changes, including buffers containing stale entries.

Paired baseline and changed release binaries on the same Mac, with 400 animals
in both fixtures, gave these native results (milliseconds, before → after):

| Fixture | Pair 1 | Pair 2 | Pair 3 |
|---|---:|---:|---:|
| 5,000 people, mean of 30 ticks | 160.73 → 148.12 | 153.84 → 147.43 | 168.50 → 162.49 |
| 50,000 people, first tick | 6,486.28 → 6,079.00 | 6,218.74 → 6,022.37 | 9,110.00 → 8,653.67 |

The 50,000-person fixture bypasses the game's population cap. These are
synthetic native measurements; they do not establish the browser frame rate,
WASM speed, or thermal behavior of a mature world. Absolute times varied
substantially across pairs, so the exact gain should not be extrapolated.

## Shared perception neighbor query

Each person forms a perception before choosing an action and again afterward.
Both formerly queried the human spatial index twice for overlapping social and
attitude neighborhoods, allocating a fresh candidate vector for each
perception. One query now covers both exact-distance checks, and the vector is
reused across residents for the tick. A reference test compares the social and
attitude fields with the old two-query algorithm across bucket sizes,
day/night sight ranges, dead residents, and bucket edges; it also checks that
reused and fresh buffers produce the same full perception string.

Two paired native comparisons against the preceding main revision, with 400
animals in each fixture, measured (milliseconds, before → after):

| Fixture | Pair 1 | Pair 2 |
|---|---:|---:|
| 5,000 people, mean of 30 ticks | 172.94 → 170.24 | 171.57 → 170.05 |
| 50,000 people, first tick | 9,398.70 → 8,958.16 | 9,055.41 → 8,865.56 |

The 5,000-person difference is small enough that these runs do not establish a
practical whole-tick speedup at the game cap. The 50,000-person fixture bypasses
that cap; its paired improvements varied with machine conditions. These results
are native synthetic timings, not browser FPS or WASM measurements.

## Local workspace eligibility in building-heavy worlds

`crowd_profile` accepts an optional fifth argument for completed buildings
(0–1,500). When nonzero, it sets up a deterministic mixture of owned
buildings and supplied information-era residents so workspace-gated actions
are exercised. For example:

```sh
cargo run --manifest-path simulation/Cargo.toml -p sim-core --release --example crowd_profile -- 5000 10 0 0 1200
```

Workspace and nearby-hut eligibility previously scanned the building list for
every qualifying action band. A single availability calculation now remembers
each local result and shares it across bands. The cache ends with that
calculation, so a building completed, damaged, or ruined before the next
decision is checked again. A regression test compares all workspace types and
hut checks with their uncached predicates across ownership, location, and
building condition.

Paired native release runs on the same Mac measured (before → after):

| Fixture | Pair 1 | Pair 2 |
|---|---:|---:|
| 5,000 people, 1,200 buildings, mean of 10 ticks | 362.64 → 318.45 ms/tick | 374.73 → 331.67 ms/tick |
| 5,000 people, 400 animals, 1,200 buildings, mean of 10 ticks | 365.80 → 358.41 ms/tick | 408.82 → 364.37 ms/tick |

The 50,000-person, 1,200-building first tick measured 12,673.10 → 10,821.38
ms in one pair. All four 5,000-person runs without animals produced the same
incremental-state byte count after ten ticks. The 50,000-person fixture exceeds
the game cap, and these synthetic native figures do not measure browser FPS,
WASM speed, or laptop heat. Animal runs varied more, so their exact gain is
uncertain.

## Compact action-family sampling

Available actions are calculated twice per person per tick. The generated
action families previously used a new `BTreeMap` and per-family vectors to
collect, sort, and deduplicate eligible action IDs each time. Each family now
uses a 60-bit mask, and the rotating sampler reads the bits in the same sorted
order without heap allocations. A parity test compares the resulting sampled
action order against the former collection method for sparse and overlapping
subsets of the real action catalogue.

Alternating the before and after native release binaries on the same Mac gave
these 5,000-person, ten-tick means (milliseconds per tick):

| Fixture | Pair 1, before → after | Pair 2, before → after |
|---|---:|---:|
| No added buildings | 219.07 → 210.92 | 213.12 → 211.54 |
| 1,200 completed buildings | 492.89 → 483.57 | 491.84 → 480.70 |

One paired 50,000-person, 1,200-building first tick measured 12,059.41 →
11,649.69 ms. The 5,000-person gain is modest, roughly 2% in this fixture;
50,000 exceeds the game cap. These native synthetic measurements do not prove
a browser FPS or thermal improvement.

## One local-building pass for workspace eligibility

An action calculation now scans the buildings once and records every eligible
workspace type plus nearby operational huts. Previously, each distinct
workspace gate could scan all buildings even after repeated gates were cached.
The snapshot is discarded after the calculation so construction, damage, and
grid changes are visible to the next decision. A reference test compares all
24 workspace types and huts with the original predicates across ownership,
distance, condition, and a hut tile appearing between decisions.

Two alternating native release comparisons with 5,000 residents, 1,200
completed buildings, and ten ticks measured 510.94 → 397.82 and 506.16 →
406.08 ms/tick. The first attempted baseline run overlapped an unrelated
CPU-heavy linter and was excluded. The useful paired runs suggest roughly
20% lower tick cost for this synthetic building-heavy world, with the same
incremental-state byte count. They do not measure WASM, browser FPS, or heat.
