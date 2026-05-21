# Data formats

All datasets and intermediate artifacts are JSONL (one JSON object per
line). The schemas below describe each one.

## Raw trace

Produced by `capture_periodic.py` and `trace_collector.py`. Each line is
a serialised world snapshot (see `simulation/sim/serialize.rs` for the
exhaustive shape). Important fields:

```jsonc
{
  "tick": 12345,
  "is_day": true,
  "day_progress": 0.42,
  "season": "abundance",
  "drought": false,
  "weather": {"kind": "clear", "intensity": 0.0, "wind_x": 0.0, "wind_y": 0.0},
  "organisms": [...],      // alive orgs, AoS in full frames, SoA in deltas
  "animals": [...],
  "events": [...],         // recent world events
  "history": {...},        // tick counters
  "lineage_names": {...},
  "lineage_centroid_history": {...},
  "lineage_homes": {...}
}
```

## Thought dataset

Produced by `build_thought_dataset.py`. One row per organism thought:

```json
{
  "prompt": "You are an organism, named Tila, generation 3...",
  "completion": "wandering the cursed land",
  "scenario": "restless",
  "org_id": "abc123",
  "tick": 12345
}
```

## SFT formatted dataset

Output of `prepare_sft_dataset.py --format chatml`:

```json
{"messages": [
  {"role": "system", "content": "You are an organism..."},
  {"role": "user", "content": "Where do you go now?"},
  {"role": "assistant", "content": "wandering the cursed land"}
]}
```

llama3 / alpaca / openai formats are similar shape changes.

## DPO pair

```json
{
  "prompt": "...",
  "chosen": "wandering the cursed land",
  "rejected": "asdf zxcv qwer"
}
```

## Scored thoughts

```json
{
  "prompt": "...",
  "completion": "...",
  "score": {"coherence": 0.81, "interest": 0.62, "length": 1.0},
  "composite": 0.79
}
```

## Eval result

```json
{
  "config": {"backend_a": "ollama", "backend_b": "llamacpp"},
  "results": [
    {"prompt": "...", "a": "...", "b": "...", "winner": "a", "judge_reason": "..."}
  ],
  "summary": {"a_wins": 12, "b_wins": 8, "ties": 4}
}
```

## Training manifest v2

```json
{
  "base_model": "google/gemma-2-2b-it",
  "dataset_path": "...",
  "dataset_hash": "sha256:...",
  "lora_config": {"r": 16, "alpha": 32, "dropout": 0.05},
  "lora_config_hash": "...",
  "eval_baseline_score": 0.62,
  "git_sha": "...",
  "train_started_at": "...",
  "train_finished_at": "...",
  "final_loss": 1.34,
  "peak_eval_score": 0.71,
  "hardware": "a10g x1"
}
```

## Model registry entry

See `lab/models/registry.json`. Each entry:

```json
{
  "name": "gemma-2-2b-it",
  "family": "gemma2",
  "params_b": 2.0,
  "base_url_pattern": "huggingface.co/google/gemma-2-2b-it",
  "license": "Gemma Terms of Use",
  "quantization": ["Q4_K_M", "Q5_K_M", "Q8_0"],
  "default_temp": 0.7,
  "default_max_tokens": 256,
  "cost_per_million_tokens": null,
  "source": "https://huggingface.co/google/gemma-2-2b-it",
  "eval_baseline_score": null,
  "last_updated": "2026-05-21"
}
```
