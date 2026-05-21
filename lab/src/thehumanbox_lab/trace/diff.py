from __future__ import annotations

from typing import Any


def _index_orgs(snapshot: dict[str, Any]) -> dict[Any, dict[str, Any]]:
    out: dict[Any, dict[str, Any]] = {}
    for o in snapshot.get("organisms") or []:
        if not isinstance(o, dict):
            continue
        oid = o.get("id")
        if oid is None:
            continue
        out[oid] = o
    return out


def _is_alive(o: dict[str, Any]) -> bool:
    alive = o.get("alive")
    if alive is None:
        return True
    return bool(alive)


def _thought(o: dict[str, Any]) -> Any:
    return o.get("thought") or o.get("action")


def snapshot_delta(prev: dict[str, Any], cur: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    prev_orgs = _index_orgs(prev)
    cur_orgs = _index_orgs(cur)
    tick = cur.get("tick")

    births: list[dict[str, Any]] = []
    deaths: list[dict[str, Any]] = []
    thoughts_changed: list[dict[str, Any]] = []

    for oid, cur_o in cur_orgs.items():
        prev_o = prev_orgs.get(oid)
        cur_alive = _is_alive(cur_o)
        if prev_o is None:
            if cur_alive:
                births.append({
                    "tick": tick,
                    "organism_id": oid,
                    "name": cur_o.get("name"),
                    "lineage_id": cur_o.get("lineage_id"),
                    "generation": cur_o.get("generation"),
                })
            continue
        prev_alive = _is_alive(prev_o)
        if prev_alive and not cur_alive:
            deaths.append({
                "tick": tick,
                "organism_id": oid,
                "name": cur_o.get("name"),
                "lineage_id": cur_o.get("lineage_id"),
            })
        if cur_alive and prev_alive:
            p_th = _thought(prev_o)
            c_th = _thought(cur_o)
            if p_th != c_th:
                thoughts_changed.append({
                    "tick": tick,
                    "organism_id": oid,
                    "name": cur_o.get("name"),
                    "lineage_id": cur_o.get("lineage_id"),
                    "prev": p_th,
                    "cur": c_th,
                })

    for oid, prev_o in prev_orgs.items():
        if oid in cur_orgs:
            continue
        if _is_alive(prev_o):
            deaths.append({
                "tick": tick,
                "organism_id": oid,
                "name": prev_o.get("name"),
                "lineage_id": prev_o.get("lineage_id"),
                "reason": "vanished",
            })

    return {"births": births, "deaths": deaths, "thoughts_changed": thoughts_changed}
