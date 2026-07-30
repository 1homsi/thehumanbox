from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

Record = dict[str, Any]


def _prompt(record: Record) -> str:
    return str(record.get("prompt", ""))


def _completion(record: Record) -> str:
    if "completion" in record:
        return str(record["completion"])
    if "response" in record:
        return str(record["response"])
    return ""


def _system(record: Record) -> str:
    return str(record.get("system", record.get("system_prompt", "")))


def to_chatml(records: list[Record]) -> list[str]:
    lines: list[str] = []
    for record in records:
        parts: list[str] = []
        system = _system(record)
        if system:
            parts.append(f"<|im_start|>system\n{system}<|im_end|>")
        parts.append(f"<|im_start|>user\n{_prompt(record)}<|im_end|>")
        parts.append(f"<|im_start|>assistant\n{_completion(record)}<|im_end|>")
        lines.append("\n".join(parts))
    return lines


def to_llama3(records: list[Record]) -> list[str]:
    lines: list[str] = []
    for record in records:
        parts = ["<|begin_of_text|>"]
        system = _system(record)
        if system:
            parts.append(
                f"<|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|>"
            )
        parts.append(
            f"<|start_header_id|>user<|end_header_id|>\n\n{_prompt(record)}<|eot_id|>"
        )
        parts.append(
            "<|start_header_id|>assistant<|end_header_id|>\n\n"
            f"{_completion(record)}<|eot_id|>"
        )
        lines.append("".join(parts))
    return lines


def to_alpaca(records: list[Record]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for record in records:
        out.append(
            {
                "instruction": _prompt(record),
                "input": str(record.get("input", "")),
                "output": _completion(record),
            }
        )
    return out


def to_openai_jsonl(records: list[Record]) -> list[str]:
    out: list[str] = []
    for record in records:
        messages: list[dict[str, str]] = []
        system = _system(record)
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": _prompt(record)})
        messages.append({"role": "assistant", "content": _completion(record)})
        out.append(json.dumps({"messages": messages}, ensure_ascii=False))
    return out


_DISPATCH: dict[str, Callable[[list[Record]], list[Any]]] = {
    "chatml": to_chatml,
    "llama3": to_llama3,
    "llama-3-instruct": to_llama3,
    "alpaca": to_alpaca,
    "openai": to_openai_jsonl,
    "openai-jsonl": to_openai_jsonl,
}


def format(records: list[Record], kind: str) -> list[Any]:
    key = kind.lower().strip()
    if key not in _DISPATCH:
        raise ValueError(f"unknown formatter kind: {kind}")
    return _DISPATCH[key](records)
