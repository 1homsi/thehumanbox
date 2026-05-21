from __future__ import annotations

import json
import re
from typing import Callable

JUDGE_SYSTEM = (
    "You are an impartial judge comparing two short organism thoughts. "
    "Pick the one that is more grounded, in-character, and respects the situation. "
    "Respond with strict JSON: {\"winner\": \"A\"|\"B\"|\"tie\", \"reason\": \"...\"}."
)

JUDGE_TEMPLATE = (
    "Prompt:\n{prompt}\n\n"
    "Response A:\n{a}\n\n"
    "Response B:\n{b}\n\n"
    "Return only JSON with keys winner and reason."
)

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse(raw: str) -> dict[str, str]:
    if not raw:
        return {"winner": "tie", "reason": "empty judge response"}
    match = _JSON_RE.search(raw)
    if not match:
        return {"winner": "tie", "reason": raw.strip()[:200]}
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {"winner": "tie", "reason": raw.strip()[:200]}
    winner = str(parsed.get("winner", "tie")).strip().lower()
    if winner not in {"a", "b", "tie"}:
        winner = "tie"
    return {"winner": winner, "reason": str(parsed.get("reason", ""))[:400]}


def judge_pair(
    prompt: str,
    response_a: str,
    response_b: str,
    judge_model_fn: Callable[[str, str], str],
) -> dict[str, str]:
    rendered = JUDGE_TEMPLATE.format(prompt=prompt, a=response_a, b=response_b)
    raw = judge_model_fn(JUDGE_SYSTEM, rendered)
    return _parse(raw)


def judge_dataset(
    prompts: list[str],
    responses_a: list[str],
    responses_b: list[str],
    judge_model_fn: Callable[[str, str], str],
) -> dict[str, object]:
    if not (len(prompts) == len(responses_a) == len(responses_b)):
        raise ValueError("inputs must align in length")
    rows: list[dict[str, str]] = []
    tallies = {"a": 0, "b": 0, "tie": 0}
    for prompt, ra, rb in zip(prompts, responses_a, responses_b):
        verdict = judge_pair(prompt, ra, rb, judge_model_fn)
        tallies[verdict["winner"]] += 1
        rows.append({"prompt": prompt, "a": ra, "b": rb, **verdict})
    total = max(len(rows), 1)
    return {
        "summary": {
            "win_rate_a": tallies["a"] / total,
            "win_rate_b": tallies["b"] / total,
            "tie_rate": tallies["tie"] / total,
            "count": float(total),
        },
        "verdicts": rows,
    }
