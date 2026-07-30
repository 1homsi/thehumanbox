from __future__ import annotations

import math
from collections import Counter
from collections.abc import Iterable, Sequence


class CharNgramEmbedder:
    def __init__(self, n: int = 3, dim: int = 256) -> None:
        self.n = n
        self.dim = dim

    def _grams(self, text: str) -> list[str]:
        if len(text) < self.n:
            return [text]
        return [text[i : i + self.n] for i in range(len(text) - self.n + 1)]

    def embed(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for g in self._grams(text.lower()):
            v[hash(g) % self.dim] += 1.0
        norm = math.sqrt(sum(x * x for x in v))
        if norm > 0:
            v = [x / norm for x in v]
        return v

    def embed_many(self, texts: Iterable[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]


def tfidf_chargram(corpus: Sequence[str], n: int = 3) -> list[dict[str, float]]:
    docs_grams = [
        [c[i : i + n] for i in range(max(0, len(c) - n + 1))]
        for c in corpus
    ]
    df: Counter = Counter()
    for grams in docs_grams:
        for g in set(grams):
            df[g] += 1
    nd = max(1, len(corpus))
    out: list[dict[str, float]] = []
    for grams in docs_grams:
        tf = Counter(grams)
        vec: dict[str, float] = {}
        for g, c in tf.items():
            idf = math.log((1 + nd) / (1 + df[g])) + 1.0
            vec[g] = (c / max(1, len(grams))) * idf
        out.append(vec)
    return out
