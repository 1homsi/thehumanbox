from __future__ import annotations

from collections.abc import Callable

from . import coherence, interest, length

Scorer = Callable[[str], float]

REGISTRY: dict[str, Scorer] = {
    "coherence": coherence.score,
    "interest": interest.score,
    "length": length.score,
}


def get(name: str) -> Scorer:
    if name not in REGISTRY:
        raise KeyError(f"unknown scorer: {name}")
    return REGISTRY[name]


def register(name: str, scorer: Scorer) -> None:
    REGISTRY[name] = scorer


def names() -> list[str]:
    return sorted(REGISTRY.keys())
