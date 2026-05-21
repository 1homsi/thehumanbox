import unittest

from thehumanbox_lab.split import split_summary, stratified_split


class SplitTests(unittest.TestCase):
    def test_split_is_deterministic(self) -> None:
        records = [
            {"prompt": f"prompt-{i}", "scenario": "danger" if i % 2 == 0 else "calm"}
            for i in range(40)
        ]
        a = stratified_split(records, key="scenario", ratios=(0.6, 0.2, 0.2), seed=7)
        b = stratified_split(records, key="scenario", ratios=(0.6, 0.2, 0.2), seed=7)
        self.assertEqual([r["prompt"] for r in a[0]], [r["prompt"] for r in b[0]])
        self.assertEqual([r["prompt"] for r in a[2]], [r["prompt"] for r in b[2]])

    def test_split_covers_all_records(self) -> None:
        records = [{"prompt": f"p{i}", "scenario": "a"} for i in range(20)]
        train, valid, test = stratified_split(records, ratios=(0.7, 0.2, 0.1), seed=1)
        self.assertEqual(len(train) + len(valid) + len(test), 20)
        summary = split_summary((train, valid, test))
        self.assertEqual(summary["total"], 20)

    def test_stratification_includes_each_bucket(self) -> None:
        records = []
        for i in range(50):
            records.append({"prompt": f"p{i}", "scenario": "x" if i < 25 else "y"})
        train, valid, test = stratified_split(records, ratios=(0.5, 0.25, 0.25), seed=42)
        all_scenarios = {r["scenario"] for r in train + valid + test}
        self.assertEqual(all_scenarios, {"x", "y"})

    def test_invalid_ratios_raise(self) -> None:
        with self.assertRaises(ValueError):
            stratified_split([], ratios=(0.0, 0.0, 0.0))


if __name__ == "__main__":
    unittest.main()
