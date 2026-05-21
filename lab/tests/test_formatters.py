import json
import unittest

from thehumanbox_lab.formatters import (
    format,
    to_alpaca,
    to_chatml,
    to_llama3,
    to_openai_jsonl,
)


class FormattersTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            {"prompt": "hello", "completion": "hi there", "system": "be brief"},
            {"prompt": "ping", "response": "pong"},
        ]

    def test_chatml_includes_tags(self) -> None:
        rendered = to_chatml(self.records)
        self.assertEqual(len(rendered), 2)
        self.assertIn("<|im_start|>system", rendered[0])
        self.assertIn("<|im_start|>user", rendered[0])
        self.assertIn("<|im_start|>assistant", rendered[0])
        self.assertIn("pong", rendered[1])

    def test_llama3_includes_headers(self) -> None:
        rendered = to_llama3(self.records)
        self.assertTrue(rendered[0].startswith("<|begin_of_text|>"))
        self.assertIn("<|start_header_id|>assistant<|end_header_id|>", rendered[0])
        self.assertIn("<|eot_id|>", rendered[0])

    def test_alpaca_uses_instruction_keys(self) -> None:
        rendered = to_alpaca(self.records)
        self.assertEqual(rendered[0]["instruction"], "hello")
        self.assertEqual(rendered[0]["output"], "hi there")
        self.assertEqual(rendered[1]["output"], "pong")

    def test_openai_jsonl_is_parseable(self) -> None:
        rendered = to_openai_jsonl(self.records)
        first = json.loads(rendered[0])
        self.assertEqual(first["messages"][0]["role"], "system")
        self.assertEqual(first["messages"][-1]["content"], "hi there")

    def test_dispatcher_accepts_aliases(self) -> None:
        self.assertEqual(len(format(self.records, "chatml")), 2)
        self.assertEqual(len(format(self.records, "llama-3-instruct")), 2)
        self.assertEqual(len(format(self.records, "openai-jsonl")), 2)
        with self.assertRaises(ValueError):
            format(self.records, "unknown-format")


if __name__ == "__main__":
    unittest.main()
