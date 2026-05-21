from __future__ import annotations

from typing import Any


def vocab_diff(vocab_a: dict, vocab_b: dict) -> dict[str, Any]:
    keys_a = {k for k, v in vocab_a.items() if v}
    keys_b = {k for k, v in vocab_b.items() if v}
    only_a = {}
    only_b = {}
    divergent: dict[str, tuple[str, str]] = {}
    for key in sorted(keys_a - keys_b):
        only_a[key] = vocab_a[key]
    for key in sorted(keys_b - keys_a):
        only_b[key] = vocab_b[key]
    for key in sorted(keys_a & keys_b):
        wa = vocab_a[key]
        wb = vocab_b[key]
        if wa != wb:
            divergent[key] = (wa, wb)
    return {
        "only_a": only_a,
        "only_b": only_b,
        "divergent": divergent,
    }


def diff_summary(diff: dict[str, Any]) -> dict[str, int]:
    return {
        "only_a_count": len(diff["only_a"]),
        "only_b_count": len(diff["only_b"]),
        "divergent_count": len(diff["divergent"]),
    }


def shared_words(vocab_a: dict, vocab_b: dict) -> dict[str, str]:
    shared: dict[str, str] = {}
    for key, value in vocab_a.items():
        if not value:
            continue
        if vocab_b.get(key) == value:
            shared[key] = value
    return shared
