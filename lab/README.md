# Lab

`lab/` is the Python workspace for intelligence tooling around The
Human Box.

The simulation engine lives in Rust and remains the source of truth
for world state, causality, and organism behaviour. This workspace
exists to support that engine with offline tooling: dataset
preparation, evaluation, local model experiments, and packaging for
small on-device or self-hosted models.

## Why this exists

The Human Box is a long-running synthetic world, not a scripted toy.
Any model work has to be held to a higher standard than "sounds smart
in a demo". The purpose of `lab/` is to make that work measurable.

This workspace is for:

- preparing datasets from simulation traces
- defining repeatable evaluation cases
- testing small local models for narrow tasks
- benchmarking local inference stacks such as Ollama and llama.cpp
- building tooling that helps study the simulation without quietly
  taking control of it

## Principles

- World logic stays in `simulation/`
- Models should prefer structure over theatrics
- Evaluation matters more than vibes
- Local inference should be cheap enough to run continuously
- Any model integration should preserve emergence rather than replace it

## Current capabilities

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
- `trace_collector.py`
  Subscribes to a running simulation's WebSocket and streams
  per-organism thought events to JSONL
- `show_models.py`
  Shows the current local model registry

## Quick start

```bash
cd lab
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev,trace,inference]"
```

Run the included checks:

```bash
make smoke    # build a tiny dataset and inspect it
make eval     # run the thought eval against the dummy backend
make pipeline # full end-to-end into runs/<timestamp>/
```

## Example workflow

1. Collect simulation traces as JSONL (live via `trace_collector.py`,
   or from headless runs)
2. Build a task-specific dataset
3. Inspect the result and freeze eval cases
4. Run a baseline and local model against those evals
5. Capture the best teacher outputs into a distillation dataset
6. Convert the teacher set into train and validation SFT files
7. Generate a reproducible training manifest
8. Only then consider wiring a model back into the sim

## Action vocabulary

The simulation's action space has grown wide — thousands of distinct
actions across dozens of categories (agriculture, hunting, weaving,
brewing, distillation, journalism, fashion, retail, cafe work, tech
devops, religion, warfare, diplomacy, governance, childhood, elder
life, and more). The dataset tooling treats `event_type` as an opaque
string, so new categories flow through transparently — but the
baseline scorer in `baseline.py` and the synthetic templates in
`synth/template_thoughts.py` only know the older vocabulary and
fall through to defaults for newer categories. Worth refreshing
before any serious eval work.

The eval set and capture pipeline currently runs against a small
sample trace. Re-capturing from a live headless run with the current
action vocabulary is the recommended starting point before training.

## Model registry

`models/registry.json` is where we track which local model targets we
care about. Intentionally simple right now — a stable place to record
candidates, runtimes, and roles before model packaging starts
branching out.

## Distillation path

The intended workflow is:

1. Build or collect thought examples
2. Sweep installed local models against the same eval set
3. Pick the best teacher for a narrow task
4. Capture teacher outputs into JSONL
5. Convert that data into train and validation SFT format
6. Fine-tune a smaller task model on the distilled set

## Data shape

One JSON object per line:

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

This format is intentionally simple so it can evolve with the
simulation instead of locking the training pipeline into a premature
schema.

## Bridging lab/ back into the simulation

The simulation exposes a per-org reasoning hook through
`ThinkTrigger` / `ThinkResult` (see `simulation/think_worker.rs`).
Most scenarios resolve locally without any LLM call; only specific
scenarios reach out to a chat-completions endpoint.

When you're ready to wire a distilled model in:

1. Train a small task-specific model on JSONL captured here.
2. Serve it through any OpenAI-compatible endpoint (vLLM, llama.cpp's
   server, Ollama with an `OPENAI_API_BASE`, etc.).
3. Point the simulation at it by setting `LLM_URL` and optionally
   `LLM_MODEL`. The existing client primitives in `simulation/llm.rs`
   already speak that protocol.
4. Resist routing _everything_ through the model. The local resolver
   in `local_think.rs` handles weighted-pick scenarios
   deterministically and is much cheaper. Only push to the model the
   scenarios that genuinely benefit from generated text.

The goal is augmentation, not replacement. The Rust simulation owns
causality; `lab/` ships small models that flavour specific moments.

## Roadmap

Active threads of work, in rough priority:

- `thought_eval`: scoring how well a small model picks a thought-line
  consistent with state. Existing eval set is a starting point; needs
  more cases pulled from real headless traces covering the new
  category vocabulary.
- `narration_eval`: end-of-day story generation. The simulation
  already falls back to a stitched-from-life-log story when the LLM
  is unreachable, so this is a quality bar, not a feature gate.
- `invention_eval`: given prerequisites, pick the most plausible next
  invention. The local resolver currently picks uniformly at random
  from candidates — a model that biases toward culturally coherent
  picks (cooking before stone_tools when fire is dominant, brewing
  after agriculture, distillation after brewing) is the goal.
- `baseline` and `synth/template_thoughts.py` need their event_type
  branches refreshed to cover the wider action vocabulary.

If you add anything here, update this list so future you (or another
collaborator) can see what's been tried.
