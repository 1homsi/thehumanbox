use super::*;

impl Simulation {
    pub fn tick_n(&mut self, count: u32) {
        for _ in 0..count {
            self.tick();
        }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;
        self.tick_goals();
        self.resolve_strategy_objective_expirations();
        if self.tick_count.is_multiple_of(60) {
            self.resolve_extinct_strategy_objectives();
        }

        self.rebuild_lineage_aggregates();
        // Cross-lineage learning only runs every 500 ticks. Build the spatial
        // index on that cadence so contact lookup stays local instead of
        // comparing every living pair.
        let civ_spatial = self
            .tick_count
            .is_multiple_of(500)
            .then(|| SpatialIndex::build(&self.organisms, 8));
        crate::sim::civ_tick::tick_civ(self, civ_spatial.as_ref());
        self.tick_evening_gatherings();

        if self.tick_count.is_multiple_of(6000) {
            let alive = self.organisms.iter().filter(|o| o.alive).count();
            let q_rows: usize = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.q_table.len())
                .sum();
            let food: usize = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.food_memory.len())
                .sum();
            let trust: usize = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.org_trust.len())
                .sum();
            let rss_kb = read_self_rss_kb_local();
            tracing::info!(target: "mem",
                "t{} alive={} q_rows={} food={} trust={} rss_mb={:.1}",
                self.tick_count, alive, q_rows, food, trust,
                rss_kb as f64 / 1024.0,
            );
        }

        self.tick_new_year();
        let season = self.season();
        self.physics.growth_mult = season_growth(season);
        self.physics.food_season = crate::sim::seasons::food_season(season);
        self.physics.season_temp = self.season_temperature_now();

        if self.tick_count.is_multiple_of(5) {
            let wet = self.weather.is_wet(self.tick_count);
            self.physics
                .tick(&mut self.grid, &mut self.rng, self.weather.kind, wet);
        }

        let _phase = self.tick_count % DAY_LENGTH;

        let season_str: &str = season;
        let drought_was_active = self.drought.active;
        tick_drought(
            &mut self.drought,
            &mut self.grid,
            &self.organisms,
            &self.weather,
            self.tick_count,
            season_str,
            self.goals.difficulty.disaster_mult(),
            &mut self.history,
            &mut self.events,
            &mut self.rng,
        );
        if self.drought.active && !drought_was_active {
            self.headlines.push_back((
                self.tick_count,
                "\u{1F325}\u{FE0F} A drought grips the land — water retreats and crops wither.".to_string(),
            ));
            while self.headlines.len() > 80 {
                self.headlines.pop_front();
            }
        }
        tick_outbreak(
            &mut self.organisms,
            &mut self.grid,
            self.tick_count,
            season_str,
            self.goals.difficulty.disaster_mult(),
            &mut self.history,
            &mut self.events,
            &mut self.rng,
        );
        tick_weather(
            &mut self.weather,
            &mut self.grid,
            &mut self.physics,
            &mut self.organisms,
            self.tick_count,
            season_str,
            &mut self.events,
            &mut self.rng,
        );
        tick_heat_wave(
            &mut self.weather,
            &mut self.grid,
            &mut self.farms,
            self.tick_count,
            &mut self.events,
            &mut self.rng,
        );
        tick_lava(
            &mut self.grid,
            &mut self.physics,
            &mut self.organisms,
            &mut self.animals,
            self.tick_count,
            &mut self.events,
            &mut self.rng,
        );
        let temperature = self.season_temperature_now();
        tick_ice(&mut self.grid, temperature, self.tick_count, &mut self.rng);
        crate::sim::agriculture::tick_farm_weather(
            &mut self.farms,
            self.tick_count,
            self.drought.active,
            self.weather.is_wet(self.tick_count),
            season_str,
        );
        if self.tick_count > 0
            && self
                .tick_count
                .is_multiple_of(crate::sim::civ::fields::FIELD_STEP)
        {
            crate::sim::civ::fields::tick_fields(self);
        }
        if self.tick_count > 0
            && self
                .tick_count
                .is_multiple_of(crate::sim::civ::land::village_fields::SOW_STEP)
        {
            crate::sim::civ::land::village_fields::tick_village_fields(self);
        }

        if self.tick_count.is_multiple_of(300) {
            let ignited_fires = tick_world_evolution(
                &mut self.grid,
                &mut self.organisms,
                &mut self.flood_tiles,
                self.tick_count,
                season_str,
                self.drought.active,
                &self.weather,
                &mut self.events,
                &mut self.rng,
            );
            for (x, y) in ignited_fires {
                self.physics.register_fire(x, y);
            }
        }

        // Drought, flood, and shoreline evolution mutate terrain after a
        // building's one-time completion effect. Operational wells and
        // bridges must remain usable world infrastructure across those
        // ecological changes; unfinished projects are deliberately ignored.
        if drought_was_active != self.drought.active || self.tick_count.is_multiple_of(300) {
            crate::sim::civ_tick::reconcile_operational_infrastructure(self);
        }

        if self.tick_count.is_multiple_of(500) {
            self.grid.decay_world_layers();
        }

        // `current_era` is the world's highest technological era. Ecological
        // state is already represented by seasons, drought, weather, and
        // population history, so it must not enter the era transition stream.
        if self.tick_count % 1200 == 600 {
            self.tick_settlements();
        }

        if self.tick_count.is_multiple_of(600) {
            crate::sim::tech_progress::seed_baseline_discoveries(&mut self.organisms, self.tick_count);
            self.update_lineage_eras();
            self.tick_water_depletion();
        }

        crate::sim::tech_progress::tick_tech_progress(
            self.tick_count,
            &mut self.rng,
            &mut self.organisms,
            &mut self.events,
            &self.lineage_names,
            &self.buildings,
            &self.governments,
        );

        {
            let new_battles = crate::sim::warfare::try_spawn_raids(
                self.tick_count,
                &mut self.rng,
                &self.organisms,
                &self.territory,
                &self.treaties,
                &self.battles,
                &mut self.events,
            );
            let new_battles = self.turn_away_warded(new_battles);
            self.battles.extend(new_battles);
            let new_wars = crate::sim::warfare::try_spawn_border_wars(
                self.tick_count,
                &mut self.rng,
                &self.organisms,
                &self.territory,
                &self.treaties,
                &self.battles,
                &mut self.events,
            );
            let new_wars = self.turn_away_warded(new_wars);
            self.battles.extend(new_wars);
            let standing: Vec<bool> = self.organisms.iter().map(|o| o.alive).collect();
            crate::sim::warfare::tick_battles(
                self.tick_count,
                &mut self.rng,
                &mut self.battles,
                &mut self.treaties,
                &mut self.organisms,
                &mut self.events,
                &mut self.history,
                crate::sim::warfare::BattleInstitutions {
                    lineage_eras: &self.lineage_eras,
                    governments: &self.governments,
                    buildings: &self.buildings,
                    field_fortifications: &self.field_fortifications,
                    grid: &self.grid,
                },
            );
            // The fallen are their tribes' war dead.
            let fallen: Vec<String> = self
                .organisms
                .iter()
                .zip(&standing)
                .filter(|(o, &was)| was && !o.alive)
                .map(|(o, _)| o.lineage_id.clone())
                .collect();
            for lineage in fallen {
                self.note_death(&lineage, "war");
            }
            self.apply_conquests();
        }
        crate::sim::civ::building_damage::tick_building_damage(self);

        let born = growth::deliver_births(
            &mut self.organisms,
            self.tick_count,
            &mut self.events,
            &mut self.history,
        );
        self.note_generations(&born);

        if self.tick_count.is_multiple_of(DAY_LENGTH) {
            let alive = self.organisms.iter().filter(|o| o.alive).count() as u64;
            self.pop_history.push_back([self.tick_count, alive]);
            if self.pop_history.len() > 1000 {
                self.pop_history.pop_front();
            }
            self.sample_lineage_centroids();
        }

        if self.tick_count.is_multiple_of(60) && !self.lineage_centroid_history.is_empty() {
            self.tick_ancestral_recognition();
        }

        if self.tick_count.is_multiple_of(200) {
            let mut candidates: HashMap<String, (String, u32)> = HashMap::default();
            for org in self.organisms.iter().filter(|o| o.alive) {
                let e = candidates
                    .entry(org.lineage_id.clone())
                    .or_insert_with(|| (org.id.clone(), 0));
                if org.age > e.1 {
                    *e = (org.id.clone(), org.age);
                }
            }
            self.lineage_elders.clear();
            for (lid, (id, _)) in candidates {
                self.lineage_elders.insert(lid, id);
            }
            let elder_ids: crate::hashing::FxHashSet<String> =
                self.lineage_elders.values().cloned().collect();
            let tc = self.tick_count;
            for org in self.organisms.iter_mut() {
                let was_elder = org.is_elder;
                org.is_elder = elder_ids.contains(&org.id);
                if org.is_elder && !was_elder {
                    org.log_life(tc, "achievement", "became the elder of my people".to_string());
                }
            }
        }

        const QX: i32 = 3;
        const QY: i32 = 3;
        let qw = WIDTH as f32 / QX as f32;
        let qh = HEIGHT as f32 / QY as f32;
        let mut quadrant_counts = [[0u32; QX as usize]; QY as usize];
        let mut alive_count_before_loop: usize = 0;
        let mut lineage_counts = growth::lineage_population_slots(&self.organisms);
        for o in self.organisms.iter() {
            if !o.alive {
                continue;
            }
            alive_count_before_loop += 1;
            let cx = ((o.x / qw).floor() as i32).clamp(0, QX - 1);
            let cy = ((o.y / qh).floor() as i32).clamp(0, QY - 1);
            quadrant_counts[cy as usize][cx as usize] += 1;
        }
        let sparse_quadrants = quadrant_counts.iter().flatten().filter(|&&n| n <= 6).count();
        let world_is_clumped = sparse_quadrants >= 5;
        // Newcomers seek out a world whose gods answer prayers. A silent
        // world stays silent: nobody migrates into an empty land, and a
        // dwindling world is only rescued once its gods have earned faith.
        let gods_trusted = self.prayers_faith_total() > 0;
        let immig_cooldown = if alive_count_before_loop == 0 {
            None
        } else if alive_count_before_loop < 60 && gods_trusted {
            Some(200u64)
        } else if alive_count_before_loop < 100 && gods_trusted {
            Some(600u64)
        } else if world_is_clumped {
            Some(1500u64)
        } else {
            None
        };
        let reserved_before_immigration = growth::population_slots_used(&self.organisms);
        if let Some(cd) = immig_cooldown {
            if self.tick_count - self.last_immigration_tick >= cd {
                // Immigrant tribes contain at most 14 people. Waiting for a
                // full tribe-sized opening keeps both living people and
                // pending births inside the selected world capacity.
                if reserved_before_immigration.saturating_add(14) <= self.population_limit {
                    self.spawn_immigrant_tribe();
                    self.last_immigration_tick = self.tick_count;
                }
            }
        }

        let mut population_slots_used = growth::population_slots_used(&self.organisms);

        let spatial = SpatialIndex::build(&self.organisms, 10);
        let animal_spatial = SpatialIndex::build_animals(&self.animals, 10);
        let mut buffers = TickBuffers::new();
        let mut org_idx_by_id: FxHashMap<String, usize> =
            FxHashMap::with_capacity_and_hasher(self.organisms.len(), Default::default());
        let mut lineage_members = lineage_member_index(&self.organisms);
        for (i, o) in self.organisms.iter().enumerate() {
            if o.alive {
                org_idx_by_id.insert(o.id.clone(), i);
            }
        }
        for vehicle in &mut self.vehicles {
            vehicle.occupants.retain(|id| org_idx_by_id.contains_key(id));
            // A fishing boat keeps its voyage with nobody aboard; a crossing ends when its passenger is gone.
            if vehicle.occupants.is_empty() && vehicle.harbour.is_none() {
                vehicle.route.clear();
            }
        }
        self.separate_crowds();
        for i in 0..self.organisms.len() {
            if self.organisms[i].alive {
                let prev_len = self.organisms.len();
                self.tick_organism(
                    i,
                    population_slots_used,
                    &lineage_counts,
                    &spatial,
                    &animal_spatial,
                    &mut buffers,
                    &org_idx_by_id,
                    &mut lineage_members,
                );

                if self.organisms.len() > prev_len {
                    let new_slots = self.organisms.len() - prev_len;
                    population_slots_used += new_slots;
                    for child in &self.organisms[prev_len..] {
                        if growth::is_pending_birth(child) {
                            *lineage_counts.entry(child.lineage_id.clone()).or_insert(0) += 1;
                        }
                    }
                    let child_idx = self.organisms.len() - 1;
                    let child_lid = self.organisms[child_idx].lineage_id.clone();
                    if let Some(elder_id) = self.lineage_elders.get(&child_lid).cloned() {
                        let epos_opt = org_idx_by_id.get(&elder_id).copied();
                        if let Some(epos) = epos_opt {
                            if epos != child_idx {
                                let danger: Vec<_> = self.organisms[epos]
                                    .danger_memory
                                    .iter()
                                    .map(|(&k, &v)| (k, v))
                                    .collect();
                                let food: Vec<_> = self.organisms[epos]
                                    .food_memory
                                    .iter()
                                    .map(|(&k, &v)| (k, v))
                                    .collect();
                                let child = &mut self.organisms[child_idx];
                                let ms = child.traits.memory_strength;
                                for (k, v) in danger {
                                    if self.rng.random::<f32>() < 0.45 {
                                        Organism::remember(&mut child.danger_memory, k.0, k.1, v * 0.4, ms);
                                    }
                                }
                                for (k, v) in food {
                                    if self.rng.random::<f32>() < 0.20 {
                                        Organism::remember(&mut child.food_memory, k.0, k.1, v * 0.2, ms);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        const VEL_EMA_ALPHA: f32 = 0.4;
        const MAX_PER_TICK: f32 = 2.0;
        for o in self.organisms.iter_mut() {
            if !o.alive {
                continue;
            }
            let inst_vx = o.x - o.prev_x;
            let inst_vy = o.y - o.prev_y;
            o.prev_x = o.x;
            o.prev_y = o.y;
            if inst_vx.abs() > MAX_PER_TICK || inst_vy.abs() > MAX_PER_TICK {
                o.vx_smooth = 0.0;
                o.vy_smooth = 0.0;
                continue;
            }
            o.vx_smooth = VEL_EMA_ALPHA * inst_vx + (1.0 - VEL_EMA_ALPHA) * o.vx_smooth;
            o.vy_smooth = VEL_EMA_ALPHA * inst_vy + (1.0 - VEL_EMA_ALPHA) * o.vy_smooth;
        }

        if self.tick_count.is_multiple_of(1200) {
            let dead_count = self
                .organisms
                .iter()
                .filter(|o| !o.alive && !growth::is_pending_birth(o))
                .count();
            const RECENT_DEAD_FULL: usize = 300;
            const MAX_ARCHIVE: usize = 800;
            if dead_count > RECENT_DEAD_FULL {
                let to_compress = dead_count - RECENT_DEAD_FULL;
                let mut compressed = 0usize;
                let tick_now = self.tick_count;
                for o in self.organisms.iter_mut() {
                    if compressed >= to_compress {
                        break;
                    }
                    if !o.alive && !growth::is_pending_birth(o) && !o.q_table.is_empty() {
                        if !o.memories.is_empty() {
                            let top: Vec<crate::organism::memory::MemoryEntry> =
                                o.memories.top(8).into_iter().cloned().collect();
                            self.pending_memory_flushes.push(PendingMemoryFlush {
                                org_id: o.id.clone(),
                                org_name: o.name.clone(),
                                lineage_id: o.lineage_id.clone(),
                                flushed_tick: tick_now,
                                memories: top,
                            });
                        }
                        o.compress_for_archive();
                        compressed += 1;
                    }
                }
            }
            let dead_now = self
                .organisms
                .iter()
                .filter(|o| !o.alive && !growth::is_pending_birth(o))
                .count();
            if dead_now > MAX_ARCHIVE {
                let excess = dead_now - MAX_ARCHIVE;
                let mut removed = 0usize;
                self.organisms.retain(|o| {
                    if o.alive || growth::is_pending_birth(o) {
                        return true;
                    }
                    if removed < excess {
                        removed += 1;
                        return false;
                    }
                    true
                });
                // Retaining archived bodies shifts resident indices. Refresh
                // the tick's ID map only on this rare path before dogs use it.
                org_idx_by_id.clear();
                for (i, o) in self.organisms.iter().enumerate() {
                    if o.alive {
                        org_idx_by_id.insert(o.id.clone(), i);
                    }
                }
            }
        }

        self.tick_animals(&org_idx_by_id);
        self.tick_colonization();
        self.tick_fleet();
        self.tick_plantings();
        self.tick_prayers();
        self.tick_wards();
        self.tick_smog();
        self.tick_wild_food();
        self.check_animal_catches();

        {
            let storm = self.weather.kind >= 2;
            let decay = if storm { 0.00025 } else { 0.000025 };
            let mut promote = Vec::new();
            let mut demote = Vec::new();
            let mut to_remove = Vec::new();
            for &(x, y) in &self.active_structure_tiles {
                let s = self.grid.structure_at(x, y);
                if s <= 0.0 {
                    to_remove.push((x, y));
                    continue;
                }
                let ns = (s - decay).max(0.0);
                *self.grid.structure_at_mut(x, y) = ns;
                if ns == 0.0 {
                    to_remove.push((x, y));
                }
                let tile = self.grid.get(x, y);
                if ns >= 0.85
                    && matches!(
                        tile,
                        Tile::Grass | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Food
                    )
                {
                    promote.push((x, y));
                } else if ns < 0.1 && tile == Tile::Hut {
                    demote.push((x, y));
                }
            }
            for (x, y) in to_remove {
                self.active_structure_tiles.remove(&(x, y));
                self.field_fortifications
                    .retain(|fortification| fortification.x != x || fortification.y != y);
            }
            for (x, y) in promote {
                self.grid.set(x, y, Tile::Hut);
            }
            for (x, y) in demote {
                self.grid.set(x, y, Tile::Ash);
            }
        }
    }

    pub(super) fn should_start_emergency_shelter(&self, idx: usize) -> bool {
        if self.weather.kind < 2 || self.organisms[idx].inv_wood < 1 {
            return false;
        }
        let org = &self.organisms[idx];
        if org.has_shelter_within(&self.grid, &self.buildings, 3)
            || org.has_shelter_project_within(&self.buildings, 3)
        {
            return false;
        }
        matches!(
            self.grid.get(org.x as i32, org.y as i32),
            Tile::Grass | Tile::Sand | Tile::Snow
        )
    }
}
