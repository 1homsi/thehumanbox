# Old world save

`world-600x300.json.gz` is the unmodified JSON save from the pre-resize browser WASM,
seed 42, tick 0: 600×300 tiles, 120 people, 14 animals. It was captured before
changing the dimensions using `apps/web/bench/gen-save.mjs` and gzip-compressed
with a zero timestamp. The WASM first passed the committed tick-3000 determinism
fingerprint (`0x3745b0a2c7fa995f`).

Source commit: b2cba5f88772d5e448fbb98af1e3816f36986cc5.

The migration tests also enrich this real save with later-game records to cover
all saved coordinates and nonzero values in every grid layer.
