from __future__ import annotations

import hashlib
import json
import os
import pickle
import time
from pathlib import Path
from typing import Any, Callable, Optional


class DiskCache:
    def __init__(self, root: str | Path = ".cache/thb-lab", ttl_seconds: Optional[float] = None) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_seconds

    def _path(self, key: str) -> Path:
        h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
        return self.root / f"{h}.pkl"

    def get(self, key: str) -> Optional[Any]:
        p = self._path(key)
        if not p.exists():
            return None
        if self.ttl is not None and (time.time() - p.stat().st_mtime) > self.ttl:
            try:
                p.unlink()
            except OSError:
                pass
            return None
        try:
            with p.open("rb") as f:
                return pickle.load(f)
        except (pickle.UnpicklingError, EOFError, OSError):
            return None

    def set(self, key: str, value: Any) -> None:
        p = self._path(key)
        tmp = p.with_suffix(".tmp")
        with tmp.open("wb") as f:
            pickle.dump(value, f)
        os.replace(tmp, p)

    def has(self, key: str) -> bool:
        return self.get(key) is not None

    def clear(self) -> int:
        n = 0
        for f in self.root.glob("*.pkl"):
            try:
                f.unlink()
                n += 1
            except OSError:
                pass
        return n


def cache_call(cache: DiskCache, fn: Callable, *args, **kwargs) -> Any:
    key = json.dumps({"fn": fn.__qualname__, "args": list(args), "kwargs": kwargs}, sort_keys=True, default=str)
    hit = cache.get(key)
    if hit is not None:
        return hit
    out = fn(*args, **kwargs)
    cache.set(key, out)
    return out
