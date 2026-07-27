from __future__ import annotations

import functools
from collections.abc import Callable

from .disk import DiskCache, cache_call


def lru_disk(root: str = ".cache/thb-lab", ttl_seconds: float | None = None) -> Callable:
    def decorator(fn: Callable) -> Callable:
        cache = DiskCache(root=root, ttl_seconds=ttl_seconds)

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return cache_call(cache, fn, *args, **kwargs)

        wrapper.cache = cache
        return wrapper
    return decorator
