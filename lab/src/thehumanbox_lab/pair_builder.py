from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

Record = dict[str, Any]


def _prompt_of(record: Record) -> str:
    return str(record.get("prompt", ""))


def _completion_of(record: Record) -> str:
    if "completion" in record:
        return str(record["completion"])
    if "response" in record:
        return str(record["response"])
    if "teacher_response" in record:
        return str(record["teacher_response"])
    return ""


def _group_by_prompt(records: list[Record]) -> dict[str, list[Record]]:
    grouped: dict[str, list[Record]] = defaultdict(list)
    for record in records:
        grouped[_prompt_of(record)].append(record)
    return grouped


def pair_by_temperature(
    records: list[Record], low_max: float = 0.4, high_min: float = 0.8
) -> list[Record]:
    pairs: list[Record] = []
    for prompt, group in _group_by_prompt(records).items():
        lows = [r for r in group if float(r.get("temperature", 0.0)) <= low_max]
        highs = [r for r in group if float(r.get("temperature", 0.0)) >= high_min]
        for low in lows:
            for high in highs:
                chosen = _completion_of(low)
                rejected = _completion_of(high)
                if not chosen or not rejected or chosen == rejected:
                    continue
                pairs.append({"prompt": prompt, "chosen": chosen, "rejected": rejected})
    return pairs


def pair_by_score(
    records: list[Record], score_key: str = "score", min_gap: float = 0.0
) -> list[Record]:
    pairs: list[Record] = []
    for prompt, group in _group_by_prompt(records).items():
        scored = [r for r in group if score_key in r]
        if len(scored) < 2:
            continue
        scored.sort(key=lambda r: float(r[score_key]))
        worst = scored[0]
        best = scored[-1]
        gap = float(best[score_key]) - float(worst[score_key])
        if gap < min_gap:
            continue
        chosen = _completion_of(best)
        rejected = _completion_of(worst)
        if not chosen or not rejected or chosen == rejected:
            continue
        pairs.append({"prompt": prompt, "chosen": chosen, "rejected": rejected})
    return pairs


def build_pairs(
    records: list[Record],
    strategy: str = "auto",
    score_key: str = "score",
    low_max: float = 0.4,
    high_min: float = 0.8,
    min_gap: float = 0.0,
) -> list[Record]:
    if strategy == "temperature":
        return pair_by_temperature(records, low_max=low_max, high_min=high_min)
    if strategy == "score":
        return pair_by_score(records, score_key=score_key, min_gap=min_gap)
    if strategy == "auto":
        if any(score_key in r for r in records):
            return pair_by_score(records, score_key=score_key, min_gap=min_gap)
        return pair_by_temperature(records, low_max=low_max, high_min=high_min)
    raise ValueError(f"unknown pair strategy: {strategy}")


def to_jsonl(pairs: list[Record]) -> list[str]:
    return [json.dumps(p, ensure_ascii=False) for p in pairs]
