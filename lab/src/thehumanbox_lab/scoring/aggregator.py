from __future__ import annotations

from collections.abc import Mapping


def normalize_weights(weights: Mapping[str, float]) -> dict[str, float]:
    total = sum(max(0.0, float(value)) for value in weights.values())
    if total <= 0.0:
        if not weights:
            return {}
        share = 1.0 / len(weights)
        return {key: share for key in weights}
    return {key: max(0.0, float(value)) / total for key, value in weights.items()}


def composite(scores: Mapping[str, float], weights: Mapping[str, float]) -> float:
    if not scores:
        return 0.0
    if not weights:
        weights = {key: 1.0 for key in scores}
    normalized = normalize_weights(weights)
    total = 0.0
    used = 0.0
    for key, value in scores.items():
        weight = normalized.get(key)
        if weight is None:
            continue
        total += float(value) * weight
        used += weight
    if used <= 0.0:
        return 0.0
    return max(0.0, min(1.0, total / used))


def stack(rows: list[Mapping[str, float]], weights: Mapping[str, float]) -> list[float]:
    return [composite(row, weights) for row in rows]
