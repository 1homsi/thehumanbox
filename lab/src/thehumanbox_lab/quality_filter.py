from __future__ import annotations

import re
from typing import Any, Iterable

Record = dict[str, Any]

DEFAULT_DROP_PATTERNS: tuple[str, ...] = (
    r"(?i)\bi cannot\b",
    r"(?i)\bi can't\b",
    r"(?i)\bi'm sorry,? but\b",
    r"(?i)\bas an ai\b",
    r"(?i)\bi am unable to\b",
    r"(?i)\bi do not have the ability\b",
)


def _text_of(record: Record, key: str) -> str:
    if key in record:
        return str(record[key])
    if key == "completion":
        if "response" in record:
            return str(record["response"])
        if "teacher_response" in record:
            return str(record["teacher_response"])
    return ""


def is_blank(text: str) -> bool:
    return not text.strip()


def length_ok(text: str, min_len: int, max_len: int) -> bool:
    length = len(text)
    return min_len <= length <= max_len


def matches_any(text: str, patterns: Iterable[re.Pattern[str]]) -> bool:
    for pattern in patterns:
        if pattern.search(text):
            return True
    return False


def _compile(patterns: Iterable[str]) -> list[re.Pattern[str]]:
    return [re.compile(p) for p in patterns]


def filter_records(
    records: list[Record],
    min_len: int = 20,
    max_len: int = 4000,
    drop_patterns: Iterable[str] | None = None,
    prompt_key: str = "prompt",
    completion_key: str = "completion",
    check_prompt: bool = True,
    check_completion: bool = True,
) -> list[Record]:
    patterns = _compile(
        list(drop_patterns) if drop_patterns is not None else list(DEFAULT_DROP_PATTERNS)
    )
    out: list[Record] = []
    for record in records:
        prompt = _text_of(record, prompt_key)
        completion = _text_of(record, completion_key)
        if check_prompt and is_blank(prompt):
            continue
        if check_completion and is_blank(completion):
            continue
        if check_prompt and not length_ok(prompt, min_len, max_len):
            continue
        if check_completion and not length_ok(completion, min_len, max_len):
            continue
        if check_completion and matches_any(completion, patterns):
            continue
        out.append(record)
    return out


def filter_stats(
    records: list[Record],
    filtered: list[Record],
) -> dict[str, int]:
    return {
        "input": len(records),
        "kept": len(filtered),
        "dropped": len(records) - len(filtered),
    }
