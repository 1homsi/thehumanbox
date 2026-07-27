from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from thehumanbox_lab.training.hp_search import config_hash, grid, random_sample


def _load_spec(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise TypeError("spec file must be a JSON list of {name, values} objects")
    return data


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Generate hyperparameter search grids.")
    parser.add_argument("spec", type=Path, help="JSON file: [{name, values}, ...]")
    parser.add_argument(
        "--mode", choices=("grid", "random"), default="grid", help="search mode"
    )
    parser.add_argument("--n", type=int, default=8, help="random sample count")
    parser.add_argument("--seed", type=int, default=0, help="random seed")
    parser.add_argument("--out", type=Path, default=None, help="write JSONL to file")
    args = parser.parse_args(argv[1:])

    spaces = _load_spec(args.spec)
    if args.mode == "grid":
        combos = grid(spaces)
    else:
        combos = random_sample(spaces, args.n, args.seed)

    lines = []
    for combo in combos:
        record = {"hash": config_hash(combo), "config": combo}
        lines.append(json.dumps(record, sort_keys=True))

    output = "\n".join(lines) + ("\n" if lines else "")
    if args.out is not None:
        args.out.write_text(output, encoding="utf-8")
        print(f"wrote {len(combos)} configs to {args.out}")
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
