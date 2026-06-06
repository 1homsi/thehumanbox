from __future__ import annotations

import json
from dataclasses import dataclass, asdict, fields
from pathlib import Path
from typing import Any, Optional

from .local_stack import installed_ollama_model_names


@dataclass
class ModelEntry:
    name: str
    family: str
    params_b: float
    base_url_pattern: Optional[str] = None
    license: Optional[str] = None
    quantization: Optional[str] = None
    default_temp: Optional[float] = None
    default_max_tokens: Optional[int] = None
    cost_per_million_tokens: Optional[float] = None
    source: Optional[str] = None
    eval_baseline_score: Optional[float] = None
    last_updated: Optional[str] = None
    runtime: Optional[str] = None
    id: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ModelEntry":
        allowed = {f.name for f in fields(cls)}
        kwargs = {k: v for k, v in raw.items() if k in allowed}
        if "name" not in kwargs and "id" in kwargs:
            kwargs["name"] = kwargs["id"]
        if "params_b" not in kwargs:
            kwargs["params_b"] = 0.0
        if "family" not in kwargs:
            kwargs["family"] = "unknown"
        return cls(**kwargs)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def default_registry_path() -> Path:
    return Path(__file__).resolve().parents[2] / "models" / "registry.json"


def _read_raw(path: str | Path | None = None) -> dict[str, Any]:
    registry_path = Path(path) if path else default_registry_path()
    with registry_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_registry(path: str | Path | None = None) -> list[ModelEntry]:
    raw = _read_raw(path)
    return [ModelEntry.from_dict(m) for m in raw.get("models", [])]


def load_registry_raw(path: str | Path | None = None) -> dict[str, Any]:
    return _read_raw(path)


def find(name: str, path: str | Path | None = None) -> Optional[ModelEntry]:
    for entry in load_registry(path):
        if entry.name == name or entry.id == name:
            return entry
    return None


def filter(
    family: Optional[str] = None,
    max_params_b: Optional[float] = None,
    min_eval: Optional[float] = None,
    license: Optional[str] = None,
    path: str | Path | None = None,
) -> list[ModelEntry]:
    out: list[ModelEntry] = []
    for entry in load_registry(path):
        if family is not None and entry.family != family:
            continue
        if max_params_b is not None and entry.params_b > max_params_b:
            continue
        if min_eval is not None:
            if entry.eval_baseline_score is None or entry.eval_baseline_score < min_eval:
                continue
        if license is not None and entry.license != license:
            continue
        out.append(entry)
    return out


def pretty_table(entries: list[ModelEntry]) -> str:
    headers = ["name", "family", "params_b", "license", "quant", "eval"]
    rows: list[list[str]] = []
    for e in entries:
        rows.append([
            e.name or "",
            e.family or "",
            f"{e.params_b:g}" if e.params_b is not None else "",
            e.license or "",
            e.quantization or "",
            "" if e.eval_baseline_score is None else f"{e.eval_baseline_score:g}",
        ])
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            if len(cell) > widths[i]:
                widths[i] = len(cell)

    def fmt(row: list[str]) -> str:
        return " | ".join(cell.ljust(widths[i]) for i, cell in enumerate(row))

    sep = "-+-".join("-" * w for w in widths)
    lines = [fmt(headers), sep]
    for row in rows:
        lines.append(fmt(row))
    return "\n".join(lines)


def diff(name_a: str, name_b: str, path: str | Path | None = None) -> dict[str, Any]:
    a = find(name_a, path)
    b = find(name_b, path)
    if a is None:
        raise KeyError(f"model not found: {name_a}")
    if b is None:
        raise KeyError(f"model not found: {name_b}")
    ad = a.to_dict()
    bd = b.to_dict()
    keys = sorted(set(ad) | set(bd))
    out: dict[str, Any] = {}
    for k in keys:
        va = ad.get(k)
        vb = bd.get(k)
        if va != vb:
            out[k] = {"a": va, "b": vb}
    return {"a": name_a, "b": name_b, "differences": out}


def load_registry_with_runtime(path: str | Path | None = None) -> dict[str, Any]:
    registry = _read_raw(path)
    installed = set(installed_ollama_model_names())
    enriched_models = []
    for model in registry.get("models", []):
        enriched = dict(model)
        enriched["installed"] = model.get("id") in installed
        enriched_models.append(enriched)
    return {"models": enriched_models}


def _parse_simple_yaml(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'") and len(value) >= 2:
            value = value[1:-1]
        result[key] = value
    return result


def default_cards_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "models" / "cards"


def load_card(card_path: str | Path) -> dict[str, str]:
    p = Path(card_path)
    return _parse_simple_yaml(p.read_text(encoding="utf-8"))


def load_all_cards(cards_dir: str | Path | None = None) -> list[dict[str, str]]:
    directory = Path(cards_dir) if cards_dir else default_cards_dir()
    if not directory.exists():
        return []
    out: list[dict[str, str]] = []
    for entry in sorted(directory.iterdir()):
        if entry.suffix.lower() in {".yaml", ".yml"}:
            out.append(load_card(entry))
    return out


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
