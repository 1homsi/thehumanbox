# Jev audit remediation

This change addresses the four confirmed findings from the September 20 Jev
review of revision `f635e5d1`. The original pass produced 160 preliminary
batch/domain flags; those were not 160 confirmed defects.

## Changes

- First contact now searches spatial candidates, then applies the original exact
  current-position predicates in population order. Two tiles of movement padding
  account for the index being built before residents take their tick's step.
- Thirteen related bounded-distance queries (sharing, listeners, threats,
  negotiation, rivalry and witnesses) use the same ordered candidate strategy.
  Several relationship lookups reuse the tick's existing ID index and still
  check current liveness.
- 3D dust checks at most 512 residents and emits at most 12 particles per frame.
  A rotating cursor fairly continues through large populations; particle slot
  selection is constant-time. The 200-particle visual pool remains intact.
- Dust emitter positions are pruned when the supplied population changes, so
  dead/departed residents do not accumulate for the component's lifetime.
- Failed lazy imports now reject if checkpoint failure cancels the reload,
  including synchronous cancellation, declined reload, cooldown and browser
  storage failure. Successful imports and ordinary errors retain their behavior.

## Verification

- 320 release-mode Rust tests passed; Clippy all-targets passed with warnings denied.
- 215 client tests passed; TypeScript, changed-file ESLint and Vite build passed.
- Optimized WASM build passed.
- Spatial regression tests compare first-contact selection and 600 ordered local
  candidate sets with full scans after diagonal movement across bucket boundaries.
- A 5,000-person fixture proves distant residents are excluded from first-contact
  candidates rather than visited individually.
- Dust tests check dense-frame emission limits, scan limits, fair continuation,
  empty populations and historical-position cleanup.
- Reload tests cover asynchronous and synchronous checkpoint cancellation,
  cooldown, declined reload, unavailable storage, ordinary errors and successful imports.

Jev also reviewed the four exact fix claims. All returned `supported`; reported
confidences were 0.99 (first contact), 0.70 (dust work budget), 1.00 (emitter
cleanup), and 1.00 (reload cancellation). Tests and code evidence are the
acceptance criteria, not these model judgments.

## Matched native benchmarks

Release binaries built from the original revision `f635e5d1` and this patch were
run sequentially on the same machine with the existing `crowd_profile` fixture.
No other build or test workload ran during this comparison.

| Population | Measurement | Before | After | Reduction |
| --- | --- | --- | --- | --- |
| 5,000 | Mean of 30 ticks | 450.68 ms | 365.52 ms | 18.9% |
| 50,000 | Single first tick | 85,516.56 ms | 65,245.75 ms | 23.7% |

All 50,000 residents remained alive in both stress runs. This fixture deliberately
bypasses the normal population cap, uses repeated deterministic positions and
20 lineages, and is not a mature saved world. The 50,000 result is a first-tick
comparison, not a steady-state average. These native simulation measurements do
not measure browser/WASM performance or canvas frame rate. The 2D renderer was
unchanged, and 50,000-person simulation remains far from real-time.

## Scope and remaining work

The audit's other flags are candidate hotspots or under-specified model signals,
not a proven backlog that can safely be fixed automatically. This patch does not
claim every flag is resolved. Per-lineage/global population scans and other
simulation costs remain, and dense local neighborhoods still require local work.
It does not establish real-time 50,000-person simulation.

The two gameplay limitations recorded separately in the audit (short straight
boat crossings and simplified soil-pH action semantics) are unchanged; expanding
those systems is feature work rather than remediation of these four bugs.
