from __future__ import annotations

from typing import Any, Iterable

from .edit_distance import vocab_distance


def _extract_org(org: Any) -> tuple[str, dict]:
    if isinstance(org, dict):
        org_id = str(org.get("id") or org.get("organism_id") or org.get("name") or "")
        vocab = dict(org.get("vocabulary") or {})
        return org_id, vocab
    org_id = str(getattr(org, "id", getattr(org, "organism_id", "")))
    vocab = dict(getattr(org, "vocabulary", {}) or {})
    return org_id, vocab


def cluster_dialects(
    orgs: Iterable[Any],
    concepts: list[str] | None = None,
    n_clusters: int = 4,
) -> dict[str, int]:
    if concepts is None:
        concepts = ["food", "water", "danger", "tribe"]
    items: list[tuple[str, dict]] = []
    for org in orgs:
        org_id, vocab = _extract_org(org)
        if not org_id:
            continue
        items.append((org_id, vocab))
    if not items:
        return {}
    clusters: list[list[int]] = [[i] for i in range(len(items))]
    cache: dict[tuple[int, int], float] = {}

    def cdist(ci: int, cj: int) -> float:
        key = (ci, cj) if ci < cj else (cj, ci)
        if key in cache:
            return cache[key]
        total = 0.0
        count = 0
        for a in clusters[ci]:
            for b in clusters[cj]:
                total += vocab_distance(items[a][1], items[b][1], concepts)
                count += 1
        value = total / count if count else 0.0
        cache[key] = value
        return value

    while len(clusters) > max(1, n_clusters):
        best = None
        best_d = float("inf")
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                d = cdist(i, j)
                if d < best_d:
                    best_d = d
                    best = (i, j)
        if best is None:
            break
        i, j = best
        clusters[i] = clusters[i] + clusters[j]
        del clusters[j]
        cache.clear()
    assignments: dict[str, int] = {}
    for cid, members in enumerate(clusters):
        for idx in members:
            assignments[items[idx][0]] = cid
    return assignments
