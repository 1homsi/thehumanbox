from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from typing import Any


def command_version(command: str, args: list[str]) -> str | None:
    path = shutil.which(command)
    if not path:
        return None
    try:
        result = subprocess.run(
            [command, *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return f"{path} (found, version check failed)"
    output = (result.stdout or result.stderr).strip().splitlines()
    version = output[0] if output else "version unknown"
    return f"{path} :: {version}"


def list_ollama_models() -> list[dict[str, Any]]:
    path = shutil.which("ollama")
    if not path:
        return []
    try:
        result = subprocess.run(
            ["ollama", "list"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return []
    lines = [line.rstrip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) <= 1:
        return []
    models: list[dict[str, Any]] = []
    for line in lines[1:]:
        parts = line.split()
        if len(parts) < 4:
            continue
        models.append(
            {
                "name": parts[0],
                "id": parts[1],
                "size": parts[2],
            }
        )
    return models


def installed_ollama_model_names() -> list[str]:
    return [model["name"] for model in list_ollama_models()]


def probe_stack() -> dict[str, str]:
    result = {
        "python": sys.executable,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }
    for command, args in [
        ("ollama", ["--version"]),
        ("llama-cli", ["--version"]),
        ("python3", ["--version"]),
    ]:
        result[command] = command_version(command, args) or "not found"
    models = list_ollama_models()
    if models:
        result["ollama_models"] = ", ".join(model["name"] for model in models)
    return result
