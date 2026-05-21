import unittest

from thehumanbox_lab.quality_filter import filter_records, filter_stats


class QualityFilterTests(unittest.TestCase):
    def test_drops_blank_and_too_short(self) -> None:
        records = [
            {"prompt": "a long enough prompt here", "completion": "a long enough completion here"},
            {"prompt": "", "completion": "ok"},
            {"prompt": "hi", "completion": "x"},
        ]
        kept = filter_records(records, min_len=5, max_len=200, drop_patterns=[])
        self.assertEqual(len(kept), 1)

    def test_drops_refusal_patterns(self) -> None:
        records = [
            {"prompt": "tell me about stars in detail", "completion": "stars are huge balls of plasma"},
            {"prompt": "tell me about planets in detail", "completion": "I cannot help with that request"},
        ]
        kept = filter_records(records, min_len=5, max_len=200)
        self.assertEqual(len(kept), 1)
        self.assertIn("plasma", kept[0]["completion"])

    def test_respects_max_length(self) -> None:
        records = [
            {"prompt": "short prompt here ok", "completion": "x" * 5000},
        ]
        kept = filter_records(records, min_len=5, max_len=4000, drop_patterns=[])
        self.assertEqual(kept, [])

    def test_filter_stats_reports_counts(self) -> None:
        records = [
            {"prompt": "long enough prompt input", "completion": "long enough completion text"},
            {"prompt": "", "completion": ""},
        ]
        kept = filter_records(records, min_len=5, max_len=200, drop_patterns=[])
        stats = filter_stats(records, kept)
        self.assertEqual(stats, {"input": 2, "kept": 1, "dropped": 1})


if __name__ == "__main__":
    unittest.main()
