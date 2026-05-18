from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Iterator, Mapping, Any

def read_jsonl(path: str | Path) -> Iterator[dict[str, Any]]:
    file_path = Path(path)
    with file_path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                value = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSONL in {file_path} at line {line_no}: {exc}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"expected JSON object in {file_path} at line {line_no}")
            yield value

def write_jsonl(path: str | Path, rows: Iterable[Mapping[str, Any]]) -> None:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with file_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(dict(row), ensure_ascii=True) + "\n")
