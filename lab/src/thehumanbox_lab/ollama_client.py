from __future__ import annotations

import json
import urllib.error
import urllib.request


class OllamaError(RuntimeError):
    pass


def generate(
    model: str,
    prompt: str,
    temperature: float = 0.2,
    host: str = "http://127.0.0.1:11434",
    system: str | None = None,
) -> str:
    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "system": system or "",
            "options": {"temperature": temperature},
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{host}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise OllamaError(f"failed to reach Ollama at {host}: {exc}") from exc
    return str(body.get("response", "")).strip()
