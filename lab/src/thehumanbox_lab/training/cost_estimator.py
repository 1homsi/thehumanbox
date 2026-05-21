from __future__ import annotations

from dataclasses import dataclass
from typing import Any

GPU_PRICES_USD_PER_HOUR: dict[str, dict[str, Any]] = {
    "a10g_aws": {"price": 1.21, "source": "AWS g5.xlarge on-demand us-east-1 2024-10"},
    "a100_40gb_aws": {"price": 4.10, "source": "AWS p4d.24xlarge per-GPU 2024-10"},
    "a100_80gb_aws": {"price": 5.12, "source": "AWS p4de per-GPU 2024-10"},
    "h100_aws": {"price": 12.29, "source": "AWS p5.48xlarge per-GPU 2024-10"},
    "a100_40gb_runpod": {"price": 1.19, "source": "RunPod Community Cloud 2024-10"},
    "a100_80gb_runpod": {"price": 1.89, "source": "RunPod Secure Cloud 2024-10"},
    "h100_runpod": {"price": 2.99, "source": "RunPod Secure Cloud 2024-10"},
    "rtx_4090_runpod": {"price": 0.69, "source": "RunPod Community Cloud 2024-10"},
    "l40s_runpod": {"price": 1.19, "source": "RunPod Secure Cloud 2024-10"},
}


@dataclass(slots=True)
class CostEstimate:
    gpu: str
    price_per_hour_usd: float
    estimated_hours: float
    estimated_cost_usd: float
    tokens_total: int
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "gpu": self.gpu,
            "price_per_hour_usd": self.price_per_hour_usd,
            "estimated_hours": self.estimated_hours,
            "estimated_cost_usd": self.estimated_cost_usd,
            "tokens_total": self.tokens_total,
            "source": self.source,
        }


def estimate_cost(
    gpu: str,
    dataset_tokens: int,
    epochs: int,
    tokens_per_second: float,
    overhead_factor: float = 1.15,
) -> CostEstimate:
    if gpu not in GPU_PRICES_USD_PER_HOUR:
        raise KeyError(
            f"unknown gpu: {gpu!r}; available: {sorted(GPU_PRICES_USD_PER_HOUR)}"
        )
    if dataset_tokens <= 0 or epochs <= 0 or tokens_per_second <= 0:
        raise ValueError("dataset_tokens, epochs, tokens_per_second must be positive")
    entry = GPU_PRICES_USD_PER_HOUR[gpu]
    total_tokens = dataset_tokens * epochs
    seconds = total_tokens / tokens_per_second
    hours = (seconds / 3600.0) * overhead_factor
    cost = hours * float(entry["price"])
    return CostEstimate(
        gpu=gpu,
        price_per_hour_usd=float(entry["price"]),
        estimated_hours=round(hours, 4),
        estimated_cost_usd=round(cost, 4),
        tokens_total=total_tokens,
        source=str(entry["source"]),
    )


def compare_gpus(
    dataset_tokens: int,
    epochs: int,
    tokens_per_second_by_gpu: dict[str, float],
) -> list[CostEstimate]:
    out: list[CostEstimate] = []
    for gpu, tps in tokens_per_second_by_gpu.items():
        out.append(estimate_cost(gpu, dataset_tokens, epochs, tps))
    out.sort(key=lambda c: c.estimated_cost_usd)
    return out
