import unittest

from thehumanbox_lab.behavior import (
    aggregate_deaths,
    build_influence_graph,
    detect_migrations,
    fan_out,
    ngrams,
    render_report,
    summarize_life,
    top_influencers,
    top_ngrams,
    track_settlement_tiers,
)


class LifeArcTests(unittest.TestCase):
    def test_summarize_life_extracts_milestones(self) -> None:
        org = {
            "id": "org-1",
            "name": "Aren",
            "lineage_id": "lin-a",
            "generation": 2,
            "alive": False,
            "age_ticks": 800,
            "discoveries": ["fire", "shelter"],
            "thought_history": [{"tick": 1, "text": "x"}],
            "events": [
                {"tick": 10, "category": "born", "text": "born to Mira"},
                {"tick": 120, "category": "discovery", "text": "discovered fire"},
                {"tick": 300, "category": "child", "text": "child born"},
                {"tick": 450, "category": "conflict", "text": "raid attack"},
                {"tick": 800, "category": "died", "text": "perished from starvation"},
            ],
        }
        arc = summarize_life(org)
        self.assertEqual(arc.birth_tick, 10)
        self.assertEqual(arc.first_discovery_tick, 120)
        self.assertEqual(arc.first_child_tick, 300)
        self.assertEqual(arc.first_conflict_tick, 450)
        self.assertEqual(arc.death_tick, 800)
        self.assertEqual(arc.death_cause, "starvation")
        self.assertEqual(arc.discovery_count, 2)

    def test_summarize_life_handles_alive_with_no_events(self) -> None:
        arc = summarize_life({"id": "x", "alive": True, "age_ticks": 5})
        self.assertIsNone(arc.death_cause)
        self.assertIsNone(arc.first_discovery_tick)
        self.assertTrue(arc.alive)


class DeathCauseTests(unittest.TestCase):
    def test_aggregate_uses_history_counters(self) -> None:
        snap = {
            "history": {
                "deaths_starvation": 4,
                "deaths_dehydration": 2,
                "deaths_sickness": 1,
                "deaths_combat": 3,
                "deaths_old_age": 0,
            },
            "events": [
                {"type": "died", "actor": "org-1", "detail": "starvation"},
                {"type": "killed", "actor": "org-2", "detail": "killed in combat"},
            ],
            "organisms": [
                {"id": "org-1", "lineage_id": "lin-a"},
                {"id": "org-2", "lineage_id": "lin-b"},
            ],
        }
        br = aggregate_deaths(snap)
        self.assertEqual(br.total, 10)
        self.assertEqual(br.by_cause["starvation"], 4)
        self.assertEqual(br.by_lineage["lin-a"]["starvation"], 1)
        self.assertEqual(br.by_lineage["lin-b"]["combat"], 1)


class ActionSeqTests(unittest.TestCase):
    def test_ngrams_basic(self) -> None:
        out = ngrams(["a", "b", "c", "d"], 2)
        self.assertEqual(out, [("a", "b"), ("b", "c"), ("c", "d")])

    def test_top_ngrams_counts(self) -> None:
        actions = ["eat", "drink", "eat", "drink", "eat", "drink"]
        top = top_ngrams(actions, n=2, top=1)
        self.assertEqual(top[0][0], ("eat", "drink"))
        self.assertGreaterEqual(top[0][1], 2)

    def test_ngrams_short_stream(self) -> None:
        self.assertEqual(ngrams(["a"], 3), [])


class MigrationTests(unittest.TestCase):
    def test_detects_jump_above_threshold(self) -> None:
        history = {
            "lin-a": [
                {"tick": 100, "x": 0.0, "y": 0.0},
                {"tick": 200, "x": 5.0, "y": 0.0},
                {"tick": 300, "x": 50.0, "y": 0.0},
            ],
        }
        events = detect_migrations(history, jump_threshold=15.0)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["lineage_id"], "lin-a")
        self.assertEqual(events[0]["tick"], 300)
        self.assertGreater(events[0]["distance"], 40)

    def test_no_history_returns_empty(self) -> None:
        self.assertEqual(detect_migrations({}, jump_threshold=5.0), [])


class InfluenceTests(unittest.TestCase):
    def test_graph_counts_teach_edges(self) -> None:
        events = [
            {"category": "teach", "actor": "Aren", "target": "Bee"},
            {"category": "teach", "actor": "Aren", "target": "Bee"},
            {"category": "discovery", "actor": "Aren", "related_name": "Cleo"},
            {"category": "wander", "actor": "Aren", "target": "Bee"},
        ]
        graph = build_influence_graph(events)
        self.assertEqual(graph["Aren"]["Bee"], 2)
        self.assertEqual(graph["Aren"]["Cleo"], 1)
        self.assertEqual(fan_out(graph)["Aren"], 2)
        top = top_influencers(graph)
        self.assertEqual(top[0][0], "Aren")
        self.assertEqual(top[0][1], 3)


class SettlementTests(unittest.TestCase):
    def test_tier_transitions_detected(self) -> None:
        snaps = [
            {"tick": 100, "territory": {"lin-a": {"tier": "band"}}},
            {"tick": 200, "territory": {"lin-a": {"tier": "band"}}},
            {"tick": 300, "territory": {"lin-a": {"tier": "village"}}},
            {"tick": 400, "territory": {"lin-a": {"tier": "town"}}},
        ]
        transitions = track_settlement_tiers(snaps)
        self.assertEqual(len(transitions), 2)
        self.assertEqual(transitions[0]["tier_old"], "band")
        self.assertEqual(transitions[0]["tier_new"], "village")
        self.assertEqual(transitions[1]["tier_new"], "town")


class ReportTests(unittest.TestCase):
    def test_render_report_produces_sections(self) -> None:
        snap = {
            "tick": 500,
            "history": {"deaths_starvation": 1, "deaths_combat": 1},
            "events": [
                {"type": "wander", "actor": "Aren", "detail": ""},
                {"type": "eat", "actor": "Aren", "detail": ""},
                {"type": "wander", "actor": "Aren", "detail": ""},
                {"category": "teach", "actor": "Aren", "target": "Bee"},
            ],
            "organisms": [
                {"id": "org-1", "name": "Aren", "lineage_id": "lin-a",
                 "alive": True, "age_ticks": 100, "events": []},
            ],
            "lineage_centroid_history": {
                "lin-a": [{"tick": 1, "x": 0, "y": 0}, {"tick": 2, "x": 50, "y": 0}],
            },
        }
        text = render_report(snap)
        self.assertIn("Behavioral Report", text)
        self.assertIn("Death Causes", text)
        self.assertIn("Action Sequences", text)
        self.assertIn("Migrations", text)
        self.assertIn("Influence Graph", text)


if __name__ == "__main__":
    unittest.main()
