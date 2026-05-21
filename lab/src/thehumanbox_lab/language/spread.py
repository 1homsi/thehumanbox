from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


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
                "vocabulary": getattr(org, "vocabulary", {}) or {},
            }


def _adopters(snap: Any) -> dict[tuple[str, str], set[str]]:
    out: dict[tuple[str, str], set[str]] = defaultdict(set)
    for org in _iter_orgs(snap):
        vocab = dict(org.get("vocabulary") or {})
        org_id = str(org.get("id") or org.get("organism_id") or "")
        if not org_id:
            continue
        for concept, word in vocab.items():
            if not word:
                continue
            out[(concept, word)].add(org_id)
    return out


def track_word_spread(snap_old: Any, snap_new: Any) -> dict[str, list[dict]]:
    old = _adopters(snap_old)
    new = _adopters(snap_new)
    growing: list[dict] = []
    declining: list[dict] = []
    keys = set(old) | set(new)
    for key in keys:
        old_set = old.get(key, set())
        new_set = new.get(key, set())
        delta = len(new_set) - len(old_set)
        if delta == 0:
            continue
        row = {
            "concept": key[0],
            "word": key[1],
            "old_count": len(old_set),
            "new_count": len(new_set),
            "delta": delta,
        }
        if delta > 0:
            growing.append(row)
        else:
            declining.append(row)
    growing.sort(key=lambda r: -r["delta"])
    declining.sort(key=lambda r: r["delta"])
    return {"growing": growing, "declining": declining}
