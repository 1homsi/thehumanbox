from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.request import urlopen

from thehumanbox_lab.language.report import build_report


def _load(source: str) -> dict:
    if source.startswith("http://") or source.startswith("https://"):
        with urlopen(source) as resp:
            raw = resp.read()
    else:
        raw = Path(source).read_bytes()
    try:
        import msgpack
        return msgpack.unpackb(raw, raw=False)
    except Exception:
        return json.loads(raw.decode("utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze vocabulary in a snapshot")
    parser.add_argument("source", help="URL or local file path to a snapshot")
    parser.add_argument("--previous", help="Optional previous snapshot for spread analysis")
    parser.add_argument("--clusters", type=int, default=4)
    parser.add_argument(
        "--concepts",
        nargs="*",
        default=["food", "water", "danger", "tribe"],
    )
    args = parser.parse_args(argv)
    snap = _load(args.source)
    prev = _load(args.previous) if args.previous else None
    report = build_report(snap, previous=prev, concepts=args.concepts, n_clusters=args.clusters)
    sys.stdout.write(report)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
