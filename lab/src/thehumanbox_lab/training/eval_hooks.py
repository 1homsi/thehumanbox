from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol


@dataclass(slots=True)
class EvalResult:
    epoch: int | None
    step: int | None
    prompt: str
    score: float
    output: str
    extra: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "epoch": self.epoch,
            "step": self.step,
            "prompt": self.prompt,
            "score": self.score,
            "output": self.output,
            "extra": dict(self.extra),
        }


class ScoreFn(Protocol):
    def __call__(self, output: str, reference: str) -> float: ...


class GenerateFn(Protocol):
    def __call__(self, model: Any, prompt: str) -> str: ...


def make_epoch_eval_hook(
    prompts: list[dict[str, str]],
    generate_fn: GenerateFn,
    score_fn: ScoreFn,
    sink: Callable[[EvalResult], None] | None = None,
) -> Callable[[Any, int], list[EvalResult]]:
    def hook(model: Any, epoch: int) -> list[EvalResult]:
        results: list[EvalResult] = []
        for item in prompts:
            prompt = str(item.get("prompt", ""))
            reference = str(item.get("reference", ""))
            output = generate_fn(model, prompt)
            score = float(score_fn(output, reference))
            result = EvalResult(
                epoch=epoch,
                step=None,
                prompt=prompt,
                score=score,
                output=output,
                extra={"reference": reference},
            )
            results.append(result)
            if sink is not None:
                sink(result)
        return results

    return hook


def make_step_eval_hook(
    prompts: list[dict[str, str]],
    generate_fn: GenerateFn,
    score_fn: ScoreFn,
    every_n_steps: int,
    sink: Callable[[EvalResult], None] | None = None,
) -> Callable[[Any, int], list[EvalResult] | None]:
    if every_n_steps <= 0:
        raise ValueError("every_n_steps must be positive")

    def hook(model: Any, step: int) -> list[EvalResult] | None:
        if step <= 0 or step % every_n_steps != 0:
            return None
        results: list[EvalResult] = []
        for item in prompts:
            prompt = str(item.get("prompt", ""))
            reference = str(item.get("reference", ""))
            output = generate_fn(model, prompt)
            score = float(score_fn(output, reference))
            result = EvalResult(
                epoch=None,
                step=step,
                prompt=prompt,
                score=score,
                output=output,
                extra={"reference": reference},
            )
            results.append(result)
            if sink is not None:
                sink(result)
        return results

    return hook


def aggregate_mean(results: list[EvalResult]) -> float:
    if not results:
        return 0.0
    return sum(r.score for r in results) / len(results)
