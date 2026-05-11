use std::collections::HashMap;

use serde_json::json;

use crate::sim::config::DAY_LENGTH;
use crate::sim::simulation::Simulation;

/// Server-side prediction lookahead, expressed in sim ticks. Read once
/// at startup from `LOOKAHEAD_MS` / `TICK_MS` env vars (both shared with
/// main.rs). Hot deltas project each organism's position forward by
/// this many ticks along its smoothed velocity, so the value the client
/// renders matches the org's "now" coordinate after the network +
/// render-lag round trip. 0 disables prediction.
static LOOKAHEAD_TICKS: std::sync::LazyLock<f32> = std::sync::LazyLock::new(|| {
    let look_ms = std::env::var("LOOKAHEAD_MS").ok()
        .and_then(|v| v.parse::<f32>().ok()).unwrap_or(150.0);
    let tick_ms = std::env::var("TICK_MS").ok()
        .and_then(|v| v.parse::<f32>().ok()).unwrap_or(100.0);
    if tick_ms <= 0.0 { 0.0 } else { (look_ms / tick_ms).max(0.0) }
});

impl Simulation {
    pub fn state_json(&mut self) -> serde_json::Value {
        let (cx, cy) = self.viewport_centroid();
        self.state_json_inner(cx, cy, true)
    }

    pub fn state_json_incremental(&mut self) -> serde_json::Value {
        let (cx, cy) = self.viewport_centroid();
        self.state_json_inner(cx, cy, false)
    }

    pub fn state_json_at(&mut self, vp_cx: i32, vp_cy: i32) -> serde_json::Value {
        self.state_json_inner(vp_cx, vp_cy, false)
    }

    fn viewport_centroid(&self) -> (i32, i32) {
        let alive: Vec<_> = self.organisms.iter().filter(|o| o.alive).collect();
        if alive.is_empty() {
            (crate::world::grid::WIDTH as i32 / 2, crate::world::grid::HEIGHT as i32 / 2)
        } else {
            let n = alive.len() as f32;
            ((alive.iter().map(|o| o.x).sum::<f32>() / n) as i32,
             (alive.iter().map(|o| o.y).sum::<f32>() / n) as i32)
        }
    }

    fn state_json_inner(&mut self, vp_cx: i32, vp_cy: i32, force_full: bool) -> serde_json::Value {
        // Throttled tribal_relations + lineage_sizes (O(orgs * lineages) each).
        // Cached for 60 ticks (~18 s); stale is fine - tribes don't flip
        // allegiance every tick and the panel doesn't need sub-second updates.
        let needs_slow = self.tick_count == 0
            || self.tick_count.saturating_sub(self.slow_compute_tick) >= 60;
        if needs_slow {
            let alive_lineages: std::collections::HashSet<String> = self.organisms.iter()
                .filter(|o| o.alive).map(|o| o.lineage_id.clone()).collect();

            let mut att_totals: HashMap<(String, String), (f32, u32)> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                for (other_lid, &att) in &org.lineage_attitudes {
                    if alive_lineages.contains(other_lid) {
                        let key = if org.lineage_id < *other_lid {
                            (org.lineage_id.clone(), other_lid.clone())
                        } else {
                            (other_lid.clone(), org.lineage_id.clone())
                        };
                        let e = att_totals.entry(key).or_insert((0.0, 0));
                        e.0 += att; e.1 += 1;
                    }
                }
            }
            self.cached_tribal_relations = serde_json::to_value(
                att_totals.into_iter()
                    .filter(|(_, (_, cnt))| *cnt > 0)
                    .map(|((a, b), (sum, cnt))| {
                        let avg = sum / cnt as f32;
                        let status = if avg > 0.3 { "ally" } else if avg < -0.3 { "rivals" } else { "neutral" };
                        json!({ "a": a, "b": b,
                                 "attitude": (avg * 100.0).round() / 100.0, "status": status })
                    }).collect::<Vec<_>>()
            ).unwrap();

            let mut lineage_sizes: HashMap<String, usize> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                *lineage_sizes.entry(org.lineage_id.clone()).or_insert(0) += 1;
            }
            self.cached_lineage_sizes = serde_json::to_value(
                lineage_sizes.into_iter()
                    .map(|(id, count)| json!({"id": id, "count": count}))
                    .collect::<Vec<_>>()
            ).unwrap();

            self.slow_compute_tick = self.tick_count;
        }

        // Stagger expensive static grid layers to cap per-tick payload size.
        // force_full=true (initial WS snapshot) bypasses the stagger so a
        // fresh client gets terrain immediately rather than rendering ocean
        // until the next tick%30 boundary.
        let include_tiles  = force_full || self.tick_count % 5  == 0 || self.tick_count <= 1;
        let include_static = force_full || self.tick_count % 30 == 0 || self.tick_count <= 1;
        let grid_json = self.grid.to_json_viewport(vp_cx, vp_cy,
            crate::world::grid::VP_W, crate::world::grid::VP_H,
            include_tiles, include_static);
        let include_all_entities = force_full || self.tick_count % 120 == 0 || self.tick_count <= 1;
        let left = vp_cx - crate::world::grid::VP_W as i32 / 2 - 8;
        let right = vp_cx + crate::world::grid::VP_W as i32 / 2 + 8;
        let top = vp_cy - crate::world::grid::VP_H as i32 / 2 - 8;
        let bottom = vp_cy + crate::world::grid::VP_H as i32 / 2 + 8;
        let in_view = |x: f32, y: f32| {
            let x = x as i32;
            let y = y as i32;
            x >= left && x <= right && y >= top && y <= bottom
        };
        // Per-organism encoding splits two ways:
        //  - Hot deltas use structure-of-arrays (`organisms_hot`).
        //    Every alive in-viewport org contributes one slot to each of
        //    the 16 parallel arrays. ~50% smaller on the wire than the
        //    AoS version and the client decodes 16 typed arrays instead
        //    of 300 maps.
        //  - Full snapshots use the AoS array (`organisms`) because that
        //    path also carries cold/identity fields and SoA-with-many-
        //    optional-columns costs more than it saves.
        // Newborns (age < 60 ticks) always get their cold fields in the
        // AoS path; the SoA hot path never carries cold fields, so a new
        // baby's static identity arrives on the next full snapshot.
        use crate::organism::organism::OrgsHotSoa;
        let mut payload = if include_all_entities {
            let organisms_json = self.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| serde_json::to_value(o.to_json_with(true)).unwrap())
                .collect::<Vec<_>>();
            let animals_json = self.animals.iter()
                .map(|a| serde_json::to_value(a.to_json()).unwrap())
                .collect::<Vec<_>>();
            json!({
                "tick":               self.tick_count,
                "grid":               serde_json::to_value(grid_json).unwrap(),
                "organisms":          organisms_json,
                "organisms_complete": true,
                "animals":            animals_json,
                "animals_complete":   true,
                "is_day":             !self.is_night(),
                "day_progress":       ((self.tick_count % DAY_LENGTH) as f32 / DAY_LENGTH as f32 * 1000.0).round() / 1000.0,
                "season":             self.season(),
                "season_progress":    (self.season_progress() * 1000.0).round() / 1000.0,
                "drought":            self.drought.active,
                "weather":            { "kind": self.weather.kind_str(), "intensity": self.weather.intensity },
            })
        } else {
            let mut soa = OrgsHotSoa::with_capacity(self.organisms.len() / 2);
            let lookahead = *LOOKAHEAD_TICKS;
            for o in &self.organisms {
                if o.alive && in_view(o.x, o.y) { soa.push(o, lookahead); }
            }
            let animals_json = self.animals.iter()
                .filter(|a| in_view(a.x, a.y))
                .map(|a| serde_json::to_value(a.to_json()).unwrap())
                .collect::<Vec<_>>();
            json!({
                "tick":               self.tick_count,
                "grid":               serde_json::to_value(grid_json).unwrap(),
                "organisms_hot":      serde_json::to_value(&soa).unwrap(),
                "organisms_complete": false,
                "animals":            animals_json,
                "animals_complete":   false,
                "is_day":             !self.is_night(),
                "day_progress":       ((self.tick_count % DAY_LENGTH) as f32 / DAY_LENGTH as f32 * 1000.0).round() / 1000.0,
                "season":             self.season(),
                "season_progress":    (self.season_progress() * 1000.0).round() / 1000.0,
                "drought":            self.drought.active,
                "weather":            { "kind": self.weather.kind_str(), "intensity": self.weather.intensity },
            })
        };
        if force_full {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("events".to_string(), serde_json::to_value(&self.events).unwrap());
                obj.insert("history".to_string(), serde_json::to_value(&self.history).unwrap());
                obj.insert(
                    "story_history".to_string(),
                    serde_json::to_value(self.story_history.iter().rev().take(120).collect::<Vec<_>>()).unwrap(),
                );
                obj.insert("pop_history".to_string(), serde_json::to_value(&self.pop_history).unwrap());
                obj.insert("tribal_relations".to_string(), self.cached_tribal_relations.clone());
                obj.insert("lineage_sizes".to_string(), self.cached_lineage_sizes.clone());
                obj.insert("lineage_names".to_string(), serde_json::to_value(&self.lineage_names).unwrap());
                obj.insert("current_era".to_string(), serde_json::to_value(&self.current_era).unwrap());
                obj.insert("sex_words".to_string(), serde_json::to_value(&self.sex_words).unwrap());
            }
        }
        payload
    }
}
