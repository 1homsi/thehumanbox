from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path
from typing import Any

try:
    import msgpack
except ImportError:
    msgpack = None

_MSGPACK_HINTS = ("application/msgpack", "application/x-msgpack", "application/octet-stream")


def _decode(body: bytes, content_type: str) -> dict[str, Any]:
    ct = (content_type or "").lower()
    if msgpack is not None and any(h in ct for h in _MSGPACK_HINTS):
        try:
            obj = msgpack.unpackb(body, raw=False)
            if isinstance(obj, dict):
                return obj
        except (TypeError, ValueError, UnicodeError):
            obj = None
    if msgpack is not None and not ct.startswith("application/json"):
        try:
            obj = msgpack.unpackb(body, raw=False)
            if isinstance(obj, dict):
                return obj
        except (TypeError, ValueError, UnicodeError):
            obj = None
    text = body.decode("utf-8", errors="replace")
    obj = json.loads(text)
    if not isinstance(obj, dict):
        raise TypeError("snapshot must decode to dict")
    return obj


def fetch_snapshot(url: str, timeout: float = 10.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"Accept": "application/msgpack, application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        ct = resp.headers.get("Content-Type", "")
    return _decode(body, ct)


def fetch_periodic(
    url: str,
    interval_s: float,
    count: int,
    output_path: Path | str,
) -> int:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with output_path.open("a", encoding="utf-8") as out:
        for i in range(count):
            if i > 0:
                time.sleep(interval_s)
            try:
                snap = fetch_snapshot(url)
            except (OSError, TypeError, ValueError) as exc:
                snap = {"_error": str(exc), "_at": time.time()}
            out.write(json.dumps(snap, ensure_ascii=False))
            out.write("\n")
            out.flush()
            written += 1
    return written
