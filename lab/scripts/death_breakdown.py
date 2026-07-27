from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

from thehumanbox_lab.behavior import aggregate_deaths


def _load_snapshot(source: str) -> dict:
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    return json.loads(Path(source).read_text(encoding="utf-8"))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Print a death-cause breakdown for a snapshot")
    p.add_argument("--snapshot", default="http://localhost:8081/snapshot")
    p.add_argument("--json", action="store_true", help="Emit JSON instead of a table")
    return p.parse_args()


def _table(breakdown) -> str:
    lines: list[str] = []
    lines.append(f"total: {breakdown.total}")
    lines.append("")
    lines.append("cause           count")
    lines.append("-" * 25)
    for cause, count in sorted(breakdown.by_cause.items(), key=lambda kv: -kv[1]):
        lines.append(f"{cause:<15} {count}")
    if breakdown.by_lineage:
        lines.append("")
        lines.append("by lineage:")
        for lin, sub in sorted(breakdown.by_lineage.items()):
            inline = ", ".join(f"{k}={v}" for k, v in sorted(sub.items()))
            lines.append(f"  {lin}: {inline}")
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    try:
        snap = _load_snapshot(args.snapshot)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"failed to load snapshot: {exc}", file=sys.stderr)
        return 2
    breakdown = aggregate_deaths(snap)
    if args.json:
        sys.stdout.write(json.dumps(breakdown.to_row(), indent=2) + "\n")
    else:
        sys.stdout.write(_table(breakdown))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
