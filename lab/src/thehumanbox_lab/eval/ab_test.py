from __future__ import annotations

import time
from collections.abc import Callable
from statistics import mean

from .metrics import bleu, chrf, jaccard_words, rouge_l
from .semantic import tfidf_cosine


def _score_row(pred_a: str, pred_b: str, ref: str | None) -> dict[str, float]:
    row = {
        "ab_tfidf": tfidf_cosine(pred_a, pred_b),
    }
    if ref is not None:
        row.update(
            {
                "a_bleu": bleu(pred_a, ref),
                "b_bleu": bleu(pred_b, ref),
                "a_rouge_l": rouge_l(pred_a, ref),
                "b_rouge_l": rouge_l(pred_b, ref),
                "a_chrf": chrf(pred_a, ref),
                "b_chrf": chrf(pred_b, ref),
                "a_jaccard": jaccard_words(pred_a, ref),
                "b_jaccard": jaccard_words(pred_b, ref),
                "a_tfidf_ref": tfidf_cosine(pred_a, ref),
                "b_tfidf_ref": tfidf_cosine(pred_b, ref),
            }
        )
    return row


def _time_call(fn: Callable[[str], str], prompt: str) -> tuple[str, float]:
    started = time.perf_counter()
    out = fn(prompt)
    return out, (time.perf_counter() - started) * 1000.0


def run_ab(
    model_a: Callable[[str], str],
    model_b: Callable[[str], str],
    prompts: list[str],
    references: list[str] | None = None,
    name_a: str = "A",
    name_b: str = "B",
) -> dict[str, object]:
    if references is not None and len(references) != len(prompts):
        raise ValueError("references length must match prompts")
    rows: list[dict[str, object]] = []
    for idx, prompt in enumerate(prompts):
        pred_a, lat_a = _time_call(model_a, prompt)
        pred_b, lat_b = _time_call(model_b, prompt)
        ref = references[idx] if references is not None else None
        scores = _score_row(pred_a, pred_b, ref)
        rows.append(
            {
                "prompt": prompt,
                "reference": ref,
                "pred_a": pred_a,
                "pred_b": pred_b,
                "latency_a_ms": lat_a,
                "latency_b_ms": lat_b,
                **scores,
            }
        )
    keys = set().union(*(set(r.keys()) for r in rows)) if rows else set()
    summary: dict[str, float] = {"count": float(len(rows))}
    for key in keys:
        if key in {"prompt", "reference", "pred_a", "pred_b"}:
            continue
        values = [float(r[key]) for r in rows if isinstance(r.get(key), (int, float))]
        if values:
            summary[f"avg_{key}"] = mean(values)
    return {"name_a": name_a, "name_b": name_b, "summary": summary, "rows": rows}
