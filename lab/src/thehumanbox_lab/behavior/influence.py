from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from typing import Any

_TEACH_CATEGORIES = {"teach", "teaching", "taught", "mentor", "lesson"}
_DISCOVERY_CATEGORIES = {"discovery", "discover", "discovered", "share_discovery"}


def _category(ev: dict[str, Any]) -> str:
    for key in ("category", "type", "etype", "event_type"):
        val = ev.get(key)
        if isinstance(val, str) and val:
            return val.lower()
    return ""


def _target(ev: dict[str, Any]) -> str | None:
    for key in ("target", "target_name", "related_name", "related_id", "to", "student"):
        val = ev.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def _actor(ev: dict[str, Any]) -> str | None:
    for key in ("actor", "actor_name", "from", "teacher", "organism_name"):
        val = ev.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def build_influence_graph(events: Iterable[dict[str, Any]]) -> dict[str, dict[str, int]]:
    graph: dict[str, Counter[str]] = defaultdict(Counter)
    for ev in events:
        if not isinstance(ev, dict):
            continue
        cat = _category(ev)
        if cat not in _TEACH_CATEGORIES and cat not in _DISCOVERY_CATEGORIES:
            continue
        actor = _actor(ev)
        target = _target(ev)
        if not actor or not target or actor == target:
            continue
        graph[actor][target] += 1
    return {a: dict(t) for a, t in graph.items()}


def top_influencers(graph: dict[str, dict[str, int]], top: int = 10) -> list[tuple[str, int]]:
    scores: list[tuple[str, int]] = []
    for actor, targets in graph.items():
        scores.append((actor, sum(targets.values())))
    scores.sort(key=lambda kv: (-kv[1], kv[0]))
    return scores[:top]


def fan_out(graph: dict[str, dict[str, int]]) -> dict[str, int]:
    return {actor: len(targets) for actor, targets in graph.items()}
