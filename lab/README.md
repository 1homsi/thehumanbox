# Lab

`lab/` is the Python workspace for intelligence tooling around The Human Box.

The simulation engine lives in Rust and remains the source of truth for world state, causality, and organism behavior. This workspace exists to support that engine with offline tooling: dataset preparation, evaluation, local model experiments, and packaging for small on-device or self-hosted models.

## Why this exists

The Human Box is trying to grow into a long-running synthetic world, not a scripted toy. That means any model work has to be held to a higher standard than "sounds smart in a demo." The purpose of `lab/` is to make that work measurable.

This workspace is for:

- preparing datasets from simulation traces
- defining repeatable evaluation cases
- testing small local models for narrow tasks
- benchmarking local inference stacks such as Ollama and llama.cpp
- building tooling that helps study the simulation without quietly taking control of it

## Principles

- World logic stays in `simulation/`
- Models should prefer structure over theatrics
- Evaluation matters more than vibes
- Local inference should be cheap enough to run continuously
- Any model integration should preserve emergence rather than replace it

## Current capabilities

The first scaffold includes a few practical utilities:

- `build_thought_dataset.py`
  Turns organism trace JSONL into supervised thought examples
- `inspect_jsonl.py`
  Prints quick stats for any JSONL dataset
- `probe_local_stack.py`
  Checks for local inference tools like Python, Ollama, and llama.cpp
- `run_thought_eval.py`
  Scores a baseline or Ollama model on a thought-eval dataset
- `sweep_thought_eval.py`
  Compares multiple local models on the same eval set
- `capture_teacher_thoughts.py`
  Generates distillation-ready JSONL from a teacher model
- `prepare_sft_dataset.py`
  Converts teacher JSONL into train and validation chat-format files
- `plan_train_run.py`
  Writes a starter LoRA fine-tune manifest for the current dataset
- `show_models.py`
  Shows the current local model registry

## Quick start

```bash
cd lab
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run the included checks:

```bash
python scripts/probe_local_stack.py
python scripts/inspect_jsonl.py datasets/eval/sample_trace.jsonl
python scripts/build_thought_dataset.py \
  --input datasets/eval/sample_trace.jsonl \
  --output datasets/generated/sample_thoughts.jsonl
python scripts/run_thought_eval.py \
  --input evals/sample_thought_eval.jsonl \
  --engine baseline
python scripts/sweep_thought_eval.py \
  --input evals/sample_thought_eval.jsonl \
  --include-baseline
python scripts/prepare_sft_dataset.py \
  --input datasets/generated/gemma3_teacher_thoughts.jsonl \
  --train-output datasets/generated/thought_sft_train.jsonl \
  --valid-output datasets/generated/thought_sft_valid.jsonl
python scripts/plan_train_run.py \
  --train-file datasets/generated/thought_sft_train.jsonl \
  --valid-file datasets/generated/thought_sft_valid.jsonl \
  --output experiments/thought_gemma3_270m_lora_v1.json
```

## Example workflow

1. Export or collect simulation traces as JSONL
2. Build a task-specific dataset
3. Inspect the result and freeze eval cases
4. Run a baseline and local model against those evals
5. Capture the best teacher outputs into a distillation dataset
6. Convert the teacher set into train and validation SFT files
7. Generate a reproducible training manifest
8. Only then consider wiring a model back into the sim

## Model registry

`models/registry.json` is the first place where we track which local model targets we care about. It is intentionally simple right now, but it gives us a stable place to record candidates, runtimes, and roles before model packaging starts branching out.

## Distillation path

The intended workflow now looks like this:

1. Build or collect thought examples
2. Sweep installed local models against the same eval set
3. Pick the best teacher for a narrow task
4. Capture teacher outputs into JSONL
5. Convert that data into train and validation SFT format
6. Fine-tune a smaller task model on the distilled set

## Data shape

The included sample trace uses one JSON object per line with fields like:

```json
{
  "tick": 1200,
  "organism_id": "org-1",
  "organism_name": "Aren",
  "lineage_id": "lineage-south",
  "event_type": "danger",
  "state": {
    "energy": 0.42,
    "hydration": 0.91,
    "health": 0.88,
    "fear": 0.73,
    "curiosity": 0.34
  },
  "text": "saw deep water and backed away"
}
```

This format is intentionally simple so we can evolve it with the simulation instead of locking ourselves into a premature training pipeline.

## Bridging lab/ back into the simulation

The simulation already exposes a per-org reasoning hook through `ThinkTrigger` / `ThinkResult` (see `simulation/think_worker.rs`). Most scenarios resolve locally via `local_think.rs` without any LLM call; only the `elder_teaching` scenario currently goes to a chat-completions endpoint.

When you're ready to wire a distilled model in, the integration point is straightforward:

1. Train a small task-specific model on a JSONL captured here.
2. Serve it through any OpenAI-compatible endpoint (vLLM, llama.cpp's server, Ollama with an `OPENAI_API_BASE`, etc.).
3. Point the simulation at it by setting `LLM_URL` and optionally `LLM_MODEL`. The existing client primitives in `simulation/llm.rs` already speak that protocol.
4. Resist the urge to route _everything_ through the model. The local resolver in `local_think.rs` handles weighted-pick scenarios deterministically and is much cheaper. Only push to the model the scenarios that genuinely benefit from generated text.

The goal is augmentation, not replacement. The Rust simulation owns causality; lab/ ships small models that flavor specific moments. Anything that smells like "let the model decide every action" is the wrong layer.

## Roadmap

Active threads of work, in rough priority:

- `thought_eval`: scoring how well a small model picks a thought-line consistent with state. Existing eval set is a starting point; needs more cases pulled from real headless traces.
- `narration_eval`: end-of-day story generation. The simulation already falls back to a stitched-from-life-log story when the LLM is unreachable, so this is a quality bar, not a feature gate.
- `invention_eval`: given prerequisites, pick the most plausible next invention. Currently the local resolver picks uniformly at random from candidates — a model that biases toward culturally coherent picks (cooking before stone_tools when fire is dominant) is the goal.
- `trace_collector.py`: helper to subscribe to the running simulation's WS feed and write thought events to disk continuously. Not yet implemented.

If you add anything here, update this list so future you (or another collaborator) can see what's been tried.
