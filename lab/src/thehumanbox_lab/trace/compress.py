from __future__ import annotations

import gzip
from pathlib import Path
from typing import IO, Any, Self

try:
    import zstandard
except ImportError:
    zstandard = None


class _ZstdWriter:
    def __init__(self, path: Path) -> None:
        if zstandard is None:
            raise RuntimeError("zstandard not installed")
        self._raw: IO[bytes] = open(path, "wb")  # noqa: SIM115 - this class owns and closes it
        self._cctx = zstandard.ZstdCompressor()
        self._stream = self._cctx.stream_writer(self._raw)

    def write(self, data: bytes | str) -> int:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return self._stream.write(data)

    def flush(self) -> None:
        self._stream.flush()

    def close(self) -> None:
        try:
            self._stream.close()
        finally:
            self._raw.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class _GzipWriter:
    def __init__(self, path: Path) -> None:
        self._fp = gzip.open(path, "wb")  # noqa: SIM115 - this class owns and closes it

    def write(self, data: bytes | str) -> int:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return self._fp.write(data)

    def flush(self) -> None:
        self._fp.flush()

    def close(self) -> None:
        self._fp.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def compressed_sink(path: Path | str, mode: str = "gzip") -> Any:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    mode = mode.lower()
    if mode in ("gzip", "gz"):
        return _GzipWriter(p)
    if mode in ("zstd", "zst"):
        return _ZstdWriter(p)
    if mode in ("none", "raw"):
        return open(p, "wb")
    raise ValueError(f"unknown compression mode: {mode}")
