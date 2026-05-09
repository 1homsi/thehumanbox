from __future__ import annotations

import hashlib
from typing import Any


def stable_split_key(prompt: str) -> float:
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def split_rows(
    rows: list[dict[str, Any]], validation_ratio: float = 0.15
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    train: list[dict[str, Any]] = []
    valid: list[dict[str, Any]] = []
    for row in rows:
        prompt = str(row.get("prompt", ""))
        if stable_split_key(prompt) < validation_ratio:
            valid.append(row)
        else:
            train.append(row)
    if rows and not valid and len(train) > 1:
        valid.append(train.pop())
    if rows and not train and len(valid) > 1:
        train.append(valid.pop())
    return train, valid


def teacher_rows_to_sft(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dataset: list[dict[str, Any]] = []
    for row in rows:
        dataset.append(
            {
                "messages": [
                    {"role": "system", "content": row.get("system_prompt", "")},
                    {"role": "user", "content": str(row["prompt"])},
                    {"role": "assistant", "content": str(row["teacher_response"])},
                ],
                "metadata": {
                    "task": row.get("task", "unknown"),
                    "teacher_model": row.get("teacher_model", "unknown"),
                    "organism_id": row.get("organism_id", ""),
                    "lineage_id": row.get("lineage_id", ""),
                    "reference_response": row.get("reference_response", ""),
                    "tags": row.get("tags", []),
                },
            }
        )
    return dataset
