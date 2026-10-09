use super::*;

impl Simulation {
    pub fn save(&self, path: &str) {
        if let Err(e) = self.save_result(path) {
            tracing::warn!(target: "save", "failed to write {}: {}", path, e);
        }
    }

    pub fn save_result(&self, path: &str) -> io::Result<()> {
        let state = self.to_save_state();
        write_save_to_disk(&state, path)
    }

    /// Builds the in-memory SaveState snapshot. Cheap-ish (mostly
    /// Vec/HashMap clones); no fs IO, no serialization. Call this
    /// while you hold the sim lock, then pass the result to
    /// `write_save_to_disk` on a background blocking task so the
    /// next tick can run while serde_json + fs::write happen.
    pub fn to_save_state(&self) -> SaveState {
        SaveState {
            version: SAVE_SCHEMA_VERSION,
            tick_count: self.tick_count,
            next_animal_id: self.next_animal_id,
            history: self.history.clone(),
            drought: DroughtSave {
                active: self.drought.active,
                start_tick: self.drought.start_tick,
                dried_tiles: self.drought.dried_tiles.iter().map(|&(x, y)| [x, y]).collect(),
                rain_relief: self.drought.rain_relief,
            },
            weather: WeatherSave {
                kind: self.weather.kind,
                start_tick: self.weather.start_tick,
                duration: self.weather.duration,
                intensity: self.weather.intensity,
                wet_until: self.weather.wet_until,
                wind_x: self.weather.wind_x,
                wind_y: self.weather.wind_y,
                wind_last_tick: self.weather.wind_last_tick,
                heat_until: self.weather.heat_until,
            },
            // Cap unbounded VecDeques on save. Their in-memory caps
            // are larger than what makes sense to persist; if we ship
            // them whole, save bloats linearly with playtime and the
            // serde_json::to_string allocation eats the spawn_blocking
            // budget. The tail is what subsequent reads actually need.
            pop_history: self.pop_history.iter().rev().take(300).rev().cloned().collect(),
            lineage_centroid_history: self
                .lineage_centroid_history
                .iter()
                .map(|(k, v)| (k.clone(), v.iter().rev().take(60).rev().cloned().collect()))
                .collect(),
            lineage_homes: self.lineage_homes.clone(),
            lineage_eras: self.lineage_eras.clone(),
            lineage_generations_reached: self.lineage_generations_reached.clone(),
            lineage_unrest: self.lineage_unrest.clone(),
            lineage_crime: self.lineage_crime.clone(),
            goals: self.goals.clone(),
            events: self.events.iter().rev().take(200).rev().cloned().collect(),
            organisms: self.organisms.iter().map(org_to_save).collect(),
            animals: self.animals.iter().map(animal_to_save).collect(),
            carcasses: self
                .carcasses
                .iter()
                .map(|c| CarcassSave {
                    x: c.x,
                    y: c.y,
                    kind: kind_code(c.kind),
                    age: c.age,
                    picked: c.picked,
                })
                .collect(),
            story_history: self.story_history.iter().rev().take(120).rev().cloned().collect(),
            grid: GridSave {
                tiles: self.grid.tiles.clone(),
                depth: self.grid.depth.clone(),
                biome: self.grid.biome.clone(),
                fire: self.grid.fire_intensity.clone(),
                food_trail: self.grid.food_trail.clone(),
                water_trail: self.grid.water_trail.clone(),
                path_trail: self.grid.path_trail.clone(),
                structure: self.grid.structure.clone(),
                fertility: self.grid.fertility.clone(),
                hazard: self.grid.hazard.clone(),
                pressure: self.grid.pressure.clone(),
                road: self.grid.road.clone(),
            },
            current_era: self.current_era.clone(),
            sex_words: self.sex_words.to_vec(),
            world_seed: self.world_seed,
            lineage_names: self.lineage_names.clone(),
            lineage_strategies: self.lineage_strategies.clone(),
            lineage_strategy_objectives: self.lineage_strategy_objectives.clone(),
            lineage_strategy_history: self
                .lineage_strategy_history
                .iter()
                .rev()
                .take(40)
                .rev()
                .cloned()
                .collect(),
            lineage_elders: self.lineage_elders.clone(),
            rng: Some(self.rng.clone()),
            flood_tiles: self.flood_tiles.clone(),
            wards: self.wards.clone(),
            plantings: self.plantings.clone(),
            prayers: self.prayers.clone(),
            hard_winter: self.hard_winter,
            hard_winter_ahead: self.hard_winter_ahead,
            territory: self
                .territory
                .iter()
                .map(|(lid, tiles)| (lid.clone(), tiles.iter().map(|&(x, y)| [x, y]).collect()))
                .collect(),
            last_immigration_tick: self.last_immigration_tick,
            settlement_tiers: self.settlement_tiers.clone(),
            buildings: self.buildings.to_vec(),
            next_building_id: self.next_building_id,
            governments: self.governments.clone(),
            religions: self.religions.clone(),
            next_religion_id: self.next_religion_id,
            artworks: self.artworks.clone(),
            next_artwork_id: self.next_artwork_id,
            festivals: self.festivals.clone(),
            next_festival_id: self.next_festival_id,
            last_witness_tick: self.last_witness_tick,
            books: self.books.clone(),
            next_book_id: self.next_book_id,
            farms: self.farms.clone(),
            next_farm_id: self.next_farm_id,
            vehicles: self.vehicles.clone(),
            next_vehicle_id: self.next_vehicle_id,
            battles: self.battles.clone(),
            next_battle_id: self.next_battle_id,
            treaties: self.treaties.clone(),
            outbreaks: self.outbreaks.clone(),
            milestones_achieved: self.milestones_achieved.clone(),
            lineage_peak_pop: self.lineage_peak_pop.clone(),
            headlines: self.headlines.iter().rev().take(160).rev().cloned().collect(),
            trades: self.trades.iter().rev().take(500).rev().cloned().collect(),
            trade_routes: self.trade_routes.clone(),
            village_roads: self.village_roads.clone(),
            caravans: self.caravans.clone(),
            next_trade_route_id: self.next_trade_route_id,
            next_caravan_id: self.next_caravan_id,
            water_use: self
                .water_use
                .iter()
                .map(|(&(x, y), &count)| WaterUseSave { x, y, count })
                .collect(),
            field_fortifications: self.field_fortifications.clone(),
        }
    }
}
