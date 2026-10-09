use super::*;

impl Simulation {
    pub fn from_save(seed: u64, state: SaveState) -> Self {
        let expected = WIDTH * HEIGHT;
        let mut grid = WorldGrid::new(seed);
        if state.grid.tiles.len() == expected {
            grid.tiles = state.grid.tiles;
            if state.grid.depth.len() == expected {
                grid.depth = state.grid.depth;
            }
            if state.grid.biome.len() == expected {
                grid.biome = state.grid.biome;
            }
            if state.grid.fire.len() == expected {
                grid.fire_intensity = state.grid.fire;
            }
            if state.grid.food_trail.len() == expected {
                grid.food_trail = state.grid.food_trail;
            }
            if state.grid.water_trail.len() == expected {
                grid.water_trail = state.grid.water_trail;
            }
            if state.grid.path_trail.len() == expected {
                grid.path_trail = state.grid.path_trail;
            }
            if !state.grid.structure.is_empty() && state.grid.structure.len() == expected {
                grid.structure = state.grid.structure;
            }
            if !state.grid.fertility.is_empty() && state.grid.fertility.len() == expected {
                grid.fertility = state.grid.fertility;
            }
            if !state.grid.hazard.is_empty() && state.grid.hazard.len() == expected {
                grid.hazard = state.grid.hazard;
            }
            if !state.grid.pressure.is_empty() && state.grid.pressure.len() == expected {
                grid.pressure = state.grid.pressure;
            }
            if state.grid.road.len() == expected {
                grid.road = state.grid.road;
            }
            grid.trail_dirty = (0..expected)
                .filter(|&i| {
                    grid.food_trail[i] > 0.0 || grid.water_trail[i] > 0.0 || grid.path_trail[i] > 0.0
                })
                .map(|i| i as u32)
                .collect();
        } else {
            tracing::info!(
                "Save grid size mismatch (got {}, need {}) - regenerating world",
                state.grid.tiles.len(),
                expected
            );
        }

        let drought = DroughtState {
            active: state.drought.active,
            start_tick: state.drought.start_tick,
            dried_tiles: state
                .drought
                .dried_tiles
                .into_iter()
                .map(|[x, y]| (x, y))
                .collect(),
            rain_relief: state.drought.rain_relief,
        };

        let save_version = state.version;
        let mut organisms: Vec<_> = state
            .organisms
            .into_iter()
            .map(|saved| org_from_save(saved, save_version))
            .collect();
        for org in &mut organisms {
            org.x = org.x.clamp(1.0, WIDTH as f32 - 2.0);
            org.y = org.y.clamp(1.0, HEIGHT as f32 - 2.0);
        }

        let active_structure_tiles: HashSet<(i32, i32)> = {
            let mut hs = HashSet::default();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    if grid.structure_at(x, y) > 0.0 {
                        hs.insert((x, y));
                    }
                }
            }
            hs
        };
        let field_fortifications = state
            .field_fortifications
            .into_iter()
            .filter(|fortification| grid.structure_at(fortification.x, fortification.y) > 0.0)
            .collect();
        let mut physics = PhysicsEngine::new();
        // Simulation physics runs exactly once every five world ticks.
        // Reconstruct its cadence so trail decay and lightning continue from
        // the same phase instead of restarting after every load.
        physics.tick_count = state.tick_count / 5;
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if matches!(grid.get(x, y), Tile::Fire | Tile::Campfire) {
                    physics.register_fire(x, y);
                }
            }
        }

        let next_animal_id = repaired_next_animal_id(state.next_animal_id, &state.animals);
        let mut buildings = state.buildings;
        let next_building_id = repaired_next_u32_id(state.next_building_id, buildings.iter().map(|b| b.id));
        for building in &mut buildings {
            if building.damage_fraction() >= 1.0 && building.ruined_at_tick.is_none() {
                building.ruined_at_tick = Some(building.last_damage_tick.unwrap_or(state.tick_count));
            }
        }
        let mut religions = state.religions;
        crate::sim::actions::religion_expanded::repair_persisted_religions(&mut organisms, &mut religions);
        let next_religion_id = repaired_next_religion_id(state.next_religion_id, &religions);
        let next_artwork_id =
            repaired_next_u32_id(state.next_artwork_id, state.artworks.iter().map(|a| a.id));
        let next_festival_id =
            repaired_next_u32_id(state.next_festival_id, state.festivals.iter().map(|f| f.id));
        let next_book_id = repaired_next_u32_id(state.next_book_id, state.books.iter().map(|b| b.id));
        let next_farm_id = repaired_next_u32_id(state.next_farm_id, state.farms.iter().map(|f| f.id));
        let mut farms = state.farms;
        crate::sim::agriculture::deduplicate_farm_plots(&mut farms);
        let next_vehicle_id =
            repaired_next_u32_id(state.next_vehicle_id, state.vehicles.iter().map(|v| v.id));
        // Battle IDs currently encode tick and lineages rather than this
        // sequence, but preserve a useful monotonic counter for old saves and
        // the eventual numeric-ID migration instead of resetting it to one.
        let next_battle_id = repaired_next_sequence(state.next_battle_id, state.battles.len());
        let mut treaties = state.treaties;
        crate::sim::warfare::consolidate_treaties(&mut treaties, state.tick_count);
        let next_trade_route_id = repaired_next_u32_id(
            state.next_trade_route_id,
            state.trade_routes.iter().map(|route| route.id),
        );
        let next_caravan_id = repaired_next_u32_id(
            state.next_caravan_id,
            state.caravans.iter().map(|caravan| caravan.id),
        );

        let mut sim = Simulation {
            grid,
            physics,
            organisms,
            animals: state.animals.into_iter().map(animal_from_save).collect(),
            carcasses: state
                .carcasses
                .into_iter()
                .map(|c| Carcass {
                    x: c.x,
                    y: c.y,
                    kind: kind_from_code(c.kind),
                    age: c.age,
                    picked: c.picked,
                })
                .collect(),
            tick_count: state.tick_count,
            population_limit: crate::sim::config::DEFAULT_MAX_POPULATION,
            events: state.events.into_iter().collect(),
            history: state.history,
            drought,
            weather: WeatherState {
                kind: state.weather.kind,
                start_tick: state.weather.start_tick,
                duration: state.weather.duration,
                intensity: state.weather.intensity,
                wet_until: state.weather.wet_until,
                wind_x: state.weather.wind_x,
                wind_y: state.weather.wind_y,
                wind_last_tick: state.weather.wind_last_tick,
                heat_until: state.weather.heat_until,
            },
            flood_tiles: state.flood_tiles,
            wards: state.wards,
            smog: Vec::new(),
            plantings: state.plantings,
            prayers: state.prayers,
            hard_winter: state.hard_winter,
            hard_winter_ahead: state.hard_winter_ahead,
            story_history: state.story_history.into_iter().collect(),
            pending_memory_flushes: Vec::new(),
            lineage_strategies: state.lineage_strategies,
            lineage_strategy_objectives: state.lineage_strategy_objectives,
            lineage_strategy_history: state.lineage_strategy_history.into_iter().collect(),
            lineage_elders: state.lineage_elders,
            pop_history: state.pop_history.into_iter().collect(),
            lineage_centroid_history: state
                .lineage_centroid_history
                .into_iter()
                .map(|(k, v)| (k, v.into_iter().collect()))
                .collect(),
            lineage_homes: state.lineage_homes,
            lineage_eras: state.lineage_eras,
            lineage_generations_reached: state.lineage_generations_reached,
            lineage_unrest: state.lineage_unrest,
            lineage_crime: state.lineage_crime,
            lineage_aggregates: HashMap::default(),
            current_era: if state.current_era.is_empty() {
                "genesis".to_string()
            } else {
                state.current_era
            },
            sex_words: {
                if state.sex_words.len() >= 2 {
                    [state.sex_words[0].clone(), state.sex_words[1].clone()]
                } else {
                    use crate::organism::vocabulary::gen_phoneme_word;
                    let mut word_rng = rand_chacha::ChaCha8Rng::seed_from_u64(seed.wrapping_add(0xc0ffee));
                    let w0 = gen_phoneme_word(&mut word_rng);
                    let mut w1 = gen_phoneme_word(&mut word_rng);
                    while w1 == w0 {
                        w1 = gen_phoneme_word(&mut word_rng);
                    }
                    [w0, w1]
                }
            },
            world_seed: seed,
            next_animal_id,
            animal_census: Vec::new(),
            lineage_names: state.lineage_names,
            rng: state
                .rng
                .unwrap_or_else(|| ChaCha8Rng::seed_from_u64(seed ^ state.tick_count)),
            last_immigration_tick: state.last_immigration_tick,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes: serde_json::Value::Array(vec![]),
            slow_compute_tick: 0,
            active_structure_tiles,
            field_fortifications,
            settlement_tiers: state.settlement_tiers,
            territory: state
                .territory
                .into_iter()
                .map(|(lid, tiles)| (lid, tiles.into_iter().map(|[x, y]| (x, y)).collect()))
                .collect(),
            tile_owner: crate::hashing::FxHashMap::default(),
            cached_territory: serde_json::Value::Null,
            building_state_revision: 1,
            serialized_building_state_revision: 0,
            planting_revision: 1,
            serialized_planting_revision: 0,
            buildings: buildings.into(),
            next_building_id,
            governments: state.governments,
            religions,
            next_religion_id,
            artworks: state.artworks,
            next_artwork_id,
            festivals: state.festivals,
            next_festival_id,
            action_counts: HashMap::default(),
            decision_counts: HashMap::default(),
            workshop_hits: HashMap::default(),
            last_witness_tick: state.last_witness_tick,
            books: state.books,
            next_book_id,
            farms,
            next_farm_id,
            vehicles: state.vehicles,
            next_vehicle_id,
            battles: state.battles,
            next_battle_id,
            treaties,
            outbreaks: state.outbreaks,
            milestones_achieved: state.milestones_achieved,
            lineage_peak_pop: state.lineage_peak_pop,
            tribe_peril: HashMap::default(),
            festival_last: HashMap::default(),
            goals: state.goals,
            evening_places: Default::default(),
            fallen: Default::default(),
            revive_cooldown: HashMap::default(),
            teach_cooldown: HashMap::default(),
            grave_queue: Vec::new(),
            cemeteries: HashMap::default(),
            orphans_cared: Default::default(),
            recent_deaths: HashMap::default(),
            faith_empty_since: HashMap::default(),
            headlines: state.headlines.into_iter().collect(),
            trades: state.trades.into_iter().collect(),
            trade_routes: state.trade_routes,
            village_roads: state.village_roads,
            caravans: state.caravans,
            next_trade_route_id,
            next_caravan_id,
            water_use: state
                .water_use
                .into_iter()
                .map(|entry| ((entry.x, entry.y), entry.count))
                .collect(),
        };
        // The save format only stores the forward map; rebuild the
        // inverse map after the struct exists. Last claim in the
        // iteration order wins (matches runtime "most recent wins"
        // semantics - order is unstable but the next claim_territory
        // call refreshes it deterministically).
        {
            let mut owner = crate::hashing::FxHashMap::default();
            for (lid, tiles) in sim.territory.iter() {
                for &p in tiles {
                    owner.insert(p, lid.clone());
                }
            }
            sim.tile_owner = owner;
        }
        sim.grid.enforce_ocean_border();
        sim.relocate_edge_squatters();
        // Strategy guidance existed before campaign objectives. Upgrade active
        // legacy guidance in-place so an imported local world immediately
        // gains a real target instead of displaying 0/0 forever.
        let living_lineages: crate::hashing::FxHashSet<String> = sim
            .organisms
            .iter()
            .filter(|organism| organism.alive || crate::sim::agents::growth::is_pending_birth(organism))
            .map(|organism| organism.lineage_id.clone())
            .collect();
        let loaded_tick = sim.tick_count;
        sim.lineage_strategies
            .retain(|lineage_id, (strategy, expires_tick)| {
                matches!(
                    strategy.as_str(),
                    "hunt" | "explore" | "settle" | "trade" | "defend"
                ) && *expires_tick > loaded_tick
                    && living_lineages.contains(lineage_id)
            });
        let legacy_objectives: Vec<(String, String, u64)> = sim
            .lineage_strategies
            .iter()
            .filter(|(lineage_id, (strategy, _))| {
                sim.lineage_strategy_objectives
                    .get(*lineage_id)
                    .is_none_or(|objective| objective.strategy != strategy.as_str() || objective.target == 0)
            })
            .map(|(lineage_id, (strategy, expires_tick))| {
                (lineage_id.clone(), strategy.clone(), *expires_tick)
            })
            .collect();
        for (lineage_id, objective) in sim.lineage_strategy_objectives.iter_mut() {
            objective.target = objective.target.max(1);
            objective.progress = objective.progress.min(objective.target);
            if objective.completed_tick.is_some() && objective.failed_tick.is_some() {
                if objective.completed_tick <= objective.failed_tick {
                    objective.failed_tick = None;
                } else {
                    objective.completed_tick = None;
                }
            }
            if let Some((strategy, expires_tick)) = sim.lineage_strategies.get(lineage_id) {
                if objective.strategy == *strategy && objective.target > 0 {
                    objective.expires_tick = *expires_tick;
                }
            }
        }
        for (lineage_id, strategy, expires_tick) in legacy_objectives {
            sim.lineage_strategy_objectives.swap_remove(&lineage_id);
            sim.start_strategy_objective(&lineage_id, &strategy, expires_tick);
        }
        sim.resolve_strategy_objective_expirations();
        // Old/imported saves may predate terrain effects for completed wells
        // and bridges. Reassert only operational infrastructure so an
        // unfinished project still grants no world effect.
        crate::sim::civ_tick::reconcile_operational_infrastructure(&mut sim);
        // The saved map is a cache, not source-of-truth. Rebuild it from
        // living residents and operational buildings so extinct/imported
        // stale rows disappear immediately on load without emitting events.
        crate::sim::civ::settlements::rebuild_tiers(&mut sim);
        crate::sim::civ::trade_routes::repair_loaded_state(&mut sim);
        sim
    }

    pub fn relocate_edge_squatters(&mut self) {
        use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
        let interior_w_min = (WIDTH as f32 * 0.05).ceil() + 1.0;
        let interior_w_max = WIDTH as f32 - interior_w_min - 1.0;
        let interior_h_min = (HEIGHT as f32 * 0.05).ceil() + 1.0;
        let interior_h_max = HEIGHT as f32 - interior_h_min - 1.0;

        for org in self.organisms.iter_mut() {
            let mut moved = false;
            if WorldGrid::is_edge_border(org.x as i32, org.y as i32) {
                org.x = org.x.clamp(interior_w_min, interior_w_max);
                org.y = org.y.clamp(interior_h_min, interior_h_max);
                moved = true;
            }
            if WorldGrid::is_edge_border(org.home_x as i32, org.home_y as i32) {
                org.home_x = org.home_x.clamp(interior_w_min, interior_w_max);
                org.home_y = org.home_y.clamp(interior_h_min, interior_h_max);
                moved = true;
            }
            if moved {
                org.wander_target = None;
            }
        }
        for animal in self.animals.iter_mut() {
            if WorldGrid::is_edge_border(animal.x as i32, animal.y as i32) {
                animal.x = animal.x.clamp(interior_w_min, interior_w_max);
                animal.y = animal.y.clamp(interior_h_min, interior_h_max);
            }
        }
    }
}
