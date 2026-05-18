from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

@dataclass(slots=True)
class LoraConfig:
    rank: int = 16
    alpha: int = 32
    dropout: float = 0.05
    target_modules: tuple[str, ...] = ("q_proj", "k_proj", "v_proj", "o_proj")

@dataclass(slots=True)
class TrainManifest:
    run_name: str
    task: str
    base_model: str
    train_file: str
    valid_file: str
    output_dir: str
    epochs: int
    learning_rate: float
    max_seq_length: int
    batch_size: int
    gradient_accumulation_steps: int
    lora: LoraConfig

    def to_row(self) -> dict[str, Any]:
        row = asdict(self)
        row["lora"]["target_modules"] = list(self.lora.target_modules)
        return row

def default_manifest(
    train_file: str,
    valid_file: str,
    base_model: str = "google/gemma-3-270m",
    run_name: str = "thought-gemma3-270m-lora-v1",
) -> TrainManifest:
    return TrainManifest(
        run_name=run_name,
        task="thought-v1",
        base_model=base_model,
        train_file=train_file,
        valid_file=valid_file,
        output_dir=f"models/checkpoints/{run_name}",
        epochs=3,
        learning_rate=2e-4,
        max_seq_length=512,
        batch_size=4,
        gradient_accumulation_steps=8,
        lora=LoraConfig(),
    )
