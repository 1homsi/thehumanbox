import unittest

from thehumanbox_lab.pair_builder import build_pairs, pair_by_score, pair_by_temperature


class PairBuilderTests(unittest.TestCase):
    def test_pair_by_temperature(self) -> None:
        records = [
            {"prompt": "p1", "completion": "cold-answer", "temperature": 0.2},
            {"prompt": "p1", "completion": "hot-answer", "temperature": 1.1},
            {"prompt": "p2", "completion": "only", "temperature": 0.1},
        ]
        pairs = pair_by_temperature(records)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]["prompt"], "p1")
        self.assertEqual(pairs[0]["chosen"], "cold-answer")
        self.assertEqual(pairs[0]["rejected"], "hot-answer")

    def test_pair_by_score(self) -> None:
        records = [
            {"prompt": "p", "completion": "good", "score": 0.9},
            {"prompt": "p", "completion": "meh", "score": 0.5},
            {"prompt": "p", "completion": "bad", "score": 0.1},
        ]
        pairs = pair_by_score(records, min_gap=0.5)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]["chosen"], "good")
        self.assertEqual(pairs[0]["rejected"], "bad")

    def test_auto_strategy_prefers_score(self) -> None:
        records = [
            {"prompt": "p", "completion": "a", "score": 0.9, "temperature": 0.1},
            {"prompt": "p", "completion": "b", "score": 0.1, "temperature": 0.9},
        ]
        pairs = build_pairs(records, strategy="auto")
        self.assertEqual(pairs[0]["chosen"], "a")
        self.assertEqual(pairs[0]["rejected"], "b")

    def test_skips_identical_completions(self) -> None:
        records = [
            {"prompt": "p", "completion": "same", "temperature": 0.1},
            {"prompt": "p", "completion": "same", "temperature": 1.1},
        ]
        self.assertEqual(pair_by_temperature(records), [])


if __name__ == "__main__":
    unittest.main()
