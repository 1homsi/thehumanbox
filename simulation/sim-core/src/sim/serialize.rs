use std::collections::{HashMap, HashSet};

use serde_json::json;

use crate::sim::config::DAY_LENGTH;
use crate::sim::simulation::Simulation;

fn lookahead_ticks_for_values(look_ms: Option<&str>, tick_ms: Option<&str>) -> f32 {
    let look_ms = look_ms
        .and_then(|value| value.trim().parse::<f32>().ok())
        .filter(|value| value.is_finite())
        .unwrap_or(150.0)
        .max(0.0);
    // Keep prediction cadence aligned with the server's bounded runtime
    // interval. Invalid or zero TICK_MS used to disable lookahead while the
    // server silently ran at its 100ms fallback, making movement stutter.
    let tick_ms = tick_ms
        .and_then(|value| value.trim().parse::<f32>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(100.0)
        .clamp(16.0, 5_000.0);
    look_ms / tick_ms
}

static LOOKAHEAD_TICKS: std::sync::LazyLock<f32> = std::sync::LazyLock::new(|| {
    lookahead_ticks_for_values(
        std::env::var("LOOKAHEAD_MS").ok().as_deref(),
        std::env::var("TICK_MS").ok().as_deref(),
    )
});

fn lineage_strategy_payload(sim: &Simulation) -> serde_json::Value {
    let active_strategies: HashMap<String, serde_json::Value> = sim
        .lineage_strategies
        .iter()
        .filter(|(_, (_, expires_tick))| *expires_tick > sim.tick_count)
        .map(|(lineage_id, (strategy, expires_tick))| {
            let objective = sim
                .lineage_strategy_objectives
                .get(lineage_id)
                .filter(|objective| objective.strategy == strategy.as_str());
            (
                lineage_id.clone(),
                json!({
                    "strategy": strategy,
                    "expires_tick": expires_tick,
                    "started_tick": objective.map(|objective| objective.started_tick).unwrap_or(sim.tick_count),
                    "progress": objective.map(|objective| objective.progress).unwrap_or(0),
                    "target": objective.map(|objective| objective.target).unwrap_or(0),
                    "completed": objective.and_then(|objective| objective.completed_tick).is_some(),
                    "completed_tick": objective.and_then(|objective| objective.completed_tick),
                    "status": if objective.and_then(|objective| objective.completed_tick).is_some() {
                        "completed"
                    } else {
                        "active"
                    },
                }),
            )
        })
        .collect();
    serde_json::to_value(active_strategies).unwrap()
}

fn lineage_strategy_history_payload(sim: &Simulation) -> serde_json::Value {
    serde_json::to_value(
        sim.lineage_strategy_history
            .iter()
            .rev()
            .take(20)
            .collect::<Vec<_>>(),
    )
    .unwrap()
}

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
        let mut sx: f32 = 0.0;
        let mut sy: f32 = 0.0;
        let mut n: u32 = 0;
        for o in &self.organisms {
            if o.alive {
                sx += o.x;
                sy += o.y;
                n += 1;
            }
        }
        if n == 0 {
            (
                crate::world::grid::WIDTH as i32 / 2,
                crate::world::grid::HEIGHT as i32 / 2,
            )
        } else {
            let nf = n as f32;
            ((sx / nf) as i32, (sy / nf) as i32)
        }
    }

    fn state_json_inner(
        &mut self,
        vp_cx: i32,
        vp_cy: i32,
        force_full: bool,
        include_cold: bool,
    ) -> serde_json::Value {
        let needs_slow = self.tick_count == 0 || self.tick_count.saturating_sub(self.slow_compute_tick) >= 60;
        if needs_slow {
            let alive_lineages: std::collections::HashSet<String> = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.lineage_id.clone())
                .collect();

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
                        e.0 += att;
                        e.1 += 1;
                    }
                }
            }
            self.cached_tribal_relations = serde_json::to_value(
                att_totals
                    .into_iter()
                    .filter(|(_, (_, cnt))| *cnt > 0)
                    .map(|((a, b), (sum, cnt))| {
                        let avg = sum / cnt as f32;
                        let status = if avg > 0.3 {
                            "ally"
                        } else if avg < -0.3 {
                            "rivals"
                        } else {
                            "neutral"
                        };
                        json!({ "a": a, "b": b,
                                 "attitude": (avg * 100.0).round() / 100.0, "status": status })
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();

            let mut lineage_sizes: HashMap<String, usize> = HashMap::new();
            for org in self.organisms.iter().filter(|o| o.alive) {
                *lineage_sizes.entry(org.lineage_id.clone()).or_insert(0) += 1;
            }
            self.cached_lineage_sizes = serde_json::to_value(
                lineage_sizes
                    .into_iter()
                    .map(|(id, count)| json!({"id": id, "count": count}))
                    .collect::<Vec<_>>(),
            )
            .unwrap();

            // Compute contested tiles: any tile claimed by 2+ lineages
            let mut tile_claim_count: HashMap<(i32, i32), u32> = HashMap::new();
            for tiles in self.territory.values() {
                for &tile in tiles {
                    *tile_claim_count.entry(tile).or_insert(0) += 1;
                }
            }
            let contested: Vec<[i32; 2]> = tile_claim_count
                .into_iter()
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

        let include_tiles = include_cold || self.tick_count.is_multiple_of(60) || self.tick_count <= 1;
        let include_static = include_cold || self.tick_count.is_multiple_of(60) || self.tick_count <= 1;
        let include_terrain = include_cold;
        let grid_json = self.grid.to_json_viewport(
            vp_cx,
            vp_cy,
            crate::world::grid::VP_W,
            crate::world::grid::VP_H,
            include_tiles,
            include_static,
            include_terrain,
        );
        let include_all_entities = force_full || self.tick_count.is_multiple_of(120) || self.tick_count <= 1;
        // When the viewport spans the whole world (the current config),
        // the centroid-centered window can slide off the map and filter
        // out entities that are still on the canvas. Compute the actual
        // visible AABB and clamp it to world bounds so we never drop
        // entities the client needs to render.
        let half_w = crate::world::grid::VP_W as i32 / 2 + 8;
        let half_h = crate::world::grid::VP_H as i32 / 2 + 8;
        let left = (vp_cx - half_w).max(-8);
        let right = (vp_cx + half_w).min(crate::world::grid::WIDTH as i32 + 8);
        let top = (vp_cy - half_h).max(-8);
        let bottom = (vp_cy + half_h).min(crate::world::grid::HEIGHT as i32 + 8);
        let full_world_vp = crate::world::grid::VP_W >= crate::world::grid::WIDTH
            && crate::world::grid::VP_H >= crate::world::grid::HEIGHT;
        let in_view = |x: f32, y: f32| {
            if full_world_vp {
                return true;
            }
            let x = x as i32;
            let y = y as i32;
            x >= left && x <= right && y >= top && y <= bottom
        };
        let per_org_cold = include_cold;
        use crate::organism::organism::OrgsHotSoa;
        let mut payload = if include_all_entities {
            let mut organisms_json: Vec<serde_json::Value> = Vec::with_capacity(self.organisms.len());
            for o in self.organisms.iter() {
                if o.alive {
                    organisms_json.push(serde_json::to_value(o.to_json_with(per_org_cold)).unwrap());
                }
            }
            let mut animals_json: Vec<serde_json::Value> = Vec::with_capacity(self.animals.len());
            for a in self.animals.iter() {
                animals_json.push(serde_json::to_value(a.to_json()).unwrap());
            }
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
                "cosmos": {
                    "moon_phase":    crate::sim::cosmos::moon_phase_at(self.tick_count).label(),
                    "moon_illum":    crate::sim::cosmos::moon_phase_at(self.tick_count).illumination(),
                    "year":          crate::sim::cosmos::current_year(self.tick_count),
                    "day_of_year":   crate::sim::cosmos::day_of_year(self.tick_count),
                },
            })
        } else {
            let mut soa = OrgsHotSoa::with_capacity(self.organisms.len() / 2);
            let lookahead = *LOOKAHEAD_TICKS;
            // `soa.push` takes `&mut Organism` because it clears
            // `thought_dirty` after emitting the change. That's fine
            // - `state_json_inner` already holds `&mut self`.
            for o in self.organisms.iter_mut() {
                if o.alive && in_view(o.x, o.y) {
                    soa.push(o, lookahead);
                }
            }
            let mut animals_json: Vec<serde_json::Value> = Vec::with_capacity(self.animals.len());
            for a in self.animals.iter() {
                if in_view(a.x, a.y) {
                    animals_json.push(serde_json::to_value(a.to_json()).unwrap());
                }
            }
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
                "cosmos": {
                    "moon_phase":    crate::sim::cosmos::moon_phase_at(self.tick_count).label(),
                    "moon_illum":    crate::sim::cosmos::moon_phase_at(self.tick_count).illumination(),
                    "year":          crate::sim::cosmos::current_year(self.tick_count),
                    "day_of_year":   crate::sim::cosmos::day_of_year(self.tick_count),
                },
            })
        };
        if let Some(obj) = payload.as_object_mut() {
            obj.insert(
                "population_limit".to_string(),
                serde_json::to_value(self.population_limit()).unwrap(),
            );
            // Campaigns are live player-facing state. Sending this small map
            // on every frame avoids a short objective completing or expiring
            // entirely between deep/cold snapshots.
            obj.insert("lineage_strategies".to_string(), lineage_strategy_payload(self));
            obj.insert(
                "lineage_strategy_history".to_string(),
                lineage_strategy_history_payload(self),
            );
        }
        if include_cold {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("events".to_string(), serde_json::to_value(&self.events).unwrap());
                obj.insert(
                    "history".to_string(),
                    serde_json::to_value(&self.history).unwrap(),
                );
                obj.insert(
                    "story_history".to_string(),
                    serde_json::to_value(self.story_history.iter().rev().take(120).collect::<Vec<_>>())
                        .unwrap(),
                );
                // Tail-only pop_history: only the most recent 60
                // samples make it to the wire. The full ring buffer
                // is kept server-side for trend analysis, but the
                // client only graphs the tail.
                let start = self.pop_history.len().saturating_sub(60);
                let tail: Vec<&[u64; 2]> = self.pop_history.iter().skip(start).collect();
                obj.insert("pop_history".to_string(), serde_json::to_value(&tail).unwrap());
                obj.insert(
                    "tribal_relations".to_string(),
                    self.cached_tribal_relations.clone(),
                );
                obj.insert("lineage_sizes".to_string(), self.cached_lineage_sizes.clone());
                obj.insert("territory".to_string(), self.cached_territory.clone());
                obj.insert(
                    "lineage_names".to_string(),
                    serde_json::to_value(&self.lineage_names).unwrap(),
                );
                obj.insert(
                    "lineage_centroid_history".to_string(),
                    serde_json::to_value(&self.lineage_centroid_history).unwrap(),
                );
                obj.insert(
                    "lineage_homes".to_string(),
                    serde_json::to_value(&self.lineage_homes).unwrap(),
                );
                obj.insert(
                    "current_era".to_string(),
                    serde_json::to_value(&self.current_era).unwrap(),
                );
                let eras_json: Vec<serde_json::Value> = self
                    .lineage_eras
                    .iter()
                    .map(|(lid, era)| json!({ "lineage_id": lid, "era_name": era.name() }))
                    .collect();
                obj.insert("lineage_eras".to_string(), serde_json::Value::Array(eras_json));
                let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::new();
                let mut lineage_pop: HashMap<String, usize> = HashMap::new();
                for org in self.organisms.iter().filter(|o| o.alive) {
                    *lineage_pop.entry(org.lineage_id.clone()).or_insert(0) += 1;
                    let entry = lineage_discoveries.entry(org.lineage_id.clone()).or_default();
                    for d in &org.discoveries {
                        entry.insert(d.clone());
                    }
                }
                let world_population: usize = lineage_pop.values().sum();
                let era_progress_json: Vec<serde_json::Value> = self
                    .lineage_eras
                    .iter()
                    .map(|(lid, era)| {
                        let lineage_population = *lineage_pop.get(lid).unwrap_or(&0);
                        let discoveries = lineage_discoveries.get(lid);
                        let next = era.advance();
                        let (next_era, required, known, missing, world_population_required) =
                            if let Some(next) = next {
                                let required = next.required_discoveries();
                                let has = |d: &str| discoveries.is_some_and(|set| set.contains(d));
                                let known: Vec<&str> = required.iter().copied().filter(|d| has(d)).collect();
                                let missing: Vec<&str> =
                                    required.iter().copied().filter(|d| !has(d)).collect();
                                (
                                    Some(next.name()),
                                    required.to_vec(),
                                    known,
                                    missing,
                                    next.population_gate(self.population_limit()),
                                )
                            } else {
                                (None, Vec::new(), Vec::new(), Vec::new(), 0)
                            };
                        let discovery_ready = missing.is_empty();
                        let lineage_population_ready = lineage_population >= world_population_required;
                        let world_population_ready = world_population >= world_population_required;
                        json!({
                            "lineage_id": lid,
                            "era_name": era.name(),
                            "next_era": next_era,
                            // Keep the original fields for older clients, but make the
                            // lineage/world distinction explicit for current clients.
                            "pop": lineage_population,
                            "pop_required": world_population_required,
                            "pop_ready": lineage_population_ready,
                            "lineage_population": lineage_population,
                            "world_population": world_population,
                            "world_population_required": world_population_required,
                            "world_population_ready": world_population_ready,
                            "required": required,
                            "known": known,
                            "missing": missing,
                            "discovery_ready": discovery_ready,
                            "ready": discovery_ready && world_population_ready,
                        })
                    })
                    .collect();
                obj.insert(
                    "lineage_era_progress".to_string(),
                    serde_json::Value::Array(era_progress_json),
                );

                let farms_json: Vec<serde_json::Value> = self
                    .farms
                    .iter()
                    .map(|farm| {
                        let fertility = self.grid.fertility_at(farm.x, farm.y);
                        let era = self.era(&farm.owner_lineage);
                        json!({
                            "id": farm.id,
                            "x": farm.x,
                            "y": farm.y,
                            "crop": farm.crop.name(),
                            "lineage_id": farm.owner_lineage,
                            "planted_tick": farm.planted_tick,
                            "ready_tick": farm.ready_tick,
                            "harvested": farm.harvested,
                            "stage": farm.stage(self.tick_count),
                            "progress": farm.progress(self.tick_count).clamp(0.0, 1.0),
                            "yield": if farm.harvested {
                                0
                            } else {
                                farm.projected_yield(era, fertility)
                            },
                        })
                    })
                    .collect();
                obj.insert("farms".to_string(), serde_json::Value::Array(farms_json));

                let settlements_json: Vec<serde_json::Value> = crate::sim::civ::settlements::snapshots(self)
                    .into_iter()
                    .map(|settlement| {
                        json!({
                            "lineage_id": settlement.lineage_id,
                            "name": settlement.name,
                            "tier": settlement.tier,
                            "tier_name": settlement.tier_name,
                            "center": settlement.center,
                            "population": settlement.population,
                            "building_count": settlement.building_count,
                            "capacity": settlement.capacity,
                            "score": settlement.score,
                        })
                    })
                    .collect();
                obj.insert(
                    "settlements".to_string(),
                    serde_json::Value::Array(settlements_json),
                );

                let gov_json: Vec<serde_json::Value> = self
                    .governments
                    .values()
                    .map(|g| {
                        json!({
                            "lineage_id": g.lineage_id,
                            "kind": g.kind.name(),
                            "leader_id": g.leader_id,
                            "treasury": g.treasury,
                            "tax_rate": g.tax_rate,
                            "laws": g.laws.iter().map(|l| l.kind.name()).collect::<Vec<_>>(),
                        })
                    })
                    .collect();
                obj.insert("governments".to_string(), serde_json::Value::Array(gov_json));

                let religions_json: Vec<serde_json::Value> = self
                    .religions
                    .iter()
                    .map(|r| {
                        json!({
                            "id": r.id, "kind": r.kind.name(), "name": r.name,
                            "founder_lineage": r.founder_lineage, "adherents": r.adherents,
                        })
                    })
                    .collect();
                obj.insert("religions".to_string(), serde_json::Value::Array(religions_json));

                let books_json: Vec<serde_json::Value> = self
                    .books
                    .iter()
                    .rev()
                    .take(30)
                    .map(|b| {
                        json!({
                            "id": b.id, "title": b.title, "author_name": b.author_name,
                            "lineage_id": b.lineage_id, "topic": b.topic.name(), "copies": b.copies,
                        })
                    })
                    .collect();
                obj.insert("books".to_string(), serde_json::Value::Array(books_json));

                let artworks_json: Vec<serde_json::Value> = self
                    .artworks
                    .iter()
                    .rev()
                    .take(30)
                    .map(|a| {
                        json!({
                            "id": a.id, "kind": a.kind.name(), "title": a.title,
                            "creator_name": a.creator_name, "x": a.location[0], "y": a.location[1],
                        })
                    })
                    .collect();
                obj.insert("artworks".to_string(), serde_json::Value::Array(artworks_json));

                let headlines_json: Vec<serde_json::Value> = self
                    .headlines
                    .iter()
                    .rev()
                    .take(60)
                    .map(|(t, s)| json!({"tick": t, "text": s}))
                    .collect();
                obj.insert("headlines".to_string(), serde_json::Value::Array(headlines_json));

                let mut lineage_alive: HashMap<&str, u32> = HashMap::new();
                for o in self.organisms.iter().filter(|o| o.alive) {
                    *lineage_alive.entry(o.lineage_id.as_str()).or_insert(0) += 1;
                }
                if let Some((top_lid, _)) = lineage_alive.iter().max_by_key(|(_, n)| **n) {
                    let top_lid = *top_lid;
                    let featured = self
                        .organisms
                        .iter()
                        .filter(|o| o.alive && o.lineage_id == top_lid)
                        .max_by_key(|o| o.age)
                        .map(|o| o.id.clone());
                    if let Some(fid) = featured {
                        obj.insert("featured_org_id".to_string(), serde_json::Value::String(fid));
                    }
                }

                let now = self.tick_count;
                let battles_json: Vec<serde_json::Value> = self
                    .battles
                    .iter()
                    .filter(|b| b.ended_tick.is_none_or(|e| now.saturating_sub(e) < 900))
                    .rev()
                    .take(16)
                    .map(|b| {
                        json!({
                            "id": b.id,
                            "attackers": b.attackers,
                            "defenders": b.defenders,
                            "scale": format!("{:?}", b.scale),
                            "location": [b.location.0, b.location.1],
                            "started_tick": b.started_tick,
                            "ended": b.ended_tick.is_some(),
                            "outcome": b.outcome.map(|o| format!("{:?}", o)),
                            "casualties_a": b.casualties_a,
                            "casualties_d": b.casualties_d,
                            "initial_a": b.initial_a,
                            "initial_d": b.initial_d,
                        })
                    })
                    .collect();
                obj.insert("battles".to_string(), serde_json::Value::Array(battles_json));

                let treaties_json: Vec<serde_json::Value> = self
                    .treaties
                    .iter()
                    .filter(|t| t.expires_tick > now)
                    .rev()
                    .take(16)
                    .map(|t| {
                        json!({
                            "tick": t.signed_tick,
                            "a_lineage": t.lineage_a,
                            "b_lineage": t.lineage_b,
                            "kind": t.kind.name(),
                        })
                    })
                    .collect();
                obj.insert("treaties".to_string(), serde_json::Value::Array(treaties_json));

                let trades_json: Vec<serde_json::Value> = self
                    .trades
                    .iter()
                    .rev()
                    .take(30)
                    .map(|tr| {
                        json!({
                            "tick": tr.tick,
                            "buyer_id": tr.buyer_id,
                            "seller_id": tr.seller_id,
                            "good": tr.good,
                            "amount": tr.amount,
                            "price": tr.price,
                        })
                    })
                    .collect();
                obj.insert("trades".to_string(), serde_json::Value::Array(trades_json));

                let currencies: std::collections::HashMap<String, &str> = self
                    .lineage_eras
                    .iter()
                    .map(|(lid, era)| (lid.clone(), crate::sim::economy::currency_unit_for_era(*era)))
                    .collect();
                obj.insert(
                    "lineage_currencies".to_string(),
                    serde_json::to_value(&currencies).unwrap(),
                );

                obj.insert(
                    "sex_words".to_string(),
                    serde_json::to_value(&self.sex_words).unwrap(),
                );
            }
        }
        let buildings_changed = self.building_state_revision != self.serialized_building_state_revision;
        if include_cold || force_full || buildings_changed {
            if let Some(obj) = payload.as_object_mut() {
                let buildings_json: Vec<serde_json::Value> = self
                    .buildings
                    .iter()
                    .map(|b| {
                        json!({
                            "id": b.id,
                            "kind": b.kind.name(),
                            "x": b.x,
                            "y": b.y,
                            "lineage_id": b.owner_lineage.clone().unwrap_or_default(),
                            // `condition` is retained for older clients. It is
                            // construction progress, not structural health.
                            "condition": b.condition,
                            "construction_progress": b.condition,
                            "damage": b.damage_fraction(),
                            "integrity": b.integrity(),
                            "ruined": b.is_ruined(),
                            "repairing": b.is_repairing_at(self.tick_count),
                            "ruined_at_tick": b.ruined_at_tick,
                            "last_damage_tick": b.last_damage_tick,
                            "last_repair_tick": b.last_repair_tick,
                            "fw": b.kind.footprint().0,
                            "fh": b.kind.footprint().1,
                            "function": format!("{:?}", b.kind.function()).to_lowercase(),
                        })
                    })
                    .collect();
                obj.insert("buildings".to_string(), serde_json::Value::Array(buildings_json));
                self.serialized_building_state_revision = self.building_state_revision;
            }
        }
        payload
    }
}

#[cfg(test)]
mod schema_tests {
    use super::*;

    #[test]
    fn lookahead_uses_the_same_safe_tick_bounds_as_the_runtime() {
        assert!((lookahead_ticks_for_values(Some("150"), Some("100")) - 1.5).abs() < f32::EPSILON);
        assert!((lookahead_ticks_for_values(Some("150"), Some("0")) - 1.5).abs() < f32::EPSILON);
        assert!((lookahead_ticks_for_values(Some("150"), Some("8")) - 9.375).abs() < f32::EPSILON);
        assert_eq!(lookahead_ticks_for_values(Some("-5"), Some("100")), 0.0);
    }

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
            "tick",
            "grid",
            "organisms_complete",
            "animals",
            "animals_complete",
            "is_day",
            "day_progress",
            "season",
            "season_progress",
            "drought",
            "weather",
            "lineage_strategies",
            "lineage_strategy_history",
        ] {
            assert!(obj.contains_key(*key), "delta payload missing key `{}`", key);
        }
        // The hot-SoA path is what the client decodes for deltas.
        assert!(
            obj.contains_key("organisms_hot"),
            "delta payload must carry organisms_hot"
        );
        // Wind made it into the weather object.
        let weather = obj["weather"].as_object().unwrap();
        for key in &["kind", "intensity", "wind_x", "wind_y"] {
            assert!(weather.contains_key(*key), "weather missing key `{}`", key);
        }
    }

    #[test]
    fn building_wire_contract_separates_construction_from_damage() {
        use crate::sim::buildings::{Building, BuildingKind};

        let mut sim = Simulation::new(420);
        sim.buildings.clear();
        let mut building = Building::new(9, BuildingKind::House, 40, 41, Some("wire".into()), 12);
        building.condition = 1.0;
        building.damage = 0.40;
        building.ruined_at_tick = Some(55);
        building.last_damage_tick = Some(56);
        building.last_repair_tick = Some(57);
        sim.buildings.push(building);
        sim.tick_count = 58;

        let payload = sim.state_json();
        let building = payload["buildings"][0].as_object().expect("building object");

        assert_eq!(building["condition"].as_f64(), Some(1.0));
        assert_eq!(building["construction_progress"].as_f64(), Some(1.0));
        assert!((building["damage"].as_f64().unwrap() - 0.40).abs() < 0.000_001);
        assert!((building["integrity"].as_f64().unwrap() - 0.60).abs() < 0.000_001);
        assert_eq!(building["ruined"].as_bool(), Some(true));
        assert_eq!(building["repairing"].as_bool(), Some(true));
        assert_eq!(building["ruined_at_tick"].as_u64(), Some(55));
        assert_eq!(building["last_damage_tick"].as_u64(), Some(56));
        assert_eq!(building["last_repair_tick"].as_u64(), Some(57));
    }

    #[test]
    fn incremental_payload_only_resends_buildings_after_state_changes() {
        let mut sim = Simulation::new(421);
        sim.tick_count = 5;

        let initial = sim.state_json_incremental();
        assert!(
            initial.get("buildings").is_none(),
            "unchanged building state should stay off the hot wire"
        );

        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
        let changed = sim.state_json_incremental();
        assert!(changed["buildings"].is_array());

        let unchanged = sim.state_json_incremental();
        assert!(
            unchanged.get("buildings").is_none(),
            "building state should only be sent once per revision"
        );
    }

    #[test]
    fn full_payload_includes_lineage_era_progress() {
        let mut sim = Simulation::new(42);
        let lid = sim
            .organisms
            .iter()
            .find(|o| o.alive)
            .expect("founder exists")
            .lineage_id
            .clone();
        for org in sim.organisms.iter_mut().filter(|o| o.lineage_id == lid) {
            org.discoveries.insert("fire".to_string());
            org.discoveries.insert("stone_tools".to_string());
            org.discoveries.insert("shelter".to_string());
            org.discoveries.insert("smelting".to_string());
        }
        let mut kept_one_lineage_member = false;
        for org in sim.organisms.iter_mut().filter(|o| o.lineage_id == lid) {
            if kept_one_lineage_member {
                org.alive = false;
            } else {
                kept_one_lineage_member = true;
            }
        }
        sim.lineage_eras.insert(lid.clone(), crate::sim::era::Era::Stone);

        let world_population = sim.organisms.iter().filter(|o| o.alive).count();

        let payload = sim.state_json();
        let rows = payload
            .get("lineage_era_progress")
            .and_then(|v| v.as_array())
            .expect("lineage_era_progress array");
        let row = rows
            .iter()
            .find(|row| row.get("lineage_id").and_then(|v| v.as_str()) == Some(lid.as_str()))
            .expect("progress for lineage");

        assert_eq!(row.get("era_name").and_then(|v| v.as_str()), Some("stone"));
        assert_eq!(row.get("next_era").and_then(|v| v.as_str()), Some("bronze"));
        assert_eq!(row.get("pop").and_then(|v| v.as_u64()), Some(1));
        assert_eq!(row.get("pop_ready").and_then(|v| v.as_bool()), Some(false));
        assert_eq!(row.get("lineage_population").and_then(|v| v.as_u64()), Some(1));
        assert_eq!(
            row.get("world_population").and_then(|v| v.as_u64()),
            Some(world_population as u64)
        );
        assert_eq!(
            row.get("world_population_required").and_then(|v| v.as_u64()),
            Some(crate::sim::era::Era::Bronze.pop_threshold() as u64)
        );
        assert_eq!(
            row.get("world_population_ready").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(row.get("known").and_then(|v| v.as_array()).unwrap().len(), 1);
        assert!(row
            .get("missing")
            .and_then(|v| v.as_array())
            .unwrap()
            .iter()
            .any(|v| v.as_str() == Some("agriculture")));
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
        let hot = payload
            .as_object()
            .unwrap()
            .get("organisms_hot")
            .expect("organisms_hot present");
        let obj = hot.as_object().expect("organisms_hot is an object");
        assert!(
            !obj.contains_key("ages"),
            "ages must NOT be serialized in delta SoA - saves 4 bytes/org/tick"
        );
        // Spot-check that we still have the fields the client expects.
        for key in &["ids", "xs", "ys", "vxs", "vys", "energies", "thoughts"] {
            assert!(
                obj.contains_key(*key),
                "organisms_hot missing required key `{}`",
                key
            );
        }
    }

    #[test]
    fn every_payload_exposes_only_active_player_guidance() {
        let mut sim = Simulation::new(43);
        let lid = sim
            .organisms
            .iter()
            .find(|org| org.alive)
            .unwrap()
            .lineage_id
            .clone();
        sim.tick_count = 500;
        sim.lineage_strategies.insert(lid.clone(), ("trade".into(), 900));
        sim.lineage_strategy_objectives.insert(
            lid.clone(),
            crate::sim::simulation::StrategyObjective {
                strategy: "trade".into(),
                started_tick: 450,
                expires_tick: 900,
                progress: 17,
                target: 80,
                completed_tick: None,
                failed_tick: None,
            },
        );
        sim.lineage_strategies
            .insert("expired".into(), ("hunt".into(), 400));
        sim.lineage_strategy_history
            .push_back(crate::sim::simulation::StrategyCampaignRecord {
                lineage_id: lid.clone(),
                lineage_name: "Wayfinders".into(),
                strategy: "explore".into(),
                started_tick: 100,
                ended_tick: 420,
                progress: 60,
                target: 60,
                outcome: "completed".into(),
                reason: None,
            });

        let payload = sim.state_json();
        let strategies = payload["lineage_strategies"].as_object().unwrap();
        assert_eq!(strategies[&lid]["strategy"].as_str(), Some("trade"));
        assert_eq!(strategies[&lid]["started_tick"].as_u64(), Some(450));
        assert_eq!(strategies[&lid]["progress"].as_u64(), Some(17));
        assert_eq!(strategies[&lid]["target"].as_u64(), Some(80));
        assert_eq!(strategies[&lid]["completed"].as_bool(), Some(false));
        assert_eq!(strategies[&lid]["status"].as_str(), Some("active"));
        assert!(!strategies.contains_key("expired"));
        let history = payload["lineage_strategy_history"].as_array().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0]["lineage_id"].as_str(), Some(lid.as_str()));
        assert_eq!(history[0]["strategy"].as_str(), Some("explore"));
        assert_eq!(history[0]["outcome"].as_str(), Some("completed"));

        let incremental = sim.state_json_incremental();
        let strategies = incremental["lineage_strategies"].as_object().unwrap();
        assert_eq!(strategies[&lid]["strategy"].as_str(), Some("trade"));
        assert!(!strategies.contains_key("expired"));
        let history = incremental["lineage_strategy_history"].as_array().unwrap();
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn full_payload_exposes_farm_lifecycle_contract() {
        let mut sim = Simulation::new(44);
        let lineage_id = sim
            .organisms
            .iter()
            .find(|org| org.alive)
            .unwrap()
            .lineage_id
            .clone();
        sim.tick_count = 1_300;
        sim.lineage_eras
            .insert(lineage_id.clone(), crate::sim::era::Era::Bronze);
        sim.farms.push(crate::sim::agriculture::Farm {
            id: 7,
            x: 120,
            y: 120,
            owner_lineage: lineage_id.clone(),
            crop: crate::sim::agriculture::CropKind::Wheat,
            planted_tick: 100,
            ready_tick: 1_300,
            harvested: false,
            prepared: false,
        });

        let payload = sim.state_json();
        let farm = payload["farms"][0].as_object().expect("farm object");
        let actual: std::collections::BTreeSet<&str> = farm.keys().map(String::as_str).collect();
        let expected: std::collections::BTreeSet<&str> = [
            "id",
            "x",
            "y",
            "crop",
            "lineage_id",
            "planted_tick",
            "ready_tick",
            "harvested",
            "stage",
            "progress",
            "yield",
        ]
        .into_iter()
        .collect();

        assert_eq!(actual, expected);
        assert_eq!(farm["id"].as_u64(), Some(7));
        assert_eq!(farm["crop"].as_str(), Some("wheat"));
        assert_eq!(farm["lineage_id"].as_str(), Some(lineage_id.as_str()));
        assert_eq!(farm["stage"].as_str(), Some("mature"));
        assert_eq!(farm["progress"].as_f64(), Some(1.0));
        assert!(farm["yield"].as_u64().is_some_and(|value| value > 0));
    }

    #[test]
    fn full_payload_exposes_authoritative_settlement_contract() {
        use crate::sim::buildings::{Building, BuildingKind};

        let mut sim = Simulation::new(45);
        let lineage_id = "settlement-wire".to_string();
        sim.lineage_names.clear();
        sim.lineage_names
            .insert(lineage_id.clone(), "Harbor Folk".to_string());
        for (index, org) in sim.organisms.iter_mut().enumerate() {
            org.alive = index < 4;
            if org.alive {
                org.lineage_id = lineage_id.clone();
                org.x = 100.0 + index as f32;
                org.y = 110.0;
            }
        }
        sim.buildings.clear();
        for (id, kind, x) in [(1, BuildingKind::House, 100), (2, BuildingKind::Hut, 104)] {
            let mut building = Building::new(id, kind, x, 110, Some(lineage_id.clone()), 1);
            building.condition = 1.0;
            sim.buildings.push(building);
        }

        let payload = sim.state_json();
        let settlement = payload["settlements"][0].as_object().expect("settlement object");
        let actual: std::collections::BTreeSet<&str> = settlement.keys().map(String::as_str).collect();
        let expected: std::collections::BTreeSet<&str> = [
            "lineage_id",
            "name",
            "tier",
            "tier_name",
            "center",
            "population",
            "building_count",
            "capacity",
            "score",
        ]
        .into_iter()
        .collect();

        assert_eq!(actual, expected);
        assert_eq!(settlement["lineage_id"].as_str(), Some(lineage_id.as_str()));
        assert_eq!(settlement["name"].as_str(), Some("Harbor Folk"));
        assert_eq!(settlement["tier"].as_u64(), Some(2));
        assert_eq!(settlement["tier_name"].as_str(), Some("hamlet"));
        assert_eq!(settlement["population"].as_u64(), Some(4));
        assert_eq!(settlement["building_count"].as_u64(), Some(2));
        assert_eq!(settlement["capacity"].as_u64(), Some(6));
        assert!(settlement["score"].as_u64().is_some_and(|score| score >= 24));
        assert_eq!(settlement["center"].as_array().map(Vec::len), Some(2));
    }
}
