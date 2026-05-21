# Fine-tuning a small model

The lab does not ship its own trainer — it instead writes
manifests + dataset files in shapes that TRL / Hugging Face Trainer /
Axolotl / Unsloth can consume.

## Pick a preset

```python
from thehumanbox_lab.training import lora_preset, qlora_preset
cfg = lora_preset("gemma_270m")
# {r: 16, alpha: 32, dropout: 0.05, target_modules: [...]}
```

## Estimate cost first

```python
from thehumanbox_lab.training import estimate_cost
cost = estimate_cost(
    gpu="a10g",
    batch_size=8,
    dataset_tokens=2_000_000,
    epochs=3,
)
print(cost)
```

`cost_estimator` is calibrated against published RunPod / AWS hourly
rates and a per-GPU tokens/sec table. Treat it as ±30 percent.

## Prepare the dataset

```sh
python scripts/prepare_sft_dataset.py \
    --input datasets/captured/thoughts.jsonl \
    --format chatml \
    --output datasets/captured/sft_chatml.jsonl
```

Available formats: `chatml`, `llama3`, `alpaca`, `openai`.

## Generate DPO pairs (optional)

```sh
python scripts/prep_dpo_pairs.py \
    --input datasets/captured/thoughts.jsonl \
    --output datasets/captured/dpo.jsonl
```

## Write a training manifest

```python
from thehumanbox_lab.training import TrainManifestV2

m = TrainManifestV2(
    base_model="google/gemma-2-2b-it",
    dataset_path="datasets/captured/sft_chatml.jsonl",
    lora_config=lora_preset("gemma_2b"),
    eval_baseline_score=0.62,
    hardware="a10g x1",
)
m.write("experiments/run_2026-05-21.json")
```

Now feed the manifest to your trainer of choice. The `eval_hooks`
module gives you a trainer-agnostic `on_epoch_end` callable that runs
the lab's eval suite mid-training.
