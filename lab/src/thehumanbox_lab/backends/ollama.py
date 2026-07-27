from __future__ import annotations

import json
import urllib.error
import urllib.request


class OllamaBackend:
    name = "ollama"

    def __init__(
        self,
        model: str = "gemma3:270m",
        base_url: str = "http://127.0.0.1:11434",
        timeout: float = 60.0,
        system: str | None = None,
    ) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.system = system or ""

    def _post(self, path: str, payload: dict) -> dict:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def complete(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> str:
        options: dict = {"temperature": temperature, "num_predict": max_tokens}
        if stop:
            options["stop"] = list(stop)
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "system": self.system,
            "options": options,
        }
        body = self._post("/api/generate", payload)
        return str(body.get("response", "")).strip()

    def health(self) -> bool:
        try:
            request = urllib.request.Request(f"{self.base_url}/api/tags", method="GET")
            with urllib.request.urlopen(request, timeout=3.0) as response:
                return response.status == 200
        except (urllib.error.URLError, OSError, TimeoutError):
            return False
