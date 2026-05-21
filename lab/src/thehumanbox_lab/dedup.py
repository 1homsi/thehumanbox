from __future__ import annotations

import hashlib
import re
from typing import Any

Record = dict[str, Any]

_TOKEN_RE = re.compile(r"\w+")


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _shingles(tokens: list[str], width: int = 3) -> list[str]:
    if len(tokens) <= width:
        return [" ".join(tokens)] if tokens else []
    return [" ".join(tokens[i : i + width]) for i in range(len(tokens) - width + 1)]


def simhash(text: str, bits: int = 64, shingle_width: int = 3) -> int:
    tokens = _tokens(text)
    if not tokens:
        return 0
    weights = [0] * bits
    for shingle in _shingles(tokens, width=shingle_width):
        digest = hashlib.blake2b(shingle.encode("utf-8"), digest_size=bits // 8).digest()
        value = int.from_bytes(digest, "big")
        for bit in range(bits):
            if value & (1 << bit):
                weights[bit] += 1
            else:
                weights[bit] -= 1
    fingerprint = 0
    for bit, weight in enumerate(weights):
        if weight > 0:
            fingerprint |= 1 << bit
    return fingerprint


def hamming_distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def exact_dedup(records: list[Record], key: str = "prompt") -> list[Record]:
    seen: set[str] = set()
    out: list[Record] = []
    for record in records:
        value = str(record.get(key, ""))
        if value in seen:
            continue
        seen.add(value)
        out.append(record)
    return out


def near_dedup(
    records: list[Record], key: str = "prompt", threshold: int = 4, bits: int = 64
) -> list[Record]:
    kept: list[Record] = []
    fingerprints: list[int] = []
    for record in records:
        text = str(record.get(key, ""))
        fingerprint = simhash(text, bits=bits)
        duplicate = False
        for existing in fingerprints:
            if hamming_distance(fingerprint, existing) <= threshold:
                duplicate = True
                break
        if duplicate:
            continue
        kept.append(record)
        fingerprints.append(fingerprint)
    return kept


def dedup_records(
    records: list[Record], key: str = "prompt", near_threshold: int = 4, bits: int = 64
) -> list[Record]:
    exact = exact_dedup(records, key=key)
    if near_threshold <= 0:
        return exact
    return near_dedup(exact, key=key, threshold=near_threshold, bits=bits)
