from __future__ import annotations

import time
from statistics import mean
from typing import Callable


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    k = (len(ordered) - 1) * pct
    lo = int(k)
    hi = min(lo + 1, len(ordered) - 1)
    frac = k - lo
    return ordered[lo] + (ordered[hi] - ordered[lo]) * frac


def bench(
    model_fn: Callable[[str], str],
    prompts: list[str],
    warmup: int = 0,
    label: str = "model",
) -> dict[str, object]:
    if warmup > 0 and prompts:
        for _ in range(warmup):
            model_fn(prompts[0])
    latencies: list[float] = []
    outputs: list[str] = []
    errors = 0
    wall_start = time.perf_counter()
    for prompt in prompts:
        started = time.perf_counter()
        try:
            out = model_fn(prompt)
        except Exception:
            errors += 1
            latencies.append((time.perf_counter() - started) * 1000.0)
            outputs.append("")
            continue
        latencies.append((time.perf_counter() - started) * 1000.0)
        outputs.append(out)
    wall_total = max(time.perf_counter() - wall_start, 1e-9)
    summary = {
        "label": label,
        "count": float(len(prompts)),
        "errors": float(errors),
        "avg_ms": mean(latencies) if latencies else 0.0,
        "p50_ms": _percentile(latencies, 0.50),
        "p95_ms": _percentile(latencies, 0.95),
        "p99_ms": _percentile(latencies, 0.99),
        "min_ms": min(latencies) if latencies else 0.0,
        "max_ms": max(latencies) if latencies else 0.0,
        "throughput_per_s": len(prompts) / wall_total,
        "wall_seconds": wall_total,
    }
    return {"summary": summary, "latencies_ms": latencies, "outputs": outputs}


def compare_bench(
    models: dict[str, Callable[[str], str]],
    prompts: list[str],
    warmup: int = 0,
) -> dict[str, object]:
    results = {label: bench(fn, prompts, warmup=warmup, label=label) for label, fn in models.items()}
    leaderboard = sorted(
        (r["summary"] for r in results.values()),
        key=lambda s: float(s["p95_ms"]),
    )
    return {"results": results, "leaderboard": leaderboard}
