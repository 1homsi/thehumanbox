from __future__ import annotations

from thehumanbox_lab.training.lora_presets import lora_preset, LORA_PRESETS
from thehumanbox_lab.training.qlora_presets import qlora_preset, QLORA_PRESETS
from thehumanbox_lab.training.hp_search import grid, random_sample
from thehumanbox_lab.training.cost_estimator import (
    estimate_cost,
    GPU_PRICES_USD_PER_HOUR,
)
from thehumanbox_lab.training.eval_hooks import (
    make_epoch_eval_hook,
    make_step_eval_hook,
    EvalResult,
)
from thehumanbox_lab.training.manifest_v2 import TrainManifestV2, new_manifest_v2
from thehumanbox_lab.training.wandb_stub import WandbStub, init, log, finish

__all__ = [
    "lora_preset",
    "LORA_PRESETS",
    "qlora_preset",
    "QLORA_PRESETS",
    "grid",
    "random_sample",
    "estimate_cost",
    "GPU_PRICES_USD_PER_HOUR",
    "make_epoch_eval_hook",
    "make_step_eval_hook",
    "EvalResult",
    "TrainManifestV2",
    "new_manifest_v2",
    "WandbStub",
    "init",
    "log",
    "finish",
]
