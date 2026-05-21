from __future__ import annotations

from typing import Any, Callable, Iterable

Predicate = Callable[[dict[str, Any]], bool]


def _iter_organisms(record: dict[str, Any]) -> Iterable[dict[str, Any]]:
    orgs = record.get("organisms")
    if isinstance(orgs, list):
        for o in orgs:
            if isinstance(o, dict):
                yield o


def by_lineage(lineage_id: str | Iterable[str]) -> Predicate:
    ids = {lineage_id} if isinstance(lineage_id, str) else set(lineage_id)

    def pred(record: dict[str, Any]) -> bool:
        if record.get("lineage_id") in ids:
            return True
        return any(o.get("lineage_id") in ids for o in _iter_organisms(record))

    return pred


def by_event_type(types: str | Iterable[str]) -> Predicate:
    accept = {types} if isinstance(types, str) else set(types)

    def pred(record: dict[str, Any]) -> bool:
        return record.get("event_type") in accept

    return pred


def by_tick_range(lo: int, hi: int) -> Predicate:
    def pred(record: dict[str, Any]) -> bool:
        t = record.get("tick")
        if not isinstance(t, (int, float)):
            return False
        return lo <= t <= hi

    return pred


def by_org_id(ids: str | Iterable[str]) -> Predicate:
    accept = {ids} if isinstance(ids, str) else set(ids)

    def pred(record: dict[str, Any]) -> bool:
        if record.get("organism_id") in accept:
            return True
        return any(o.get("id") in accept for o in _iter_organisms(record))

    return pred


def compose(*filters: Predicate) -> Predicate:
    def pred(record: dict[str, Any]) -> bool:
        return all(f(record) for f in filters)

    return pred


def union(*filters: Predicate) -> Predicate:
    def pred(record: dict[str, Any]) -> bool:
        return any(f(record) for f in filters)

    return pred
