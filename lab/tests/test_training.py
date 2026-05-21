from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from thehumanbox_lab.training.cost_estimator import (
    GPU_PRICES_USD_PER_HOUR,
    compare_gpus,
    estimate_cost,
)
from thehumanbox_lab.training.eval_hooks import (
    aggregate_mean,
    make_epoch_eval_hook,
    make_step_eval_hook,
)
from thehumanbox_lab.training.hp_search import config_hash, grid, random_sample
from thehumanbox_lab.training.lora_presets import LORA_PRESETS, lora_preset
from thehumanbox_lab.training.manifest_v2 import TrainManifestV2, new_manifest_v2
from thehumanbox_lab.training.qlora_presets import qlora_preset
from thehumanbox_lab.training.wandb_stub import WandbStub


class LoraPresetTests(unittest.TestCase):
    def test_all_presets_have_required_keys(self) -> None:
        required = {"r", "alpha", "dropout", "target_modules"}
        for name in LORA_PRESETS:
            preset = lora_preset(name)
            self.assertTrue(required.issubset(preset.keys()), f"missing keys in {name}")
            self.assertIsInstance(preset["target_modules"], list)
            self.assertGreater(preset["r"], 0)
            self.assertGreater(preset["alpha"], 0)

    def test_returns_copy_not_reference(self) -> None:
        a = lora_preset("medium")
        a["target_modules"].append("zzz")
        b = lora_preset("medium")
        self.assertNotIn("zzz", b["target_modules"])

    def test_unknown_preset_raises(self) -> None:
        with self.assertRaises(KeyError):
            lora_preset("does_not_exist")

    def test_qlora_preset_bundles_bnb_and_lora(self) -> None:
        cfg = qlora_preset("nf4_default")
        self.assertIn("bnb_config", cfg)
        self.assertIn("lora_config", cfg)
        self.assertTrue(cfg["bnb_config"]["load_in_4bit"])
        self.assertIn("r", cfg["lora_config"])


class HpSearchTests(unittest.TestCase):
    def test_grid_cartesian_product(self) -> None:
        spaces = [
            {"name": "lr", "values": [1e-4, 2e-4]},
            {"name": "r", "values": [8, 16, 32]},
        ]
        combos = grid(spaces)
        self.assertEqual(len(combos), 6)
        keys = {tuple(sorted(c.items())) for c in combos}
        self.assertEqual(len(keys), 6)

    def test_grid_empty_returns_empty(self) -> None:
        self.assertEqual(grid([]), [])

    def test_grid_missing_keys_raises(self) -> None:
        with self.assertRaises(ValueError):
            grid([{"name": "lr"}])
        with self.assertRaises(ValueError):
            grid([{"name": "lr", "values": []}])

    def test_random_sample_dedupes(self) -> None:
        spaces = [
            {"name": "a", "values": [1, 2]},
            {"name": "b", "values": ["x", "y"]},
        ]
        out = random_sample(spaces, n=10, seed=42)
        self.assertLessEqual(len(out), 4)
        hashes = {config_hash(c) for c in out}
        self.assertEqual(len(hashes), len(out))


class CostEstimatorTests(unittest.TestCase):
    def test_estimate_is_positive(self) -> None:
        est = estimate_cost(
            gpu="a100_40gb_runpod",
            dataset_tokens=1_000_000,
            epochs=3,
            tokens_per_second=1500.0,
        )
        self.assertGreater(est.estimated_cost_usd, 0)
        self.assertGreater(est.estimated_hours, 0)
        self.assertEqual(est.tokens_total, 3_000_000)
        self.assertTrue(est.source)

    def test_unknown_gpu_raises(self) -> None:
        with self.assertRaises(KeyError):
            estimate_cost("not_a_gpu", 1000, 1, 100.0)

    def test_invalid_args_raise(self) -> None:
        with self.assertRaises(ValueError):
            estimate_cost("h100_runpod", 0, 1, 100.0)
        with self.assertRaises(ValueError):
            estimate_cost("h100_runpod", 100, 0, 100.0)
        with self.assertRaises(ValueError):
            estimate_cost("h100_runpod", 100, 1, 0.0)

    def test_compare_gpus_sorted_by_cost(self) -> None:
        rows = compare_gpus(
            dataset_tokens=500_000,
            epochs=2,
            tokens_per_second_by_gpu={
                "a100_80gb_aws": 1800.0,
                "rtx_4090_runpod": 1200.0,
                "h100_runpod": 3000.0,
            },
        )
        costs = [r.estimated_cost_usd for r in rows]
        self.assertEqual(costs, sorted(costs))

    def test_price_table_has_sources(self) -> None:
        for gpu, entry in GPU_PRICES_USD_PER_HOUR.items():
            self.assertIn("price", entry, gpu)
            self.assertIn("source", entry, gpu)
            self.assertGreater(entry["price"], 0, gpu)


class EvalHookTests(unittest.TestCase):
    def test_epoch_hook_runs(self) -> None:
        prompts = [
            {"prompt": "hi", "reference": "hello"},
            {"prompt": "bye", "reference": "goodbye"},
        ]
        hook = make_epoch_eval_hook(
            prompts,
            generate_fn=lambda model, p: p.upper(),
            score_fn=lambda out, ref: 1.0 if ref in out.lower() else 0.0,
        )
        results = hook(model=None, epoch=1)
        self.assertEqual(len(results), 2)
        self.assertEqual(aggregate_mean(results), 0.0)

    def test_step_hook_only_fires_on_interval(self) -> None:
        prompts = [{"prompt": "x", "reference": "y"}]
        hook = make_step_eval_hook(
            prompts,
            generate_fn=lambda m, p: "y",
            score_fn=lambda o, r: 1.0,
            every_n_steps=10,
        )
        self.assertIsNone(hook(None, 1))
        self.assertIsNone(hook(None, 9))
        out = hook(None, 10)
        self.assertIsNotNone(out)
        self.assertEqual(len(out), 1)


class ManifestV2Tests(unittest.TestCase):
    def test_roundtrip(self) -> None:
        manifest = new_manifest_v2(
            run_name="r1",
            task="thought-v1",
            base_model="google/gemma-3-270m",
            dataset_path="data.jsonl",
            dataset_hash="abc123",
            lora_config={"r": 16, "alpha": 32},
            train_args={"epochs": 3},
            eval_target={"metric": "token_jaccard"},
            git_sha="deadbeef",
        )
        self.assertTrue(manifest.lora_config_hash)
        blob = manifest.to_json()
        loaded = TrainManifestV2.from_dict(json.loads(blob))
        self.assertEqual(loaded.run_name, "r1")
        self.assertEqual(loaded.lora_config_hash, manifest.lora_config_hash)


class WandbStubTests(unittest.TestCase):
    def test_writes_jsonl(self) -> None:
        with TemporaryDirectory() as tmp:
            stub = WandbStub(log_dir=tmp)
            stub.init("test-run", config={"lr": 1e-4})
            stub.log({"loss": 0.5})
            stub.log({"loss": 0.4}, step=10)
            path = stub.run_path
            stub.finish()
            self.assertIsNotNone(path)
            lines = Path(path).read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 4)
            events = [json.loads(line)["event"] for line in lines]
            self.assertEqual(events[0], "init")
            self.assertEqual(events[-1], "finish")


if __name__ == "__main__":
    unittest.main()
