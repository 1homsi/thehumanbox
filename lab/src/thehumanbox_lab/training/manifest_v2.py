from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any


def _hash_obj(obj: Any) -> str:
    blob = json.dumps(obj, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


@dataclass(slots=True)
class TrainManifestV2:
    run_name: str
    task: str
    base_model: str
    dataset_path: str
    dataset_hash: str
    lora_config: dict[str, Any]
    lora_config_hash: str
    train_args: dict[str, Any]
    eval_target: dict[str, Any]
    eval_baseline_score: float | None
    git_sha: str | None
    train_started_at: str | None
    train_finished_at: str | None
    final_loss: float | None
    peak_eval_score: float | None
    hardware: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, sort_keys=True, default=str)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TrainManifestV2:
        return cls(
            run_name=str(data["run_name"]),
            task=str(data["task"]),
            base_model=str(data["base_model"]),
            dataset_path=str(data["dataset_path"]),
            dataset_hash=str(data.get("dataset_hash", "")),
            lora_config=dict(data.get("lora_config", {})),
            lora_config_hash=str(data.get("lora_config_hash", "")),
            train_args=dict(data.get("train_args", {})),
            eval_target=dict(data.get("eval_target", {})),
            eval_baseline_score=data.get("eval_baseline_score"),
            git_sha=data.get("git_sha"),
            train_started_at=data.get("train_started_at"),
            train_finished_at=data.get("train_finished_at"),
            final_loss=data.get("final_loss"),
            peak_eval_score=data.get("peak_eval_score"),
            hardware=dict(data.get("hardware", {})),
        )


def new_manifest_v2(
    run_name: str,
    task: str,
    base_model: str,
    dataset_path: str,
    dataset_hash: str,
    lora_config: dict[str, Any],
    train_args: dict[str, Any],
    eval_target: dict[str, Any] | None = None,
    git_sha: str | None = None,
    hardware: dict[str, Any] | None = None,
) -> TrainManifestV2:
    return TrainManifestV2(
        run_name=run_name,
        task=task,
        base_model=base_model,
        dataset_path=dataset_path,
        dataset_hash=dataset_hash,
        lora_config=dict(lora_config),
        lora_config_hash=_hash_obj(lora_config),
        train_args=dict(train_args),
        eval_target=dict(eval_target or {}),
        eval_baseline_score=None,
        git_sha=git_sha,
        train_started_at=None,
        train_finished_at=None,
        final_loss=None,
        peak_eval_score=None,
        hardware=dict(hardware or {}),
    )
