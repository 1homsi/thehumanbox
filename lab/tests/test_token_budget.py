import unittest

from thehumanbox_lab.token_budget import estimate_dataset, estimate_tokens


class TokenBudgetTests(unittest.TestCase):
    def test_estimate_tokens_handles_empty(self) -> None:
        self.assertEqual(estimate_tokens(""), 0)

    def test_estimate_tokens_scales_with_length(self) -> None:
        short = estimate_tokens("hello")
        long = estimate_tokens("hello " * 200)
        self.assertGreater(long, short)

    def test_estimate_dataset_reports_stats(self) -> None:
        records = [
            {"prompt": "tell me about stars", "completion": "stars are bright"},
            {"prompt": "tell me about oceans", "completion": "oceans are deep blue and very wide"},
            {"prompt": "tell me about forests", "completion": "forests are full of trees"},
        ]
        stats = estimate_dataset(records, formatter="chatml")
        self.assertEqual(stats["count"], 3)
        self.assertGreater(stats["total"], 0)
        self.assertGreaterEqual(stats["max"], stats["p95"])
        self.assertGreaterEqual(stats["p95"], stats["p50"])

    def test_estimate_dataset_empty_returns_zeros(self) -> None:
        stats = estimate_dataset([])
        self.assertEqual(stats["total"], 0)
        self.assertEqual(stats["count"], 0)


if __name__ == "__main__":
    unittest.main()
