from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .local_stack import installed_ollama_model_names, list_ollama_models


def default_registry_path() -> Path:
    return Path(__file__).resolve().parents[2] / "models" / "registry.json"


def load_registry(path: str | Path | None = None) -> dict[str, Any]:
    registry_path = Path(path) if path else default_registry_path()
    with registry_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_registry_with_runtime(path: str | Path | None = None) -> dict[str, Any]:
    registry = load_registry(path)
    installed = set(installed_ollama_model_names())
    enriched_models = []
    for model in registry.get("models", []):
        enriched = dict(model)
        enriched["installed"] = model.get("id") in installed
        enriched_models.append(enriched)
    return {"models": enriched_models}


def candidate_ollama_models(path: str | Path | None = None, installed_only: bool = True) -> list[str]:
    registry = load_registry_with_runtime(path)
    models: list[str] = []
    for model in registry.get("models", []):
        if model.get("runtime") != "ollama":
            continue
        if installed_only and not model.get("installed"):
            continue
        models.append(str(model["id"]))
    return models
