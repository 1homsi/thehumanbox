from __future__ import annotations

import re
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from statistics import mean

from .baseline import predict_thought
from .ollama_client import generate
from .schemas import ThoughtExample
from .task_specs import THOUGHT_V1, TaskSpec, compact_response

WORD_RE = re.compile(r"[a-z0-9']+")

@dataclass(slots=True)
class EvalPrediction:
    organism_id: str
    expected: str
    predicted: str
    exact_match: bool
    token_jaccard: float
    latency_ms: float
    predicted_chars: int
    tags: list[str]

    def to_row(self) -> dict[str, object]:
        return asdict(self)

def normalize_tokens(text: str) -> set[str]:
    return set(WORD_RE.findall(text.lower()))

def token_jaccard(left: str, right: str) -> float:
    left_tokens = normalize_tokens(left)
    right_tokens = normalize_tokens(right)
    if not left_tokens and not right_tokens:
        return 1.0
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = left_tokens & right_tokens
    union = left_tokens | right_tokens
    return len(overlap) / len(union)

def baseline_engine(prompt: str) -> str:
    return predict_thought(prompt)

def ollama_engine(
    model: str, temperature: float = 0.2, task_spec: TaskSpec = THOUGHT_V1
) -> Callable[[str], str]:
    def run(prompt: str) -> str:
        response = generate(
            model=model,
            prompt=prompt,
            temperature=temperature,
            system=task_spec.system_prompt,
        )
        return compact_response(response, task_spec.max_words)

    return run

def run_eval(examples: list[ThoughtExample], engine: Callable[[str], str]) -> tuple[dict[str, float], list[EvalPrediction]]:
    predictions: list[EvalPrediction] = []
    for example in examples:
        started = time.perf_counter()
        predicted = engine(example.prompt).strip()
        latency_ms = (time.perf_counter() - started) * 1000.0
        expected = example.response.strip()
        predictions.append(
            EvalPrediction(
                organism_id=example.organism_id,
                expected=expected,
                predicted=predicted,
                exact_match=predicted.lower() == expected.lower(),
                token_jaccard=token_jaccard(predicted, expected),
                latency_ms=latency_ms,
                predicted_chars=len(predicted),
                tags=example.tags,
            )
        )

    summary = {
        "count": float(len(predictions)),
        "exact_match": mean(item.exact_match for item in predictions) if predictions else 0.0,
        "token_jaccard": mean(item.token_jaccard for item in predictions) if predictions else 0.0,
        "avg_latency_ms": mean(item.latency_ms for item in predictions) if predictions else 0.0,
        "avg_predicted_chars": mean(item.predicted_chars for item in predictions) if predictions else 0.0,
    }
    return summary, predictions

def run_sweep(
    examples: list[ThoughtExample], engines: dict[str, Callable[[str], str]]
) -> list[dict[str, float | str]]:
    results: list[dict[str, float | str]] = []
    for name, engine in engines.items():
        summary, _ = run_eval(examples, engine)
        results.append({"engine": name, **summary})
    results.sort(key=lambda item: (float(item["token_jaccard"]), -float(item["avg_latency_ms"])), reverse=True)
    return results
