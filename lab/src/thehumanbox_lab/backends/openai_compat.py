from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

class OpenAICompatBackend:
    name = "openai_compat"

    def __init__(
        self,
        model: str = "gpt-3.5-turbo",
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.model = model
        self.base_url = (base_url or os.environ.get("OPENAI_BASE_URL") or "http://127.0.0.1:8000/v1").rstrip("/")
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY") or ""
        self.timeout = timeout

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def complete(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> str:
        payload: dict = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if stop:
            payload["stop"] = list(stop)
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=data,
            headers=self._headers(),
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
        choices = body.get("choices") or []
        if not choices:
            return ""
        message = choices[0].get("message") or {}
        return str(message.get("content", "")).strip()

    def health(self) -> bool:
        try:
            request = urllib.request.Request(
                f"{self.base_url}/models", headers=self._headers(), method="GET"
            )
            with urllib.request.urlopen(request, timeout=3.0) as response:
                return response.status == 200
        except (urllib.error.URLError, OSError, TimeoutError):
            return False
