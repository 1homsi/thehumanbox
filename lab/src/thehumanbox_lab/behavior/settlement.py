from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterable


@dataclass(slots=True)
class TierTransition:
    tick: int
    lineage_id: str
    tier_old: str
    tier_new: str

    def to_row(self) -> dict[str, Any]:
        return asdict(self)


_TIER_KEYS = ("settlement_tier", "tier", "settlement", "stage")


def _tier_for_lineage(snapshot: dict[str, Any], lineage_id: str) -> str | None:
    territory = snapshot.get("territory")
    if isinstance(territory, dict):
        entry = territory.get(lineage_id)
        if isinstance(entry, dict):
            for key in _TIER_KEYS:
                val = entry.get(key)
                if isinstance(val, str) and val:
                    return val
    homes = snapshot.get("lineage_homes")
    if isinstance(homes, dict):
        entry = homes.get(lineage_id)
        if isinstance(entry, dict):
            for key in _TIER_KEYS:
                val = entry.get(key)
                if isinstance(val, str) and val:
                    return val
    return None


def _lineage_ids(snapshot: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for key in ("territory", "lineage_homes", "lineage_sizes", "lineage_names"):
        val = snapshot.get(key)
        if isinstance(val, dict):
            ids.update(str(k) for k in val.keys())
    for org in snapshot.get("organisms", []) or []:
        lin = org.get("lineage_id") if isinstance(org, dict) else None
        if lin:
            ids.add(str(lin))
    return ids


def track_settlement_tiers(snapshots: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    last_tier: dict[str, str] = {}
    transitions: list[TierTransition] = []
    for snap in snapshots:
        if not isinstance(snap, dict):
            continue
        tick = int(snap.get("tick") or 0)
        for lineage_id in _lineage_ids(snap):
            new_tier = _tier_for_lineage(snap, lineage_id)
            if new_tier is None:
                continue
            old = last_tier.get(lineage_id)
            if old is not None and old != new_tier:
                transitions.append(TierTransition(
                    tick=tick,
                    lineage_id=lineage_id,
                    tier_old=old,
                    tier_new=new_tier,
                ))
            last_tier[lineage_id] = new_tier
    return [t.to_row() for t in transitions]
