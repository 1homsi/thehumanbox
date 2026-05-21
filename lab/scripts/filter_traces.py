from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from thehumanbox_lab.trace.filters import (
    by_event_type,
    by_lineage,
    by_org_id,
    by_tick_range,
    compose,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Filter a JSONL trace file by predicates.")
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--lineage", action="append", default=[])
    p.add_argument("--org", action="append", default=[])
    p.add_argument("--event-type", action="append", default=[])
    p.add_argument("--tick-lo", type=int, default=None)
    p.add_argument("--tick-hi", type=int, default=None)
    return p.parse_args()


def build_filter(args: argparse.Namespace):
    filters = []
    if args.lineage:
        filters.append(by_lineage(args.lineage))
    if args.org:
        filters.append(by_org_id(args.org))
    if args.event_type:
        filters.append(by_event_type(args.event_type))
    if args.tick_lo is not None or args.tick_hi is not None:
        lo = args.tick_lo if args.tick_lo is not None else -(10**18)
        hi = args.tick_hi if args.tick_hi is not None else 10**18
        filters.append(by_tick_range(lo, hi))
    if not filters:
        return lambda _r: True
    return compose(*filters)


def main() -> int:
    args = parse_args()
    pred = build_filter(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    kept = 0
    total = 0
    with args.input.open("r", encoding="utf-8") as src, args.output.open("w", encoding="utf-8") as dst:
        for line in src:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(rec, dict):
                continue
            if pred(rec):
                dst.write(json.dumps(rec, ensure_ascii=False))
                dst.write("\n")
                kept += 1
    print(f"kept {kept}/{total} records -> {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
