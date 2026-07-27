from __future__ import annotations

from thehumanbox_lab.training.cost_estimator import (
    GPU_PRICES_USD_PER_HOUR,
    estimate_cost,
)
from thehumanbox_lab.training.eval_hooks import (
    EvalResult,
    make_epoch_eval_hook,
    make_step_eval_hook,
)
from thehumanbox_lab.training.hp_search import grid, random_sample
from thehumanbox_lab.training.lora_presets import LORA_PRESETS, lora_preset
from thehumanbox_lab.training.manifest_v2 import TrainManifestV2, new_manifest_v2
from thehumanbox_lab.training.qlora_presets import QLORA_PRESETS, qlora_preset
from thehumanbox_lab.training.wandb_stub import WandbStub, finish, init, log

__all__ = [
    "GPU_PRICES_USD_PER_HOUR",
    "LORA_PRESETS",
    "QLORA_PRESETS",
    "EvalResult",
    "TrainManifestV2",
    "WandbStub",
    "estimate_cost",
    "finish",
    "grid",
    "init",
    "log",
    "lora_preset",
    "make_epoch_eval_hook",
    "make_step_eval_hook",
    "new_manifest_v2",
    "qlora_preset",
    "random_sample",
]
