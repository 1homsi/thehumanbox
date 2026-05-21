# Quickstart

This 10-minute walkthrough goes capture → dataset → eval without
fine-tuning anything.

## 1. Install

```sh
cd lab
pip install -e ".[dev,trace]"
```

## 2. Capture some thoughts from a live sim

If the simulation is running at `http://localhost:8000`:

```sh
python scripts/capture_periodic.py \
    --url http://localhost:8000/snapshot \
    --interval 5 \
    --count 12 \
    --output datasets/quickstart/raw.jsonl
```

Twelve snapshots, five seconds apart. The output JSONL has one
serialised snapshot per line.

## 3. Convert to a thought dataset

```sh
python scripts/build_thought_dataset.py \
    --input datasets/quickstart/raw.jsonl \
    --output datasets/quickstart/thoughts.jsonl
```

Each line is now `{prompt, completion, scenario, org_id}`.

## 4. Filter + dedup + split

```sh
python scripts/prep_split.py \
    --input datasets/quickstart/thoughts.jsonl \
    --output-dir datasets/quickstart/split \
    --ratios 0.8 0.1 0.1
```

Produces `train.jsonl`, `val.jsonl`, `test.jsonl`.

## 5. Score with heuristics

```sh
python scripts/score_thoughts.py \
    --input datasets/quickstart/split/val.jsonl \
    --output datasets/quickstart/scored.jsonl \
    --dims coherence interest length
```

## 6. Evaluate two backends side-by-side

```sh
python -m thehumanbox_lab.cli eval-ab \
    --prompts datasets/quickstart/split/val.jsonl \
    --backend-a dummy \
    --backend-b ollama \
    --output datasets/quickstart/ab.json
```

## 7. Render a report

```sh
python scripts/build_report.py \
    --eval datasets/quickstart/ab.json \
    --output datasets/quickstart/report.html
open datasets/quickstart/report.html
```

You now have a captured dataset, scored thoughts, an A/B test, and an
HTML report ready to share.
