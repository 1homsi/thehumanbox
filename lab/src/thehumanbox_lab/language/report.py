from __future__ import annotations

from collections import Counter
from typing import Any, Iterable

from .dialect import cluster_dialects
from .spread import track_word_spread
from .word_freq import popular_drift, word_frequency


def _orgs_from(snap: Any) -> list[dict]:
    if isinstance(snap, dict):
        return list(snap.get("organisms") or snap.get("orgs") or [])
    return list(getattr(snap, "organisms", []) or [])


def build_report(
    snapshot: Any,
    previous: Any | None = None,
    concepts: list[str] | None = None,
    n_clusters: int = 4,
) -> str:
    orgs = _orgs_from(snapshot)
    lines: list[str] = []
    lines.append("# Language Report")
    lines.append("")
    lines.append(f"- Organisms analyzed: {len(orgs)}")
    freq = word_frequency(orgs)
    unique_words = len({row[0] for row in freq})
    lines.append(f"- Unique word forms: {unique_words}")
    lines.append("")
    lines.append("## Top words")
    lines.append("")
    lines.append("| word | concept | count |")
    lines.append("| --- | --- | --- |")
    for word, count, concept in freq[:15]:
        lines.append(f"| {word} | {concept} | {count} |")
    lines.append("")
    drift = popular_drift(orgs)
    lines.append("## Popular drift concepts")
    lines.append("")
    if not drift:
        lines.append("_No concepts exceed disagreement threshold._")
    else:
        for concept, counter in drift[:10]:
            top = ", ".join(f"{w}({c})" for w, c in counter.items())
            lines.append(f"- **{concept}** → {top}")
    lines.append("")
    assignments = cluster_dialects(orgs, concepts=concepts, n_clusters=n_clusters)
    cluster_sizes = Counter(assignments.values())
    lines.append("## Dialect clusters")
    lines.append("")
    for cid, size in cluster_sizes.most_common():
        lines.append(f"- cluster {cid}: {size} organisms")
    lines.append("")
    if previous is not None:
        spread = track_word_spread(previous, snapshot)
        lines.append("## Spread (vs previous snapshot)")
        lines.append("")
        lines.append("### Growing")
        for row in spread["growing"][:10]:
            lines.append(
                f"- {row['word']} ({row['concept']}): {row['old_count']} -> {row['new_count']}"
            )
        lines.append("")
        lines.append("### Declining")
        for row in spread["declining"][:10]:
            lines.append(
                f"- {row['word']} ({row['concept']}): {row['old_count']} -> {row['new_count']}"
            )
        lines.append("")
    return "\n".join(lines)


def summarize(orgs: Iterable[Any]) -> dict[str, int]:
    orgs = list(orgs)
    freq = word_frequency(orgs)
    return {
        "organisms": len(orgs),
        "unique_words": len({row[0] for row in freq}),
        "concept_word_pairs": len(freq),
    }
