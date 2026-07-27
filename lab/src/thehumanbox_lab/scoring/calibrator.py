from __future__ import annotations

from collections.abc import Iterable, Mapping

Calibration = dict[str, float]


def fit(pairs: Iterable[tuple[float, float]]) -> Calibration:
    xs: list[float] = []
    ys: list[float] = []
    for heuristic, label in pairs:
        xs.append(float(heuristic))
        ys.append(float(label))
    n = len(xs)
    if n == 0:
        return {"slope": 1.0, "intercept": 0.0, "n": 0.0}
    if n == 1:
        return {"slope": 1.0, "intercept": ys[0] - xs[0], "n": 1.0}
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    numerator = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    denominator = sum((xs[i] - mean_x) ** 2 for i in range(n))
    if denominator == 0.0:
        return {"slope": 0.0, "intercept": mean_y, "n": float(n)}
    slope = numerator / denominator
    intercept = mean_y - slope * mean_x
    return {"slope": slope, "intercept": intercept, "n": float(n)}


def apply(score: float, calibration: Mapping[str, float]) -> float:
    slope = float(calibration.get("slope", 1.0))
    intercept = float(calibration.get("intercept", 0.0))
    calibrated = slope * float(score) + intercept
    return max(0.0, min(1.0, calibrated))


def apply_many(scores: Iterable[float], calibration: Mapping[str, float]) -> list[float]:
    return [apply(value, calibration) for value in scores]
