from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from typing import Any


def _iter_orgs(snap: Any) -> Iterable[dict]:
    if isinstance(snap, dict):
        orgs = snap.get("organisms") or snap.get("orgs") or []
    else:
        orgs = getattr(snap, "organisms", []) or []
    for org in orgs:
        if isinstance(org, dict):
            yield org
        else:
            yield {
                "id": getattr(org, "id", ""),
                "lineage_id": getattr(org, "lineage_id", ""),
                "vocabulary": getattr(org, "vocabulary", {}) or {},
            }


def _lineage_words(snap: Any) -> dict[tuple[str, str], set[str]]:
    out: dict[tuple[str, str], set[str]] = defaultdict(set)
    for org in _iter_orgs(snap):
        lineage = str(org.get("lineage_id") or "")
        vocab = dict(org.get("vocabulary") or {})
        if not lineage:
            continue
        for concept, word in vocab.items():
            if not word:
                continue
            out[(concept, word)].add(lineage)
    return out


def detect_loan_words(snapshots: list[Any]) -> list[dict]:
    if len(snapshots) < 2:
        return []
    history: dict[tuple[str, str], tuple[int, str]] = {}
    loans: list[dict] = []
    for tick_index, snap in enumerate(snapshots):
        current = _lineage_words(snap)
        for key, lineages in current.items():
            for lineage in lineages:
                origin = history.get(key)
                if origin is None:
                    history[key] = (tick_index, lineage)
                    continue
                first_tick, first_lineage = origin
                if lineage != first_lineage and tick_index > first_tick:
                    loans.append({
                        "concept": key[0],
                        "word": key[1],
                        "origin_lineage": first_lineage,
                        "borrower_lineage": lineage,
                        "first_seen_tick_index": first_tick,
                        "borrowed_tick_index": tick_index,
                    })
                    history[key] = (first_tick, first_lineage)
    seen: set[tuple[str, str, str, str]] = set()
    unique: list[dict] = []
    for row in loans:
        key = (row["concept"], row["word"], row["origin_lineage"], row["borrower_lineage"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    unique.sort(key=lambda r: (r["borrowed_tick_index"], r["concept"]))
    return unique
