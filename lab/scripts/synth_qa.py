from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.synth import generate_qa_pairs


def _fetch_snapshot(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _load_snapshot(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate QA pairs from a sim snapshot.")
    parser.add_argument("--url", default="http://localhost:8080/snapshot")
    parser.add_argument("--snapshot", type=Path, default=None)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    if args.snapshot is not None:
        snapshot = _load_snapshot(args.snapshot)
    else:
        snapshot = _fetch_snapshot(args.url)
    pairs = generate_qa_pairs(snapshot, n=args.count, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as fh:
        for pair in pairs:
            fh.write(json.dumps(pair, ensure_ascii=False) + "\n")
    print(f"Wrote {len(pairs)} QA pairs to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
