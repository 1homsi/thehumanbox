"""Subscribe to the simulation WebSocket and stream organism-thought
events to a JSONL file for offline dataset work.

This is the missing piece between a running simulation and the
build_thought_dataset / capture_teacher_thoughts pipeline. The Rust
sim broadcasts world snapshots over /ws every ~100ms; this script
filters those down to per-organism thought events and writes one
JSON line per event.

The protocol on the wire is rich (full world state per frame), but
for training data we usually only care about:
  - which organism thought it
  - what they were doing / where they were
  - what they thought
  - the surrounding emotional / vital state

That's exactly the shape the existing scripts expect, so the file
this writes can be fed straight into build_thought_dataset.py.

Example usage:

    python lab/scripts/trace_collector.py \
        --url ws://localhost:8081/ws \
        --output datasets/traces/run_2026-05-11.jsonl \
        --duration 600     # 10 minutes of wall clock

This script intentionally has no external deps beyond `websockets` so
it can be run from a fresh venv that hasn't installed the full lab
toolkit yet. `pip install websockets` is enough.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

try:
    import websockets
except ImportError:
    print("trace_collector needs the `websockets` package: pip install websockets", file=sys.stderr)
    sys.exit(2)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", default="ws://localhost:8081/ws",
                   help="WebSocket URL of the running simulation")
    p.add_argument("--output", type=Path, required=True,
                   help="Destination JSONL file (one event per line)")
    p.add_argument("--duration", type=float, default=0.0,
                   help="Stop after this many seconds (0 = run until killed)")
    p.add_argument("--min-tick-gap", type=int, default=20,
                   help="Skip frames whose tick is less than this far ahead "
                        "of the last written tick. Default keeps roughly one "
                        "snapshot per 2 sim-seconds, which is plenty for "
                        "training data without bloating the file.")
    return p.parse_args()


def organism_event_rows(snapshot: dict, accept_ids: set[str] | None = None) -> list[dict]:
    """Project a world snapshot into one row per organism whose thought is
    interesting. Skips empty thoughts and the "observing" no-op so the
    dataset isn't dominated by idle frames."""
    tick = snapshot.get("tick")
    if tick is None:
        return []
    season = snapshot.get("season")
    weather = snapshot.get("weather", {}).get("kind") if isinstance(snapshot.get("weather"), dict) else None
    is_day = snapshot.get("is_day")
    era = snapshot.get("current_era")

    rows: list[dict] = []
    for org in snapshot.get("organisms", []):
        if not org.get("alive"):
            continue
        thought = org.get("thought") or ""
        if not thought or thought == "observing":
            continue
        if accept_ids is not None and org.get("id") not in accept_ids:
            continue
        rows.append({
            "tick":          tick,
            "organism_id":   org.get("id"),
            "organism_name": org.get("name"),
            "lineage_id":    org.get("lineage_id"),
            "generation":    org.get("generation"),
            "event_type":    "thought",
            "text":          thought,
            "position": {
                "x": org.get("x"),
                "y": org.get("y"),
            },
            "state": {
                "energy":     org.get("energy"),
                "hydration":  org.get("hydration"),
                "health":     org.get("health"),
                "fear":       org.get("fear_level"),
                "infection":  org.get("infection"),
                "curiosity":  (org.get("traits") or {}).get("curiosity"),
                "social":     (org.get("traits") or {}).get("social_tendency"),
                "resilience": (org.get("traits") or {}).get("resilience"),
            },
            "world": {
                "season":  season,
                "weather": weather,
                "is_day":  is_day,
                "era":     era,
            },
            "discoveries": list(org.get("discoveries") or []),
        })
    return rows


async def collect(args: argparse.Namespace) -> int:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    last_tick = -10**9
    deadline = (time.monotonic() + args.duration) if args.duration > 0 else None

    async with websockets.connect(args.url) as ws, args.output.open("a", encoding="utf-8") as out:
        while True:
            if deadline is not None and time.monotonic() > deadline:
                break
            raw = await ws.recv()
            try:
                snapshot = json.loads(raw)
            except json.JSONDecodeError:
                continue
            tick = snapshot.get("tick")
            if tick is None or tick - last_tick < args.min_tick_gap:
                continue
            last_tick = tick
            for row in organism_event_rows(snapshot):
                out.write(json.dumps(row, ensure_ascii=False))
                out.write("\n")
                written += 1
            out.flush()

    print(f"wrote {written} thought events to {args.output}", file=sys.stderr)
    return 0


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(collect(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
