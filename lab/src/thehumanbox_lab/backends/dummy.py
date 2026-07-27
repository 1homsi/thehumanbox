from __future__ import annotations

import hashlib


class DummyBackend:
    name = "dummy"

    def __init__(self, model: str = "dummy", seed: int = 0) -> None:
        self.model = model
        self.seed = seed
        self.calls = 0

    def _hash(self, text: str) -> str:
        digest = hashlib.sha256(f"{self.seed}:{text}".encode()).hexdigest()
        return digest

    def complete(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> str:
        self.calls += 1
        digest = self._hash(prompt)
        token_count = max(1, min(max_tokens, 16))
        chunks = [digest[i : i + 4] for i in range(0, token_count * 4, 4)]
        text = " ".join(chunks)
        if stop:
            for marker in stop:
                if marker and marker in text:
                    text = text.split(marker, 1)[0]
        return text.strip()

    def health(self) -> bool:
        return True
