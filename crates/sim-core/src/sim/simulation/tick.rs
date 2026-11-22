use super::*;

const STRUCTURE_SORT_EVERY: u64 = 600;

impl Simulation {
    pub fn tick_n(&mut self, count: u32) {
        for _ in 0..count {
            self.tick();
        }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;
        // Homes move during the tick. The founding-site search rebuilds its
        // list on the next query.
        self.home_spots_ok = false;
        self.tick_goals();
        self.resolve_strategy_objective_expirations();
        if self.tick_count.is_multiple_of(60) {
            self.resolve_extinct_strategy_objectives();
        }

        self.rebuild_lineage_aggregates();
        // Cross-lineage learning only runs every 500 ticks. Build the spatial
        // index on that cadence so contact lookup stays local instead of
        // comparing every living pair.
        let civ_spatial = self.tick_count.is_multiple_of(500).then(|| {
            self.organism_columns.sync_from(&self.organisms);
            let index = SpatialIndex::build_columns(&self.organism_columns, 8);
            // World events below move people. The columns are stale until the next sync.
            self.organism_columns.invalidate();
            index
        });
        crate::sim::civ_tick::tick_civ(self, civ_spatial.as_ref());
        self.tick_evening_gatherings();
        self.tick_school_places();

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
        if on_beat(
            self.tick_count,
            crate::sim::civ::land::village_fields::SOW_STEP,
            SOW_PHASE,
        ) {
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

        // Baseline discoveries keep the 600-tick multiples: their thresholds are absolute ticks (fire at 1200,
        // shelter at 2400, stone tools at 3600), and a later pass would hand each one out late.
        if self.tick_count.is_multiple_of(600) {
            crate::sim::tech_progress::seed_baseline_discoveries(&mut self.organisms, self.tick_count);
        }
        if on_beat(self.tick_count, 600, ERAS_PHASE) {
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
            let facts = if self
                .tick_count
                .is_multiple_of(crate::sim::warfare::RAID_CHECK_INTERVAL)
            {
                self.tribe_facts()
            } else {
                Default::default()
            };
            let at_war = self.lineages_at_war();
            let mut reasons = Vec::new();
            let new_battles = crate::sim::warfare::try_spawn_raids(
                self.tick_count,
                &mut self.rng,
                &self.organisms,
                &self.territory,
                &self.treaties,
                &self.battles,
                &mut self.events,
                &crate::sim::warfare::WarMinds {
                    relations: &self.diplomacy.relations,
                    facts: &facts,
                    sides: &self.diplomacy.nation_of,
                    at_war: &at_war,
                },
                &mut reasons,
            );
            let new_battles = self.turn_away_warded(new_battles);
            let new_battles = self.weary_stay_home(new_battles);
            let new_battles = self.enter_wars(new_battles, &reasons, false);
            self.march_warbands(&new_battles);
            for battle in &new_battles {
                self.chronicle_battle(battle);
            }
            self.battles.extend(new_battles);
            let new_wars = crate::sim::warfare::try_spawn_border_wars(
                self.tick_count,
                &mut self.rng,
                &self.organisms,
                &self.territory,
                &self.treaties,
                &self.battles,
                &mut self.events,
                &crate::sim::warfare::WarMinds {
                    relations: &self.diplomacy.relations,
                    facts: &facts,
                    sides: &self.diplomacy.nation_of,
                    at_war: &at_war,
                },
                &mut reasons,
            );
            let new_wars = self.turn_away_warded(new_wars);
            let new_wars = self.weary_stay_home(new_wars);
            let new_wars = self.enter_wars(new_wars, &reasons, true);
            self.march_warbands(&new_wars);
            for battle in &new_wars {
                self.chronicle_battle(battle);
            }
            self.battles.extend(new_wars);
            let front_battles = self.tick_wars();
            let front_battles = self.turn_away_warded(front_battles);
            self.march_warbands(&front_battles);
            for battle in &front_battles {
                self.chronicle_battle(battle);
            }
            self.battles.extend(front_battles);
            let in_war = self.war_battle_ids();
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
                    in_war: &in_war,
                },
            );
            self.record_fallen_leaders(&standing);
            // The fallen are their tribes' war dead.
            let fallen: Vec<String> = self
                .organisms
                .iter()
                .zip(&standing)
                .filter(|(o, &was)| was && !o.alive)
                .map(|(o, _)| o.lineage_id.to_string())
                .collect();
            for lineage in fallen {
                self.note_death(&lineage, "war");
                self.mourn_war_dead(&lineage);
            }
            self.settle_wars();
            self.make_weary_peace();
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
                    .entry(org.lineage_id.to_string())
                    .or_insert_with(|| (org.id.to_string(), 0));
                if org.age > e.1 {
                    *e = (org.id.to_string(), org.age);
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
                org.is_elder = elder_ids.contains(org.id.as_str());
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

        self.organism_columns.sync_from(&self.organisms);
        let spatial = SpatialIndex::build_columns(&self.organism_columns, 10);
        let animal_spatial = SpatialIndex::build_animals(&self.animals, 10);
        let mut buffers = TickBuffers::new();
        let mut org_idx_by_id: FxHashMap<crate::intern::Sym, usize> =
            FxHashMap::with_capacity_and_hasher(self.organisms.len(), Default::default());
        let mut lineage_members = lineage_member_index(&self.organisms);
        for (i, o) in self.organisms.iter().enumerate() {
            if o.alive {
                org_idx_by_id.insert(o.id, i);
            }
        }
        for vehicle in &mut self.vehicles {
            vehicle
                .occupants
                .retain(|id| org_idx_by_id.contains_key(id.as_str()));
            // A fishing boat keeps its voyage with nobody aboard; a crossing ends when its passenger is gone.
            if vehicle.occupants.is_empty() && vehicle.harbour.is_none() {
                vehicle.route.clear();
            }
        }
        self.separate_crowds_indexed();
        // A person's turn runs in three passes over everyone. First they all look at once (kin, strangers,
        // beasts, and the kin a wander would count — reads of the world, on all cores; see `sim::par`), then
        // each is written in order from what they saw. A tribe that splits redoes those reads for the people
        // after the founder, who are the only ones that split can change. Then they all choose at once, from
        // the world as the choosing begins, and each acts on their choice, in order, as before.
        let n = self.organisms.len();
        let now = self.tick_count;
        self.focus_points.retain(|&(_, _, until)| until > now);
        self.refresh_calm_towns();
        let towns = self.calm_town_of_each();
        let (awake, strangers) = self.lod_awake(&animal_spatial, &mut buffers.spatial, &towns);
        let tiers = self.town_tiers(&towns, &awake);
        self.lineage_lore(&awake);
        let mut perceived = self.perceive_all(&spatial, &animal_spatial, &awake);
        let mut sensing = awake.clone();
        for (on, tier) in sensing.iter_mut().zip(&tiers) {
            if *tier == town_lod::Tier::Idle {
                *on = false;
            }
        }
        let mut looks = self.sense_looks(&sensing, &spatial, &animal_spatial, &org_idx_by_id);
        // Who would count kin on this tick, judged before inner state moves a threshold. Anyone who only
        // becomes eligible as their own state ticks scans inline, which is the same walk.
        let mut scan = sensing.clone();
        for (on, o) in scan.iter_mut().zip(&self.organisms) {
            if *on
                && (o.journey.is_some()
                    || o.wander_target.is_some()
                    || o.energy < 0.45
                    || o.hydration < 0.45
                    || o.age < 600
                    || o.fear_level > 0.65)
            {
                *on = false;
            }
        }
        let mut crowds = self.kin_crowds(&spatial, &lineage_members, &scan);
        let mut sensed: Vec<Option<organism_tick::Sensed>> = Vec::with_capacity(n);
        {
            let cx = organism_tick::TurnContext {
                lineage_counts: &lineage_counts,
                spatial: &spatial,
                animal_spatial: &animal_spatial,
                org_idx_by_id: &org_idx_by_id,
            };
            for i in 0..n {
                if tiers[i] == town_lod::Tier::Idle {
                    sensed.push(None);
                    continue;
                }
                if self.organisms[i].alive && !awake[i] {
                    let dt = self.turn_gap(i);
                    sensed.push(Some(self.dormant_sensed(i, strangers[i], dt)));
                    continue;
                }
                sensed.push(self.organisms[i].alive.then(|| {
                    let before = self.organisms[i].lineage_id;
                    let sensed = self.org_sense(
                        i,
                        population_slots_used,
                        &cx,
                        &mut buffers,
                        &mut lineage_members,
                        perceived[i].take(),
                        &looks[i],
                        crowds[i],
                    );
                    if self.organisms[i].lineage_id != before {
                        self.refill_sense_looks(
                            i + 1,
                            &mut looks,
                            &sensing,
                            &spatial,
                            &animal_spatial,
                            &org_idx_by_id,
                        );
                        self.refill_kin_crowds(i + 1, &mut crowds, &spatial, &lineage_members, &scan);
                    }
                    sensed
                }));
            }
        }
        let dormant: Vec<u64> = sensed
            .iter()
            .enumerate()
            .map(|(i, s)| match s {
                Some(s) if s.dormant => s.dt,
                Some(_) => self.turn_gap(i) - 1,
                None => 0,
            })
            .collect();
        for (o, s) in self.organisms.iter_mut().zip(&sensed) {
            if s.is_some() {
                o.lod_turn = now;
            }
        }
        // Choosing and acting write positions, needs and life through the structs.
        self.organism_columns.invalidate();
        let tick_seed: u64 = self.rng.random();
        self.choosing_tribes = Some(crate::sim::civ::fields::tribe_people_and_plots(self));
        let mut choices = self.choose_all(&sensed, &spatial, tick_seed);
        self.choosing_tribes = None;
        for i in 0..n {
            let (Some(sense), Some(choice)) = (sensed[i].take(), choices[i].take()) else {
                continue;
            };
            // Someone killed earlier this tick, after they chose, takes no turn.
            if self.organisms[i].alive {
                let prev_len = self.organisms.len();
                let cx = organism_tick::TurnContext {
                    lineage_counts: &lineage_counts,
                    spatial: &spatial,
                    animal_spatial: &animal_spatial,
                    org_idx_by_id: &org_idx_by_id,
                };
                self.org_turn(
                    sense,
                    choice,
                    population_slots_used,
                    &cx,
                    &mut buffers,
                    &mut lineage_members,
                );

                if self.organisms.len() > prev_len {
                    let new_slots = self.organisms.len() - prev_len;
                    population_slots_used += new_slots;
                    for child in &self.organisms[prev_len..] {
                        if growth::is_pending_birth(child) {
                            *lineage_counts.entry(child.lineage_id).or_insert(0) += 1;
                        }
                    }
                    let child_idx = self.organisms.len() - 1;
                    let child_lid = self.organisms[child_idx].lineage_id;
                    if let Some(elder_id) = self.lineage_elders.get(child_lid.as_str()).cloned() {
                        let epos_opt = org_idx_by_id.get(elder_id.as_str()).copied();
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

        self.dormant_upkeep(&dormant, &spatial, &animal_spatial);
        self.glide(&tiers);
        self.learn_from_the_tick(&spatial);

        self.organism_columns.smooth_velocity(&mut self.organisms);

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
                    if !o.alive && !growth::is_pending_birth(o) && !o.archived {
                        self.pending_memory_flushes
                            .extend(PendingMemoryFlush::of(o, tick_now));
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
                        org_idx_by_id.insert(o.id, i);
                    }
                }
            }
        }

        // After the people have chosen their actions, so the market crowd's thoughts and walks show in this tick's frame.
        self.tick_market_crowds();
        self.tick_animals(&org_idx_by_id);
        self.tick_colonization();
        self.tick_fleet();
        self.tick_ferries();
        self.tick_rails();
        crate::sim::civ::land::village_carts::tick_carts(self);
        self.tick_plantings();
        self.tick_prayers();
        self.tick_wards();
        self.tick_fallout();
        self.tick_smog();
        self.tick_winter_memories();
        self.tick_tribe_crafts();
        self.tick_game_wariness();
        self.tick_war_weariness();
        self.tick_relations();
        self.tick_relief();
        self.tick_supply();
        self.tick_land_memory();
        self.tick_migrations();
        self.tick_nations();
        self.tick_rulers();
        self.tick_wild_food();
        self.check_animal_catches();

        {
            let storm = self.weather.kind >= 2;
            let decay = if storm { 0.00025 } else { 0.000025 };
            let mut promote = Vec::new();
            let mut demote = Vec::new();
            let mut to_remove = Vec::new();
            if self.tick_count.is_multiple_of(STRUCTURE_SORT_EVERY) {
                self.active_structure_tiles.sort_unstable_by_key(|&(x, y)| (y, x));
            }
            for &(x, y) in &self.active_structure_tiles {
                if !WorldGrid::in_bounds(x, y) {
                    to_remove.push((x, y));
                    continue;
                }
                let i = WorldGrid::idx(x, y);
                let s = self.grid.structure[i];
                if s <= 0.0 {
                    to_remove.push((x, y));
                    continue;
                }
                let ns = (s - decay).max(0.0);
                self.grid.structure[i] = ns;
                if ns == 0.0 {
                    to_remove.push((x, y));
                }
                let tile = Tile::from_i8(self.grid.tiles[i]);
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
            if !to_remove.is_empty() {
                for tile in &to_remove {
                    self.active_structure_tiles.swap_remove(tile);
                }
                let removed: crate::hashing::FxHashSet<(i32, i32)> = to_remove.into_iter().collect();
                self.field_fortifications
                    .retain(|fortification| !removed.contains(&(fortification.x, fortification.y)));
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
        // Someone starving or parched goes for food or water first: the storm
        // reflex used to override even eating, and they built until they died.
        if org.energy < 0.25 || org.hydration < 0.25 {
            return false;
        }
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
