from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(slots=True)
class TraceEvent:
    tick: int
    organism_id: str
    organism_name: str
    lineage_id: str
    event_type: str
    text: str
    state: dict[str, float]

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> TraceEvent:
        return cls(
            tick=int(row["tick"]),
            organism_id=str(row["organism_id"]),
            organism_name=str(row.get("organism_name", row["organism_id"])),
            lineage_id=str(row.get("lineage_id", "")),
            event_type=str(row["event_type"]),
            text=str(row.get("text", "")),
            state={str(k): float(v) for k, v in dict(row.get("state", {})).items()},
        )

@dataclass(slots=True)
class ThoughtExample:
    organism_id: str
    lineage_id: str
    prompt: str
    response: str
    source_ticks: list[int]
    tags: list[str]

    def to_row(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> ThoughtExample:
        return cls(
            organism_id=str(row["organism_id"]),
            lineage_id=str(row.get("lineage_id", "")),
            prompt=str(row["prompt"]),
            response=str(row["response"]),
            source_ticks=[int(value) for value in list(row.get("source_ticks", []))],
            tags=[str(value) for value in list(row.get("tags", []))],
        )
