from __future__ import annotations

from collections import Counter, defaultdict
from itertools import islice
from typing import Any, Iterable


def _normalize(action: Any) -> str | None:
    if action is None:
        return None
    if isinstance(action, str):
        return action.strip().lower() or None
    if isinstance(action, dict):
        for key in ("action", "type", "category", "etype", "event_type"):
            val = action.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip().lower()
    return None


def extract_actions(events: Iterable[Any]) -> list[str]:
    out: list[str] = []
    for ev in events:
        norm = _normalize(ev)
        if norm is not None:
            out.append(norm)
    return out


def extract_actions_by_actor(events: Iterable[dict[str, Any]]) -> dict[str, list[str]]:
    streams: dict[str, list[str]] = defaultdict(list)
    for ev in events:
        if not isinstance(ev, dict):
            continue
        actor = str(ev.get("actor") or ev.get("organism_id") or "")
        if not actor:
            continue
        norm = _normalize(ev)
        if norm is not None:
            streams[actor].append(norm)
    return dict(streams)


def ngrams(actions: list[str], n: int) -> list[tuple[str, ...]]:
    if n < 1 or len(actions) < n:
        return []
    it = iter(actions)
    window = tuple(islice(it, n))
    grams: list[tuple[str, ...]] = [window]
    for nxt in it:
        window = window[1:] + (nxt,)
        grams.append(window)
    return grams


def top_ngrams(actions: list[str], n: int = 3, top: int = 20) -> list[tuple[tuple[str, ...], int]]:
    counter: Counter[tuple[str, ...]] = Counter()
    counter.update(ngrams(actions, n))
    return counter.most_common(top)


def top_ngrams_per_actor(
    events: Iterable[dict[str, Any]], n: int = 3, top: int = 5
) -> dict[str, list[tuple[tuple[str, ...], int]]]:
    streams = extract_actions_by_actor(events)
    return {actor: top_ngrams(stream, n=n, top=top) for actor, stream in streams.items()}
