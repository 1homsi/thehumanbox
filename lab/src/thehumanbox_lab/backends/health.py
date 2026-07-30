from __future__ import annotations

import time
from collections.abc import Iterable

from . import KNOWN_BACKENDS, get_backend

SMOKE_PROMPT = "ping"

def probe_one(name: str, **opts) -> dict:
    info: dict = {"available": False, "latency_ms": None, "version": None, "error": None}
    try:
        backend = get_backend(name, **opts)
    except Exception as exc:  # noqa: BLE001 - adapters may raise provider-specific errors
        info["error"] = f"init: {exc}"
        return info
    start = time.perf_counter()
    try:
        healthy = bool(backend.health())
    except Exception as exc:  # noqa: BLE001 - health probes must isolate adapter failures
        info["error"] = f"health: {exc}"
        return info
    info["available"] = healthy
    info["latency_ms"] = round((time.perf_counter() - start) * 1000.0, 2)
    if healthy:
        try:
            sample = backend.complete(SMOKE_PROMPT, max_tokens=4, temperature=0.0)
            info["version"] = sample[:64] if isinstance(sample, str) else None
        except Exception as exc:  # noqa: BLE001 - smoke probes report arbitrary adapter failures
            info["error"] = f"smoke: {exc}"
    return info

def probe_all(names: Iterable[str] | None = None, **opts) -> dict[str, dict]:
    selected = list(names) if names is not None else list(KNOWN_BACKENDS)
    return {name: probe_one(name, **opts.get(name, {})) for name in selected}
