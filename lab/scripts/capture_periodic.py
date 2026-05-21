from __future__ import annotations

import argparse
import sys
from pathlib import Path

from thehumanbox_lab.trace.snapshot_fetcher import fetch_periodic


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Capture N HTTP /snapshot frames at fixed interval.")
    p.add_argument("--url", default="http://localhost:8081/snapshot")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--interval", type=float, default=1.0)
    p.add_argument("--count", type=int, default=60)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    try:
        written = fetch_periodic(args.url, args.interval, args.count, args.output)
    except KeyboardInterrupt:
        return 130
    print(f"wrote {written} snapshots to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
