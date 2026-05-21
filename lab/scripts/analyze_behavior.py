from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

from thehumanbox_lab.behavior import render_report


def _load_snapshot(source: str) -> dict:
    if source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    return json.loads(Path(source).read_text(encoding="utf-8"))


def _load_history(path: str | None) -> list[dict] | None:
    if not path:
        return None
    text = Path(path).read_text(encoding="utf-8")
    text = text.strip()
    if not text:
        return []
    if text.startswith("["):
        data = json.loads(text)
        return [row for row in data if isinstance(row, dict)]
    out: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if isinstance(row, dict):
            out.append(row)
    return out


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Render a behavioral report from a snapshot")
    p.add_argument("--snapshot", default="http://localhost:8081/snapshot",
                   help="HTTP URL or local JSON file containing a /snapshot payload")
    p.add_argument("--history", default=None,
                   help="Optional JSON / JSONL file with a series of past snapshots")
    p.add_argument("--output", type=Path, default=None,
                   help="Write the Markdown report to this path (default: stdout)")
    p.add_argument("--ngram", type=int, default=3)
    p.add_argument("--top", type=int, default=15)
    p.add_argument("--migration-threshold", type=float, default=15.0)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    try:
        snapshot = _load_snapshot(args.snapshot)
    except Exception as exc:
        print(f"failed to load snapshot from {args.snapshot}: {exc}", file=sys.stderr)
        return 2
    history = _load_history(args.history)
    report = render_report(
        snapshot,
        history_snapshots=history,
        ngram_size=args.ngram,
        ngram_top=args.top,
        migration_threshold=args.migration_threshold,
    )
    if args.output is None:
        sys.stdout.write(report)
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8")
        print(f"wrote {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
