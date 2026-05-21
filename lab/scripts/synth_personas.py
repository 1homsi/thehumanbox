from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.synth import generate_personas


def main() -> int:
    parser = argparse.ArgumentParser(description="Emit N synthetic personas as JSONL.")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    personas = generate_personas(args.count, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as fh:
        for persona in personas:
            fh.write(json.dumps(persona, ensure_ascii=False) + "\n")
    print(f"Wrote {len(personas)} personas to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
