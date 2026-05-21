# Lab Architecture

The lab is organised around the four stages of the model-improvement
loop: **capture → curate → train → evaluate**. Each stage is a separate
package so they can be used independently, composed into pipelines, or
imported into notebooks for ad-hoc analysis.

## Layout

```
lab/
  src/thehumanbox_lab/
    backends/       inference (Ollama, llama.cpp, OpenAI-compat, Groq, dummy)
    behavior/       life-arc / death-cause / migration / influence analysis
    cache/          disk-backed memoization
    embedding/      char-ngram vectors + kmeans / NN
    eval/           metrics, judge, A/B, drift, latency, HTML report
    language/       vocab diff, dialect clustering, spread, loan-words
    scoring/        heuristic + LLM-judge quality scoring
    synth/          paraphrase, permute, template generation, QA, personas
    trace/          snapshot / WS capture, filters, sampling, checkpoints
    training/       LoRA presets, HP search, cost estimator, manifest, wandb stub
    viz/            SVG primitives + report builder
    formatters.py   ChatML / Llama3 / Alpaca / OpenAI fine-tune formats
    pair_builder.py DPO / IPO / KTO chosen-rejected pair extraction
    dedup.py        exact + simhash near-duplicate dedup
    quality_filter.py length / pattern filters
    split.py        stratified train/val/test split
    token_budget.py token estimation (tiktoken or fallback)
  scripts/          thin CLI wrappers for each operation
  experiments/      JSON experiment configs
  models/           registry.json + per-family YAML cards
  tests/            pytest test suite
  notebooks/        starter Jupyter notebooks
  docs/             you are here
```

## Design rationale

- **Pure stdlib by default.** Heavy deps (transformers, peft,
  websockets, msgpack) are optional extras in `pyproject.toml`. The
  core packages always import without them.
- **Protocols over inheritance.** `backends/__init__.py` defines a
  `Backend` protocol; new backends only need to satisfy the
  `complete()` + `health()` signature.
- **Deterministic randomness.** Anything stochastic accepts a `seed`
  argument and uses an instance `random.Random` rather than the global.
- **No-comment policy.** New code does not carry comments — the
  identifiers and function signatures must carry the meaning.
- **Backwards-compatible saves.** `model_registry.json`, training
  manifests, and dataset checkpoints all use `#[serde(default)]` style
  Python equivalents so adding fields never breaks older files.
