from __future__ import annotations

from collections.abc import Iterable

from . import aggregator, calibrator, coherence, interest, judge_rubric, length, persona, registry

DEFAULT_DIMS = ["coherence", "interest", "length"]


def score(text: str, dims: Iterable[str] = DEFAULT_DIMS) -> dict[str, float]:
    results: dict[str, float] = {}
    for dim in dims:
        scorer = registry.get(dim)
        results[dim] = float(scorer(text))
    return results


__all__ = [
    "DEFAULT_DIMS",
    "aggregator",
    "calibrator",
    "coherence",
    "interest",
    "judge_rubric",
    "length",
    "persona",
    "registry",
    "score",
]
