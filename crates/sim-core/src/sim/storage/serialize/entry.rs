use super::*;

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
    pub(super) fn entity_head(
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
    pub(super) fn entity_head_reference(
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
    pub(super) fn buildings_value_reference(&self) -> serde_json::Value {
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

    pub(super) fn viewport_centroid(&self) -> (i32, i32) {
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
}
