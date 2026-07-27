from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Backend(Protocol):
    name: str

    def complete(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> str: ...

    def health(self) -> bool: ...

def get_backend(name: str, **opts: Any) -> Backend:
    key = name.lower()
    if key == "ollama":
        from .ollama import OllamaBackend
        return OllamaBackend(**opts)
    if key in ("llamacpp", "llama.cpp", "llama_cpp"):
        from .llamacpp import LlamaCppBackend
        return LlamaCppBackend(**opts)
    if key in ("openai", "openai_compat", "openai-compat"):
        from .openai_compat import OpenAICompatBackend
        return OpenAICompatBackend(**opts)
    if key == "groq":
        from .groq import GroqBackend
        return GroqBackend(**opts)
    if key == "dummy":
        from .dummy import DummyBackend
        return DummyBackend(**opts)
    raise ValueError(f"unknown backend: {name}")

KNOWN_BACKENDS = ("ollama", "llamacpp", "openai_compat", "groq", "dummy")

__all__ = ["KNOWN_BACKENDS", "Backend", "get_backend"]
