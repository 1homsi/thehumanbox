from __future__ import annotations

import json
import os
from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path
from typing import Any


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
                raise TypeError(f"expected JSON object in {file_path} at line {line_no}")
            yield value

def write_jsonl(path: str | Path, rows: Iterable[Mapping[str, Any]]) -> None:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a sibling temp file and rename, so an interrupted run cannot
    # leave a truncated dataset that `read_jsonl` then rejects at the first
    # partial line. The previous `"w"` mode truncated the destination before
    # writing anything.
    tmp_path = file_path.with_name(file_path.name + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(dict(row), ensure_ascii=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_path, file_path)
