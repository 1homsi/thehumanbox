from __future__ import annotations

import math
from collections import Counter


def _char_3grams(text: str) -> Counter:
    cleaned = text.lower().strip()
    if len(cleaned) < 3:
        if not cleaned:
            return Counter()
        return Counter([cleaned])
    return Counter(cleaned[i : i + 3] for i in range(len(cleaned) - 2))


def _norm(vec: Counter) -> float:
    return math.sqrt(sum(v * v for v in vec.values()))


def tfidf_cosine(a: str, b: str) -> float:
    va = _char_3grams(a)
    vb = _char_3grams(b)
    if not va or not vb:
        return 0.0
    keys = set(va) | set(vb)
    df = {k: (1 if k in va else 0) + (1 if k in vb else 0) for k in keys}
    idf = {k: math.log((2 + 1) / (df[k] + 1)) + 1.0 for k in keys}
    wa = {k: va.get(k, 0) * idf[k] for k in keys}
    wb = {k: vb.get(k, 0) * idf[k] for k in keys}
    dot = sum(wa[k] * wb[k] for k in keys)
    na = math.sqrt(sum(v * v for v in wa.values()))
    nb = math.sqrt(sum(v * v for v in wb.values()))
    if na == 0 or nb == 0:
        return 0.0
    score = dot / (na * nb)
    return max(0.0, min(1.0, score))


def pairwise_similarity(items: list[str]) -> list[list[float]]:
    n = len(items)
    grid = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i, n):
            score = 1.0 if i == j else tfidf_cosine(items[i], items[j])
            grid[i][j] = score
            grid[j][i] = score
    return grid
