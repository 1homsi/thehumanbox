from __future__ import annotations

from statistics import mean
from typing import Iterable


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


def _index_by_id(rows: Iterable[dict], score_key: str) -> dict[str, float]:
    indexed: dict[str, float] = {}
    for row in rows:
        item_id = (
            row.get("id")
            or row.get("organism_id")
            or row.get("prompt_id")
            or row.get("prompt")
        )
        if item_id is None:
            continue
        value = row.get(score_key)
        if isinstance(value, (int, float)):
            indexed[str(item_id)] = float(value)
    return indexed


def compute_drift(
    baseline: list[dict],
    current: list[dict],
    score_key: str = "score",
    top_k: int = 10,
) -> dict[str, object]:
    base = _index_by_id(baseline, score_key)
    curr = _index_by_id(current, score_key)
    shared = sorted(set(base) & set(curr))
    deltas = [curr[i] - base[i] for i in shared]
    base_values = [base[i] for i in shared]
    curr_values = [curr[i] for i in shared]
    summary = {
        "n_shared": float(len(shared)),
        "n_baseline_only": float(len(set(base) - set(curr))),
        "n_current_only": float(len(set(curr) - set(base))),
        "baseline_mean": mean(base_values) if base_values else 0.0,
        "current_mean": mean(curr_values) if curr_values else 0.0,
        "mean_delta": mean(deltas) if deltas else 0.0,
        "baseline_p95": _percentile(base_values, 0.95),
        "current_p95": _percentile(curr_values, 0.95),
        "p95_delta": _percentile(curr_values, 0.95) - _percentile(base_values, 0.95),
        "regressions": float(sum(1 for d in deltas if d < 0)),
        "improvements": float(sum(1 for d in deltas if d > 0)),
    }
    movers = sorted(
        (
            {
                "id": item_id,
                "baseline": base[item_id],
                "current": curr[item_id],
                "delta": curr[item_id] - base[item_id],
            }
            for item_id in shared
        ),
        key=lambda r: abs(r["delta"]),
        reverse=True,
    )
    return {"summary": summary, "top_movers": movers[:top_k]}
