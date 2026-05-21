from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from thehumanbox_lab.trace.diff import snapshot_delta


def _load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        raise SystemExit(f"{path}: empty file")
    if text.startswith("{"):
        first_nl = text.find("\n")
        if first_nl == -1:
            return json.loads(text)
        first = text[:first_nl].strip()
        try:
            return json.loads(first)
        except json.JSONDecodeError:
            return json.loads(text)
    raise SystemExit(f"{path}: not JSON")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Diff two snapshot JSON files.")
    p.add_argument("prev", type=Path)
    p.add_argument("cur", type=Path)
    p.add_argument("--output", type=Path, default=None)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    prev = _load(args.prev)
    cur = _load(args.cur)
    delta = snapshot_delta(prev, cur)
    payload = json.dumps(delta, ensure_ascii=False, indent=2)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        sys.stdout.write(payload + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
