from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

State = dict[str, Any]


def _default_state() -> State:
    return {
        "last_frame_id": None,
        "bytes_written": 0,
        "started_at": time.time(),
        "updated_at": time.time(),
    }


def load(path: Path | str) -> State:
    p = Path(path)
    if not p.exists():
        return _default_state()
    try:
        with p.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return _default_state()
    except Exception:
        return _default_state()
    base = _default_state()
    base.update(data)
    return base


def save(path: Path | str, state: State) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(state)
    payload["updated_at"] = time.time()
    fd, tmp_path = tempfile.mkstemp(
        prefix=p.name + ".",
        suffix=".tmp",
        dir=str(p.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, p)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def should_resume(path: Path | str) -> Optional[State]:
    p = Path(path)
    if not p.exists():
        return None
    state = load(p)
    if state.get("last_frame_id") is None and not state.get("bytes_written"):
        return None
    return state
