from __future__ import annotations

from typing import Any

from thehumanbox_lab.training.lora_presets import lora_preset

QLORA_PRESETS: dict[str, dict[str, Any]] = {
    "nf4_default": {
        "bnb_config": {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
            "bnb_4bit_compute_dtype": "bfloat16",
        },
        "lora_name": "medium",
    },
    "nf4_aggressive": {
        "bnb_config": {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
            "bnb_4bit_compute_dtype": "bfloat16",
        },
        "lora_name": "large",
    },
    "fp4_lite": {
        "bnb_config": {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "fp4",
            "bnb_4bit_use_double_quant": False,
            "bnb_4bit_compute_dtype": "float16",
        },
        "lora_name": "small",
    },
    "gemma_270m_4bit": {
        "bnb_config": {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
            "bnb_4bit_compute_dtype": "bfloat16",
        },
        "lora_name": "gemma_270m",
    },
    "qwen_0_5b_4bit": {
        "bnb_config": {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
            "bnb_4bit_compute_dtype": "bfloat16",
        },
        "lora_name": "qwen_0_5b",
    },
}


def qlora_preset(name: str) -> dict[str, Any]:
    if name not in QLORA_PRESETS:
        raise KeyError(f"unknown qlora preset: {name!r}; available: {sorted(QLORA_PRESETS)}")
    entry = QLORA_PRESETS[name]
    return {
        "bnb_config": dict(entry["bnb_config"]),
        "lora_config": lora_preset(entry["lora_name"]),
    }


def available_presets() -> list[str]:
    return sorted(QLORA_PRESETS.keys())
