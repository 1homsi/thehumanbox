# Lab Changelog

## 2026-05-21

Massive expansion: 11 new packages, 138 new files, ~8500 lines.

- New `backends/` — Ollama, llama.cpp, OpenAI-compatible, Groq, dummy,
  health probe, async request manager.
- New `behavior/` — life-arc summarisation, death-cause aggregation,
  action n-gram extraction, migration detection, settlement-tier
  tracking, influence graph, Markdown report.
- New `cache/` — disk-backed memoisation decorator.
- New `embedding/` — character n-gram embeddings, TF-IDF, cosine,
  k-means, nearest neighbours.
- New `eval/` — BLEU / ROUGE-L / CHRF / Jaccard, TF-IDF cosine,
  LLM-as-judge, A/B comparison, drift detection, latency benchmark,
  HTML report.
- New `language/` — Levenshtein, vocab diff, agglomerative dialect
  clustering, word frequency, spread tracking, loan-word detection.
- New `scoring/` — coherence, interest, length, persona-match,
  judge rubric, aggregator, calibrator, registry.
- New `synth/` — paraphrase, permute, back-translate, template
  thoughts, scenario augment, QA pairs, persona generator.
- New `trace/` — snapshot fetch, WS streamer, filters, sampling,
  resumable checkpoints, gzip sink, snapshot diff.
- New `training/` — LoRA presets (6 families), QLoRA presets, HP
  search (grid + random), cost estimator with 9-GPU price table,
  trainer-agnostic eval hooks, manifest v2 with hashing, wandb stub.
- New `viz/` — pure-SVG primitives + lineage population, death pie,
  scenario distribution, Q-value histogram, heatmap, timeline,
  unified HTML report.
- 6 new top-level modules: `dedup`, `formatters`, `pair_builder`,
  `quality_filter`, `split`, `token_budget`.
- 22 new CLI scripts.
- Model registry rewritten: 16 entries (gemma2, qwen2.5, phi3.5,
  llama3.2, smollm2, tinyllama, mistral), 7 YAML model cards, find /
  filter / pretty_table / diff helpers.
- 3 new experiment configs (gemma_2b_lora, qwen_0_5b_dpo,
  phi_mini_sft).
- 3 starter Jupyter notebooks.
- `Makefile` with install / test / lint / format / smoke / eval /
  report / pipeline targets.
- 17 new test files.
- `docs/` directory: architecture, three tutorials, three reference
  pages.
- CONTRIBUTING.md.
