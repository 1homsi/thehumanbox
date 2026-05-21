from __future__ import annotations

from typing import Any, Iterable

from .action_seq import extract_actions, top_ngrams
from .death_causes import aggregate_deaths
from .influence import build_influence_graph, top_influencers
from .life_arc import summarize_life
from .migration import detect_migrations
from .settlement import track_settlement_tiers


def _header(text: str, level: int = 2) -> str:
    return f"{'#' * level} {text}"


def _format_ngram(gram: tuple[str, ...], count: int) -> str:
    return f"- `{' -> '.join(gram)}` x{count}"


def render_report(
    snapshot: dict[str, Any],
    history_snapshots: Iterable[dict[str, Any]] | None = None,
    ngram_size: int = 3,
    ngram_top: int = 15,
    migration_threshold: float = 15.0,
) -> str:
    parts: list[str] = []
    tick = snapshot.get("tick")
    parts.append(_header(f"Behavioral Report (tick={tick})", level=1))

    deaths = aggregate_deaths(snapshot)
    parts.append(_header("Death Causes"))
    parts.append(f"Total deaths: {deaths.total}")
    for cause, count in sorted(deaths.by_cause.items(), key=lambda kv: -kv[1]):
        parts.append(f"- {cause}: {count}")
    if deaths.by_lineage:
        parts.append("")
        parts.append("**By lineage (from events):**")
        for lin, breakdown in sorted(deaths.by_lineage.items()):
            inline = ", ".join(f"{k}={v}" for k, v in sorted(breakdown.items()))
            parts.append(f"- `{lin}`: {inline}")

    events = list(snapshot.get("events") or [])
    actions = extract_actions(events)
    parts.append(_header("Action Sequences"))
    parts.append(f"Action events analyzed: {len(actions)}")
    for gram, count in top_ngrams(actions, n=ngram_size, top=ngram_top):
        parts.append(_format_ngram(gram, count))

    migs = detect_migrations(snapshot.get("lineage_centroid_history") or {}, jump_threshold=migration_threshold)
    parts.append(_header("Migrations"))
    parts.append(f"Detected jumps (>={migration_threshold}): {len(migs)}")
    for m in migs[:20]:
        parts.append(
            f"- lineage `{m['lineage_id']}` tick {m['tick']} "
            f"dist {m['distance']:.1f} {m['from']} -> {m['to']}"
        )

    if history_snapshots is not None:
        transitions = track_settlement_tiers(history_snapshots)
        parts.append(_header("Settlement Tier Transitions"))
        parts.append(f"Total transitions: {len(transitions)}")
        for t in transitions[:30]:
            parts.append(
                f"- tick {t['tick']} lineage `{t['lineage_id']}`: "
                f"{t['tier_old']} -> {t['tier_new']}"
            )

    graph = build_influence_graph(events)
    parts.append(_header("Influence Graph"))
    parts.append(f"Edges: {sum(len(t) for t in graph.values())}")
    for actor, score in top_influencers(graph, top=10):
        targets = ", ".join(f"{k}({v})" for k, v in graph[actor].items())
        parts.append(f"- **{actor}** taught {score}: {targets}")

    parts.append(_header("Life Arcs (sampled)"))
    orgs = list(snapshot.get("organisms") or [])
    for org in orgs[:10]:
        arc = summarize_life(org)
        parts.append(
            f"- `{arc.name}` ({arc.lineage_id}) gen{arc.generation} "
            f"age={arc.age_ticks} alive={arc.alive} death={arc.death_cause} "
            f"discoveries={arc.discovery_count}"
        )
    return "\n".join(parts) + "\n"
