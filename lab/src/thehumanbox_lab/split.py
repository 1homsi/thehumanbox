from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any

Record = dict[str, Any]
Split = tuple[list[Record], list[Record], list[Record]]


def _stable_score(value: str, seed: int) -> float:
    payload = f"{seed}::{value}".encode()
    digest = hashlib.sha256(payload).hexdigest()
    return int(digest[:12], 16) / float(0xFFFFFFFFFFFF)


def _record_key(record: Record, key: str) -> str:
    if key in record:
        return str(record[key])
    metadata = record.get("metadata")
    if isinstance(metadata, dict) and key in metadata:
        return str(metadata[key])
    return "_default"


def _bucket_score(record: Record, seed: int) -> float:
    prompt = str(record.get("prompt", ""))
    if not prompt:
        prompt = repr(sorted(record.items()))
    return _stable_score(prompt, seed)


def _validate_ratios(ratios: tuple[float, float, float]) -> None:
    if len(ratios) != 3:
        raise ValueError("ratios must have three entries")
    if any(r < 0 for r in ratios):
        raise ValueError("ratios must be non-negative")
    total = sum(ratios)
    if total <= 0:
        raise ValueError("ratios must sum to a positive number")


def stratified_split(
    records: list[Record],
    key: str = "scenario",
    ratios: tuple[float, float, float] = (0.8, 0.1, 0.1),
    seed: int = 42,
) -> Split:
    _validate_ratios(ratios)
    total = sum(ratios)
    train_cut = ratios[0] / total
    valid_cut = (ratios[0] + ratios[1]) / total

    buckets: dict[str, list[Record]] = defaultdict(list)
    for record in records:
        buckets[_record_key(record, key)].append(record)

    train: list[Record] = []
    valid: list[Record] = []
    test: list[Record] = []
    for bucket in buckets.values():
        sorted_bucket = sorted(bucket, key=lambda r: _bucket_score(r, seed))
        for record in sorted_bucket:
            score = _bucket_score(record, seed)
            if score < train_cut:
                train.append(record)
            elif score < valid_cut:
                valid.append(record)
            else:
                test.append(record)
    return train, valid, test


def split_summary(splits: Split) -> dict[str, int]:
    train, valid, test = splits
    return {
        "train": len(train),
        "valid": len(valid),
        "test": len(test),
        "total": len(train) + len(valid) + len(test),
    }
