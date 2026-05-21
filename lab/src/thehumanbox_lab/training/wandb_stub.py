from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any


class WandbStub:
    def __init__(self, log_dir: str | os.PathLike[str] = "lab/runs/wandb_stub") -> None:
        self._log_dir = Path(log_dir)
        self._run_name: str | None = None
        self._run_path: Path | None = None
        self._step = 0
        self._started_at: float | None = None

    def init(self, name: str, config: dict[str, Any] | None = None) -> "WandbStub":
        self._log_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        self._run_name = name
        self._run_path = self._log_dir / f"{name}-{ts}.jsonl"
        self._started_at = time.time()
        self._step = 0
        header = {
            "event": "init",
            "run_name": name,
            "config": dict(config or {}),
            "timestamp": ts,
        }
        self._append(header)
        return self

    def log(self, payload: dict[str, Any], step: int | None = None) -> None:
        if self._run_path is None:
            raise RuntimeError("WandbStub.init must be called before log")
        if step is None:
            self._step += 1
            step = self._step
        else:
            self._step = step
        record = {
            "event": "log",
            "step": step,
            "timestamp": time.time(),
            "data": dict(payload),
        }
        self._append(record)

    def finish(self, status: str = "ok") -> None:
        if self._run_path is None:
            return
        record = {
            "event": "finish",
            "status": status,
            "timestamp": time.time(),
            "duration_seconds": (
                time.time() - self._started_at if self._started_at else None
            ),
        }
        self._append(record)
        self._run_path = None
        self._run_name = None
        self._started_at = None

    @property
    def run_path(self) -> Path | None:
        return self._run_path

    def _append(self, record: dict[str, Any]) -> None:
        assert self._run_path is not None
        with self._run_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, sort_keys=True, default=str))
            fh.write("\n")


_DEFAULT = WandbStub()


def init(name: str, config: dict[str, Any] | None = None) -> WandbStub:
    return _DEFAULT.init(name, config)


def log(payload: dict[str, Any], step: int | None = None) -> None:
    _DEFAULT.log(payload, step)


def finish(status: str = "ok") -> None:
    _DEFAULT.finish(status)
