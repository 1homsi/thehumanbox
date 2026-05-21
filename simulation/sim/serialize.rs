use std::collections::HashMap;

use serde_json::json;

use crate::sim::config::DAY_LENGTH;
use crate::sim::simulation::Simulation;

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
        self.state_json_inner(cx, cy, true, true)
    }

    pub fn state_json_periodic_full(&mut self) -> serde_json::Value {
        let (cx, cy) = self.viewport_centroid();
        self.state_json_inner(cx, cy, true, false)
    }

    pub fn state_json_incremental(&mut self) -> serde_json::Value {
        let (cx, cy) = self.viewport_centroid();
        self.state_json_inner(cx, cy, false, false)
    }

    pub fn state_json_at(&mut self, vp_cx: i32, vp_cy: i32) -> serde_json::Value {
        self.state_json_inner(vp_cx, vp_cy, false, false)
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

    fn state_json_inner(&mut self, vp_cx: i32, vp_cy: i32, force_full: bool, include_cold: bool) -> serde_json::Value {
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

            // Compute contested tiles: any tile claimed by 2+ lineages
            let mut tile_claim_count: HashMap<(i32, i32), u32> = HashMap::new();
            for tiles in self.territory.values() {
                for &tile in tiles {
                    *tile_claim_count.entry(tile).or_insert(0) += 1;
                }
            }
            let contested: Vec<[i32; 2]> = tile_claim_count.into_iter()
                .filter(|(_, c)| *c >= 2)
                .map(|((x, y), _)| [x, y])
                .collect();
            self.cached_territory = serde_json::json!({
                "claimed": self.territory.iter()
                    .map(|(lid, tiles)| {
                        let pts: Vec<[i32;2]> = tiles.iter().map(|&(x,y)| [x,y]).collect();
                        json!({"lid": lid, "tiles": pts})
                    }).collect::<Vec<_>>(),
                "contested": contested,
            });

            self.slow_compute_tick = self.tick_count;
        }

        let include_tiles  = include_cold || self.tick_count % 60 == 0 || self.tick_count <= 1;
        let include_static = include_cold || self.tick_count % 60 == 0 || self.tick_count <= 1;
        let include_terrain = include_cold;
        let grid_json = self.grid.to_json_viewport(vp_cx, vp_cy,
            crate::world::grid::VP_W, crate::world::grid::VP_H,
            include_tiles, include_static, include_terrain);
        let include_all_entities = force_full || self.tick_count % 120 == 0 || self.tick_count <= 1;
        // When the viewport spans the whole world (the current config),
        // the centroid-centered window can slide off the map and filter
        // out entities that are still on the canvas. Compute the actual
        // visible AABB and clamp it to world bounds so we never drop
        // entities the client needs to render.
        let half_w = crate::world::grid::VP_W as i32 / 2 + 8;
        let half_h = crate::world::grid::VP_H as i32 / 2 + 8;
        let left   = (vp_cx - half_w).max(-8);
        let right  = (vp_cx + half_w).min(crate::world::grid::WIDTH  as i32 + 8);
        let top    = (vp_cy - half_h).max(-8);
        let bottom = (vp_cy + half_h).min(crate::world::grid::HEIGHT as i32 + 8);
        let full_world_vp = crate::world::grid::VP_W >= crate::world::grid::WIDTH
            && crate::world::grid::VP_H >= crate::world::grid::HEIGHT;
        let in_view = |x: f32, y: f32| {
            if full_world_vp { return true }
            let x = x as i32;
            let y = y as i32;
            x >= left && x <= right && y >= top && y <= bottom
        };
        let per_org_cold = include_cold;
        use crate::organism::organism::OrgsHotSoa;
        let mut payload = if include_all_entities {
            let organisms_json = self.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| serde_json::to_value(o.to_json_with(per_org_cold)).unwrap())
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
                "weather":            { "kind": self.weather.phase(self.tick_count), "intensity": self.weather.effective_intensity(self.tick_count), "wind_x": self.weather.wind_x, "wind_y": self.weather.wind_y },
            })
        } else {
            let mut soa = OrgsHotSoa::with_capacity(self.organisms.len() / 2);
            let lookahead = *LOOKAHEAD_TICKS;
            // `soa.push` takes `&mut Organism` because it clears
            // `thought_dirty` after emitting the change. That's fine
            // - `state_json_inner` already holds `&mut self`.
            for o in self.organisms.iter_mut() {
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
                "weather":            { "kind": self.weather.phase(self.tick_count), "intensity": self.weather.effective_intensity(self.tick_count), "wind_x": self.weather.wind_x, "wind_y": self.weather.wind_y },
            })
        };
        if include_cold {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("events".to_string(), serde_json::to_value(&self.events).unwrap());
                obj.insert("history".to_string(), serde_json::to_value(&self.history).unwrap());
                obj.insert(
                    "story_history".to_string(),
                    serde_json::to_value(self.story_history.iter().rev().take(120).collect::<Vec<_>>()).unwrap(),
                );
                // Tail-only pop_history: only the most recent 60
                // samples make it to the wire. The full ring buffer
                // is kept server-side for trend analysis, but the
                // client only graphs the tail.
                let tail: Vec<&[u64; 2]> = self.pop_history.iter()
                    .rev().take(60).collect::<Vec<_>>()
                    .into_iter().rev().collect();
                obj.insert("pop_history".to_string(), serde_json::to_value(&tail).unwrap());
                obj.insert("tribal_relations".to_string(), self.cached_tribal_relations.clone());
                obj.insert("lineage_sizes".to_string(), self.cached_lineage_sizes.clone());
                obj.insert("territory".to_string(), self.cached_territory.clone());
                obj.insert("lineage_names".to_string(), serde_json::to_value(&self.lineage_names).unwrap());
                obj.insert("lineage_centroid_history".to_string(),
                    serde_json::to_value(&self.lineage_centroid_history).unwrap());
                obj.insert("lineage_homes".to_string(),
                    serde_json::to_value(&self.lineage_homes).unwrap());
                obj.insert("current_era".to_string(), serde_json::to_value(&self.current_era).unwrap());
                let eras_json: Vec<serde_json::Value> = self.lineage_eras.iter()
                    .map(|(lid, era)| json!({ "lineage_id": lid, "era_name": era.name() }))
                    .collect();
                obj.insert("lineage_eras".to_string(), serde_json::Value::Array(eras_json));
                obj.insert("sex_words".to_string(), serde_json::to_value(&self.sex_words).unwrap());
            }
        }
        payload
    }
}

#[cfg(test)]
mod schema_tests {
    use super::*;

    /// Lock the delta payload's top-level shape. The client wire
    /// round-trip test in client/src/simulation/wire.roundtrip.test.ts
    /// expects these exact keys; if a refactor here removes one
    /// without coordinating the rename, this test catches it before
    /// it reaches the wire.
    #[test]
    fn delta_payload_has_expected_top_level_keys() {
        let mut sim = Simulation::new(42);
        // Bump tick past the boot-time "include all entities" cutoff so
        // we exercise the actual delta path the client sees in steady
        // state. Boot frames are conceptually a full snapshot anyway.
        sim.tick_count = 5;
        let payload = sim.state_json_incremental();
        let obj = payload.as_object().expect("payload must be a JSON object");
        for key in &[
            "tick", "grid", "organisms_complete", "animals", "animals_complete",
            "is_day", "day_progress", "season", "season_progress",
            "drought", "weather",
        ] {
            assert!(obj.contains_key(*key), "delta payload missing key `{}`", key);
        }
        // The hot-SoA path is what the client decodes for deltas.
        assert!(obj.contains_key("organisms_hot"),
            "delta payload must carry organisms_hot");
        // Wind made it into the weather object.
        let weather = obj["weather"].as_object().unwrap();
        for key in &["kind", "intensity", "wind_x", "wind_y"] {
            assert!(weather.contains_key(*key),
                "weather missing key `{}`", key);
        }
    }

    /// Verify that ages was actually dropped from the SoA payload -
    /// the wire-slim-down work is only worth committing if the
    /// serialised payload actually omits the field.
    #[test]
    fn organisms_hot_does_not_include_ages() {
        let mut sim = Simulation::new(7);
        sim.tick_count = 5;
        // Need at least one alive org so the SoA isn't empty.
        // The default `new` constructor seeds a small starter pop.
        let payload = sim.state_json_incremental();
        let hot = payload.as_object().unwrap().get("organisms_hot")
            .expect("organisms_hot present");
        let obj = hot.as_object().expect("organisms_hot is an object");
        assert!(!obj.contains_key("ages"),
            "ages must NOT be serialized in delta SoA - saves 4 bytes/org/tick");
        // Spot-check that we still have the fields the client expects.
        for key in &["ids", "xs", "ys", "vxs", "vys", "energies", "thoughts"] {
            assert!(obj.contains_key(*key),
                "organisms_hot missing required key `{}`", key);
        }
    }
}
