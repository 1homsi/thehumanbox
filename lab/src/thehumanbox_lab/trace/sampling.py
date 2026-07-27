from __future__ import annotations

import heapq
import random
from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from typing import Any

Record = dict[str, Any]


def uniform(records: Sequence[Record], n: int, seed: int | None = None) -> list[Record]:
    if n <= 0 or not records:
        return []
    if n >= len(records):
        return list(records)
    rng = random.Random(seed)
    return rng.sample(list(records), n)


def stratified(
    records: Iterable[Record],
    key: str | Callable[[Record], Any],
    n_per_group: int,
    seed: int | None = None,
) -> list[Record]:
    if n_per_group <= 0:
        return []
    key_fn: Callable[[Record], Any]
    if isinstance(key, str):
        def key_fn(r: Record) -> Any:
            return r.get(key)
    else:
        key_fn = key
    buckets: dict[Any, list[Record]] = defaultdict(list)
    for r in records:
        buckets[key_fn(r)].append(r)
    rng = random.Random(seed)
    out: list[Record] = []
    for group_key in sorted(buckets.keys(), key=lambda k: (k is None, str(k))):
        group = buckets[group_key]
        if len(group) <= n_per_group:
            out.extend(group)
        else:
            out.extend(rng.sample(group, n_per_group))
    return out


def importance(
    records: Iterable[Record],
    score_fn: Callable[[Record], float],
    n: int,
) -> list[Record]:
    if n <= 0:
        return []
    heap: list[tuple[float, int, Record]] = []
    for idx, r in enumerate(records):
        score = float(score_fn(r))
        if len(heap) < n:
            heapq.heappush(heap, (score, idx, r))
        elif score > heap[0][0]:
            heapq.heapreplace(heap, (score, idx, r))
    heap.sort(key=lambda t: t[0], reverse=True)
    return [r for _, _, r in heap]
