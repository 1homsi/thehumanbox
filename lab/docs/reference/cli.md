# CLI reference

The CLI is installed as `thb-lab` via `[project.scripts]` in
`pyproject.toml`. Each subcommand also has a thin `scripts/*.py`
wrapper for ad-hoc use without installation.

## Capture

| Command | Purpose |
|---|---|
| `python scripts/trace_collector.py` | Stream WS frames to JSONL |
| `python scripts/capture_periodic.py` | Snapshot every N seconds |
| `python scripts/capture_teacher_thoughts.py` | Pull teacher-model thoughts |
| `python scripts/filter_traces.py` | Apply a filter to a trace JSONL |
| `python scripts/snapshot_diff.py` | Diff two snapshots |

## Dataset prep

| Command | Purpose |
|---|---|
| `python scripts/build_thought_dataset.py` | Capture-JSONL → prompt/completion |
| `python scripts/prepare_sft_dataset.py` | Format as chatml / llama3 / alpaca / openai |
| `python scripts/prep_dpo_pairs.py` | Build chosen/rejected pairs |
| `python scripts/prep_split.py` | Stratified train/val/test split |
| `python scripts/estimate_tokens.py` | Token count for a dataset |
| `python scripts/augment_dataset.py` | Paraphrase / permute augmentation |
| `python scripts/synth_qa.py` | Generate QA pairs from a snapshot |
| `python scripts/synth_personas.py` | Generate synthetic personas |

## Scoring

| Command | Purpose |
|---|---|
| `python scripts/score_thoughts.py` | Apply heuristic scorers |
| `python scripts/score_calibrate.py` | Fit a heuristic ↔ human calibration |

## Backends + eval

| Command | Purpose |
|---|---|
| `thb-lab backend probe` | Health-check every backend |
| `thb-lab backend bench` | Latency benchmark |
| `python scripts/run_thought_eval.py` | Run a held-out scenario eval |
| `python scripts/sweep_thought_eval.py` | Sweep models / configs |
| `python scripts/run_pipeline.py` | Capture → dataset → eval orchestrator |
| `thb-lab eval-ab` | Side-by-side comparison |
| `thb-lab eval-judge` | LLM-judge over a dataset |
| `thb-lab eval-bench` | Latency on a backend |
| `thb-lab eval-report` | Render HTML report |

## Models + training

| Command | Purpose |
|---|---|
| `python scripts/list_models.py` | Filter the registry |
| `python scripts/model_diff.py A B` | Diff two registry entries |
| `python scripts/show_models.py` | List Ollama-available models |
| `python scripts/print_lora_presets.py` | Show available LoRA configs |
| `python scripts/estimate_cost.py` | GPU cost estimate |
| `python scripts/hp_search.py` | Generate hyperparameter grid |
| `python scripts/plan_train_run.py` | Pre-train sanity check |

## Reports

| Command | Purpose |
|---|---|
| `python scripts/analyze_vocab.py` | Vocabulary diversity report |
| `python scripts/analyze_behavior.py` | Behavioral analysis Markdown |
| `python scripts/death_breakdown.py` | Death-cause table |
| `python scripts/dialect_map.py` | Cluster orgs into dialects |
| `python scripts/build_report.py` | Build full HTML lab report |
| `python scripts/inspect_jsonl.py` | Peek at any JSONL file |

## Probe

| Command | Purpose |
|---|---|
| `python scripts/probe_local_stack.py` | One-shot health check of llama.cpp / Ollama |
