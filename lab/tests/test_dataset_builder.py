import unittest

from thehumanbox_lab.dataset_builder import build_thought_examples
from thehumanbox_lab.eval_runner import EvalPrediction, run_eval, token_jaccard
from thehumanbox_lab.schemas import ThoughtExample, TraceEvent
from thehumanbox_lab.task_specs import THOUGHT_V1, compact_response
from thehumanbox_lab.train_manifest import default_manifest
from thehumanbox_lab.teacher_dataset import build_distillation_rows
from thehumanbox_lab.train_prep import split_rows, teacher_rows_to_sft

class DatasetBuilderTests(unittest.TestCase):
    def test_build_thought_examples_uses_recent_history(self) -> None:
        events = [
            TraceEvent(
                tick=10,
                organism_id="org-1",
                organism_name="Aren",
                lineage_id="lin-a",
                event_type="wander",
                text="walking north",
                state={"energy": 0.8, "hydration": 0.9, "health": 1.0, "fear": 0.1},
            ),
            TraceEvent(
                tick=20,
                organism_id="org-1",
                organism_name="Aren",
                lineage_id="lin-a",
                event_type="danger",
                text="water is risky here",
                state={"energy": 0.7, "hydration": 0.85, "health": 0.95, "fear": 0.6},
            ),
        ]

        examples = build_thought_examples(events, window=2)

        self.assertEqual(len(examples), 1)
        self.assertIn("Recent events:", examples[0].prompt)
        self.assertEqual(examples[0].response, "water is risky here")
        self.assertEqual(examples[0].source_ticks, [10, 20])
        self.assertIn("Task: thought-v1", examples[0].prompt)
        self.assertIn("Instruction:", examples[0].prompt)

    def test_thought_example_round_trip(self) -> None:
        row = {
            "organism_id": "org-1",
            "lineage_id": "lin-a",
            "prompt": "prompt",
            "response": "response",
            "source_ticks": [1, 2],
            "tags": ["danger"],
        }
        example = ThoughtExample.from_row(row)
        self.assertEqual(example.to_row(), row)

    def test_token_jaccard_rewards_overlap(self) -> None:
        score = token_jaccard("this feels dangerous", "dangerous water here")
        self.assertGreater(score, 0.15)

    def test_run_eval_reports_latency_and_output_size(self) -> None:
        examples = [
            ThoughtExample(
                organism_id="org-1",
                lineage_id="lin-a",
                prompt="prompt",
                response="hello",
                source_ticks=[1],
                tags=["test"],
            )
        ]

        summary, predictions = run_eval(examples, lambda _: "hello")

        self.assertEqual(summary["count"], 1.0)
        self.assertEqual(summary["exact_match"], 1)
        self.assertGreaterEqual(summary["avg_latency_ms"], 0.0)
        self.assertEqual(predictions[0].predicted_chars, 5)

    def test_build_distillation_rows_captures_teacher_output(self) -> None:
        examples = [
            ThoughtExample(
                organism_id="org-1",
                lineage_id="lin-a",
                prompt="prompt",
                response="expected",
                source_ticks=[1, 2],
                tags=["danger"],
            )
        ]
        predictions = [
            EvalPrediction(
                organism_id="org-1",
                expected="expected",
                predicted="teacher says run",
                exact_match=False,
                token_jaccard=0.2,
                latency_ms=4.0,
                predicted_chars=16,
                tags=["danger"],
            )
        ]

        rows = build_distillation_rows(examples, predictions, teacher_model="gemma3:270m")

        self.assertEqual(rows[0]["teacher_model"], "gemma3:270m")
        self.assertEqual(rows[0]["task_spec"], THOUGHT_V1.name)
        self.assertEqual(rows[0]["teacher_response"], "teacher says run")
        self.assertEqual(rows[0]["reference_response"], "expected")
        self.assertIn("system_prompt", rows[0])

    def test_teacher_rows_to_sft_and_split(self) -> None:
        rows = [
            {
                "task": "thought-generation",
                "teacher_model": "gemma3:270m",
                "organism_id": "org-1",
                "lineage_id": "lin-a",
                "prompt": "prompt one",
                "teacher_response": "response one",
                "reference_response": "ref one",
                "tags": ["danger"],
                "system_prompt": "system",
            },
            {
                "task": "thought-generation",
                "teacher_model": "gemma3:270m",
                "organism_id": "org-2",
                "lineage_id": "lin-b",
                "prompt": "prompt two",
                "teacher_response": "response two",
                "reference_response": "ref two",
                "tags": ["memory"],
                "system_prompt": "system",
            },
        ]
        sft_rows = teacher_rows_to_sft(rows)
        train_rows, valid_rows = split_rows(sft_rows, validation_ratio=0.5)

        self.assertEqual(len(sft_rows[0]["messages"]), 3)
        self.assertEqual(sft_rows[0]["messages"][0]["role"], "system")
        self.assertEqual(len(train_rows) + len(valid_rows), 2)
        self.assertGreaterEqual(len(valid_rows), 1)

    def test_compact_response_trims_and_limits_words(self) -> None:
        text = '  "I should head east because the water feels wrong tonight"  '
        compact = compact_response(text, max_words=6)
        self.assertEqual(compact, "I should head east because the")

    def test_default_manifest_uses_expected_defaults(self) -> None:
        manifest = default_manifest("train.jsonl", "valid.jsonl")
        row = manifest.to_row()
        self.assertEqual(row["task"], "thought-v1")
        self.assertEqual(row["base_model"], "google/gemma-3-270m")
        self.assertEqual(row["lora"]["rank"], 16)

if __name__ == "__main__":
    unittest.main()
