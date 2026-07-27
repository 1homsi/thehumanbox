from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from typing import Any


def _iter_vocabs(orgs: Iterable[Any]) -> Iterable[dict]:
    for org in orgs:
        if isinstance(org, dict):
            if org.get("alive") is False:
                continue
            vocab = org.get("vocabulary")
        else:
            if getattr(org, "alive", True) is False:
                continue
            vocab = getattr(org, "vocabulary", None)
        if not vocab:
            continue
        yield dict(vocab)


def word_frequency(orgs: Iterable[Any]) -> list[tuple[str, int, str]]:
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for vocab in _iter_vocabs(orgs):
        for concept, word in vocab.items():
            if not word:
                continue
            counts[(word, concept)] += 1
    rows = [(word, count, concept) for (word, concept), count in counts.items()]
    rows.sort(key=lambda row: (-row[1], row[2], row[0]))
    return rows


def popular_drift(orgs: Iterable[Any], threshold: float = 0.5) -> list[tuple[str, dict[str, int]]]:
    per_concept: dict[str, Counter] = defaultdict(Counter)
    for vocab in _iter_vocabs(orgs):
        for concept, word in vocab.items():
            if not word:
                continue
            per_concept[concept][word] += 1
    drifted: list[tuple[str, dict[str, int]]] = []
    for concept, counter in per_concept.items():
        total = sum(counter.values())
        if total == 0:
            continue
        _top_word, top_count = counter.most_common(1)[0]
        disagreement = (total - top_count) / total
        if disagreement > threshold:
            drifted.append((concept, dict(counter.most_common(5))))
    drifted.sort(key=lambda row: -sum(row[1].values()))
    return drifted
