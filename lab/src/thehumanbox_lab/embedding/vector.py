from __future__ import annotations

import math
from collections.abc import Iterable, Sequence


def normalize(v: Sequence[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v))
    if n == 0.0:
        return [0.0] * len(v)
    return [x / n for x in v]


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a))
    db = math.sqrt(sum(y * y for y in b))
    if da == 0.0 or db == 0.0:
        return 0.0
    return num / (da * db)


def euclidean(a: Sequence[float], b: Sequence[float]) -> float:
    return math.sqrt(sum((x - y) * (x - y) for x, y in zip(a, b)))


def mean_vec(vs: Iterable[Sequence[float]]) -> list[float]:
    acc: list[float] = []
    n = 0
    for v in vs:
        if not acc:
            acc = list(v)
        else:
            for i, x in enumerate(v):
                acc[i] += x
        n += 1
    if n == 0:
        return []
    return [x / n for x in acc]
