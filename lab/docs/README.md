# Lab Documentation

The `lab/` workspace is the Python side of The Human Box: dataset
prep, evaluation, local-inference benchmarks, fine-tuning support,
behavioral analysis, and visualization tooling.

## Quick links

- [Architecture overview](architecture.md)
- [Quickstart tutorial](tutorials/01-quickstart.md)
- [Fine-tuning walkthrough](tutorials/02-fine-tune.md)
- [Adding a custom backend](tutorials/03-custom-backend.md)
- [CLI reference](reference/cli.md)
- [Data formats](reference/data-formats.md)
- [Scoring rubric](reference/scoring-rubric.md)

## Packages

| Package | Purpose |
|---|---|
| `backends/` | Local-inference adapters: Ollama, llama.cpp, OpenAI-compatible, Groq, dummy |
| `behavior/` | Life arcs, death causes, action n-grams, migrations, settlement transitions, influence graphs |
| `cache/` | Disk-backed memoization decorator |
| `embedding/` | Character n-gram embeddings + cosine / kmeans / nearest-neighbour |
| `eval/` | BLEU, ROUGE-L, CHRF, Jaccard, TF-IDF cosine, LLM-judge, A/B test, drift, latency, HTML report |
| `language/` | Vocab diff, dialect clustering, word frequency, loan-word detection, spread tracking |
| `scoring/` | Coherence, interest, length, persona-match, judge rubric, aggregator, calibrator |
| `synth/` | Paraphrase, permute, back-translate, template thoughts, QA pairs, persona generator |
| `trace/` | Snapshot fetch, WS stream, filters, sampling, checkpoints, gzip, snapshot diff |
| `training/` | LoRA / QLoRA presets, HP search, cost estimator, eval hooks, manifest v2, wandb stub |
| `viz/` | SVG primitives + lineage population, death pie, scenario distribution, Q-value histogram, heatmap, timeline |

## Running

```sh
cd lab
pip install -e ".[dev,trace,inference]"
make test
make smoke
```

See `Makefile` for the full list of targets.
