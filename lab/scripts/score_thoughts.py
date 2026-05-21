from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.scoring import DEFAULT_DIMS, score
from thehumanbox_lab.scoring.aggregator import composite


def iter_rows(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def write_rows(rows, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def parse_weights(spec: str | None, dims: list[str]) -> dict[str, float]:
    if not spec:
        return {dim: 1.0 for dim in dims}
    weights: dict[str, float] = {}
    for chunk in spec.split(","):
        if not chunk.strip():
            continue
        name, value = chunk.split("=")
        weights[name.strip()] = float(value)
    return weights


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--field", default="response")
    parser.add_argument("--dims", default=",".join(DEFAULT_DIMS))
    parser.add_argument("--weights", default=None)
    args = parser.parse_args()
    dims = [token.strip() for token in args.dims.split(",") if token.strip()]
    weights = parse_weights(args.weights, dims)
    scored = []
    for row in iter_rows(Path(args.input)):
        text = str(row.get(args.field, ""))
        per_dim = score(text, dims=dims)
        row["scores"] = per_dim
        row["composite"] = composite(per_dim, weights)
        scored.append(row)
    write_rows(scored, Path(args.output))
    print(f"scored {len(scored)} rows -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
