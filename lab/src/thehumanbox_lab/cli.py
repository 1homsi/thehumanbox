from __future__ import annotations

import argparse
import json
from pathlib import Path

from .backends import KNOWN_BACKENDS, get_backend
from .backends.health import probe_all
from .dataset_builder import build_thought_examples
from .eval import bench, compare_bench, judge_dataset, render_html, run_ab
from .eval_runner import baseline_engine, ollama_engine, run_eval, run_sweep
from .jsonl import read_jsonl, write_jsonl
from .local_stack import probe_stack
from .model_registry import candidate_ollama_models, load_registry_with_runtime
from .ollama_client import generate as ollama_generate
from .pair_builder import build_pairs
from .schemas import ThoughtExample, TraceEvent
from .split import split_summary, stratified_split
from .task_specs import THOUGHT_V1
from .teacher_dataset import build_distillation_rows
from .token_budget import estimate_dataset
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

    prep_pairs = subparsers.add_parser("prep-dpo-pairs", help="Build chosen/rejected preference pairs")
    prep_pairs.add_argument("--input", required=True)
    prep_pairs.add_argument("--output", required=True)
    prep_pairs.add_argument("--strategy", choices=["auto", "temperature", "score"], default="auto")
    prep_pairs.add_argument("--score-key", default="score")
    prep_pairs.add_argument("--low-max", type=float, default=0.4)
    prep_pairs.add_argument("--high-min", type=float, default=0.8)
    prep_pairs.add_argument("--min-gap", type=float, default=0.0)

    prep_split = subparsers.add_parser("prep-split", help="Stratified train/val/test split")
    prep_split.add_argument("--input", required=True)
    prep_split.add_argument("--train-output", required=True)
    prep_split.add_argument("--valid-output", required=True)
    prep_split.add_argument("--test-output", required=True)
    prep_split.add_argument("--key", default="scenario")
    prep_split.add_argument("--ratios", nargs=3, type=float, default=[0.8, 0.1, 0.1])
    prep_split.add_argument("--seed", type=int, default=42)

    estimate = subparsers.add_parser("estimate-tokens", help="Estimate token counts for a dataset")
    estimate.add_argument("--input", required=True)
    estimate.add_argument("--formatter", default="chatml")
    estimate.add_argument("--output", default=None)

    eval_ab = subparsers.add_parser("eval-ab", help="Run A/B comparison between two Ollama models")
    eval_ab.add_argument("--input", required=True)
    eval_ab.add_argument("--model-a", required=True)
    eval_ab.add_argument("--model-b", required=True)
    eval_ab.add_argument("--output", default=None)
    eval_ab.add_argument("--limit", type=int, default=0)

    eval_judge = subparsers.add_parser("eval-judge", help="LLM-as-judge pairwise comparison")
    eval_judge.add_argument("--input", required=True)
    eval_judge.add_argument("--model-a", required=True)
    eval_judge.add_argument("--model-b", required=True)
    eval_judge.add_argument("--judge-model", required=True)
    eval_judge.add_argument("--output", default=None)
    eval_judge.add_argument("--limit", type=int, default=0)

    eval_bench = subparsers.add_parser("eval-bench", help="Latency benchmark for one or more Ollama models")
    eval_bench.add_argument("--input", required=True)
    eval_bench.add_argument("--models", nargs="+", required=True)
    eval_bench.add_argument("--warmup", type=int, default=1)
    eval_bench.add_argument("--limit", type=int, default=0)
    eval_bench.add_argument("--output", default=None)

    eval_report = subparsers.add_parser("eval-report", help="Render a JSON eval report as standalone HTML")
    eval_report.add_argument("--input", required=True)
    eval_report.add_argument("--output", required=True)
    eval_report.add_argument("--title", default="Eval Report")

    backend = subparsers.add_parser("backend", help="Inference backend utilities")
    backend_sub = backend.add_subparsers(dest="backend_command", required=True)
    backend_probe = backend_sub.add_parser("probe", help="Probe all known inference backends")
    backend_probe.add_argument("--names", nargs="*", default=None)
    backend_bench = backend_sub.add_parser("bench", help="Bench latency across available backends")
    backend_bench.add_argument("--names", nargs="*", default=None)
    backend_bench.add_argument("--prompt", default="Say hello in five words.")
    backend_bench.add_argument("--repeat", type=int, default=3)

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
    train_teacher, valid_teacher = split_rows(teacher_rows, validation_ratio=args.validation_ratio)
    train_rows = teacher_rows_to_sft(train_teacher)
    valid_rows = teacher_rows_to_sft(valid_teacher)
    write_jsonl(args.train_output, train_rows)
    write_jsonl(args.valid_output, valid_rows)
    print(
        json.dumps(
            {
                "total": len(train_rows) + len(valid_rows),
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

def cmd_prep_dpo_pairs(args: argparse.Namespace) -> int:
    records = list(read_jsonl(args.input))
    pairs = build_pairs(
        records,
        strategy=args.strategy,
        score_key=args.score_key,
        low_max=args.low_max,
        high_min=args.high_min,
        min_gap=args.min_gap,
    )
    write_jsonl(args.output, pairs)
    print(json.dumps({"input": len(records), "pairs": len(pairs)}, indent=2))
    return 0

def cmd_prep_split(args: argparse.Namespace) -> int:
    records = list(read_jsonl(args.input))
    ratios = tuple(args.ratios)
    train, valid, test = stratified_split(
        records, key=args.key, ratios=(ratios[0], ratios[1], ratios[2]), seed=args.seed
    )
    write_jsonl(args.train_output, train)
    write_jsonl(args.valid_output, valid)
    write_jsonl(args.test_output, test)
    print(json.dumps(split_summary((train, valid, test)), indent=2))
    return 0

def cmd_estimate_tokens(args: argparse.Namespace) -> int:
    records = list(read_jsonl(args.input))
    stats = estimate_dataset(records, formatter=args.formatter)
    payload = {"formatter": args.formatter, "stats": stats}
    print(json.dumps(payload, indent=2))
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return 0

def _load_eval_prompts(path: str, limit: int) -> tuple[list[str], list[str]]:
    examples = [ThoughtExample.from_row(row) for row in read_jsonl(path)]
    if limit and limit > 0:
        examples = examples[:limit]
    prompts = [ex.prompt for ex in examples]
    refs = [ex.response for ex in examples]
    return prompts, refs


def _write_json(path: str, payload: dict) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def cmd_eval_ab(args: argparse.Namespace) -> int:
    prompts, refs = _load_eval_prompts(args.input, args.limit)
    report = run_ab(
        ollama_engine(args.model_a),
        ollama_engine(args.model_b),
        prompts,
        references=refs,
        name_a=args.model_a,
        name_b=args.model_b,
    )
    print(json.dumps(report["summary"], indent=2))
    if args.output:
        _write_json(args.output, report)
        print(f"wrote ab report -> {args.output}")
    return 0


def cmd_eval_judge(args: argparse.Namespace) -> int:
    prompts, _ = _load_eval_prompts(args.input, args.limit)
    fn_a = ollama_engine(args.model_a)
    fn_b = ollama_engine(args.model_b)
    responses_a = [fn_a(p) for p in prompts]
    responses_b = [fn_b(p) for p in prompts]

    def judge_fn(system: str, prompt: str) -> str:
        return ollama_generate(model=args.judge_model, prompt=prompt, system=system, temperature=0.0)

    report = judge_dataset(prompts, responses_a, responses_b, judge_fn)
    report["model_a"] = args.model_a
    report["model_b"] = args.model_b
    report["judge_model"] = args.judge_model
    print(json.dumps(report["summary"], indent=2))
    if args.output:
        _write_json(args.output, report)
        print(f"wrote judge report -> {args.output}")
    return 0


def cmd_eval_bench(args: argparse.Namespace) -> int:
    prompts, _ = _load_eval_prompts(args.input, args.limit)
    models = {name: ollama_engine(name) for name in args.models}
    report = compare_bench(models, prompts, warmup=args.warmup)
    print(json.dumps({"leaderboard": report["leaderboard"]}, indent=2))
    if args.output:
        _write_json(args.output, report)
        print(f"wrote bench report -> {args.output}")
    return 0


def cmd_eval_report(args: argparse.Namespace) -> int:
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    html_text = render_html(payload, title=args.title)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_text, encoding="utf-8")
    print(f"wrote html report -> {args.output}")
    return 0


def cmd_backend(args: argparse.Namespace) -> int:
    import time

    names = args.names or list(KNOWN_BACKENDS)
    if args.backend_command == "probe":
        report = probe_all(names)
        print(json.dumps(report, indent=2))
        return 0
    if args.backend_command == "bench":
        results: dict[str, dict] = {}
        for name in names:
            try:
                backend = get_backend(name)
            except Exception as exc:
                results[name] = {"available": False, "error": f"init: {exc}"}
                continue
            try:
                if not backend.health():
                    results[name] = {"available": False, "error": "health check failed"}
                    continue
            except Exception as exc:
                results[name] = {"available": False, "error": f"health: {exc}"}
                continue
            latencies: list[float] = []
            error: str | None = None
            for _ in range(max(1, args.repeat)):
                start = time.perf_counter()
                try:
                    backend.complete(args.prompt, max_tokens=32, temperature=0.0)
                except Exception as exc:
                    error = f"complete: {exc}"
                    break
                latencies.append((time.perf_counter() - start) * 1000.0)
            entry: dict = {"available": error is None, "runs": len(latencies)}
            if latencies:
                entry["latency_ms_avg"] = round(sum(latencies) / len(latencies), 2)
                entry["latency_ms_min"] = round(min(latencies), 2)
                entry["latency_ms_max"] = round(max(latencies), 2)
            if error:
                entry["error"] = error
            results[name] = entry
        print(json.dumps(results, indent=2))
        return 0
    raise ValueError(f"unknown backend command: {args.backend_command}")

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
        "prep-dpo-pairs": cmd_prep_dpo_pairs,
        "prep-split": cmd_prep_split,
        "estimate-tokens": cmd_estimate_tokens,
        "eval-ab": cmd_eval_ab,
        "eval-judge": cmd_eval_judge,
        "eval-bench": cmd_eval_bench,
        "eval-report": cmd_eval_report,
        "backend": cmd_backend,
    }
    return handlers[args.command](args)

if __name__ == "__main__":
    raise SystemExit(main())
