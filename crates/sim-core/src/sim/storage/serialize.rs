use rustc_hash::{FxHashMap as HashMap, FxHashSet as HashSet};

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
    // The browser build simulates in the same tab that renders, so there is
    // no network latency to hide. Predicting ahead there made delta frames
    // lead the true position while every full frame (true positions) pulled
    // people back, which read as jittering in place.
    if cfg!(target_arch = "wasm32") {
        return 0.0;
    }
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

/// One frame's top-level object, ready to be encoded.
///
/// It is the same sorted JSON object `state_json*` returns, except that the
/// two sections that dominate a delta frame (the grid and the hot organism
/// arrays: thousands of small `[row, col, value]` triples and parallel number
/// arrays) stay typed. Converting them to `serde_json::Value` first allocated
/// one `Value` per number (and one `Vec` per triple) only to walk the tree
/// again when encoding; written from the typed form they cost a fraction of
/// that. `Serialize` merges the typed sections into the sorted key order, and
/// both structs serialise only integers, strings and bools, which encode to
/// the same bytes whether they come from a `Value` or from the typed field.
/// `into_value` gives the original `Value` for consumers that want one.
pub struct FramePayload {
    rest: serde_json::Map<String, serde_json::Value>,
    grid: Option<crate::world::grid::GridJson>,
    organisms_hot: Option<crate::organism::organism::OrgsHotSoa>,
    buildings: Option<Vec<BuildingJson>>,
}

/// An `f32` as `serde_json::Value` holds it: widened to `f64`, or `null` when
/// it is not finite. Typed sections use it so they encode to the same bytes
/// as the `Value` they replace.
struct Num32(f32);

impl serde::Serialize for Num32 {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if self.0.is_finite() {
            serializer.serialize_f64(f64::from(self.0))
        } else {
            serializer.serialize_unit()
        }
    }
}

/// One building as a frame carries it (every frame after a building changed,
/// and every full frame). Fields are declared alphabetically: that is the key
/// order of the sorted `Value` object this replaces.
#[derive(serde::Serialize)]
pub struct BuildingJson {
    // `condition` is retained for older clients. It is construction progress,
    // not structural health.
    condition: Num32,
    construction_progress: Num32,
    damage: Num32,
    fh: u8,
    function: &'static str,
    fw: u8,
    id: u32,
    integrity: Num32,
    kind: &'static str,
    last_damage_tick: Option<u64>,
    last_repair_tick: Option<u64>,
    lineage_id: String,
    repairing: bool,
    ruined: bool,
    ruined_at_tick: Option<u64>,
    x: i32,
    y: i32,
}

impl BuildingJson {
    fn new(b: &crate::sim::buildings::Building, tick: u64) -> Self {
        let (fw, fh) = b.kind.footprint();
        BuildingJson {
            condition: Num32(b.condition),
            construction_progress: Num32(b.condition),
            damage: Num32(b.damage_fraction()),
            fh,
            function: b.kind.function().label(),
            fw,
            id: b.id,
            integrity: Num32(b.integrity()),
            kind: b.kind.name(),
            last_damage_tick: b.last_damage_tick,
            last_repair_tick: b.last_repair_tick,
            lineage_id: b.owner_lineage.clone().unwrap_or_default(),
            repairing: b.is_repairing_at(tick),
            ruined: b.is_ruined(),
            ruined_at_tick: b.ruined_at_tick,
            x: b.x,
            y: b.y,
        }
    }
}

impl FramePayload {
    /// Set the typed buildings section.
    pub fn set_buildings(&mut self, buildings: Vec<BuildingJson>) {
        self.buildings = Some(buildings);
    }

    pub fn as_object_mut(&mut self) -> Option<&mut serde_json::Map<String, serde_json::Value>> {
        Some(&mut self.rest)
    }

    /// Set the typed grid section.
    pub fn set_grid(&mut self, grid: crate::world::grid::GridJson) {
        self.grid = Some(grid);
    }

    /// Add or replace a top-level entry (the transport stamps frame metadata
    /// this way).
    pub fn insert(&mut self, key: &str, value: serde_json::Value) {
        self.rest.insert(key.to_string(), value);
    }

    pub fn into_value(self) -> serde_json::Value {
        let FramePayload {
            mut rest,
            grid,
            organisms_hot,
            buildings,
        } = self;
        if let Some(grid) = grid {
            rest.insert("grid".to_string(), serde_json::to_value(grid).unwrap());
        }
        if let Some(soa) = organisms_hot {
            rest.insert("organisms_hot".to_string(), serde_json::to_value(&soa).unwrap());
        }
        if let Some(buildings) = buildings {
            rest.insert("buildings".to_string(), serde_json::to_value(&buildings).unwrap());
        }
        serde_json::Value::Object(rest)
    }
}

/// A frame is always a JSON object; anything else becomes an empty one.
impl From<serde_json::Value> for FramePayload {
    fn from(value: serde_json::Value) -> Self {
        let rest = match value {
            serde_json::Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        FramePayload {
            rest,
            grid: None,
            organisms_hot: None,
            buildings: None,
        }
    }
}

/// One top-level entry of a [`FramePayload`].
pub enum FrameEntry<'a> {
    Json(&'a serde_json::Value),
    Grid(&'a crate::world::grid::GridJson),
    HotOrganisms(&'a crate::organism::organism::OrgsHotSoa),
    Buildings(&'a [BuildingJson]),
}

impl serde::Serialize for FrameEntry<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            FrameEntry::Json(value) => value.serialize(serializer),
            FrameEntry::Grid(grid) => grid.serialize(serializer),
            FrameEntry::HotOrganisms(soa) => soa.serialize(serializer),
            FrameEntry::Buildings(list) => list.serialize(serializer),
        }
    }
}

impl FramePayload {
    /// The top-level entries in key order (the order `Serialize` writes them).
    pub fn entries(&self) -> Vec<(&str, FrameEntry<'_>)> {
        // `rest` is already sorted (a `BTreeMap`); slot the typed sections in.
        let mut entries: Vec<(&str, FrameEntry<'_>)> = Vec::with_capacity(self.rest.len() + 2);
        entries.extend(self.rest.iter().map(|(k, v)| (k.as_str(), FrameEntry::Json(v))));
        if let Some(grid) = &self.grid {
            entries.push(("grid", FrameEntry::Grid(grid)));
        }
        if let Some(soa) = &self.organisms_hot {
            entries.push(("organisms_hot", FrameEntry::HotOrganisms(soa)));
        }
        if let Some(list) = &self.buildings {
            entries.push(("buildings", FrameEntry::Buildings(list)));
        }
        entries.sort_by(|a, b| a.0.cmp(b.0));
        entries
    }
}

impl serde::Serialize for FramePayload {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let entries = self.entries();
        let mut map = serializer.serialize_map(Some(entries.len()))?;
        for (key, entry) in &entries {
            map.serialize_entry(key, entry)?;
        }
        map.end()
    }
}

/// The organism section `entity_head` receives: the full list as `Value`s, or
/// the hot arrays, which stay typed.
enum HeadOrganisms {
    Full(Vec<serde_json::Value>),
    Hot(Box<crate::organism::organism::OrgsHotSoa>),
}

impl Simulation {
    pub fn state_json(&mut self) -> serde_json::Value {
        self.state_frame().into_value()
    }

    pub fn state_json_periodic_full(&mut self) -> serde_json::Value {
        self.state_frame_periodic_full().into_value()
    }

    pub fn state_json_incremental(&mut self) -> serde_json::Value {
        self.state_frame_incremental().into_value()
    }

    pub fn state_json_at(&mut self, vp_cx: i32, vp_cy: i32) -> serde_json::Value {
        self.state_frame_inner(vp_cx, vp_cy, false, false).into_value()
    }

    /// `state_json`, left typed for the encoder.
    pub fn state_frame(&mut self) -> FramePayload {
        let (cx, cy) = self.viewport_centroid();
        self.state_frame_inner(cx, cy, true, true)
    }

    /// `state_json_periodic_full`, left typed for the encoder.
    pub fn state_frame_periodic_full(&mut self) -> FramePayload {
        let (cx, cy) = self.viewport_centroid();
        self.state_frame_inner(cx, cy, true, false)
    }

    /// `state_json_incremental`, left typed for the encoder.
    pub fn state_frame_incremental(&mut self) -> FramePayload {
        let (cx, cy) = self.viewport_centroid();
        self.state_frame_inner(cx, cy, false, false)
    }

    /// The top-level frame fields that come before the per-kind extras: the
    /// grid, the organism and animal sections and the world clock. The big
    /// sections are moved into the payload (the grid and the hot organism
    /// arrays stay typed). Embedding already-built `Value`s through `json!`
    /// instead re-serialises each one into a fresh copy of itself (a deep
    /// clone of every tile, organism and animal) and then drops the original.
    fn entity_head(
        &self,
        grid: crate::world::grid::GridJson,
        organisms: HeadOrganisms,
        animals: serde_json::Value,
        complete: bool,
    ) -> FramePayload {
        let mut head = json!({
            "tick":               self.tick_count,
            "organisms_complete": complete,
            "animals_complete":   complete,
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
        });
        let mut organisms_hot = None;
        if let Some(obj) = head.as_object_mut() {
            obj.insert("animals".to_string(), animals);
            match organisms {
                HeadOrganisms::Full(list) => {
                    obj.insert("organisms".to_string(), serde_json::Value::Array(list));
                }
                HeadOrganisms::Hot(soa) => organisms_hot = Some(*soa),
            }
        }
        let mut payload = FramePayload::from(head);
        payload.grid = Some(grid);
        payload.organisms_hot = organisms_hot;
        payload
    }

    /// The previous construction, kept as the reference the tests compare
    /// `entity_head` against.
    #[cfg(test)]
    fn entity_head_reference(
        &self,
        grid: serde_json::Value,
        organisms: serde_json::Value,
        animals: serde_json::Value,
        complete: bool,
    ) -> serde_json::Value {
        if complete {
            json!({
                "tick":               self.tick_count,
                "grid":               grid,
                "organisms":          organisms,
                "organisms_complete": true,
                "animals":            animals,
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
            json!({
                "tick":               self.tick_count,
                "grid":               grid,
                "organisms_hot":      organisms,
                "organisms_complete": false,
                "animals":            animals,
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
        }
    }

    /// The buildings section as it was built before it became typed
    /// (`BuildingJson`): one `json!` object per building. The test reference.
    #[cfg(test)]
    fn buildings_value_reference(&self) -> serde_json::Value {
        serde_json::Value::Array(
            self.buildings
                .iter()
                .map(|b| {
                    json!({
                        "id": b.id,
                        "kind": b.kind.name(),
                        "x": b.x,
                        "y": b.y,
                        "lineage_id": b.owner_lineage.clone().unwrap_or_default(),
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
                .collect(),
        )
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

    fn state_frame_inner(
        &mut self,
        vp_cx: i32,
        vp_cy: i32,
        force_full: bool,
        include_cold: bool,
    ) -> FramePayload {
        let needs_slow = self.tick_count == 0 || self.tick_count.saturating_sub(self.slow_compute_tick) >= 60;
        if needs_slow {
            let alive_lineages: rustc_hash::FxHashSet<String> = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.lineage_id.clone())
                .collect();

            let mut att_totals: HashMap<(String, String), (f32, u32)> = HashMap::default();
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

            let mut lineage_sizes: HashMap<String, usize> = HashMap::default();
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
            let mut tile_claim_count: HashMap<(i32, i32), u32> = HashMap::default();
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
                    organisms_json.push(o.to_json_value_with(per_org_cold));
                }
            }
            let mut animals_json: Vec<serde_json::Value> = Vec::with_capacity(self.animals.len());
            for a in self.animals.iter() {
                animals_json.push(serde_json::to_value(a.to_json()).unwrap());
            }
            self.entity_head(
                grid_json,
                HeadOrganisms::Full(organisms_json),
                serde_json::Value::Array(animals_json),
                true,
            )
        } else {
            let mut soa = OrgsHotSoa::with_capacity(self.organisms.len() / 2);
            let lookahead = *LOOKAHEAD_TICKS;
            // `soa.push` takes `&mut Organism` because it clears
            // `thought_dirty` after emitting the change. That's fine
            // - `state_frame_inner` already holds `&mut self`.
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
            self.entity_head(
                grid_json,
                HeadOrganisms::Hot(Box::new(soa)),
                serde_json::Value::Array(animals_json),
                false,
            )
        };
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("vehicles".into(), serde_json::Value::Array(self.vehicles.iter().map(|v| json!({
                "id": v.id, "kind": v.kind.name(), "x": v.x, "y": v.y,
                "rider_id": v.occupants.first(), "building": self.tick_count < v.ready_tick && !v.occupants.is_empty()
            })).collect()));
            obj.insert(
                "population_limit".to_string(),
                serde_json::to_value(self.population_limit()).unwrap(),
            );
            // Campaigns are live player-facing state. Sending this small map
            // on every frame avoids a short objective completing or expiring
            // entirely between deep/cold snapshots.
            obj.insert("lineage_strategies".to_string(), lineage_strategy_payload(self));
            obj.insert(
                "hard_winter".to_string(),
                serde_json::Value::Bool(self.hard_winter),
            );
            obj.insert(
                "hard_winter_ahead".to_string(),
                serde_json::Value::Bool(self.hard_winter_ahead),
            );
            // Prayers are the player's to-do list; they must never lag.
            let now = self.tick_count;
            let prayers: Vec<serde_json::Value> = self
                .prayers
                .active
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id,
                        "lineage_id": p.lineage,
                        "tribe": self.lineage_names.get(&p.lineage).cloned().unwrap_or_default(),
                        "kind": p.kind.name(),
                        "x": p.x,
                        "y": p.y,
                        "created": p.created,
                        "expires": p.expires,
                    })
                })
                .collect();
            obj.insert("prayers".to_string(), serde_json::Value::Array(prayers));
            obj.insert(
                "faith".to_string(),
                json!({
                    "by_lineage": self.prayers.faith,
                    "answered": self.prayers.answered,
                    "forsaken": self.prayers.forsaken,
                    "blessed": self.prayers.blessed_until.iter().filter(|(_, &t)| now < t).map(|(l, _)| l).collect::<Vec<_>>(),
                    "despairing": self.prayers.despair_until.iter().filter(|(_, &t)| now < t).map(|(l, _)| l).collect::<Vec<_>>(),
                }),
            );
            // Each tribe's recent dead by cause, so the player can see why it shrinks.
            let mut losses = serde_json::Map::new();
            for (lineage, deaths) in &self.recent_deaths {
                let mut by_cause = serde_json::Map::new();
                for &(at, cause) in deaths {
                    if now.saturating_sub(at) <= crate::sim::civ::peril::DEATH_WINDOW {
                        let n = by_cause.get(cause).and_then(|v| v.as_u64()).unwrap_or(0);
                        by_cause.insert(cause.to_string(), json!(n + 1));
                    }
                }
                if !by_cause.is_empty() {
                    losses.insert(lineage.clone(), serde_json::Value::Object(by_cause));
                }
            }
            obj.insert("tribe_losses".to_string(), serde_json::Value::Object(losses));
            obj.insert(
                "wards".to_string(),
                serde_json::Value::Array(
                    self.wards
                        .iter()
                        .filter(|w| now < w.until)
                        .map(|w| json!({"x": w.x, "y": w.y, "radius": w.radius, "cast": w.cast, "until": w.until}))
                        .collect(),
                ),
            );
            obj.insert(
                "smog".to_string(),
                serde_json::Value::Array(
                    self.smog
                        .iter()
                        .filter(|s| s.strength > 0.05)
                        .map(|s| json!({"x": s.x, "y": s.y, "s": (f64::from(s.strength) * 100.0).round() / 100.0}))
                        .collect(),
                ),
            );
            obj.insert(
                "festivals".to_string(),
                serde_json::Value::Array(
                    self.festivals
                        .iter()
                        .filter(|f| now < f.start_tick + u64::from(f.duration_ticks))
                        .map(|f| {
                            json!({
                                "name": f.name,
                                "kind": f.kind.name(),
                                "lineage_id": f.lineage_id,
                                "started": f.start_tick,
                                "ends": f.start_tick + u64::from(f.duration_ticks),
                                "x": f.center[0],
                                "y": f.center[1],
                            })
                        })
                        .collect(),
                ),
            );
            let mut peril: Vec<(&String, &crate::sim::civ::peril::Peril)> = self.tribe_peril.iter().collect();
            peril.sort_by(|a, b| a.0.cmp(b.0));
            obj.insert(
                "tribes_in_peril".to_string(),
                serde_json::Value::Array(
                    peril
                        .into_iter()
                        .map(|(lineage, p)| {
                            json!({
                                "lineage_id": lineage,
                                "tribe": self.lineage_names.get(lineage).cloned().unwrap_or_default(),
                                "population": p.population,
                                "peak": p.peak,
                                "cause": p.cause.name(),
                                "since": p.since,
                            })
                        })
                        .collect(),
                ),
            );
            obj.insert(
                "lineage_strategy_history".to_string(),
                lineage_strategy_history_payload(self),
            );
            // Routes are small and caravans visibly move every tick, so they
            // belong in hot/delta frames rather than the once-per-cold-snapshot
            // economy payload. The private dispatch_state used for delayed
            // Q-learning credit never crosses this boundary.
            let trade_routes = self
                .trade_routes
                .iter()
                .map(|route| {
                    json!({
                        "id": route.id,
                        "lineage_a": route.lineage_a,
                        "lineage_b": route.lineage_b,
                        "a_center": route.a_center,
                        "b_center": route.b_center,
                        "established_tick": route.established_tick,
                        "last_dispatch_tick": route.last_dispatch_tick,
                        "deliveries": route.deliveries,
                        "volume": route.volume,
                    })
                })
                .collect();
            obj.insert("trade_routes".to_string(), serde_json::Value::Array(trade_routes));
            let caravans = self
                .caravans
                .iter()
                .map(|caravan| {
                    json!({
                        "id": caravan.id,
                        "route_id": caravan.route_id,
                        "sender_lineage": caravan.sender_lineage,
                        "receiver_lineage": caravan.receiver_lineage,
                        "sender_org_id": caravan.sender_org_id,
                        "cargo": caravan.cargo,
                        "amount": caravan.amount,
                        "unit_price": caravan.unit_price,
                        "departed_tick": caravan.departed_tick,
                        "arrives_tick": caravan.arrives_tick,
                        "from": caravan.from,
                        "to": caravan.to,
                    })
                })
                .collect();
            obj.insert("caravans".to_string(), serde_json::Value::Array(caravans));
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
                let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::default();
                let mut lineage_pop: HashMap<String, usize> = HashMap::default();
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

                let mut lineage_alive: HashMap<&str, u32> = HashMap::default();
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
                            "ended_tick": b.ended_tick,
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
                    .take(64)
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

                let currencies: rustc_hash::FxHashMap<String, &str> = self
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
            {
                let tick = self.tick_count;
                payload.set_buildings(
                    self.buildings
                        .iter()
                        .map(|b| BuildingJson::new(b, tick))
                        .collect(),
                );
                self.serialized_building_state_revision = self.building_state_revision;
            }
        }
        if include_cold || force_full || self.planting_revision != self.serialized_planting_revision {
            if let Some(obj) = payload.as_object_mut() {
                // Flat [x, y, kind, stage, ...] - fields can hold thousands.
                let mut flat: Vec<u32> = Vec::with_capacity(self.plantings.len() * 4);
                for (&i, p) in &self.plantings {
                    let i = i as usize;
                    flat.extend([
                        (i % crate::world::grid::WIDTH) as u32,
                        (i / crate::world::grid::WIDTH) as u32,
                        p.kind.id() as u32,
                        p.stage() as u32,
                    ]);
                }
                obj.insert("plantings".to_string(), json!(flat));
                self.serialized_planting_revision = self.planting_revision;
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

    /// The typed buildings section must equal the `json!` objects it replaced,
    /// as values and as JSON text, for every kind and for the odd states a
    /// building can be in: owned or not, damaged, ruined, repairing, unfinished,
    /// NaN damage and condition.
    #[test]
    fn typed_buildings_match_the_value_reference() {
        use crate::sim::buildings::{Building, BuildingKind};
        let mut sim = Simulation::new(42);
        sim.buildings.clear();
        sim.tick_count = 5_000;
        for (i, kind) in BuildingKind::all().iter().enumerate() {
            let owner = (i % 3 != 0).then(|| format!("lineage-{}", i % 5));
            let mut b = Building::new(
                i as u32 + 1,
                *kind,
                i as i32 * 7 % 600,
                i as i32 * 3 % 300,
                owner,
                12,
            );
            b.condition = match i % 5 {
                0 => 1.0,
                1 => 0.37,
                2 => f32::NAN,
                3 => 0.999,
                _ => 0.0,
            };
            match i % 7 {
                1 => b.damage = 0.3,
                2 => {
                    b.damage = 1.0;
                    b.ruined_at_tick = Some(4_000);
                }
                3 => {
                    b.damage = 0.5;
                    b.last_damage_tick = Some(4_960);
                    b.last_repair_tick = Some(4_990);
                    b.condition = 1.0;
                }
                4 => b.damage = f32::NAN,
                5 => {
                    b.damage = 0.0001;
                    b.last_repair_tick = Some(1);
                }
                _ => {}
            }
            sim.buildings.push(b);
        }
        assert!(sim.buildings.len() > 50);
        let reference = sim.buildings_value_reference();
        let frame = sim.state_frame().into_value();
        assert_eq!(frame["buildings"], reference);
        assert_eq!(
            serde_json::to_string(&frame["buildings"]).unwrap(),
            serde_json::to_string(&reference).unwrap()
        );
        // And the typed section serialises like its `Value`.
        let typed = sim.state_frame();
        let entries = typed.entries();
        let (_, entry) = entries.iter().find(|(k, _)| *k == "buildings").unwrap();
        assert_eq!(
            serde_json::to_string(entry).unwrap(),
            serde_json::to_string(&reference).unwrap()
        );
    }

    #[test]
    fn building_function_labels_match_the_debug_names() {
        use crate::sim::buildings::{BuildingFunction::*, BuildingKind};
        for function in [
            Housing,
            Education,
            Worship,
            Trade,
            Industry,
            Healthcare,
            Military,
            Civic,
            Infrastructure,
            Recreation,
        ] {
            assert_eq!(function.label(), format!("{function:?}").to_lowercase());
        }
        for kind in BuildingKind::all() {
            assert_eq!(
                kind.function().label(),
                format!("{:?}", kind.function()).to_lowercase()
            );
        }
    }

    /// `entity_head` moves the grid, organism and animal sections into the
    /// frame; the old `json!` construction deep-copied them. On a world that
    /// has run for a while both must give the same bytes for every frame kind.
    #[test]
    fn entity_head_matches_the_deep_copy_reference() {
        use crate::organism::organism::OrgsHotSoa;
        use crate::world::grid::{VP_H, VP_W};
        let mut sim = Simulation::new(42);
        for _ in 0..400 {
            sim.tick();
        }
        let grid = |sim: &Simulation| sim.grid.to_json_viewport(300, 150, VP_W, VP_H, true, true, true);
        let animals: Vec<serde_json::Value> = sim
            .animals
            .iter()
            .map(|a| serde_json::to_value(a.to_json()).unwrap())
            .collect();
        let animals = serde_json::Value::Array(animals);

        // Full frame: the organism list is a `Value` section.
        let list: Vec<serde_json::Value> = sim
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| serde_json::to_value(o.to_json_with(false)).unwrap())
            .collect();
        assert!(!list.is_empty());
        let new = sim
            .entity_head(
                grid(&sim),
                HeadOrganisms::Full(list.clone()),
                animals.clone(),
                true,
            )
            .into_value();
        let old = sim.entity_head_reference(
            serde_json::to_value(grid(&sim)).unwrap(),
            serde_json::Value::Array(list),
            animals.clone(),
            true,
        );
        assert_eq!(new, old);
        assert_eq!(
            serde_json::to_vec(&new).unwrap(),
            serde_json::to_vec(&old).unwrap()
        );

        // Delta frame: the hot arrays stay typed until the encoder.
        let mut soa = OrgsHotSoa::with_capacity(sim.organisms.len());
        for o in sim.organisms.iter_mut().filter(|o| o.alive) {
            soa.push(o, 0.0);
        }
        let hot_value = serde_json::to_value(&soa).unwrap();
        let new = sim
            .entity_head(
                grid(&sim),
                HeadOrganisms::Hot(Box::new(soa)),
                animals.clone(),
                false,
            )
            .into_value();
        let old = sim.entity_head_reference(
            serde_json::to_value(grid(&sim)).unwrap(),
            hot_value,
            animals,
            false,
        );
        assert_eq!(new, old);
        assert_eq!(
            serde_json::to_vec(&new).unwrap(),
            serde_json::to_vec(&old).unwrap()
        );
    }

    /// The typed frame is serialised straight to the wire; the `Value` frame is
    /// what every consumer used to get. Their JSON must be identical for every
    /// frame kind, in the same key order (this also guards the alphabetical
    /// field order of `GridJson` and `OrgsHotSoa`). The server tests compare
    /// the encoded msgpack frames as well.
    #[test]
    fn typed_frame_serialises_like_the_value_frame() {
        let mut typed_world = Simulation::new(7);
        let mut value_world = Simulation::new(7);
        for _ in 0..400 {
            typed_world.tick();
            value_world.tick();
        }
        let mut kinds = std::collections::BTreeSet::new();
        for round in 0..130u64 {
            for _ in 0..3 {
                typed_world.tick();
                value_world.tick();
            }
            // Cover periodic full frames, deltas (hot arrays) and deep fulls.
            let (typed, value) = match round % 13 {
                0 => (typed_world.state_frame(), value_world.state_json()),
                6 => (
                    typed_world.state_frame_periodic_full(),
                    value_world.state_json_periodic_full(),
                ),
                _ => (
                    typed_world.state_frame_incremental(),
                    value_world.state_json_incremental(),
                ),
            };
            kinds.insert(value.get("organisms_hot").is_some());
            assert_eq!(
                serde_json::to_string(&typed).unwrap(),
                serde_json::to_string(&value).unwrap(),
                "round {round}"
            );
            assert_eq!(typed.into_value(), value, "round {round}");
        }
        assert_eq!(kinds.len(), 2, "both hot-array and full-organism frames occur");
    }
}
