from __future__ import annotations

from dataclasses import asdict, dataclass
from math import hypot
from typing import Any


@dataclass(slots=True)
class MigrationEvent:
    lineage_id: str
    tick: int
    from_xy: tuple[float, float]
    to_xy: tuple[float, float]
    distance: float

    def to_row(self) -> dict[str, Any]:
        row = asdict(self)
        row["from"] = list(self.from_xy)
        row["to"] = list(self.to_xy)
        row.pop("from_xy", None)
        row.pop("to_xy", None)
        return row


def _point(entry: Any) -> tuple[int | None, float, float] | None:
    if isinstance(entry, dict):
        tick = entry.get("tick")
        x = entry.get("x") if "x" in entry else entry.get("cx")
        y = entry.get("y") if "y" in entry else entry.get("cy")
        if x is None or y is None:
            return None
        try:
            return (int(tick) if tick is not None else None, float(x), float(y))
        except (TypeError, ValueError):
            return None
    if isinstance(entry, (list, tuple)):
        if len(entry) == 2:
            try:
                return (None, float(entry[0]), float(entry[1]))
            except (TypeError, ValueError):
                return None
        if len(entry) >= 3:
            try:
                return (int(entry[0]), float(entry[1]), float(entry[2]))
            except (TypeError, ValueError):
                return None
    return None


def _series(history: Any, lineage_id: str) -> list[tuple[int | None, float, float]]:
    raw: list[Any]
    if isinstance(history, dict):
        raw = list(history.get(lineage_id) or [])
    else:
        raw = []
    out: list[tuple[int | None, float, float]] = []
    for entry in raw:
        pt = _point(entry)
        if pt is not None:
            out.append(pt)
    return out


def detect_migrations(
    lineage_centroid_history: Any, jump_threshold: float = 15.0
) -> list[dict[str, Any]]:
    if not isinstance(lineage_centroid_history, dict):
        return []
    results: list[MigrationEvent] = []
    for lineage_id in lineage_centroid_history:
        series = _series(lineage_centroid_history, lineage_id)
        for i in range(1, len(series)):
            prev_tick, px, py = series[i - 1]
            cur_tick, cx, cy = series[i]
            dist = hypot(cx - px, cy - py)
            if dist >= jump_threshold:
                tick = cur_tick if cur_tick is not None else (prev_tick or 0)
                results.append(MigrationEvent(
                    lineage_id=str(lineage_id),
                    tick=int(tick or 0),
                    from_xy=(px, py),
                    to_xy=(cx, cy),
                    distance=dist,
                ))
    results.sort(key=lambda m: (m.tick, m.lineage_id))
    return [m.to_row() for m in results]
