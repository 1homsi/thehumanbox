from __future__ import annotations

from typing import Any

LORA_PRESETS: dict[str, dict[str, Any]] = {
    "small": {
        "r": 8,
        "alpha": 16,
        "dropout": 0.05,
        "target_modules": ["q_proj", "v_proj"],
    },
    "medium": {
        "r": 16,
        "alpha": 32,
        "dropout": 0.05,
        "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj"],
    },
    "large": {
        "r": 32,
        "alpha": 64,
        "dropout": 0.1,
        "target_modules": [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    },
    "gemma_270m": {
        "r": 16,
        "alpha": 32,
        "dropout": 0.05,
        "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj"],
    },
    "qwen_0_5b": {
        "r": 16,
        "alpha": 32,
        "dropout": 0.05,
        "target_modules": [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    },
    "phi_mini": {
        "r": 16,
        "alpha": 32,
        "dropout": 0.05,
        "target_modules": ["qkv_proj", "o_proj", "gate_up_proj", "down_proj"],
    },
}


def lora_preset(name: str) -> dict[str, Any]:
    if name not in LORA_PRESETS:
        raise KeyError(f"unknown lora preset: {name!r}; available: {sorted(LORA_PRESETS)}")
    preset = LORA_PRESETS[name]
    return {
        "r": preset["r"],
        "alpha": preset["alpha"],
        "dropout": preset["dropout"],
        "target_modules": list(preset["target_modules"]),
    }


def available_presets() -> list[str]:
    return sorted(LORA_PRESETS.keys())
