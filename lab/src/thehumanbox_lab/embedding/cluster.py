from __future__ import annotations

import random
from collections.abc import Sequence

from .vector import cosine, euclidean, mean_vec


def kmeans(
    points: Sequence[Sequence[float]],
    k: int,
    max_iter: int = 50,
    seed: int = 42,
    metric: str = "euclidean",
) -> tuple[list[int], list[list[float]]]:
    if not points or k <= 0:
        return [], []
    k = min(k, len(points))
    rng = random.Random(seed)
    centroids = [list(points[i]) for i in rng.sample(range(len(points)), k)]
    assignments = [0] * len(points)
    dist_fn = euclidean if metric == "euclidean" else (lambda a, b: 1.0 - cosine(a, b))

    for _ in range(max_iter):
        changed = False
        for i, p in enumerate(points):
            best_j, best_d = 0, float("inf")
            for j, c in enumerate(centroids):
                d = dist_fn(p, c)
                if d < best_d:
                    best_d = d
                    best_j = j
            if assignments[i] != best_j:
                assignments[i] = best_j
                changed = True
        new_centroids: list[list[float]] = []
        for j in range(k):
            cluster_pts = [points[i] for i, a in enumerate(assignments) if a == j]
            if cluster_pts:
                new_centroids.append(mean_vec(cluster_pts))
            else:
                new_centroids.append(centroids[j])
        centroids = new_centroids
        if not changed:
            break
    return assignments, centroids


def nearest_neighbors(
    query: Sequence[float],
    corpus: Sequence[Sequence[float]],
    k: int = 5,
    metric: str = "cosine",
) -> list[tuple[int, float]]:
    if not corpus:
        return []
    sim_fn = (lambda a, b: cosine(a, b)) if metric == "cosine" else (lambda a, b: -euclidean(a, b))
    scored = [(i, sim_fn(query, p)) for i, p in enumerate(corpus)]
    scored.sort(key=lambda t: -t[1])
    return scored[:k]
