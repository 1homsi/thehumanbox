from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable, Optional

try:
    import websockets
except ImportError:
    websockets = None

try:
    import msgpack
except ImportError:
    msgpack = None

FilterFn = Callable[[dict[str, Any]], bool]
SinkFn = Callable[[dict[str, Any]], Any]


def _decode(raw: bytes | str) -> Optional[dict[str, Any]]:
    if isinstance(raw, (bytes, bytearray)):
        if msgpack is not None:
            try:
                obj = msgpack.unpackb(raw, raw=False)
                if isinstance(obj, dict):
                    return obj
            except Exception:
                pass
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                return obj
        except Exception:
            return None
        return None
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return obj
    except Exception:
        return None
    return None


async def stream(
    url: str,
    filter_fn: FilterFn,
    sink_fn: SinkFn,
    until: Optional[Callable[[int, dict[str, Any]], bool]] = None,
) -> int:
    if websockets is None:
        raise RuntimeError("websockets package not installed")
    received = 0
    accepted = 0
    async with websockets.connect(url) as ws:
        while True:
            raw = await ws.recv()
            frame = _decode(raw)
            received += 1
            if frame is None:
                continue
            if not filter_fn(frame):
                if until is not None and until(received, frame):
                    break
                continue
            res = sink_fn(frame)
            if asyncio.iscoroutine(res):
                await res
            accepted += 1
            if until is not None and until(received, frame):
                break
    return accepted
