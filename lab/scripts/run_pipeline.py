#!/usr/bin/env python3
"""End-to-end orchestration of the thought-distillation pipeline.

Glues together the four existing stages so the distil→eval loop is
one command:

  1. trace_collector.py   — capture N seconds of organism thoughts
                            from a live simulation over /ws
  2. build_thought_dataset — group / filter / cap the raw traces
  3. prepare_sft_dataset   — turn into prompt/completion JSONL
  4. run_thought_eval      — run a baseline eval against the
                            prepared dataset

Each stage is run via the existing `thb-lab` CLI (see
src/thehumanbox_lab/cli.py). This script is intentionally a thin
sequencer — every real piece of logic lives in the underlying
modules so iterating on one stage doesn't require touching this
file.

Example:

    python lab/scripts/run_pipeline.py \\
        --url ws://localhost:8000/ws \\
        --duration 300 \\
        --workdir datasets/runs/$(date +%Y%m%d_%H%M%S) \\
        --eval-model gpt-4o-mini    # or any model your eval supports

After it finishes, the workdir contains:
    workdir/traces.jsonl          (raw)
    workdir/dataset.jsonl         (post build_thought_dataset)
    workdir/sft.jsonl             (post prepare_sft_dataset)
    workdir/eval.json             (post run_thought_eval)
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LAB = REPO / "lab"


def run(label: str, cmd: list[str]) -> None:
    """Run a subcommand and stream its output. Aborts on non-zero exit."""
    print(f"\n=== {label} ===", flush=True)
    print(" ".join(cmd), flush=True)
    res = subprocess.run(cmd, cwd=LAB)
    if res.returncode != 0:
        print(f"[run_pipeline] stage {label!r} failed (exit {res.returncode})", file=sys.stderr)
        sys.exit(res.returncode)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="ws://localhost:8000/ws",
                    help="WebSocket URL of the running sim")
    ap.add_argument("--duration", type=int, default=300,
                    help="Seconds to capture traces for (default 300)")
    ap.add_argument("--workdir", required=True,
                    help="Output directory (created if missing)")
    ap.add_argument("--eval-model", default=None,
                    help="Optional model name to evaluate (passed to "
                         "run_thought_eval). If omitted, skip the eval "
                         "step — useful when you just want a fresh "
                         "dataset without spending eval tokens.")
    args = ap.parse_args()

    workdir = Path(args.workdir).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    traces = workdir / "traces.jsonl"
    dataset = workdir / "dataset.jsonl"
    sft = workdir / "sft.jsonl"
    eval_out = workdir / "eval.json"

    # Stage 1: capture
    run("trace-collect", [
        sys.executable, "scripts/trace_collector.py",
        "--url", args.url,
        "--output", str(traces),
        "--duration", str(args.duration),
    ])
    if not traces.exists() or traces.stat().st_size == 0:
        print("[run_pipeline] trace-collect produced no output; aborting",
              file=sys.stderr)
        return 1

    # Stage 2: build thought dataset
    run("build-thought-dataset", [
        sys.executable, "scripts/build_thought_dataset.py",
        "--input", str(traces),
        "--output", str(dataset),
    ])

    # Stage 3: prepare SFT pairs
    run("prepare-sft-dataset", [
        sys.executable, "scripts/prepare_sft_dataset.py",
        "--input", str(dataset),
        "--output", str(sft),
    ])

    # Stage 4 (optional): eval
    if args.eval_model:
        run("run-thought-eval", [
            sys.executable, "scripts/run_thought_eval.py",
            "--dataset", str(sft),
            "--model", args.eval_model,
            "--output", str(eval_out),
        ])
    else:
        print("\n=== eval skipped (no --eval-model) ===")

    print("\n=== pipeline complete ===")
    print(f"workdir: {workdir}")
    for p, label in [
        (traces,   "traces"),
        (dataset,  "dataset"),
        (sft,      "sft"),
        (eval_out, "eval"),
    ]:
        if p.exists():
            print(f"  {label:8} {p.stat().st_size:>10} B  {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
