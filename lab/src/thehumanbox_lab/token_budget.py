from __future__ import annotations

import math
from typing import Any, Callable

from .formatters import format as format_records

Record = dict[str, Any]

try:
    import tiktoken

    _ENCODER = tiktoken.get_encoding("cl100k_base")
except ImportError:
    _ENCODER = None


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    if _ENCODER is not None:
        return len(_ENCODER.encode(text))
    return max(1, math.ceil(len(text) / 4))


def _render(records: list[Record], formatter: str) -> list[str]:
    output = format_records(records, formatter)
    rendered: list[str] = []
    for item in output:
        if isinstance(item, str):
            rendered.append(item)
        elif isinstance(item, dict):
            rendered.append(" ".join(str(v) for v in item.values()))
        else:
            rendered.append(str(item))
    return rendered


def _percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * pct
    lower = int(math.floor(rank))
    upper = int(math.ceil(rank))
    if lower == upper:
        return ordered[lower]
    fraction = rank - lower
    return int(round(ordered[lower] + (ordered[upper] - ordered[lower]) * fraction))


def estimate_dataset(
    records: list[Record],
    formatter: str = "chatml",
    counter: Callable[[str], int] | None = None,
) -> dict[str, int | float]:
    count = counter or estimate_tokens
    rendered = _render(records, formatter)
    counts = [count(text) for text in rendered]
    if not counts:
        return {"total": 0, "mean": 0.0, "p50": 0, "p95": 0, "max": 0, "count": 0}
    return {
        "total": sum(counts),
        "mean": sum(counts) / len(counts),
        "p50": _percentile(counts, 0.5),
        "p95": _percentile(counts, 0.95),
        "max": max(counts),
        "count": len(counts),
    }


def has_tiktoken() -> bool:
    return _ENCODER is not None
