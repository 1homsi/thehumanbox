from __future__ import annotations

import argparse
import json
from pathlib import Path

from .dataset_builder import build_thought_examples
from .eval_runner import baseline_engine, ollama_engine, run_eval, run_sweep
from .jsonl import read_jsonl, write_jsonl
from .local_stack import probe_stack
from .model_registry import candidate_ollama_models, load_registry_with_runtime
from .schemas import ThoughtExample, TraceEvent
from .task_specs import THOUGHT_V1
from .teacher_dataset import build_distillation_rows
from .train_manifest import default_manifest
from .train_prep import split_rows, teacher_rows_to_sft


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="thb-lab", description="The Human Box lab tooling")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_dataset = subparsers.add_parser("build-thought-dataset", help="Build thought dataset from trace JSONL")
    build_dataset.add_argument("--input", required=True)
    build_dataset.add_argument("--output", required=True)
    build_dataset.add_argument("--window", type=int, default=4)

    inspect = subparsers.add_parser("inspect-jsonl", help="Inspect a JSONL dataset")
    inspect.add_argument("path")

    probe = subparsers.add_parser("probe-stack", help="Probe local inference tooling")

    models = subparsers.add_parser("show-models", help="Show local model registry")
    models.add_argument("--registry", default=None)

    run_thought_eval = subparsers.add_parser("run-thought-eval", help="Run thought eval against a baseline or Ollama model")
    run_thought_eval.add_argument("--input", required=True)
    run_thought_eval.add_argument("--engine", choices=["baseline", "ollama"], default="baseline")
    run_thought_eval.add_argument("--model", default="gemma3:270m")
    run_thought_eval.add_argument("--output", default=None)

    sweep_eval = subparsers.add_parser("sweep-thought-eval", help="Run the thought eval across multiple local models")
    sweep_eval.add_argument("--input", required=True)
    sweep_eval.add_argument("--models", nargs="*", default=None, help="Explicit Ollama model names; defaults to installed candidates")
    sweep_eval.add_argument("--include-baseline", action="store_true")
    sweep_eval.add_argument("--output", default=None)

    capture_teacher = subparsers.add_parser("capture-teacher-thoughts", help="Generate distillation-ready teacher outputs")
    capture_teacher.add_argument("--input", required=True)
    capture_teacher.add_argument("--model", required=True)
    capture_teacher.add_argument("--output", required=True)

    prepare_sft = subparsers.add_parser("prepare-sft-dataset", help="Convert teacher JSONL into train and validation SFT files")
    prepare_sft.add_argument("--input", required=True)
    prepare_sft.add_argument("--train-output", required=True)
    prepare_sft.add_argument("--valid-output", required=True)
    prepare_sft.add_argument("--validation-ratio", type=float, default=0.15)

    plan_train = subparsers.add_parser("plan-train-run", help="Write a starter fine-tuning manifest")
    plan_train.add_argument("--train-file", required=True)
    plan_train.add_argument("--valid-file", required=True)
    plan_train.add_argument("--output", required=True)
    plan_train.add_argument("--base-model", default="google/gemma-3-270m")
    plan_train.add_argument("--run-name", default="thought-gemma3-270m-lora-v1")

    return parser


def cmd_build_thought_dataset(args: argparse.Namespace) -> int:
    events = [TraceEvent.from_row(row) for row in read_jsonl(args.input)]
    examples = build_thought_examples(events, window=args.window, task_spec=THOUGHT_V1)
    write_jsonl(args.output, (example.to_row() for example in examples))
    print(f"built {len(examples)} thought examples -> {args.output}")
    return 0


def cmd_inspect_jsonl(args: argparse.Namespace) -> int:
    rows = list(read_jsonl(args.path))
    keys: dict[str, int] = {}
    event_types: dict[str, int] = {}
    organisms: set[str] = set()
    for row in rows:
        for key in row:
            keys[key] = keys.get(key, 0) + 1
        if "event_type" in row:
            event_type = str(row["event_type"])
            event_types[event_type] = event_types.get(event_type, 0) + 1
        if "organism_id" in row:
            organisms.add(str(row["organism_id"]))

    print(f"rows: {len(rows)}")
    print(f"keys: {json.dumps(keys, sort_keys=True)}")
    if event_types:
        print(f"event types: {json.dumps(event_types, sort_keys=True)}")
    if organisms:
        print(f"organisms: {len(organisms)} unique")
    return 0


def cmd_probe_stack(_: argparse.Namespace) -> int:
    for key, value in probe_stack().items():
        print(f"{key}: {value}")
    return 0


def cmd_show_models(args: argparse.Namespace) -> int:
    registry = load_registry_with_runtime(args.registry)
    print(json.dumps(registry, indent=2))
    return 0


def cmd_run_thought_eval(args: argparse.Namespace) -> int:
    examples = [ThoughtExample.from_row(row) for row in read_jsonl(args.input)]
    engine = baseline_engine if args.engine == "baseline" else ollama_engine(args.model)
    summary, predictions = run_eval(examples, engine)
    print(json.dumps(summary, indent=2))
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(
                {
                    "summary": summary,
                    "predictions": [prediction.to_row() for prediction in predictions],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"wrote report -> {args.output}")
    return 0


def cmd_sweep_thought_eval(args: argparse.Namespace) -> int:
    examples = [ThoughtExample.from_row(row) for row in read_jsonl(args.input)]
    models = args.models or candidate_ollama_models()
    engines = {}
    if args.include_baseline:
        engines["baseline"] = baseline_engine
    for model in models:
        engines[f"ollama:{model}"] = ollama_engine(model)

    results = run_sweep(examples, engines)
    print(json.dumps({"results": results}, indent=2))
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps({"results": results}, indent=2), encoding="utf-8")
        print(f"wrote report -> {args.output}")
    return 0


def cmd_capture_teacher_thoughts(args: argparse.Namespace) -> int:
    examples = [ThoughtExample.from_row(row) for row in read_jsonl(args.input)]
    summary, predictions = run_eval(examples, ollama_engine(args.model, task_spec=THOUGHT_V1))
    rows = build_distillation_rows(
        examples, predictions, teacher_model=args.model, task_spec=THOUGHT_V1
    )
    write_jsonl(args.output, rows)
    print(json.dumps(summary, indent=2))
    print(f"wrote teacher dataset -> {args.output}")
    return 0


def cmd_prepare_sft_dataset(args: argparse.Namespace) -> int:
    teacher_rows = list(read_jsonl(args.input))
    sft_rows = teacher_rows_to_sft(teacher_rows)
    train_rows, valid_rows = split_rows(sft_rows, validation_ratio=args.validation_ratio)
    write_jsonl(args.train_output, train_rows)
    write_jsonl(args.valid_output, valid_rows)
    print(
        json.dumps(
            {
                "total": len(sft_rows),
                "train": len(train_rows),
                "valid": len(valid_rows),
                "validation_ratio": args.validation_ratio,
            },
            indent=2,
        )
    )
    return 0


def cmd_plan_train_run(args: argparse.Namespace) -> int:
    manifest = default_manifest(
        train_file=args.train_file,
        valid_file=args.valid_file,
        base_model=args.base_model,
        run_name=args.run_name,
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest.to_row(), indent=2), encoding="utf-8")
    print(f"wrote train manifest -> {args.output}")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    handlers = {
        "build-thought-dataset": cmd_build_thought_dataset,
        "inspect-jsonl": cmd_inspect_jsonl,
        "probe-stack": cmd_probe_stack,
        "show-models": cmd_show_models,
        "run-thought-eval": cmd_run_thought_eval,
        "sweep-thought-eval": cmd_sweep_thought_eval,
        "capture-teacher-thoughts": cmd_capture_teacher_thoughts,
        "prepare-sft-dataset": cmd_prepare_sft_dataset,
        "plan-train-run": cmd_plan_train_run,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
