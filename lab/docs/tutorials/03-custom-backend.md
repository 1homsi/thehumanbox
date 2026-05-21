# Implementing a custom backend

The `Backend` protocol lives in
`src/thehumanbox_lab/backends/__init__.py`:

```python
class Backend(Protocol):
    def complete(self, prompt: str, *, max_tokens: int = 256,
                 temperature: float = 0.7, stop: list[str] | None = None) -> str: ...
    def health(self) -> bool: ...
```

To add a new backend (say, `mlx`):

1. Create `src/thehumanbox_lab/backends/mlx.py`:

```python
from __future__ import annotations
import urllib.request, json

class MlxBackend:
    def __init__(self, base_url: str = "http://localhost:8081"):
        self.base_url = base_url.rstrip("/")

    def complete(self, prompt, *, max_tokens=256, temperature=0.7, stop=None):
        body = json.dumps({
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stop": stop or [],
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/v1/completions",
            data=body, headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            obj = json.loads(resp.read())
        return obj["choices"][0]["text"]

    def health(self) -> bool:
        try:
            urllib.request.urlopen(f"{self.base_url}/health", timeout=2).read()
            return True
        except Exception:
            return False
```

2. Register it in `backends/__init__.py` by adding `"mlx"` to
   `KNOWN_BACKENDS` and a case in `get_backend()`.

3. Add a test in `tests/test_backends.py` using a fake HTTP server (or
   just the dummy backend pattern).

That's it — every existing tool (`probe_all`, `RequestManager`,
`eval_ab`, the CLI `backend probe` command) will pick it up.

## Stylistic rules

- No comments in any new code.
- urllib + json stdlib only. If you need an HTTP retry, build a small
  retry decorator next to your backend rather than pulling in
  `requests` / `httpx`.
- The `health()` smoke timeout is always 2 seconds. Never block longer.
