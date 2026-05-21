import unittest

from thehumanbox_lab.dedup import (
    dedup_records,
    exact_dedup,
    hamming_distance,
    near_dedup,
    simhash,
)


class DedupTests(unittest.TestCase):
    def test_exact_dedup_keeps_first_occurrence(self) -> None:
        records = [
            {"prompt": "alpha", "id": 1},
            {"prompt": "alpha", "id": 2},
            {"prompt": "beta", "id": 3},
        ]
        result = exact_dedup(records)
        self.assertEqual([r["id"] for r in result], [1, 3])

    def test_simhash_is_stable(self) -> None:
        a = simhash("the quick brown fox jumps over the lazy dog")
        b = simhash("the quick brown fox jumps over the lazy dog")
        self.assertEqual(a, b)
        self.assertEqual(hamming_distance(a, b), 0)

    def test_near_dedup_collapses_similar_text(self) -> None:
        records = [
            {"prompt": "the quick brown fox jumps over the lazy dog"},
            {"prompt": "the quick brown fox jumps over the lazy dog!"},
            {"prompt": "completely unrelated content about astronomy and stars"},
        ]
        result = near_dedup(records, threshold=8)
        prompts = [r["prompt"] for r in result]
        self.assertEqual(len(prompts), 2)
        self.assertIn("astronomy and stars", " ".join(prompts))

    def test_dedup_records_chains_exact_and_near(self) -> None:
        records = [
            {"prompt": "hello world"},
            {"prompt": "hello world"},
            {"prompt": "totally different text"},
        ]
        result = dedup_records(records, near_threshold=4)
        self.assertEqual(len(result), 2)


if __name__ == "__main__":
    unittest.main()
