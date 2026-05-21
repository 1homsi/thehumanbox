from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.scoring.calibrator import fit


def load_pairs(path: Path, heuristic_col: str, label_col: str) -> list[tuple[float, float]]:
    pairs: list[tuple[float, float]] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if heuristic_col not in row or label_col not in row:
                continue
            try:
                pairs.append((float(row[heuristic_col]), float(row[label_col])))
            except (TypeError, ValueError):
                continue
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--heuristic-col", default="heuristic")
    parser.add_argument("--label-col", default="human")
    args = parser.parse_args()
    pairs = load_pairs(Path(args.input), args.heuristic_col, args.label_col)
    calibration = fit(pairs)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(f"fit {int(calibration.get('n', 0.0))} pairs -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
