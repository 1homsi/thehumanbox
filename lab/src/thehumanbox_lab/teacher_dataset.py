from __future__ import annotations

from typing import Any

from .eval_runner import EvalPrediction
from .schemas import ThoughtExample
from .task_specs import THOUGHT_V1, TaskSpec

def build_distillation_rows(
    examples: list[ThoughtExample],
    predictions: list[EvalPrediction],
    teacher_model: str,
    task: str = "thought-generation",
    task_spec: TaskSpec = THOUGHT_V1,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for example, prediction in zip(examples, predictions, strict=True):
        rows.append(
            {
                "task": task,
                "task_spec": task_spec.name,
                "teacher_model": teacher_model,
                "organism_id": example.organism_id,
                "lineage_id": example.lineage_id,
                "prompt": example.prompt,
                "system_prompt": task_spec.system_prompt,
                "teacher_response": prediction.predicted,
                "reference_response": example.response,
                "source_ticks": example.source_ticks,
                "tags": example.tags,
                "teacher_metrics": {
                    "exact_match": prediction.exact_match,
                    "token_jaccard": prediction.token_jaccard,
                    "latency_ms": prediction.latency_ms,
                },
            }
        )
    return rows
