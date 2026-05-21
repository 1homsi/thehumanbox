from __future__ import annotations

import random
import re

_SPLIT_PATTERN = re.compile(r"(?:,\s*|\s+(?:and|but|then|so|because|while)\s+|;\s*)")
_CONNECTORS = [", ", "; ", " then ", " and "]


def _split_clauses(text: str) -> list[str]:
    parts = _SPLIT_PATTERN.split(text)
    return [piece.strip() for piece in parts if piece and piece.strip()]


def _strip_terminal(text: str) -> tuple[str, str]:
    if not text:
        return text, ""
    if text[-1] in ".!?":
        return text[:-1].rstrip(), text[-1]
    return text, ""


def permute(text: str, rng_seed: int = 0) -> str:
    if not text or not text.strip():
        return text
    body, terminal = _strip_terminal(text.strip())
    clauses = _split_clauses(body)
    if len(clauses) < 2:
        return text
    rng = random.Random(rng_seed if rng_seed else hash(text) & 0xFFFFFFFF)
    order = list(range(len(clauses)))
    attempts = 0
    while attempts < 6:
        rng.shuffle(order)
        if order != sorted(order):
            break
        attempts += 1
    reordered = [clauses[i] for i in order]
    pieces: list[str] = []
    for idx, clause in enumerate(reordered):
        if idx == 0:
            pieces.append(clause[:1].upper() + clause[1:])
        else:
            connector = _CONNECTORS[(rng.randrange(0, len(_CONNECTORS)))]
            pieces.append(connector + clause[:1].lower() + clause[1:])
    result = "".join(pieces)
    if terminal:
        result += terminal
    return result
