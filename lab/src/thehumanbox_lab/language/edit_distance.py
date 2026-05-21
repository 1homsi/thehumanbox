from __future__ import annotations


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    current = [0] * (len(b) + 1)
    for i, ca in enumerate(a, start=1):
        current[0] = i
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            current[j] = min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            )
        previous, current = current, previous
    return previous[len(b)]


def normalized_levenshtein(a: str, b: str) -> float:
    if not a and not b:
        return 0.0
    denom = max(len(a), len(b))
    if denom == 0:
        return 0.0
    return levenshtein(a, b) / denom


def vocab_distance(vocab_a: dict, vocab_b: dict, concepts: list[str]) -> float:
    total = 0.0
    counted = 0
    for concept in concepts:
        wa = vocab_a.get(concept, "")
        wb = vocab_b.get(concept, "")
        if not wa and not wb:
            continue
        total += normalized_levenshtein(wa, wb)
        counted += 1
    if counted == 0:
        return 0.0
    return total / counted
