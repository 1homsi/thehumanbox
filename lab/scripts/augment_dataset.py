from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.synth import augment_set


def _load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Augment a JSONL dataset using synth tools.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--field", default="prompt")
    parser.add_argument("--multiplier", type=float, default=3.0)
    parser.add_argument("--ops", default="paraphrase,permute")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rows = _load_jsonl(args.input)
    if not rows:
        print("No rows found in input.", file=sys.stderr)
        return 1
    prompts = [str(row.get(args.field, "")) for row in rows]
    target_n = max(len(prompts), int(len(prompts) * args.multiplier))
    ops = [op.strip() for op in args.ops.split(",") if op.strip()]
    augmented = augment_set(prompts, target_n=target_n, ops=ops, seed=args.seed)

    out_rows: list[dict] = []
    template = rows[0] if rows else {}
    for idx, text in enumerate(augmented):
        if idx < len(rows):
            base = dict(rows[idx])
        else:
            base = dict(template)
            base["augmented"] = True
        base[args.field] = text
        out_rows.append(base)
    _write_jsonl(args.output, out_rows)
    print(f"Wrote {len(out_rows)} rows to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
