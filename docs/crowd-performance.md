# Large-crowd performance

Reproduce the isolated canvas benchmark with `cd client && npm run dev`, then open
`/crowd-benchmark.html` in the in-app browser and click Run. It creates a private,
synthetic moving crowd from a new seed; it never reads or writes saved worlds.
The page calls the real world painter without CubeForge, React frame publication,
or a running simulation. Every person is rendered. It measures synchronous canvas
painting, not end-to-end FPS or GPU presentation time. Five warm-up frames and ten
measured frames run for each population/zoom pair.

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
