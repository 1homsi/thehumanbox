from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any

_CAUSES = ("starvation", "dehydration", "sickness", "combat", "old_age")


@dataclass(slots=True)
class DeathBreakdown:
    total: int
    by_cause: dict[str, int] = field(default_factory=dict)
    by_lineage: dict[str, dict[str, int]] = field(default_factory=dict)

    def to_row(self) -> dict[str, Any]:
        return asdict(self)


def _from_history(history: dict[str, Any]) -> dict[str, int]:
    return {
        "starvation":  int(history.get("deaths_starvation") or 0),
        "dehydration": int(history.get("deaths_dehydration") or 0),
        "sickness":    int(history.get("deaths_sickness") or 0),
        "combat":      int(history.get("deaths_combat") or 0),
        "old_age":     int(history.get("deaths_old_age") or 0),
    }


def _classify(detail: str, etype: str) -> str | None:
    blob = f"{etype} {detail}".lower()
    if "starv" in blob:
        return "starvation"
    if "thirst" in blob or "dehydr" in blob:
        return "dehydration"
    if "sick" in blob or "infect" in blob or "plague" in blob:
        return "sickness"
    if "combat" in blob or "kill" in blob or "fight" in blob or "attack" in blob:
        return "combat"
    if "old" in blob or "elder" in blob:
        return "old_age"
    if "died" in blob or "death" in blob:
        return "unknown"
    return None


def aggregate_deaths(snapshot: dict[str, Any]) -> DeathBreakdown:
    history = snapshot.get("history") or {}
    by_cause = _from_history(history) if history else dict.fromkeys(_CAUSES, 0)
    by_lineage: dict[str, Counter[str]] = defaultdict(Counter)

    lineage_lookup: dict[str, str] = {}
    for org in snapshot.get("organisms", []) or []:
        oid = str(org.get("id") or "")
        lin = str(org.get("lineage_id") or "")
        if oid:
            lineage_lookup[oid] = lin

    for ev in snapshot.get("events", []) or []:
        if not isinstance(ev, dict):
            continue
        etype = str(ev.get("type") or ev.get("etype") or "").lower()
        detail = str(ev.get("detail") or "")
        cause = _classify(detail, etype)
        if cause is None:
            continue
        actor = str(ev.get("actor") or "")
        lin = lineage_lookup.get(actor) or "unknown"
        by_lineage[lin][cause] += 1

    total_from_hist = sum(by_cause.values())
    total = total_from_hist if total_from_hist > 0 else sum(sum(c.values()) for c in by_lineage.values())
    return DeathBreakdown(
        total=total,
        by_cause=by_cause,
        by_lineage={k: dict(v) for k, v in by_lineage.items()},
    )
