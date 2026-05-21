from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable


@dataclass(slots=True)
class LifeArc:
    organism_id: str
    name: str
    lineage_id: str
    generation: int
    alive: bool
    age_ticks: int
    birth_tick: int | None
    death_tick: int | None
    death_cause: str | None
    first_discovery_tick: int | None
    first_discovery: str | None
    first_child_tick: int | None
    first_conflict_tick: int | None
    discovery_count: int
    thought_count: int
    discoveries: list[str] = field(default_factory=list)

    def to_row(self) -> dict[str, Any]:
        return asdict(self)


_CONFLICT_TOKENS = ("combat", "conflict", "attack", "fight", "raid", "war", "kill")
_DEATH_TOKENS = ("died", "death", "perished", "starvation", "dehydration", "sickness", "combat", "old_age")


def _event_iter(org: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for source in ("events", "life_log"):
        for ev in org.get(source, []) or []:
            if isinstance(ev, dict):
                yield ev


_DEATH_PATTERNS = (
    ("starvation",  ("starvation", "starv")),
    ("dehydration", ("dehydration", "thirst", "dehydr")),
    ("sickness",    ("sickness", "sick", "infect", "ill")),
    ("combat",      ("combat", "kill", "fight", "attack")),
    ("old_age",     ("old_age", "old", "elder")),
)


def _classify_death(text: str, category: str) -> str:
    blob = f"{category} {text}".lower()
    for label, tokens in _DEATH_PATTERNS:
        if any(tok in blob for tok in tokens):
            return label
    return "unknown"


def summarize_life(org: dict[str, Any]) -> LifeArc:
    age = int(org.get("age_ticks") or 0)
    alive = bool(org.get("alive", False))
    discoveries = list(org.get("discoveries") or [])
    thought_count = len(list(org.get("thought_history") or []))
    birth_tick: int | None = None
    death_tick: int | None = None
    death_cause: str | None = None
    first_disc_tick: int | None = None
    first_disc: str | None = None
    first_child_tick: int | None = None
    first_conflict_tick: int | None = None

    for ev in _event_iter(org):
        tick = int(ev.get("tick") or 0)
        cat = str(ev.get("category") or ev.get("type") or "").lower()
        text = str(ev.get("text") or ev.get("detail") or "").lower()
        is_self_birth = cat in ("birth", "born") or "born to" in text
        if is_self_birth:
            if birth_tick is None or tick < birth_tick:
                birth_tick = tick
        if cat in ("discovery", "discover") or "discovered" in text or "discovery" in cat:
            if first_disc_tick is None or tick < first_disc_tick:
                first_disc_tick = tick
                first_disc = ev.get("text") or ev.get("detail")
        is_child_event = (
            cat in ("child", "birth_child", "mate", "had_child", "parent")
            or "child born" in text
            or "first child" in text
            or "had a child" in text
        )
        if is_child_event and not is_self_birth:
            if first_child_tick is None or tick < first_child_tick:
                first_child_tick = tick
        if any(tok in cat or tok in text for tok in _CONFLICT_TOKENS):
            if first_conflict_tick is None or tick < first_conflict_tick:
                first_conflict_tick = tick
        if any(tok in cat or tok in text for tok in _DEATH_TOKENS):
            if death_tick is None or tick > death_tick:
                death_tick = tick
                death_cause = _classify_death(text, cat)

    if not alive and death_cause is None:
        death_cause = "unknown"
    return LifeArc(
        organism_id=str(org.get("id") or org.get("organism_id") or ""),
        name=str(org.get("name") or ""),
        lineage_id=str(org.get("lineage_id") or ""),
        generation=int(org.get("generation") or 0),
        alive=alive,
        age_ticks=age,
        birth_tick=birth_tick,
        death_tick=death_tick,
        death_cause=death_cause,
        first_discovery_tick=first_disc_tick,
        first_discovery=first_disc,
        first_child_tick=first_child_tick,
        first_conflict_tick=first_conflict_tick,
        discovery_count=len(discoveries),
        thought_count=thought_count,
        discoveries=discoveries,
    )
