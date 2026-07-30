from __future__ import annotations

import hashlib
import itertools
import random
from collections.abc import Sequence
from typing import Any


def _normalize_spaces(spaces: Sequence[dict[str, Any]]) -> list[tuple[str, list[Any]]]:
    out: list[tuple[str, list[Any]]] = []
    for space in spaces:
        if "name" not in space or "values" not in space:
            raise ValueError(f"space missing name/values: {space!r}")
        values = list(space["values"])
        if not values:
            raise ValueError(f"space {space['name']!r} has no values")
        out.append((str(space["name"]), values))
    return out


def grid(spaces: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = _normalize_spaces(spaces)
    if not normalized:
        return []
    names = [n for n, _ in normalized]
    pools = [vs for _, vs in normalized]
    combos: list[dict[str, Any]] = []
    for combo in itertools.product(*pools):
        combos.append(dict(zip(names, combo)))
    return combos


def random_sample(
    spaces: Sequence[dict[str, Any]], n: int, seed: int | None = None
) -> list[dict[str, Any]]:
    normalized = _normalize_spaces(spaces)
    if not normalized:
        return []
    rng = random.Random(seed)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    max_tries = max(n * 20, 100)
    tries = 0
    while len(out) < n and tries < max_tries:
        tries += 1
        cand = {name: rng.choice(values) for name, values in normalized}
        key = _hash_config(cand)
        if key in seen:
            continue
        seen.add(key)
        out.append(cand)
    return out


def _hash_config(cfg: dict[str, Any]) -> str:
    blob = "|".join(f"{k}={cfg[k]!r}" for k in sorted(cfg))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def config_hash(cfg: dict[str, Any]) -> str:
    return _hash_config(cfg)
