from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from thehumanbox_lab.trace.filters import (
    by_event_type,
    by_lineage,
    by_org_id,
    by_tick_range,
    compose,
    union,
)
from thehumanbox_lab.trace.sampling import importance, stratified, uniform
from thehumanbox_lab.trace.diff import snapshot_delta
from thehumanbox_lab.trace.checkpoint import load, save, should_resume
from thehumanbox_lab.trace.compress import compressed_sink


def _ev(tick, oid, lineage, etype, **extra):
    base = {
        "tick": tick,
        "organism_id": oid,
        "lineage_id": lineage,
        "event_type": etype,
    }
    base.update(extra)
    return base


class FilterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            _ev(10, "a", "lin-1", "thought"),
            _ev(20, "b", "lin-2", "wander"),
            _ev(30, "c", "lin-1", "danger"),
            _ev(40, "a", "lin-1", "thought"),
        ]

    def test_by_lineage_string_and_iter(self) -> None:
        kept = [r for r in self.records if by_lineage("lin-1")(r)]
        self.assertEqual([r["organism_id"] for r in kept], ["a", "c", "a"])
        kept = [r for r in self.records if by_lineage(["lin-2"])(r)]
        self.assertEqual([r["organism_id"] for r in kept], ["b"])

    def test_by_event_type(self) -> None:
        kept = [r for r in self.records if by_event_type({"thought", "danger"})(r)]
        self.assertEqual(len(kept), 3)

    def test_by_tick_range(self) -> None:
        kept = [r for r in self.records if by_tick_range(15, 35)(r)]
        self.assertEqual([r["tick"] for r in kept], [20, 30])

    def test_by_org_id_snapshot(self) -> None:
        snap = {"organisms": [{"id": "x"}, {"id": "y"}]}
        self.assertTrue(by_org_id("x")(snap))
        self.assertFalse(by_org_id("z")(snap))

    def test_compose_and_union(self) -> None:
        f = compose(by_lineage("lin-1"), by_event_type("thought"))
        kept = [r for r in self.records if f(r)]
        self.assertEqual([r["tick"] for r in kept], [10, 40])
        f = union(by_event_type("wander"), by_tick_range(30, 30))
        kept = [r for r in self.records if f(r)]
        self.assertEqual([r["tick"] for r in kept], [20, 30])


class SamplingTests(unittest.TestCase):
    def test_uniform_clamps_to_population(self) -> None:
        records = [_ev(i, f"o{i}", "L", "t") for i in range(5)]
        self.assertEqual(len(uniform(records, 10, seed=1)), 5)
        self.assertEqual(uniform(records, 0), [])
        self.assertEqual(len(uniform(records, 3, seed=1)), 3)

    def test_uniform_is_seed_reproducible(self) -> None:
        records = [_ev(i, f"o{i}", "L", "t") for i in range(20)]
        a = uniform(records, 5, seed=42)
        b = uniform(records, 5, seed=42)
        self.assertEqual([r["organism_id"] for r in a], [r["organism_id"] for r in b])

    def test_stratified_per_group_cap(self) -> None:
        records = (
            [_ev(i, f"a{i}", "L1", "t") for i in range(5)]
            + [_ev(i, f"b{i}", "L2", "t") for i in range(2)]
        )
        out = stratified(records, "lineage_id", n_per_group=3, seed=0)
        groups: dict = {}
        for r in out:
            groups.setdefault(r["lineage_id"], 0)
            groups[r["lineage_id"]] += 1
        self.assertEqual(groups["L1"], 3)
        self.assertEqual(groups["L2"], 2)

    def test_importance_top_n(self) -> None:
        records = [_ev(i, f"o{i}", "L", "t", score=i) for i in range(10)]
        top = importance(records, lambda r: r["score"], n=3)
        self.assertEqual([r["score"] for r in top], [9, 8, 7])


class SnapshotDeltaTests(unittest.TestCase):
    def test_births_deaths_thought_changes(self) -> None:
        prev = {
            "tick": 100,
            "organisms": [
                {"id": "a", "alive": True, "thought": "wander", "lineage_id": "L"},
                {"id": "b", "alive": True, "thought": "rest", "lineage_id": "L"},
            ],
        }
        cur = {
            "tick": 101,
            "organisms": [
                {"id": "a", "alive": True, "thought": "flee", "lineage_id": "L"},
                {"id": "b", "alive": False, "thought": "rest", "lineage_id": "L"},
                {"id": "c", "alive": True, "thought": "born", "lineage_id": "L"},
            ],
        }
        delta = snapshot_delta(prev, cur)
        self.assertEqual([d["organism_id"] for d in delta["births"]], ["c"])
        self.assertEqual([d["organism_id"] for d in delta["deaths"]], ["b"])
        changed = [(d["organism_id"], d["prev"], d["cur"]) for d in delta["thoughts_changed"]]
        self.assertEqual(changed, [("a", "wander", "flee")])

    def test_vanished_counts_as_death(self) -> None:
        prev = {"tick": 1, "organisms": [{"id": "x", "alive": True}]}
        cur = {"tick": 2, "organisms": []}
        delta = snapshot_delta(prev, cur)
        self.assertEqual(len(delta["deaths"]), 1)
        self.assertEqual(delta["deaths"][0]["organism_id"], "x")


class CheckpointAndCompressTests(unittest.TestCase):
    def test_checkpoint_roundtrip(self) -> None:
        with TemporaryDirectory() as d:
            path = Path(d) / "ckpt.json"
            self.assertIsNone(should_resume(path))
            save(path, {"last_frame_id": 7, "bytes_written": 1234})
            state = load(path)
            self.assertEqual(state["last_frame_id"], 7)
            self.assertEqual(state["bytes_written"], 1234)
            self.assertIsNotNone(should_resume(path))

    def test_gzip_sink_writes_and_reads(self) -> None:
        import gzip
        with TemporaryDirectory() as d:
            path = Path(d) / "out.jsonl.gz"
            with compressed_sink(path, mode="gzip") as sink:
                sink.write(json.dumps({"a": 1}) + "\n")
                sink.write(b'{"a":2}\n')
            with gzip.open(path, "rt", encoding="utf-8") as f:
                lines = [json.loads(l) for l in f if l.strip()]
            self.assertEqual(lines, [{"a": 1}, {"a": 2}])


if __name__ == "__main__":
    unittest.main()
