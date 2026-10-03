use super::*;

impl Simulation {
    pub(super) fn tick_organism(
        &mut self,
        idx: usize,
        population_slots_used: usize,
        lineage_counts: &FxHashMap<String, usize>,
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        buffers: &mut TickBuffers,
        org_idx_by_id: &FxHashMap<String, usize>,
        lineage_members: &mut FxHashMap<String, Vec<usize>>,
    ) {
        let TickBuffers {
            spatial: spatial_buf,
            available_actions: available_buf,
            perception: perception_buf,
        } = buffers;
        let night = self.is_night();
        let epsilon = (0.30 - self.organisms[idx].age as f32 * 0.00005).max(0.08);

        let prev_energy = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;
        let prev_inv_food = self.organisms[idx].inv_food;
        let prev_inv_water = self.organisms[idx].inv_water;

        {
            let org = &self.organisms[idx];
            let ox = org.x as i32;
            let oy = org.y as i32;
            spatial.query_into(ox, oy, 6, spatial_buf);
            let mut kin_near: usize = 0;
            let mut hostile_near = false;
            for &i in spatial_buf.iter() {
                if i == idx {
                    continue;
                }
                let o = &self.organisms[i];
                if !o.alive {
                    continue;
                }
                let dist = (o.x - org.x).abs() + (o.y - org.y).abs();
                if o.lineage_id == org.lineage_id {
                    if dist <= 5.0 {
                        kin_near += 1;
                    }
                } else if !hostile_near && dist <= 6.0 && org.attitude_toward(&o.lineage_id) < -0.2 {
                    hostile_near = true;
                }
            }
            let near_shelter = org.near_shelter(&self.grid, &self.buildings);
            let weather_kind = self.weather.kind;
            let tick_now = self.tick_count;
            self.organisms[idx].tick_inner_state(
                kin_near,
                near_shelter,
                hostile_near,
                weather_kind,
                tick_now,
                night,
            );
        }

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let intruders: Vec<String> = if let Some(elder_id) = self.lineage_elders.get(&my_lid) {
                if let Some(&elder_idx) = org_idx_by_id.get(elder_id) {
                    let ex = self.organisms[elder_idx].home_x;
                    let ey = self.organisms[elder_idx].home_y;
                    let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                    if (ox - ex).abs() + (oy - ey).abs() < 20.0 {
                        // Query the spatial index around the home instead of
                        // scanning every organism — this block runs per-tick
                        // for every organism near its lineage's elder home.
                        spatial.query_into(ex as i32, ey as i32, 12, spatial_buf);
                        let mut v: Vec<String> = Vec::new();
                        for &i in spatial_buf.iter() {
                            let o = &self.organisms[i];
                            if !o.alive || o.lineage_id == my_lid {
                                continue;
                            }
                            if (o.x - ex).abs() + (o.y - ey).abs() < 12.0 {
                                v.push(o.lineage_id.clone());
                            }
                        }
                        v
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            };
            for intruder_lid in intruders {
                let att = self.organisms[idx]
                    .lineage_attitudes
                    .entry(intruder_lid)
                    .or_insert(0.0);
                *att = (*att - 0.0015).max(-1.0);
            }
        }

        // Passive territory: organisms gradually stamp their lineage onto land they inhabit.
        // Those with borders/territory discovery claim a wider radius around home.
        if self.tick_count % 40 == (idx as u64 % 40) {
            let has_borders = self.organisms[idx].discoveries.contains("territory")
                || self.organisms[idx].discoveries.contains("borders");
            let (hx, hy) = (
                self.organisms[idx].home_x as i32,
                self.organisms[idx].home_y as i32,
            );
            let lid = self.organisms[idx].lineage_id.clone();
            let radius = if has_borders { 4 } else { 1 };
            self.claim_territory(&lid, hx, hy, radius);
        }

        // Rival territory pressure: being on a rival's claimed tile
        // degrades attitude. The inverse map (tile_owner) makes this
        // an O(1) lookup instead of an O(L × T_avg) scan of every
        // lineage's claimed tile set.
        {
            let (ox_i, oy_i) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let rival_lid: Option<String> = self
                .tile_owner
                .get(&(ox_i, oy_i))
                .filter(|lid| lid.as_str() != self.organisms[idx].lineage_id)
                .cloned();
            if let Some(rival) = rival_lid {
                let att = self.organisms[idx].lineage_attitudes.entry(rival).or_insert(0.0);
                *att = (*att - 0.002).max(-1.0);
            }
        }

        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let fear_trait = self.organisms[idx].traits.fear;
        let wolf_flee_radius = 6.0 + fear_trait * 8.0;

        // Animal positions are stable until tick_animals, after all human
        // actions. Query only local candidates, in original animal order.
        let mut animal_near = false;
        let mut wolf_threat: Option<(f32, f32, f32)> = None;
        let mut threat_kind = AnimalKind::Wolf;
        animal_spatial.query_into(
            ox as i32,
            oy as i32,
            wolf_flee_radius.max(8.0).ceil() as i32,
            spatial_buf,
        );
        spatial_buf.sort_unstable();
        for &animal_idx in spatial_buf.iter() {
            let a = &self.animals[animal_idx];
            if !a.alive {
                continue;
            }
            let d = (a.x - ox).abs() + (a.y - oy).abs();
            if d <= 8.0 {
                animal_near = true;
            }
            if a.kind.hostile()
                && !a.sleeping
                && d <= wolf_flee_radius
                && wolf_threat.map(|(bd, _, _)| d < bd).unwrap_or(true)
            {
                wolf_threat = Some((d, a.x, a.y));
                threat_kind = a.kind;
            }
        }

        let perception = self.organisms[idx].perceive_into(
            &self.grid,
            &self.organisms,
            night,
            animal_near,
            spatial,
            perception_buf,
        );
        let prior_lineage = self.organisms[idx].lineage_id.clone();
        self.validate_or_assign_wander_target_indexed(idx, spatial, lineage_members);
        if self.organisms[idx].lineage_id != prior_lineage {
            if let Some(members) = lineage_members.get_mut(&prior_lineage) {
                members.retain(|&member_idx| member_idx != idx);
            }
            let members = lineage_members
                .entry(self.organisms[idx].lineage_id.clone())
                .or_default();
            let position = members.binary_search(&idx).unwrap_or_else(|position| position);
            members.insert(position, idx);
        }
        if let Some((_, wx, wy)) = wolf_threat {
            let wx_i = wx as i32;
            let wy_i = wy as i32;
            let prev = self.organisms[idx]
                .danger_memory
                .get(&(wx_i, wy_i))
                .copied()
                .unwrap_or(0.0);
            self.organisms[idx]
                .danger_memory
                .insert((wx_i, wy_i), (prev + 0.4).min(1.0));
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.05).min(1.0);
        }

        // Need-driven construction: during storms, organisms with wood and no nearby shelter
        // urgently build wherever they're standing if the tile allows it.
        let storm_build: Option<(usize, Option<String>)> = self
            .should_start_emergency_shelter(idx)
            .then(|| (49, Some("must build shelter now!".to_string())));

        let (action, new_thought, decision_origin): (usize, Option<String>, &'static str) =
            if let Some(boat_action) = self.boat_action(idx) {
                boat_action
            } else if let Some((action, thought)) = storm_build {
                (action, thought, "emergency_reflex")
            } else if let Some((dist, wx, wy)) = wolf_threat.filter(|(dist, _, _)| *dist <= 2.5) {
                let fdx = (ox - wx).signum();
                let fdy = (oy - wy).signum();
                let dir = match (fdx as i32, fdy as i32) {
                    (0, -1) => 0,
                    (0, 1) => 1,
                    (-1, 0) => 2,
                    (1, 0) => 3,
                    (-1, -1) => 4,
                    (1, -1) => 5,
                    (-1, 1) => 6,
                    (1, 1) => 7,
                    _ => 0,
                };
                // Set a distant flee target so they keep running after the wolf leaves range
                let flee_dist = 20.0 + fear_trait * 30.0;
                let (tx, ty) = safe_flee_target(&self.grid, ox, oy, fdx, fdy, flee_dist);
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level + 0.07 + (2.5 - dist) * 0.02).min(1.0);
                (
                    dir,
                    Some(format!("{}! run!", threat_kind.name())),
                    "emergency_reflex",
                )
            } else {
                self.refresh_lineage_guidance(idx);
                let (oa_ix, oa_iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
                crate::sim::actions::available_actions_into(
                    self,
                    idx,
                    oa_ix,
                    oa_iy,
                    spatial,
                    available_buf,
                    spatial_buf,
                );
                let q_seen = self.organisms[idx].q_table.contains_key(&perception);
                let active_directive = if self.tick_count < self.organisms[idx].directive_until
                    && !self.organisms[idx].directive.is_empty()
                {
                    Some(self.organisms[idx].directive.clone())
                } else {
                    None
                };
                let active_wander_action = self.organisms[idx]
                    .wander_target
                    .map(|target| self.organisms[idx].toward(target, &self.grid));
                spatial.query_into(oa_ix, oa_iy, 16, spatial_buf);
                // Preserve population order for tie-breaking and resource followers.
                spatial_buf.sort_unstable();
                let chosen = self.organisms[idx].choose_action_with_neighbors(
                    &self.grid,
                    &self.buildings,
                    self.tick_count,
                    epsilon,
                    &self.organisms,
                    night,
                    self.weather.kind,
                    &mut self.rng,
                    animal_near,
                    &perception,
                    available_buf,
                    Some(spatial_buf),
                );
                let decision_origin = if active_wander_action == Some(chosen.0) {
                    "soft_wander"
                } else if active_directive
                    .as_deref()
                    .is_some_and(|directive| directive_aligns_action(directive, chosen.0))
                {
                    "soft_directive"
                } else if q_seen {
                    "learned_q"
                } else {
                    "seed_or_explore"
                };
                (chosen.0, chosen.1, decision_origin)
            };
        *self.decision_counts.entry(decision_origin).or_insert(0) += 1;
        if let Some(ref t) = new_thought {
            self.organisms[idx].think(t, self.tick_count);
        }
        // A goal walled off by mountains or water is given up rather than
        // paced at forever.
        {
            let o = &mut self.organisms[idx];
            let blocked = o.route.get_mut().unreachable.take();
            if let Some(goal) = blocked {
                let mut gave_up = false;
                if o.journey.as_ref().is_some_and(|j| j.target == goal) {
                    o.journey = None;
                    gave_up = true;
                }
                if o.wander_target == Some(goal) {
                    o.wander_target = None;
                    gave_up = true;
                }
                if gave_up {
                    o.think("the way is blocked", self.tick_count);
                }
            }
        }
        // A single step away from remembered danger was undone by the next
        // tick's routine, so people flip-flopped on the spot. Commit to the
        // retreat by aiming the wander target further along the flee step.
        if action < 8 && new_thought.as_deref() == Some("avoiding danger") {
            let (dx, dy) = DIRECTIONS[action];
            let o = &mut self.organisms[idx];
            let (ox, oy) = (o.x as i32, o.y as i32);
            // A journey that leads back toward the danger is abandoned, or it
            // walks them straight back on the next tick.
            if o.journey
                .as_ref()
                .is_some_and(|j| (j.target.0 - ox) * dx + (j.target.1 - oy) * dy < 0)
            {
                o.journey = None;
            }
            if o.journey.is_none() {
                o.wander_target = Some((
                    (ox + dx * 8).clamp(1, WIDTH as i32 - 2),
                    (oy + dy * 8).clamp(1, HEIGHT as i32 - 2),
                ));
            }
        }

        let (ix, iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);

        let mut signal_reward = 0.0f32;
        let mut movement_reward = 0.0f32;
        let mut action_succeeded = false;

        if action < 8 {
            let (dx, dy) = DIRECTIONS[action];
            let (nx, ny) = (ix + dx, iy + dy);
            let next_tile = self.grid.get(nx, ny);
            // `walkable()` alone is not enough: `Tile::Fire` passes it, so a
            // direction chosen while the organism was surrounded by fire (or
            // any action whose scoring preferred fire) walked it into the
            // flames. Fire is never a valid destination, so route it through
            // the fallback, which picks the best genuinely safe neighbour and
            // returns `None` when the organism is trapped.
            let destination = if next_tile.walkable() && next_tile != Tile::Fire {
                Some((nx, ny))
            } else {
                fallback_walkable_step(
                    &self.grid,
                    ix,
                    iy,
                    action,
                    self.organisms[idx].traits.fear,
                    self.organisms[idx].health,
                )
            };
            movement_reward = movement_step_feedback(&self.grid, ix, iy, action, destination);
            movement_reward +=
                movement_momentum_feedback(&self.organisms[idx], &self.grid, (ix, iy), destination);
            movement_reward += urgent_resource_progress_feedback(&self.organisms[idx], (ix, iy), destination);
            if let Some((mx, my)) = destination {
                action_succeeded = true;
                self.organisms[idx].x = mx as f32;
                self.organisms[idx].y = my as f32;
                self.grid.leave_trail(mx, my, TrailKind::Path, 0.06);
                self.grid.stamp_pressure(mx, my);
                let has_farming = self.organisms[idx].discoveries.contains("farm");
                if has_farming {
                    let fidx = WorldGrid::idx(mx, my);
                    if self.grid.fertility[fidx] < 0.25 {
                        self.grid.fertility[fidx] = (self.grid.fertility[fidx] + 0.004).min(0.55);
                    }
                }
            }
        } else if action == 8 {
            let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if self.grid.get(cx, cy) == Tile::Food {
                action_succeeded = true;
                let cooking_bonus = if self.organisms[idx].discoveries.contains("cooking") {
                    let near_fire = [(-1, 0), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| {
                        matches!(self.grid.get(cx + dx, cy + dy), Tile::Campfire | Tile::Fire)
                    });
                    if near_fire {
                        0.12
                    } else {
                        0.0
                    }
                } else {
                    0.0
                };
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.35 + cooking_bonus).min(1.0);
                let ms = self.organisms[idx].traits.memory_strength;
                Organism::remember(&mut self.organisms[idx].food_memory, cx, cy, 1.0, ms);
                self.grid.set(cx, cy, Tile::Grass);
                self.grid.reduce_fertility(cx, cy, 0.07);
                self.organisms[idx].think("food consumed here", self.tick_count);
                self.organisms[idx].log_event(format!("found and ate food at ({},{})", cx, cy));
                self.grid.leave_trail(cx, cy, TrailKind::Food, 2.0);
                self.broadcast_discovery(idx, cx, cy, "food", 8, spatial);
                if self.organisms[idx].infection > 0.01 {
                    self.organisms[idx].infection *= 0.88;
                }
            } else {
                for dx in -1i32..=1 {
                    for dy in -1i32..=1 {
                        let key = (cx + dx, cy + dy);
                        if let Some(v) = self.organisms[idx].food_memory.get_mut(&key) {
                            *v *= 0.15;
                        }
                    }
                }
            }
        } else if action == 9 {
            let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if self.grid.get(cx, cy) == Tile::Water {
                action_succeeded = true;
                *self.water_use.entry((cx, cy)).or_insert(0) += 1;
                self.organisms[idx].hydration = 1.0;
                let room = self.organisms[idx].carry_room();
                let fill = room.min(4) as u8;
                self.organisms[idx].inv_water = self.organisms[idx].inv_water.saturating_add(fill);
                let ms = self.organisms[idx].traits.memory_strength;
                Organism::remember(&mut self.organisms[idx].water_memory, cx, cy, 1.0, ms);
                self.organisms[idx].think("water consumed here", self.tick_count);
                self.organisms[idx].log_event(format!("drank from water at ({},{})", cx, cy));
                self.grid.leave_trail(cx, cy, TrailKind::Water, 2.0);
                self.broadcast_discovery(idx, cx, cy, "water", 8, spatial);
                self.organisms[idx].discover("water");
                if self.organisms[idx].infection > 0.01 {
                    self.organisms[idx].infection *= 0.94;
                }
            } else {
                for dx in -1i32..=1 {
                    for dy in -1i32..=1 {
                        let key = (cx + dx, cy + dy);
                        if let Some(v) = self.organisms[idx].water_memory.get_mut(&key) {
                            *v *= 0.15;
                        }
                    }
                }
            }
        } else if action == 10 {
            signal_reward += social::signal_food(
                idx,
                &mut self.organisms,
                spatial,
                &self.grid,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
        } else if action == 11 {
            let alarm_reward = social::sound_alarm(
                idx,
                &mut self.organisms,
                spatial,
                &self.grid,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
            action_succeeded = alarm_reward > 0.0;
            signal_reward += alarm_reward;
        } else if action == 12 {
            if self.tick_count - self.organisms[idx].last_challenged >= 80 {
                let before = signal_reward;
                signal_reward += social::challenge_stranger(
                    idx,
                    &mut self.organisms,
                    spatial,
                    self.tick_count,
                    &mut self.events,
                    &mut self.history,
                );
                if signal_reward > before {
                    self.organisms[idx].log_event(format!("challenged a stranger near ({},{})", ix, iy));
                }
            } else {
                self.organisms[idx].think("challenging (nobody)", self.tick_count);
            }
        } else if action == 13 {
            let before = signal_reward;
            signal_reward += social::gift_knowledge(
                idx,
                &mut self.organisms,
                spatial,
                self.tick_count,
                &mut self.events,
                &mut self.history,
                &mut self.rng,
            );
            if signal_reward > before {
                self.organisms[idx].log_event(format!("shared knowledge with kin near ({},{})", ix, iy));

                let actor_lid = self.organisms[idx].lineage_id.clone();
                let neg_target: Option<(usize, String)> = spatial
                    .ordered_nearby(&self.organisms, ix as f32, iy as f32, 7)
                    .filter(|(i, o)| *i != idx && o.alive && o.lineage_id != actor_lid)
                    .filter(|(_, o)| (o.x - ix as f32).abs() + (o.y - iy as f32).abs() < 7.0)
                    .filter_map(|(i, o)| {
                        let att = self.organisms[idx].attitude_toward(&o.lineage_id);
                        let trust = *self.organisms[idx].org_trust.get(&o.id).unwrap_or(&0.0);
                        if att > 0.4 && trust > 0.3 {
                            Some((i, o.lineage_id.clone()))
                        } else {
                            None
                        }
                    })
                    .next();

                if let Some((ti, their_lid)) = neg_target {
                    let neg_key = {
                        let (a, b) = (actor_lid.clone(), their_lid.clone());
                        if a < b {
                            (a, b)
                        } else {
                            (b, a)
                        }
                    };
                    let last_neg = *self.lineage_negotiations.get(&neg_key).unwrap_or(&0);
                    if self.tick_count - last_neg >= 6000 {
                        self.lineage_negotiations.insert(neg_key, self.tick_count);
                        let my_disc: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();
                        let their_disc: Vec<String> =
                            self.organisms[ti].discoveries.iter().cloned().collect();
                        let their_name = self.organisms[ti].name.clone();
                        let their_oid = self.organisms[ti].id.clone();
                        let my_kin =
                            living_lineage_members(&self.organisms, lineage_members, &actor_lid).count();
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: actor_lid.clone(),
                                scenario: "negotiation".to_string(),
                                target_lineage: Some(their_lid),
                                target_org_id: Some(their_oid),
                                discoveries: my_disc,
                                other_name: Some(their_name),
                                other_discoveries: their_disc,
                                kin_count: my_kin,
                                ..Default::default()
                            },
                        );
                    }
                }
            }
        } else if action == 14 {
            if self.organisms[idx].carrying == 0 {
                let tile = self.grid.get(ix, iy);
                let rock_near = [
                    (-1, 0),
                    (1, 0),
                    (0, -1),
                    (0, 1),
                    (-1, -1),
                    (1, -1),
                    (-1, 1),
                    (1, 1),
                ]
                .iter()
                .any(|&(dx, dy)| matches!(self.grid.get(ix + dx, iy + dy), Tile::Rock));
                if rock_near {
                    action_succeeded = true;
                    self.organisms[idx].carrying = 200;
                    self.organisms[idx].carrying_type = 2;
                    signal_reward += 0.015;
                    self.organisms[idx].think("gathering stone", self.tick_count);
                    let name = self.organisms[idx].name.clone();
                    if self.organisms[idx].discover("stone") {
                        push_event(&mut self.events, self.tick_count, "build", &name, "found stone");
                    }
                } else if matches!(tile, Tile::Grass | Tile::Food) {
                    action_succeeded = true;
                    self.organisms[idx].carrying = 250;
                    self.organisms[idx].carrying_type = 1;
                    signal_reward += 0.015;
                    self.organisms[idx].think("gathering wood", self.tick_count);
                    self.organisms[idx].discover("wood");
                }
            }
        } else if action == 15 {
            let tile = self.grid.get(ix, iy);
            if self.organisms[idx].carrying > 0
                && self.organisms[idx].carrying_type != 2
                && matches!(
                    tile,
                    Tile::Grass | Tile::Ash | Tile::Food | Tile::Snow | Tile::Sand
                )
            {
                action_succeeded = true;
                self.grid.set(ix, iy, Tile::Campfire);
                *self.grid.fire_intensity_mut(ix, iy) = 1.0;
                self.physics.register_fire(ix, iy);
                self.organisms[idx].carrying = 0;
                self.organisms[idx].carrying_type = 0;
                signal_reward += 0.05;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("tending fire", self.tick_count);
                self.organisms[idx].log_event(format!("lit a fire at ({},{})", ix, iy));
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "build",
                    &name,
                    "lit a campfire",
                );
                if self.organisms[idx].discover("fire") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "discovered fire",
                    );
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: self.organisms[idx].lineage_id.clone(),
                            scenario: "discovery".to_string(),
                            context: "fire".to_string(),
                            discoveries: self.organisms[idx].discoveries.iter().cloned().collect(),
                            ..Default::default()
                        },
                    );
                }
            }
        } else if action == 16 {
            if self.tick_count - self.organisms[idx].last_groomed >= 60 {
                signal_reward += social::groom(
                    idx,
                    &mut self.organisms,
                    spatial,
                    self.tick_count,
                    &mut self.events,
                );
            }
        } else if action == 17 {
            let sheltered = self.organisms[idx].near_shelter(&self.grid, &self.buildings);
            let recovery = if sheltered { 0.045 } else { 0.018 };
            let comfort = if sheltered { 0.055 } else { 0.018 };
            self.organisms[idx].energy = (self.organisms[idx].energy + recovery).min(1.0);
            self.organisms[idx].hydration = (self.organisms[idx].hydration + recovery * 0.35).min(1.0);
            self.organisms[idx].sleep_debt = (self.organisms[idx].sleep_debt - recovery * 1.4).max(0.0);
            self.organisms[idx].comfort = (self.organisms[idx].comfort + comfort).min(1.0);
            self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.015).max(0.0);
            self.organisms[idx].think(
                if sheltered {
                    "resting under shelter"
                } else {
                    "resting in the open"
                },
                self.tick_count,
            );
            signal_reward += if sheltered { 0.012 } else { 0.004 };
            action_succeeded = true;
        } else if action == 18 {
            let tile = self.grid.get(ix, iy);
            match tile {
                Tile::Sand => {
                    if self.rng.random::<f32>() < 0.06 {
                        self.grid.set(ix, iy, Tile::Water);
                        signal_reward += 0.08;
                        let name = self.organisms[idx].name.clone();
                        self.organisms[idx].think("struck water", self.tick_count);
                        self.organisms[idx].log_event(format!("dug a well at ({},{})", ix, iy));
                        push_event(&mut self.events, self.tick_count, "build", &name, "dug a well");
                        if self.organisms[idx].discover("well") {
                            push_event(
                                &mut self.events,
                                self.tick_count,
                                "build",
                                &name,
                                "discovered well-digging",
                            );
                        }
                    } else {
                        self.organisms[idx].think("digging in the sand", self.tick_count);
                        signal_reward += 0.005;
                    }
                }
                Tile::Grass | Tile::Ash => {
                    let fi = WorldGrid::idx(ix, iy);
                    if self.grid.fertility[fi] < 0.85 {
                        self.grid.fertility[fi] = (self.grid.fertility[fi] + 0.03).min(0.9);
                        signal_reward += 0.015;
                        self.organisms[idx].think("tilling the soil", self.tick_count);
                    }
                }
                _ => {}
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.004).max(0.0);
        } else if action == 19 {
            let fi = WorldGrid::idx(ix, iy);
            let fert = self.grid.fertility[fi];
            // Foraging finds what the season grows: plenty in spring, roots
            // and scraps in winter, and little where the land is picked over.
            let season = crate::sim::seasons::forage_season(self.season());
            let picked_over = 1.0 / (1.0 + self.grid.pressure[fi] * 0.6);
            let chance = (0.10 + fert * 0.18) * season * picked_over;
            if matches!(self.grid.get(ix, iy), Tile::Grass) && self.rng.random::<f32>() < chance {
                self.grid.set(ix, iy, Tile::Food);
                self.grid.reduce_fertility(ix, iy, 0.03);
                signal_reward += 0.02;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("foraging wild food", self.tick_count);
                self.organisms[idx].log_event(format!("foraged wild food at ({},{})", ix, iy));
                if self.organisms[idx].discover("foraging") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "learned to forage",
                    );
                }
            } else {
                self.organisms[idx].think("searching the brush", self.tick_count);
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.003).max(0.0);
        } else if action == 20 {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let kin: Vec<usize> = spatial
                .ordered_nearby(&self.organisms, sx, sy, 5)
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 5.0)
                .map(|(i, _)| i)
                .collect();
            if !kin.is_empty() {
                for &ki in &kin {
                    self.organisms[ki].loneliness = (self.organisms[ki].loneliness - 0.10).max(0.0);
                    self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.12).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                }
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.15).max(0.0);
                signal_reward += 0.006 * kin.len().min(5) as f32;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("dancing with kin", self.tick_count);
                push_event(&mut self.events, self.tick_count, "social", &name, "led a dance");
                if self.organisms[idx].discover("dance") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "social",
                        &name,
                        "invented dance",
                    );
                }
            } else {
                self.organisms[idx].think("dancing alone", self.tick_count);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
            }
        } else if action == 21 {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_vocab = self.organisms[idx].vocabulary.clone();
            let listeners: Vec<usize> = spatial
                .ordered_nearby(&self.organisms, sx, sy, 6)
                .filter(|(i, o)| *i != idx && o.alive)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
                .map(|(i, _)| i)
                .collect();
            for &li in &listeners {
                self.organisms[li]
                    .vocabulary
                    .absorb_from(&my_vocab, &mut self.rng);
                self.organisms[li].fear_level = (self.organisms[li].fear_level - 0.05).max(0.0);
                self.organisms[li].comfort = (self.organisms[li].comfort + 0.03).min(1.0);
            }
            self.organisms[idx].think("singing", self.tick_count);
            if !listeners.is_empty() {
                signal_reward += 0.004 * listeners.len().min(6) as f32;
                let name = self.organisms[idx].name.clone();
                if self.organisms[idx].discover("song") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "social",
                        &name,
                        "sang the first song",
                    );
                }
            }
        } else if action == 22 {
            let o = &mut self.organisms[idx];
            o.fear_level = (o.fear_level - 0.06).max(0.0);
            o.boredom = (o.boredom - 0.04).max(0.0);
            o.sleep_debt = (o.sleep_debt - 0.03).max(0.0);
            o.comfort = (o.comfort + 0.04).min(1.0);
            if o.grief_ticks > 0 {
                o.grief_ticks = o.grief_ticks.saturating_sub(2);
            }
            o.think("reflecting quietly", self.tick_count);
            signal_reward += 0.008;
        } else if action == 23 {
            if self.grid.get(ix, iy) == Tile::Food && self.organisms[idx].carry_room() > 0 {
                self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                self.grid.set(ix, iy, Tile::Grass);
                self.grid.reduce_fertility(ix, iy, 0.05);
                signal_reward += 0.01;
                let name = self.organisms[idx].name.clone();
                self.organisms[idx].think("storing food", self.tick_count);
                if self.organisms[idx].discover("food stores") {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "began storing food",
                    );
                }
            }
        } else if action == 24 {
            action_succeeded = true;
            let ms = self.organisms[idx].traits.memory_strength;
            let mut found = 0;
            for dx in -10..=10 {
                for dy in -10..=10 {
                    match self.grid.get(ix + dx, iy + dy) {
                        Tile::Food => {
                            Organism::remember(
                                &mut self.organisms[idx].food_memory,
                                ix + dx,
                                iy + dy,
                                0.6,
                                ms,
                            );
                            found += 1;
                        }
                        Tile::Water => {
                            Organism::remember(
                                &mut self.organisms[idx].water_memory,
                                ix + dx,
                                iy + dy,
                                0.6,
                                ms,
                            );
                            found += 1;
                        }
                        _ => {}
                    }
                }
            }
            self.organisms[idx].think("scouting the area", self.tick_count);
            if found > 0 {
                signal_reward += 0.003;
            }
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.002).max(0.0);
        } else if action == 25 {
            self.grid.leave_trail(ix, iy, TrailKind::Path, 1.5);
            self.grid.add_structure(ix, iy, 0.02);
            self.active_structure_tiles.insert((ix, iy));
            self.organisms[idx].think("marking territory", self.tick_count);
            signal_reward += 0.008;
        } else if action >= 26 {
            if let Some(r) = crate::sim::actions::try_apply(self, idx, action, ix, iy, spatial) {
                action_succeeded = r > 0.0;
                signal_reward += r;
                self.organisms[idx].energy = (self.organisms[idx].energy - 0.0015).max(0.0);
                if action == 288 && action_succeeded {
                    // Caravan payoff is delayed until the destination really
                    // receives the cargo. Preserve the dispatch perception on
                    // this exact shipment so delivery can reinforce the
                    // originating Q-table row, including across save/reload.
                    let sender_id = self.organisms[idx].id.clone();
                    if let Some(caravan) = self.caravans.iter_mut().rev().find(|caravan| {
                        caravan.sender_org_id == sender_id
                            && caravan.departed_tick == self.tick_count
                            && caravan.dispatch_state.is_empty()
                    }) {
                        caravan.dispatch_state = perception.clone();
                    }
                }
            }
        }

        let (cx, cy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let current_tile = self.grid.get(cx, cy);

        if current_tile == Tile::Fire {
            let fire_dmg = 0.08 * (1.5 - self.organisms[idx].traits.resilience);
            let fire_dmg = if night { fire_dmg * 0.5 } else { fire_dmg };
            if night {
                self.organisms[idx].health = (self.organisms[idx].health + 0.0005).min(1.0);
            }
            self.organisms[idx].health = (self.organisms[idx].health - fire_dmg).max(0.0);
            self.organisms[idx].mark_harm(crate::organism::organism::Harm::Fire, self.tick_count);
            self.grid.add_hazard(cx, cy, 0.025);
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].danger_memory, cx, cy, 0.8, ms);
            self.organisms[idx].think("heat dangerous", self.tick_count);
            self.broadcast_discovery(idx, cx, cy, "danger", 12, spatial);
            if self.rng.random::<f32>() < 0.15 * (1.0 - self.organisms[idx].traits.resilience) {
                self.organisms[idx].infection = (self.organisms[idx].infection + 0.02).min(1.0);
            }
        }

        verify_local_resource_memory(&mut self.organisms[idx], &self.grid, cx, cy);
        verify_local_danger_memory(
            &mut self.organisms[idx],
            &self.grid,
            &self.animals,
            animal_spatial,
            spatial_buf,
            cx,
            cy,
        );

        if self.organisms[idx].carrying > 0 {
            self.organisms[idx].carrying -= 1;
            if self.organisms[idx].carrying == 0 {
                self.organisms[idx].carrying_type = 0;
            }
        }

        if self.organisms[idx].carrying > 0 {
            let tile = self.grid.get(cx, cy);
            if matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Ash | Tile::Hut | Tile::Snow | Tile::Sand
            ) {
                let prev_s = self.grid.structure_at(cx, cy);
                let has_masonry = self.organisms[idx].discoveries.contains("masonry");
                let deposit = match (self.organisms[idx].carrying_type, has_masonry) {
                    (2, true) => 0.0090,
                    (2, false) => 0.0060,
                    _ => 0.0035,
                };
                self.grid.add_structure(cx, cy, deposit);
                self.active_structure_tiles.insert((cx, cy));
                let new_s = self.grid.structure_at(cx, cy);
                let name = self.organisms[idx].name.clone();
                if prev_s < 0.35 && new_s >= 0.35 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "build",
                        &name,
                        "a crude shelter took shape",
                    );
                    if self.organisms[idx].discover("shelter") {
                        push_event(
                            &mut self.events,
                            self.tick_count,
                            "build",
                            &name,
                            "understood shelter",
                        );
                        let lid = self.organisms[idx].lineage_id.clone();
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: lid,
                                scenario: "discovery".to_string(),
                                context: "shelter".to_string(),
                                discoveries: self.organisms[idx].discoveries.iter().cloned().collect(),
                                ..Default::default()
                            },
                        );
                    }
                }
            }
        }

        let shelter_strength = {
            let mut s = 0.0f32;
            'sw: for ddx in -3i32..=3 {
                for ddy in -3i32..=3 {
                    let nx = cx + ddx;
                    let ny = cy + ddy;
                    let t = self.grid.get(nx, ny);
                    if t == Tile::Campfire {
                        s = 0.55;
                        break 'sw;
                    }
                    if t == Tile::Hut {
                        s = 0.90;
                        break 'sw;
                    }
                    let st = self.grid.structure_at(nx, ny);
                    if st >= 0.35 {
                        s = s.max(st);
                    }
                }
            }
            s
        };
        if shelter_strength > 0.0 {
            let energy_bonus = 0.0008 + shelter_strength * 0.0022;
            self.organisms[idx].energy = (self.organisms[idx].energy + energy_bonus).min(1.0);

            let health_regen = 0.0006 + shelter_strength * 0.0010;
            self.organisms[idx].health = (self.organisms[idx].health + health_regen).min(1.0);

            if self.organisms[idx].infection > 0.01 {
                let inf_mult = 0.992 - shelter_strength * 0.006;
                self.organisms[idx].infection =
                    (self.organisms[idx].infection * inf_mult.max(0.980)).max(0.0);
            }

            if self.organisms[idx].fear_level > 0.0 {
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level - shelter_strength * 0.008).max(0.0);
            }

            if self.organisms[idx].grief_ticks > 0 && self.rng.random::<f32>() < shelter_strength * 0.12 {
                self.organisms[idx].grief_ticks = self.organisms[idx].grief_ticks.saturating_sub(3);
            }
        }

        if decision_origin.starts_with("boat_") {
            if let Some(thought) = new_thought {
                self.organisms[idx].think(&thought, self.tick_count);
            }
        }

        let shelter_drain_mult = if shelter_strength > 0.0 {
            (1.0 - shelter_strength * 0.35).max(0.65)
        } else {
            1.0
        };
        let mut water_near = false;
        'wn: for ddx in -4i32..=4 {
            for ddy in -4i32..=4 {
                if self.grid.get(cx + ddx, cy + ddy) == Tile::Water {
                    water_near = true;
                    break 'wn;
                }
            }
        }
        let hydration_mult = if water_near { 0.5 } else { 1.0 };

        self.organisms[idx].energy = (self.organisms[idx].energy - 0.0022 * shelter_drain_mult).max(0.0);
        self.organisms[idx].hydration = (self.organisms[idx].hydration - 0.0014 * hydration_mult).max(0.0);

        let (used_food_reserve, _) = use_needed_reserves(&mut self.organisms[idx], self.tick_count);
        if used_food_reserve {
            self.organisms[idx].think("eating stored food", self.tick_count);
        }
        self.apply_water_fatigue(idx, cx, cy);
        if night {
            let has_torch = self.organisms[idx].discoveries.contains("torch");
            let night_base = if has_torch { 0.0002 } else { 0.0005 };
            let night_drain = night_base * shelter_drain_mult;
            self.organisms[idx].energy = (self.organisms[idx].energy - night_drain).max(0.0);
        }

        // Winters are cold and summers warm; shelter softens both.
        let temp = self.grid.temp_at(cx, cy) + self.season_temperature_now();
        let resilience = self.organisms[idx].traits.resilience;
        if !(10.0..=30.0).contains(&temp) {
            let stress = if temp < 10.0 {
                (10.0 - temp) / 40.0
            } else {
                (temp - 30.0) / 70.0
            };
            let temp_shelter = 1.0 - shelter_strength * 0.60;
            let drain = stress * 0.003 * (1.1 - resilience * 0.2) * temp_shelter;
            self.organisms[idx].energy = (self.organisms[idx].energy - drain).max(0.0);
            if temp > 40.0 {
                self.organisms[idx].hydration = (self.organisms[idx].hydration - drain * 0.5).max(0.0);
            }
        }
        let inf = self.organisms[idx].infection;
        if inf > 0.01 {
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.001 * inf).max(0.0);
            if inf > 0.6 {
                self.organisms[idx].health = (self.organisms[idx].health - 0.001 * (inf - 0.6)).max(0.0);
                self.organisms[idx].mark_harm(crate::organism::organism::Harm::Sickness, self.tick_count);
            }
            let thought = self.organisms[idx].thought.clone();
            if inf > 0.25
                && matches!(
                    thought.as_str(),
                    "exploring" | "observing" | "satisfied" | "on path"
                )
            {
                self.organisms[idx].think("feeling weak", self.tick_count);
            }
            // Decay happens once, in the `med_mult` block below, which
            // already defaults to 0.997. Applying it here as well made
            // untreated infection recover at 0.997^2 and shifted every
            // medicine tier by the extra factor.
        }

        if self.organisms[idx].infection > 0.01 {
            let d = &self.organisms[idx].discoveries;
            let med_mult = if d.contains("antibiotics") {
                0.970
            } else if d.contains("alchemy") {
                0.982
            } else if d.contains("medicine") || d.contains("medicine_lore") {
                0.988
            } else if d.contains("poultice") || d.contains("herbalism") {
                0.992
            } else {
                0.997
            };
            self.organisms[idx].infection = (self.organisms[idx].infection * med_mult).max(0.0);
        }

        if self.organisms[idx].inv_water >= 2 && self.tick_count % 7 == (idx as u64 % 7) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let recipient = spatial
                .ordered_nearby(&self.organisms, sx, sy, 3)
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.hydration < 0.30)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() < 2.5)
                .min_by(|a, b| {
                    a.1.hydration
                        .partial_cmp(&b.1.hydration)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(i, _)| i);
            if let Some(ri) = recipient {
                self.organisms[idx].inv_water -= 1;
                self.organisms[ri].hydration = (self.organisms[ri].hydration + 0.22).min(1.0);
                let recipient_id = self.organisms[ri].id.clone();
                let donor_id = self.organisms[idx].id.clone();
                self.organisms[idx].think("sharing water", self.tick_count);
                self.organisms[ri].think("watered by kin", self.tick_count);
                let cur = self.organisms[idx]
                    .org_trust
                    .get(&recipient_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[idx]
                    .org_trust
                    .insert(recipient_id, (cur + 0.03).min(1.0));
                let r_cur = self.organisms[ri]
                    .org_trust
                    .get(&donor_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[ri]
                    .org_trust
                    .insert(donor_id, (r_cur + 0.10).min(1.0));
                self.organisms[ri].comfort = (self.organisms[ri].comfort + 0.03).min(1.0);
                self.history.gifts_total += 1;
            }
        }

        if night && self.tick_count % 17 == (idx as u64 % 17) {
            let (sx, sy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-2i32..=2).any(|ddx| {
                (-2i32..=2)
                    .any(|ddy| matches!(self.grid.get(sx + ddx, sy + ddy), Tile::Campfire | Tile::Fire))
            });
            if near_fire {
                let lid = self.organisms[idx].lineage_id.clone();
                let (fx, fy) = (self.organisms[idx].x, self.organisms[idx].y);
                let listener = spatial
                    .ordered_nearby(&self.organisms, fx, fy, 4)
                    .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.age < 1800)
                    .filter(|(_, o)| (o.x - fx).abs() + (o.y - fy).abs() < 3.5)
                    .min_by_key(|(_, o)| o.age)
                    .map(|(i, _)| i);
                if let Some(li) = listener {
                    let ms = self.organisms[li].traits.memory_strength;
                    let food_hints: Vec<((i32, i32), f32)> = self.organisms[idx]
                        .food_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.5)
                        .take(2)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    let water_hints: Vec<((i32, i32), f32)> = self.organisms[idx]
                        .water_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.5)
                        .take(2)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    for ((x, y), v) in food_hints {
                        Organism::remember(&mut self.organisms[li].food_memory, x, y, v * 0.3, ms);
                    }
                    for ((x, y), v) in water_hints {
                        Organism::remember(&mut self.organisms[li].water_memory, x, y, v * 0.3, ms);
                    }
                    self.organisms[li].think("listening by the fire", self.tick_count);

                    let story_source = self.organisms[idx]
                        .memories
                        .pick_for_reflection(Some(true))
                        .map(|m| (m.kind, m.text.clone(), m.emotion));
                    if let Some((kind, text, emotion)) = story_source {
                        let teller_name = self.organisms[idx].name.clone();
                        let listener_o = &mut self.organisms[li];
                        let lower = text.trim_end_matches('.').to_lowercase();
                        let retold = format!("{} told me — {}", teller_name, lower);
                        use crate::organism::memory::{MemoryEntry, MemoryKind};
                        let listener_kind = match kind {
                            MemoryKind::Core => MemoryKind::Fact,
                            MemoryKind::Bond => MemoryKind::Episode,
                            other => other,
                        };
                        let entry = MemoryEntry::new(listener_kind, retold, self.tick_count)
                            .with_salience(0.55)
                            .with_emotion(emotion.clamp(-2, 2));
                        listener_o.memories.insert(entry);
                        listener_o.comfort = (listener_o.comfort + 0.01).min(1.0);
                        listener_o.literacy = (listener_o.literacy + 0.0015).min(1.0);
                    }
                }
            }
        }

        if self.organisms[idx].energy > 0.75 && self.tick_count % 5 == (idx as u64 % 5) {
            let lid = self.organisms[idx].lineage_id.clone();
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let recipient = spatial
                .ordered_nearby(&self.organisms, sx, sy, 3)
                .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid && o.energy < 0.30)
                .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() < 2.5)
                .min_by(|a, b| {
                    a.1.energy
                        .partial_cmp(&b.1.energy)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(i, _)| i);
            if let Some(ri) = recipient {
                self.organisms[idx].energy = (self.organisms[idx].energy - 0.10).max(0.40);
                self.organisms[ri].energy = (self.organisms[ri].energy + 0.16).min(1.0);
                let recipient_id = self.organisms[ri].id.clone();
                let donor_id = self.organisms[idx].id.clone();
                let donor_name = self.organisms[idx].name.clone();
                self.organisms[idx].think("sharing food", self.tick_count);
                self.organisms[ri].think("fed by kin", self.tick_count);
                let cur = self.organisms[idx]
                    .org_trust
                    .get(&recipient_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[idx]
                    .org_trust
                    .insert(recipient_id, (cur + 0.04).min(1.0));
                let r_cur = self.organisms[ri]
                    .org_trust
                    .get(&donor_id)
                    .copied()
                    .unwrap_or(0.0);
                self.organisms[ri]
                    .org_trust
                    .insert(donor_id, (r_cur + 0.12).min(1.0));
                self.organisms[ri].comfort = (self.organisms[ri].comfort + 0.04).min(1.0);
                self.organisms[ri].joy_ticks = (self.organisms[ri].joy_ticks + 30).min(1200);
                self.organisms[idx].joy_ticks = (self.organisms[idx].joy_ticks + 15).min(1200);
                self.history.gifts_total += 1;
                if self.rng.random::<f32>() < 0.10 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "gift",
                        &donor_name,
                        "shared food with starving kin",
                    );
                }
            }
        }

        if self.organisms[idx].discoveries.contains("trap") {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_trail = self.grid.detect_trail(cx2, cy2, TrailKind::Food, 3);
            if food_trail > 0.45 && self.rng.random::<f32>() < 0.0025 {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.14).min(1.0);
                self.organisms[idx].think("trap caught something", self.tick_count);
                let name = self.organisms[idx].name.clone();
                push_event(&mut self.events, self.tick_count, "hunt", &name, "trap catch");
            }
        }

        if night && self.organisms[idx].discoveries.contains("ritual") {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-3i32..=3)
                .any(|ddx| (-3i32..=3).any(|ddy| self.grid.get(cx2 + ddx, cy2 + ddy) == Tile::Campfire));
            if near_fire {
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.003).min(1.0);
                self.organisms[idx].loneliness = (self.organisms[idx].loneliness - 0.005).max(0.0);
            }
        }

        {
            use crate::world::tiles::Biome;
            let biome = self
                .grid
                .biome_at(self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let pathogen_rate = match biome {
                Biome::Wetland => 0.00050,
                Biome::Volcanic => 0.00020,
                _ => 0.00012,
            };
            if self.organisms[idx].infection < 0.05 && self.rng.random::<f32>() < pathogen_rate {
                self.organisms[idx].infection = 0.35 * (1.0 - self.organisms[idx].traits.resilience * 0.4);
            }
        }

        if self.organisms[idx].infection < 0.8 {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let spreaders: Vec<(f32, f32, f32)> = spatial
                .query(sx as i32, sy as i32, 2)
                .into_iter()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.infection >= 0.15 && (o.x - sx).abs() + (o.y - sy).abs() <= 2.0
                })
                .map(|i| (self.organisms[i].infection, 0.0, 0.0))
                .collect();
            let res = self.organisms[idx].traits.resilience;
            let prev_inf = self.organisms[idx].infection;
            for (other_inf, _, _) in spreaders {
                let spread = 0.015 * other_inf * (1.0 - res * 0.8);
                self.organisms[idx].infection = (self.organisms[idx].infection + spread).min(1.0);
            }
            if prev_inf < 0.15 && self.organisms[idx].infection >= 0.15 {
                self.history.sickness_events += 1;
            }
        }

        let senescence_start = if self.organisms[idx].max_age > 0 {
            (self.organisms[idx].max_age as f32 * 0.65) as u32
        } else {
            u32::MAX
        };
        let well_nourished = self.organisms[idx].energy > 0.6 && self.organisms[idx].hydration > 0.6;
        if well_nourished && current_tile != Tile::Fire && self.organisms[idx].infection < 0.3 {
            let regen = if self.organisms[idx].age < senescence_start {
                0.001
            } else {
                0.0003
            };
            self.organisms[idx].health = (self.organisms[idx].health + regen).min(1.0);
        }
        if self.organisms[idx].max_age > 0 && self.organisms[idx].age > senescence_start {
            let decline = ((self.organisms[idx].age - senescence_start) as f32
                / (self.organisms[idx].max_age - senescence_start).max(1) as f32)
                .min(1.0);
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.001 * decline).max(0.0);
        }

        self.organisms[idx].age += 1;
        if self.organisms[idx].age.is_multiple_of(100) {
            self.organisms[idx].decay_memory(self.tick_count);
        }

        if self.organisms[idx].nursing_until > self.tick_count {
            if self.organisms[idx].energy < 0.85 {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.012).min(1.0);
            }
            if self.organisms[idx].hydration < 0.85 {
                self.organisms[idx].hydration = (self.organisms[idx].hydration + 0.010).min(1.0);
            }
        }

        let mut reward = (self.organisms[idx].energy - prev_energy) * 2.0
            + (self.organisms[idx].hydration - prev_hydration) * 2.0;
        reward += reserve_inventory_feedback(
            prev_energy,
            prev_hydration,
            prev_inv_food,
            prev_inv_water,
            &self.organisms[idx],
        );
        if current_tile == Tile::Fire {
            reward -= 0.5;
        }

        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let lineage = self.organisms[idx].lineage_id.clone();
        let soc = self.organisms[idx].traits.social_tendency;
        let kin_count = spatial
            .query(ox as i32, oy as i32, 4)
            .into_iter()
            .filter(|&i| {
                if i == idx {
                    return false;
                }
                let o = &self.organisms[i];
                o.alive && o.lineage_id == lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 4.0
            })
            .count();
        reward += 0.004 * (kin_count.min(1) as f32) * (0.5 + soc);

        let crowding = spatial
            .query(ox as i32, oy as i32, 3)
            .into_iter()
            .filter(|&i| {
                if i == idx {
                    return false;
                }
                let o = &self.organisms[i];
                o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
            })
            .count();
        if crowding > 2 {
            let excess = (crowding - 2) as f32;
            reward -= 0.006 * excess * excess;
        }

        if self.organisms[idx].infection < 0.10 && self.organisms[idx].health > 0.4 {
            let healer_bonus = if self.organisms[idx].specialty.as_deref() == Some("healer")
                || self.organisms[idx].specialty.as_deref() == Some("doctor")
                || self.organisms[idx].aspiration == "healer"
            {
                3.0
            } else {
                1.0
            };
            let resilience = self.organisms[idx].traits.resilience;
            if resilience > 0.4 || healer_bonus > 1.0 {
                let sick_kin: Vec<usize> = spatial
                    .query(ox as i32, oy as i32, 3)
                    .into_iter()
                    .filter(|&i| {
                        if i == idx {
                            return false;
                        }
                        let o = &self.organisms[i];
                        o.alive
                            && o.lineage_id == lineage
                            && o.infection > 0.20
                            && (o.x - ox).abs() + (o.y - oy).abs() <= 2.5
                    })
                    .collect();
                if !sick_kin.is_empty() {
                    let care_strength = 0.004 * healer_bonus * (0.5 + resilience);
                    for &ki in &sick_kin {
                        self.organisms[ki].infection =
                            (self.organisms[ki].infection - care_strength).max(0.0);
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.002).min(1.0);
                    }
                    reward += 0.012 * healer_bonus;
                    if self.organisms[idx].thought.is_empty()
                        || self.organisms[idx].thought == "observing"
                        || self.organisms[idx].thought == "exploring"
                    {
                        self.organisms[idx].think("tending to the sick", self.tick_count);
                    }
                }
            }
        }

        spatial.query_into(ox as i32, oy as i32, 6, spatial_buf);
        spatial_buf.sort_unstable();
        let att_adjustments: Vec<(usize, f32)> = spatial_buf
            .iter()
            .copied()
            .filter(|&i| {
                let o = &self.organisms[i];
                i != idx && o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 4.0
            })
            .map(|i| {
                (
                    i,
                    self.organisms[idx].attitude_toward(&self.organisms[i].lineage_id),
                )
            })
            .collect();
        for (_, att) in &att_adjustments {
            if *att >= 0.25 {
                reward += 0.003;
            } else {
                reward -= 0.002;
            }
        }
        for (i, att) in att_adjustments {
            if att >= 0.25 {
                let lid = self.organisms[i].lineage_id.clone();
                self.organisms[idx].update_attitude(&lid, 0.001);
                if self.rng.random::<f32>() < 0.04 {
                    let to_share: Vec<((i32, i32), f32)> = self.organisms[i]
                        .food_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.4)
                        .take(1)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    let ms = self.organisms[idx].traits.memory_strength;
                    for ((x, y), v) in to_share {
                        Organism::remember(&mut self.organisms[idx].food_memory, x, y, v * 0.12, ms);
                    }
                }
            }
        }

        // The wellbeing reward uses the tick-start lineage snapshot. Reading
        // every relative here makes dense lineages quadratic in population;
        // a shared snapshot also avoids making the reward depend on which
        // relative happened to act earlier in this tick. A lineage formed
        // mid-tick has no snapshot yet, so use its live members once.
        let (kin_sum, kin_count) = self
            .lineage_aggregates
            .get(&lineage)
            .map(|stats| (stats.energy_sum, stats.population))
            .unwrap_or_else(|| {
                living_lineage_members(&self.organisms, lineage_members, &lineage)
                    .fold((0.0f32, 0usize), |(sum, count), org| {
                        (sum + org.energy, count + 1)
                    })
            });
        if kin_count >= 3 && self.organisms[idx].energy > 0.4 {
            let avg = kin_sum / kin_count as f32;
            reward += 0.003 * (avg - 0.5).max(0.0);
        }

        reward += signal_reward;
        reward += movement_reward;

        let loneliness = self.organisms[idx].loneliness;
        let boredom = self.organisms[idx].boredom;
        let comfort = self.organisms[idx].comfort;
        if loneliness > 0.5 && signal_reward > 0.0 {
            reward += loneliness * 0.015;
        }
        if boredom > 0.4 && matches!(action, 14 | 15 | 16 | 0..=7) {
            reward += boredom * 0.008;
        }
        if comfort > 0.75 {
            reward += (comfort - 0.75) * 0.01;
        }

        let aligned_strategy = {
            let lineage_id = self.organisms[idx].lineage_id.clone();
            self.lineage_strategies
                .get(&lineage_id)
                .filter(|(strategy, expiry)| {
                    action_succeeded
                        && !matches!(action, 287..=289 | 2704)
                        && *expiry > self.tick_count
                        && directive_aligns_action(strategy, action)
                })
                .map(|(strategy, _)| {
                    let bonus = match strategy.as_str() {
                        "hunt" | "trade" | "defend" => 0.008,
                        "explore" | "settle" => 0.006,
                        _ => 0.0,
                    };
                    (lineage_id, strategy.clone(), bonus)
                })
        };
        if let Some((lineage_id, strategy, bonus)) = aligned_strategy {
            reward += bonus;
            self.record_strategy_progress(&lineage_id, &strategy);
        }

        let next_perception = self.organisms[idx].perceive_into(
            &self.grid,
            &self.organisms,
            night,
            animal_near,
            spatial,
            perception_buf,
        );
        let next_ix = self.organisms[idx].x as i32;
        let next_iy = self.organisms[idx].y as i32;
        crate::sim::actions::available_actions_into(
            self,
            idx,
            next_ix,
            next_iy,
            spatial,
            available_buf,
            spatial_buf,
        );
        self.organisms[idx].learn_with_available_actions(
            &perception,
            action,
            reward,
            &next_perception,
            Some(available_buf),
        );

        if self.organisms[idx].energy > 0.7 && self.organisms[idx].hydration > 0.7 {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let neighbour_idxs = spatial.query(ox as i32, oy as i32, 3);
            let nearby_kin = neighbour_idxs
                .iter()
                .copied()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id == lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                })
                .count();
            let nearby_stranger_count = neighbour_idxs
                .iter()
                .copied()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                })
                .count();
            let thought = self.organisms[idx].thought.clone();
            if nearby_kin >= 1 && matches!(thought.as_str(), "exploring" | "observing" | "satisfied") {
                self.organisms[idx].think("socializing", self.tick_count);
                social::social_knowledge_share(
                    idx,
                    &mut self.organisms,
                    spatial,
                    self.tick_count,
                    &mut self.rng,
                );
            } else if nearby_stranger_count >= 1
                && matches!(
                    thought.as_str(),
                    "exploring" | "observing" | "satisfied" | "wary" | "coexisting peacefully"
                )
            {
                let nearest_lid: Option<String> = spatial
                    .ordered_nearby(&self.organisms, ox, oy, 3)
                    .map(|(_, o)| o)
                    .filter(|o| {
                        o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                    })
                    .min_by(|a, b| {
                        let da = (a.x - ox).abs() + (a.y - oy).abs();
                        let db = (b.x - ox).abs() + (b.y - oy).abs();
                        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|o| o.lineage_id.clone());
                if let Some(lid) = nearest_lid {
                    if self.organisms[idx].attitude_toward(&lid) >= 0.25 {
                        self.organisms[idx].think("coexisting peacefully", self.tick_count);
                        if self.tick_count % 60 == (idx as u64 % 60) {
                            social::social_knowledge_share(
                                idx,
                                &mut self.organisms,
                                spatial,
                                self.tick_count,
                                &mut self.rng,
                            );
                        }
                    } else {
                        self.organisms[idx].think("wary", self.tick_count);
                    }
                }
            } else if matches!(thought.as_str(), "exploring" | "observing") {
                self.organisms[idx].think("satisfied", self.tick_count);
            }
        }

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);

            let unknown_lid =
                crate::sim::spatial::first_unknown_nearby_lineage(&self.organisms, idx, spatial, spatial_buf);
            if let Some(stranger_lid) = unknown_lid {
                self.organisms[idx]
                    .lineage_attitudes
                    .insert(stranger_lid.clone(), 0.001);
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: self.organisms[idx].id.clone(),
                        org_name: self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario: "first_contact".to_string(),
                        target_lineage: Some(stranger_lid),
                        kin_count: 0,
                        energy_avg: self.organisms[idx].energy,
                        ..Default::default()
                    },
                );
            }

            let last_council = *self.lineage_last_council.get(&my_lid).unwrap_or(&0);
            if self.tick_count - last_council >= 6000 {
                let (kin_sum, kin_count) = living_lineage_members(&self.organisms, lineage_members, &my_lid)
                    .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 6.0)
                    .fold((0.0f32, 0u32), |(s, n), o| (s + o.energy, n + 1));
                if kin_count >= 5 {
                    let avg = kin_sum / kin_count as f32;
                    if avg > 0.7 {
                        let (elder_name, elder_ctx) = {
                            if let Some(eid) = self.lineage_elders.get(&my_lid) {
                                let eid = eid.clone();
                                if let Some(e) = org_idx_by_id
                                    .get(&eid)
                                    .map(|&i| &self.organisms[i])
                                    .filter(|o| o.alive)
                                {
                                    let ctx = format!(
                                        "age:{} gen:{} memories:{}",
                                        e.age,
                                        e.generation,
                                        e.danger_memory.len() + e.food_memory.len()
                                    );
                                    (e.name.clone(), ctx)
                                } else {
                                    let o = &self.organisms[idx];
                                    (o.name.clone(), String::new())
                                }
                            } else {
                                let o = &self.organisms[idx];
                                (o.name.clone(), String::new())
                            }
                        };
                        self.lineage_last_council.insert(my_lid.clone(), self.tick_count);
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: elder_name,
                                lineage_id: my_lid.clone(),
                                scenario: "council".to_string(),
                                kin_count: kin_count as usize,
                                energy_avg: avg,
                                context: elder_ctx,
                                ..Default::default()
                            },
                        );
                    }
                }
            }

            {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let energy = self.organisms[idx].energy;
                let hydration = self.organisms[idx].hydration;
                let tick = self.tick_count;

                if energy < 0.25
                    && hydration < 0.25
                    && self.organisms[idx].think_ready("survival_crisis", tick, 600)
                {
                    self.organisms[idx].mark_thought("survival_crisis", tick);
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "survival_crisis".to_string(),
                            energy_avg: energy,
                            context: format!("energy={:.0}% water={:.0}%", energy * 100.0, hydration * 100.0),
                            ..Default::default()
                        },
                    );
                } else if energy > 0.85
                    && hydration > 0.85
                    && self.organisms[idx].think_ready("abundance", tick, 2400)
                {
                    let kin_count = living_lineage_members(&self.organisms, lineage_members, &my_lid).count();
                    self.organisms[idx].mark_thought("abundance", tick);
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "abundance".to_string(),
                            kin_count,
                            energy_avg: energy,
                            ..Default::default()
                        },
                    );
                }

                if self.organisms[idx].think_ready("threat", tick, 800) {
                    let (hostile_near, kin_near) = {
                        let org = &self.organisms[idx];
                        let hostile = spatial
                            .ordered_nearby(&self.organisms, ox2, oy2, 8)
                            .map(|(_, o)| o)
                            .filter(|o| o.alive && o.lineage_id != org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .any(|o| org.attitude_toward(&o.lineage_id) < -0.3);
                        let kin = spatial
                            .ordered_nearby(&self.organisms, ox2, oy2, 8)
                            .map(|(_, o)| o)
                            .filter(|o| o.alive && o.lineage_id == org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .count();
                        (hostile, kin)
                    };
                    if hostile_near {
                        self.organisms[idx].mark_thought("threat", tick);
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: my_lid.clone(),
                                scenario: "threat".to_string(),
                                kin_count: kin_near,
                                energy_avg: energy,
                                ..Default::default()
                            },
                        );
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.organisms[idx].think_ready("moral_dilemma", self.tick_count, 1500)
                && self.organisms[idx].energy < 0.18
            {
                let _ = last_think;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_partner = self.organisms[idx].partner_id.clone();
                let tempting = spatial
                    .ordered_nearby(&self.organisms, ox2, oy2, 4)
                    .map(|(_, o)| o)
                    .find(|o| {
                        o.alive
                            && o.id != self.organisms[idx].id
                            && o.inv_food > 0
                            && o.lineage_id != my_lid
                            && Some(&o.id) != my_partner.as_ref()
                            && (o.x - ox2).abs() + (o.y - oy2).abs() <= 4.0
                    })
                    .map(|o| o.name.clone());
                if let Some(other_name) = tempting {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "moral_dilemma".to_string(),
                            energy_avg: self.organisms[idx].energy,
                            context: format!("starving, nearby {} carries food", other_name),
                            ..Default::default()
                        },
                    );
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 1500 {
                if let Some(partner_id) = self.organisms[idx].partner_id.clone() {
                    let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                    let my_id = self.organisms[idx].id.clone();
                    let my_sex = self.organisms[idx].sex;
                    let partner = org_idx_by_id
                        .get(&partner_id)
                        .map(|&i| &self.organisms[i])
                        .filter(|o| o.alive && (o.x - ox2).abs() + (o.y - oy2).abs() <= 5.0)
                        .map(|o| (o.name.clone(), o.x, o.y));
                    if let Some((partner_name, px, py)) = partner {
                        let third = spatial
                            .ordered_nearby(&self.organisms, px, py, 5)
                            .map(|(_, o)| o)
                            .find(|o| {
                                o.alive
                                    && o.id != my_id
                                    && o.id != partner_id
                                    && o.sex != my_sex
                                    && (o.x - px).abs() + (o.y - py).abs() <= 5.0
                            })
                            .map(|o| o.name.clone());
                        if let Some(third_name) = third {
                            self.organisms[idx].last_think_tick = self.tick_count;
                            self.push_think_for(
                                idx,
                                ThinkTrigger {
                                    org_id: self.organisms[idx].id.clone(),
                                    org_name: self.organisms[idx].name.clone(),
                                    lineage_id: my_lid.clone(),
                                    scenario: "jealousy".to_string(),
                                    energy_avg: self.organisms[idx].energy,
                                    context: format!("{} lingers near {}", third_name, partner_name),
                                    ..Default::default()
                                },
                            );
                        }
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 2400 {
                use crate::organism::organism::Sex;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_id = self.organisms[idx].id.clone();
                let my_sex = self.organisms[idx].sex;
                let my_age = self.organisms[idx].age;
                let my_eng = self.organisms[idx].energy;
                if my_sex == Sex::Male && my_age > 1200 && my_eng > 0.4 {
                    let rival = spatial
                        .ordered_nearby(&self.organisms, ox2, oy2, 6)
                        .map(|(_, o)| o)
                        .find(|o| {
                            o.alive
                                && o.id != my_id
                                && o.sex == Sex::Male
                                && o.lineage_id == my_lid
                                && o.age > 1200
                                && o.energy > 0.4
                                && (o.x - ox2).abs() + (o.y - oy2).abs() <= 6.0
                        })
                        .map(|o| o.name.clone());
                    if let Some(other_name) = rival {
                        self.organisms[idx].last_think_tick = self.tick_count;
                        self.push_think_for(
                            idx,
                            ThinkTrigger {
                                org_id: self.organisms[idx].id.clone(),
                                org_name: self.organisms[idx].name.clone(),
                                lineage_id: my_lid.clone(),
                                scenario: "rivalry".to_string(),
                                energy_avg: my_eng,
                                context: format!("brother {} threatens", other_name),
                                ..Default::default()
                            },
                        );
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 8000
                && self.organisms[idx].age > 2000
                && self.organisms[idx].energy < 0.30
                && self.drought.active
            {
                self.organisms[idx].last_think_tick = self.tick_count;
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: self.organisms[idx].id.clone(),
                        org_name: self.organisms[idx].name.clone(),
                        lineage_id: my_lid.clone(),
                        scenario: "migration_urge".to_string(),
                        energy_avg: self.organisms[idx].energy,
                        context: "land starves; old paths fail".to_string(),
                        ..Default::default()
                    },
                );
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 2400 {
                let loneliness = self.organisms[idx].loneliness;
                let boredom = self.organisms[idx].boredom;
                let energy = self.organisms[idx].energy;

                if loneliness > 0.78 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "lonely".to_string(),
                            energy_avg: energy,
                            ..Default::default()
                        },
                    );
                } else if boredom > 0.72 && energy > 0.75 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "restless".to_string(),
                            energy_avg: energy,
                            ..Default::default()
                        },
                    );
                }
            }

            let season_now = self.season();
            if scarcity_driven_migration_season(season_now) {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let last_think_m = self.organisms[idx].last_think_tick;
                let food_nearby = (-6i32..=6).any(|ddx| {
                    (-6i32..=6).any(|ddy| self.grid.get(ox2 as i32 + ddx, oy2 as i32 + ddy) == Tile::Food)
                });
                if !food_nearby && self.tick_count - last_think_m >= 8000 {
                    let kin_count = living_lineage_members(&self.organisms, lineage_members, &my_lid).count();
                    self.organisms[idx].last_think_tick = self.tick_count;
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "migration".to_string(),
                            kin_count,
                            energy_avg: self.organisms[idx].energy,
                            context: format!("season={} food_scarce=true", season_now),
                            ..Default::default()
                        },
                    );
                }
            }

            if self.tick_count - self.organisms[idx].last_invention_tick >= 5000
                && self.organisms[idx].age > 400
            {
                let disc = &self.organisms[idx].discoveries;
                let candidates = invention_candidates(disc);
                if !candidates.is_empty() {
                    self.organisms[idx].last_invention_tick = self.tick_count;
                    let disc_vec: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();
                    let life_top: Vec<String> = self.organisms[idx]
                        .life_log
                        .iter()
                        .rev()
                        .take(3)
                        .map(|e| e.text.clone())
                        .collect();
                    self.push_think_for(
                        idx,
                        ThinkTrigger {
                            org_id: self.organisms[idx].id.clone(),
                            org_name: self.organisms[idx].name.clone(),
                            lineage_id: my_lid.clone(),
                            scenario: "invention".to_string(),
                            discoveries: disc_vec,
                            life_log_top: life_top,
                            context: candidates.join(", "),
                            ..Default::default()
                        },
                    );
                }
            }

            if night
                && !self.organisms[idx].has_reflected
                && self.organisms[idx].age > 800
                && self.organisms[idx].life_log.len() >= 4
            {
                self.organisms[idx].has_reflected = true;
                let life_top: Vec<String> = self.organisms[idx]
                    .life_log
                    .iter()
                    .take(5)
                    .map(|e| e.text.clone())
                    .collect();
                let org = &self.organisms[idx];
                let emotional = format!(
                    "fear={:.1} comfort={:.1} lonely={:.1}",
                    org.fear_level, org.comfort, org.loneliness
                );
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: org.id.clone(),
                        org_name: org.name.clone(),
                        lineage_id: org.lineage_id.clone(),
                        scenario: "reflection".to_string(),
                        life_log_top: life_top,
                        emotional_state: emotional,
                        ..Default::default()
                    },
                );
            }
        }

        if self.organisms[idx].energy > 0.82 && self.tick_count - self.organisms[idx].last_fed_kin >= 180 {
            social::share_food(
                idx,
                &mut self.organisms,
                spatial,
                self.tick_count,
                &mut self.events,
            );
        }

        // Any organism with knowledge can teach nearby kin - not just elders.
        // Stagger by idx so not all organisms try to teach on the same tick.
        let can_teach = !self.organisms[idx].discoveries.is_empty() || self.organisms[idx].is_elder;
        if can_teach && self.tick_count % 120 == (idx as u64 % 120) {
            social::teach(
                idx,
                &mut self.organisms,
                spatial,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
        }

        if self.tick_count % 2000 == (idx as u64 % 2000) {
            {
                let org = &mut self.organisms[idx];
                if org.danger_memory.len() > 15 {
                    org.traits.aggression = (org.traits.aggression + 0.005).min(1.0);
                    org.traits.fear = (org.traits.fear + 0.003).min(1.0);
                }
                let social_success = org.lineage_attitudes.values().filter(|&&v| v > 0.3).count();
                if social_success >= 2 {
                    org.traits.social_tendency = (org.traits.social_tendency + 0.005).min(1.0);
                }
                if org.food_memory.len() > 20 {
                    org.traits.curiosity = (org.traits.curiosity + 0.003).min(1.0);
                }
                if org.health < 0.4 {
                    org.traits.resilience = (org.traits.resilience + 0.004).min(1.0);
                }
            }
            check_earned_attributes(&mut self.organisms[idx]);
        }

        let season = self.season();
        if scarcity_driven_migration_season(season) {
            let (ox2, oy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_near = (-8i32..=8)
                .any(|ddx| (-8i32..=8).any(|ddy| self.grid.get(ox2 + ddx, oy2 + ddy) == Tile::Food));
            if !food_near
                && self.organisms[idx].food_memory.len() < 8
                && self.rng.random::<f32>() < 0.0015
                && self.organisms[idx].wander_target.is_none()
                && self.organisms[idx].energy > 0.4
            {
                let hash = self.tick_count ^ idx as u64;
                let tx = (ox2 + ((hash % 40) as i32 - 20)).clamp(5, WIDTH as i32 - 5);
                let ty = (oy2 + ((hash / 40 % 30) as i32 - 15)).clamp(5, HEIGHT as i32 - 5);
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].think("migrating for food", self.tick_count);
            }
        }

        {
            let last_think = self.organisms[idx].last_think_tick;
            if self.organisms[idx].infection > 0.5 && self.tick_count - last_think >= 1200 {
                self.organisms[idx].last_think_tick = self.tick_count;
                let energy = self.organisms[idx].energy;
                let lid = self.organisms[idx].lineage_id.clone();
                self.push_think_for(
                    idx,
                    ThinkTrigger {
                        org_id: self.organisms[idx].id.clone(),
                        org_name: self.organisms[idx].name.clone(),
                        lineage_id: lid,
                        scenario: "illness".to_string(),
                        energy_avg: energy,
                        context: format!("infection={:.0}%", self.organisms[idx].infection * 100.0),
                        ..Default::default()
                    },
                );
            }
        }

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let partner_pos = org_idx_by_id.get(pid).copied();
            let dead = partner_pos.map(|p| !self.organisms[p].alive).unwrap_or(true);
            if dead {
                let partner_name = partner_pos
                    .map(|p| self.organisms[p].name.clone())
                    .or_else(|| {
                        self.organisms
                            .iter()
                            .find(|o| &o.id == pid)
                            .map(|o| o.name.clone())
                    })
                    .unwrap_or_else(|| "partner".to_string());
                let tc = self.tick_count;
                let pid_owned = pid.clone();
                self.organisms[idx].partner_id = None;
                self.organisms[idx].grief_ticks = (self.organisms[idx].grief_ticks + 120).min(300);
                self.organisms[idx].log_life_rel(
                    tc,
                    "loss",
                    format!("lost my beloved {}", partner_name),
                    Some(pid_owned),
                    Some(partner_name),
                );
            }
        }
        if let Some(ref aid) = self.organisms[idx].attracted_to.clone() {
            let gone = !org_idx_by_id
                .get(aid)
                .is_some_and(|&i| self.organisms[i].alive && self.organisms[i].partner_id.is_none());
            if gone {
                self.organisms[idx].attracted_to = None;
            }
        }

        let tc = self.tick_count;
        let is_unpartnered_adult = self.organisms[idx].partner_id.is_none()
            && self.organisms[idx].alive
            && self.organisms[idx].age > 1000
            && self.organisms[idx].traits.social_tendency > 0.15;

        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.organisms[idx].wander_target.is_none()
            && self.organisms[idx].loneliness > 0.20
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let my_age = self.organisms[idx].age as f32;
            let my_lid = self.organisms[idx].lineage_id.clone();
            let my_atts = self.organisms[idx].lineage_attitudes.clone();
            let my_trust = self.organisms[idx].org_trust.clone();
            // Score candidates by attitude / trust / age compat, not raw
            // proximity. Distance still matters (you have to walk there),
            // but two villagers who hate each other's lineages no longer
            // pair just because they happen to be the closest neighbour.
            // Hard distance cap on mate search - same reasoning as the
            // friend-seek cap. Without it, attraction can pull orgs
            // across the entire map, defeating the cluster-breaking
            // work in spawn.rs / friend-seek.
            const MATE_SEEK_MAX_TILES: f32 = 80.0;
            let target = spatial
                .ordered_nearby(&self.organisms, ox, oy, MATE_SEEK_MAX_TILES as i32)
                .map(|(_, o)| o)
                .filter(|o| o.alive && o.sex != my_sex && o.age > 1000 && o.partner_id.is_none())
                .map(|o| {
                    let dist = (o.x - ox).hypot(o.y - oy);
                    (o, dist)
                })
                .filter(|(_, d)| *d <= MATE_SEEK_MAX_TILES)
                .map(|(o, dist)| {
                    let lineage_att = if o.lineage_id == my_lid {
                        0.3
                    } else {
                        my_atts.get(&o.lineage_id).copied().unwrap_or(0.0)
                    };
                    let trust = my_trust.get(&o.id).copied().unwrap_or(0.0);
                    let age_gap = (my_age - o.age as f32).abs();
                    let age_score = (1.0 - age_gap / 6000.0).clamp(0.0, 1.0);
                    let dist_score = (1.0 - dist / 30.0).clamp(0.0, 1.0);
                    // Hard-reject hostile lineages even if nearby.
                    let viable = lineage_att > -0.3;
                    let score = if viable {
                        dist_score * 0.35 + lineage_att * 0.25 + trust * 0.20 + age_score * 0.20
                    } else {
                        -1.0
                    };
                    (o, score)
                })
                .filter(|(_, s)| *s > 0.0)
                .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(o, _)| (o.x as i32, o.y as i32));
            if let Some((tx, ty)) = target {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        }

        // Friend-seeking: lonely organisms with friends actively walk toward one
        if self.organisms[idx].loneliness > 0.65
            && self.organisms[idx].wander_target.is_none()
            && !self.organisms[idx].friends.is_empty()
            && self.organisms[idx].energy > 0.30
        {
            let friend_ids: Vec<String> = self.organisms[idx].friends.keys().cloned().collect();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            // Only walk toward friends within this radius. Without a cap,
            // every lonely org in the world eventually drifts toward whichever
            // cluster has the densest friend network, producing a one-way
            // attractor that empties out the rest of the map.
            const FRIEND_SEEK_MAX_TILES: f32 = 60.0;
            let best = friend_ids
                .iter()
                .filter_map(|fid| {
                    org_idx_by_id
                        .get(fid)
                        .map(|&i| &self.organisms[i])
                        .filter(|o| o.alive)
                })
                .map(|o| (o, (o.x - ox).hypot(o.y - oy)))
                .filter(|(_, d)| *d <= FRIEND_SEEK_MAX_TILES)
                .min_by_key(|(_, d)| (*d * 10.0) as i32)
                .map(|(o, _)| (o.x as i32, o.y as i32, o.name.clone()));
            if let Some((tx, ty, fname)) = best {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
                let short = &fname[..4.min(fname.len())];
                self.organisms[idx].think(&format!("going to find {}", short), self.tick_count);
            }
            // Prune dead friends using the per-tick resident index.
            let departed_friends: Vec<String> = self.organisms[idx]
                .friends
                .keys()
                .filter(|id| !org_idx_by_id.get(*id).is_some_and(|&i| self.organisms[i].alive))
                .cloned()
                .collect();
            for id in departed_friends {
                self.organisms[idx].friends.remove(&id);
            }
        }

        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.rng.random::<f32>() < 0.012
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let candidate = spatial
                .ordered_nearby(&self.organisms, ox, oy, 120)
                .find(|(i, o)| {
                    *i != idx
                        && o.alive
                        && o.partner_id.is_none()
                        && o.attracted_to.is_none()
                        && o.age > 1000
                        && o.sex != my_sex
                        && (o.x - ox).hypot(o.y - oy) < 120.0
                })
                .map(|(i, _)| i);
            if let Some(ci) = candidate {
                let cid = self.organisms[ci].id.clone();
                let cname = self.organisms[ci].name.clone();
                let my_id = self.organisms[idx].id.clone();
                self.organisms[idx].attracted_to = Some(cid.clone());
                self.organisms[idx].attraction_tick = tc;
                self.organisms[ci].attracted_to = Some(my_id);
                self.organisms[ci].attraction_tick = tc;
                self.organisms[idx].think(&format!("drawn to {}", cname), tc);
            }
        }

        if is_unpartnered_adult {
            let attracted_to = self.organisms[idx].attracted_to.clone();
            if let Some(ref aid) = attracted_to {
                let aid = aid.clone();
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let attraction_age = tc.saturating_sub(self.organisms[idx].attraction_tick);
                let partner_close = org_idx_by_id.get(&aid).is_some_and(|&i| {
                    let o = &self.organisms[i];
                    o.alive && (o.x - ox).hypot(o.y - oy) < 8.0
                });
                if partner_close && attraction_age >= 150 && self.rng.random::<f32>() < 0.08 {
                    if let Some(pi) = org_idx_by_id
                        .get(&aid)
                        .copied()
                        .filter(|&i| self.organisms[i].alive)
                    {
                        let pid = self.organisms[pi].id.clone();
                        let pname = self.organisms[pi].name.clone();
                        let oid = self.organisms[idx].id.clone();
                        let oname = self.organisms[idx].name.clone();
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[pi]);
                        let a_recent: Vec<String> = self.organisms[idx]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let b_recent: Vec<String> = self.organisms[pi]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[pi].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx],
                            &self.organisms[pi],
                            a_recent,
                            b_recent,
                            a_tribe,
                            b_tribe,
                            a_mood,
                            b_mood,
                            tc,
                            "courtship",
                            self.lineage_eras
                                .get(&self.organisms[idx].lineage_id)
                                .map(|e| e.name())
                                .unwrap_or("pre-stone"),
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.push_pending_convo(req);
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let b_lid = self.organisms[pi].lineage_id.clone();
                        self.organisms[idx].record_conversation_outcome(
                            &pid,
                            &b_lid,
                            &pname,
                            "courtship",
                            None,
                            tc,
                        );
                        self.organisms[pi].record_conversation_outcome(
                            &oid,
                            &a_lid,
                            &oname,
                            "courtship",
                            None,
                            tc,
                        );
                        self.organisms[idx].partner_id = Some(pid.clone());
                        self.organisms[idx].attracted_to = None;
                        self.organisms[pi].partner_id = Some(oid.clone());
                        self.organisms[pi].attracted_to = None;
                        self.organisms[idx].joy_ticks = (self.organisms[idx].joy_ticks + 500).min(1200);
                        self.organisms[pi].joy_ticks = (self.organisms[pi].joy_ticks + 500).min(1200);
                        self.organisms[idx].think(&format!("fell for {}", pname), tc);
                        self.organisms[idx].log_life_rel(
                            tc,
                            "love",
                            format!("fell in love with {}", pname),
                            Some(pid.clone()),
                            Some(pname.clone()),
                        );
                        self.organisms[pi].log_life_rel(
                            tc,
                            "love",
                            format!("fell in love with {}", oname),
                            Some(oid),
                            Some(oname.clone()),
                        );
                    }
                }
            }
        }

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let pid = pid.clone();
            if tc % 19 == (idx as u64 % 19) && self.rng.random::<f32>() < 0.0018 {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                if let Some(pi) = org_idx_by_id
                    .get(&pid)
                    .copied()
                    .filter(|&i| self.organisms[i].alive)
                {
                    if (self.organisms[pi].x - ox).hypot(self.organisms[pi].y - oy) < 8.0 {
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[pi]);
                        let a_recent: Vec<String> = self.organisms[idx]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let b_recent: Vec<String> = self.organisms[pi]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[pi].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx],
                            &self.organisms[pi],
                            a_recent,
                            b_recent,
                            a_tribe,
                            b_tribe,
                            a_mood,
                            b_mood,
                            tc,
                            "bonded",
                            self.lineage_eras
                                .get(&self.organisms[idx].lineage_id)
                                .map(|e| e.name())
                                .unwrap_or("pre-stone"),
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        self.push_pending_convo(req);
                        let a_id = self.organisms[idx].id.clone();
                        let a_name = self.organisms[idx].name.clone();
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let b_name = self.organisms[pi].name.clone();
                        let b_lid = self.organisms[pi].lineage_id.clone();
                        self.organisms[idx]
                            .record_conversation_outcome(&pid, &b_lid, &b_name, "bonded", None, tc);
                        self.organisms[pi]
                            .record_conversation_outcome(&a_id, &a_lid, &a_name, "bonded", None, tc);
                    }
                }
            }
        }

        {
            let spread_check = tc % 29 == (idx as u64 % 29);
            if spread_check {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let chat_target: Option<usize> = {
                    let partner_id = self.organisms[idx].partner_id.clone();
                    spatial
                        .ordered_nearby(&self.organisms, ox, oy, 6)
                        .filter(|(i, o)| {
                            *i != idx
                                && o.alive
                                && partner_id.as_deref() != Some(&o.id)
                                && (o.x - ox).hypot(o.y - oy) < 6.0
                        })
                        .min_by(|(_, a), (_, b)| {
                            let da = (a.x - ox).hypot(a.y - oy);
                            let db = (b.x - ox).hypot(b.y - oy);
                            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                        })
                        .map(|(i, _)| i)
                };
                if let Some(ci) = chat_target {
                    let their_lid = self.organisms[ci].lineage_id.clone();
                    let att = self.organisms[idx].attitude_toward(&their_lid);
                    let combined_energy = self.organisms[idx].energy + self.organisms[ci].energy;
                    let gossip_target: Option<(String, f32)> = {
                        let cid = self.organisms[ci].id.clone();
                        self.organisms[idx]
                            .org_trust
                            .iter()
                            .filter(|(id, v)| v.abs() > 0.4 && **id != cid)
                            .max_by(|a, b| {
                                a.1.abs()
                                    .partial_cmp(&b.1.abs())
                                    .unwrap_or(std::cmp::Ordering::Equal)
                            })
                            .map(|(id, v)| (id.clone(), *v))
                    };
                    let kind = if att < -0.3 {
                        "argue"
                    } else if gossip_target.is_some() && att >= 0.0 && self.rng.random::<f32>() < 0.5 {
                        "gossip"
                    } else if combined_energy > 1.5 && att >= 0.0 {
                        "excited"
                    } else {
                        "chat"
                    };
                    if self.rng.random::<f32>() < 0.004 {
                        let a_mood = derive_mood(&self.organisms[idx]);
                        let b_mood = derive_mood(&self.organisms[ci]);
                        let a_recent: Vec<String> = self.organisms[idx]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let b_recent: Vec<String> = self.organisms[ci]
                            .life_log
                            .iter()
                            .rev()
                            .take(3)
                            .map(|e| e.text.clone())
                            .collect();
                        let a_tribe = self.lineage_names.get(&self.organisms[idx].lineage_id).cloned();
                        let b_tribe = self.lineage_names.get(&self.organisms[ci].lineage_id).cloned();
                        let (conv_a, conv_b, req) = courtship::generate_conversation_with_req(
                            &self.organisms[idx],
                            &self.organisms[ci],
                            a_recent,
                            b_recent,
                            a_tribe,
                            b_tribe,
                            a_mood,
                            b_mood,
                            tc,
                            kind,
                            self.lineage_eras
                                .get(&self.organisms[idx].lineage_id)
                                .map(|e| e.name())
                                .unwrap_or("pre-stone"),
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[ci].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[ci].store_conversation(conv_b);
                        self.push_pending_convo(req);
                        let a_id = self.organisms[idx].id.clone();
                        let a_name = self.organisms[idx].name.clone();
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let c_id = self.organisms[ci].id.clone();
                        let c_name = self.organisms[ci].name.clone();
                        self.organisms[idx]
                            .record_conversation_outcome(&c_id, &their_lid, &c_name, kind, None, tc);
                        self.organisms[ci]
                            .record_conversation_outcome(&a_id, &a_lid, &a_name, kind, None, tc);
                        if kind == "gossip" {
                            if let Some((tid, sentiment)) = &gossip_target {
                                let cur = self.organisms[ci].org_trust.entry(tid.clone()).or_insert(0.0);
                                *cur = (*cur + sentiment * 0.3).clamp(-1.0, 1.0);
                            }
                        }
                        let bystanders: Vec<usize> = spatial
                            .ordered_nearby(&self.organisms, ox, oy, 5)
                            .filter(|(j, o)| {
                                *j != idx && *j != ci && o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 5.0
                            })
                            .map(|(j, _)| j)
                            .take(3)
                            .collect();
                        let emotion: i8 = if kind == "argue" { -1 } else { 1 };
                        for j in bystanders {
                            use crate::organism::memory::{MemoryEntry, MemoryKind};
                            self.organisms[j].memories.insert(
                                MemoryEntry::new(
                                    MemoryKind::Episode,
                                    format!("overheard {} and {} {}", a_name, c_name, kind),
                                    tc,
                                )
                                .with_salience(0.35)
                                .with_emotion(emotion),
                            );
                            self.organisms[j].update_attitude(&a_lid, 0.004 * emotion as f32);
                        }
                    }
                }
            }
        }

        growth::try_reproduce(
            idx,
            &mut self.organisms,
            &self.grid,
            self.tick_count,
            &mut self.events,
            &mut self.rng,
            growth::ReproductionPopulation {
                slots_used: population_slots_used,
                limit: self.population_limit,
                lineage_counts,
                org_idx_by_id,
            },
        );

        let death_grief: Option<(i32, i32, String)> = {
            let org = &self.organisms[idx];
            let dying = org.energy <= 0.0
                || org.hydration <= 0.0
                || org.health <= 0.0
                || (org.max_age > 0 && org.age >= org.max_age);
            if dying {
                Some((org.x as i32, org.y as i32, org.lineage_id.clone()))
            } else {
                None
            }
        };

        let mut noted: Option<(String, &'static str)> = None;
        let mut grave: Option<(String, f32, f32)> = None;
        let org = &mut self.organisms[idx];
        if org.energy <= 0.0 || org.hydration <= 0.0 || org.health <= 0.0 {
            org.alive = false;
            org.think("dying", self.tick_count);
            use crate::organism::organism::Harm;
            // A wound is told by what dealt it; before, every death from
            // lost health that was not a fever counted as combat, so cold
            // water, wolves and earthquakes all read as war.
            let harm = if org.health <= 0.0 {
                org.fatal_harm(self.tick_count)
            } else {
                None
            };
            let cause = match harm {
                Some(Harm::Beast) => {
                    self.history.deaths_beasts += 1;
                    "beasts"
                }
                Some(Harm::Drowning) => {
                    self.history.deaths_drowning += 1;
                    "drowning"
                }
                Some(Harm::Fire) => {
                    self.history.deaths_fire += 1;
                    "fire"
                }
                Some(Harm::Disaster) => {
                    self.history.deaths_disaster += 1;
                    "disaster"
                }
                Some(Harm::Sickness) => {
                    self.history.deaths_sickness += 1;
                    "sickness"
                }
                Some(Harm::War) => {
                    self.history.deaths_combat += 1;
                    "war"
                }
                Some(Harm::Fight) => {
                    self.history.deaths_combat += 1;
                    "combat"
                }
                None if org.health <= 0.0 && org.infection > 0.3 => {
                    self.history.deaths_sickness += 1;
                    "sickness"
                }
                None if org.energy <= 0.0 => {
                    self.history.deaths_starvation += 1;
                    "starvation"
                }
                None if org.hydration <= 0.0 => {
                    self.history.deaths_dehydration += 1;
                    "dehydration"
                }
                None => {
                    self.history.deaths_combat += 1;
                    "combat"
                }
            };
            noted = Some((org.lineage_id.clone(), cause));
            if matches!(
                crate::sim::agents::age_stage::AgeStage::from_age(org.age, org.max_age),
                crate::sim::agents::age_stage::AgeStage::Adult
                    | crate::sim::agents::age_stage::AgeStage::Elder
            ) {
                grave = Some((org.lineage_id.clone(), org.x, org.y));
            }
            // Migration-pressure signal: an organism dying far from
            // where it was born is the simulation's emergent answer
            // to "the elders left home and never came back." Fires
            // sparingly (only at death, only past a sizeable
            // threshold) so the event log doesn't drown.
            let dx = org.x - org.home_x;
            let dy = org.y - org.home_y;
            let home_dist_sq = dx * dx + dy * dy;
            let migrated = home_dist_sq > 40.0 * 40.0;
            let msg = format!("gen{} age {} - {}", org.generation, org.age, cause);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
            if migrated {
                let dist = home_dist_sq.sqrt() as i32;
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "migration",
                    &name,
                    &format!("died {} tiles from home, far from where they were born", dist),
                );
            }
        } else if org.max_age > 0 && org.age >= org.max_age {
            org.alive = false;
            org.think("died of old age", self.tick_count);
            self.history.deaths_old_age += 1;
            noted = Some((org.lineage_id.clone(), "old_age"));
            grave = Some((org.lineage_id.clone(), org.x, org.y));
            let msg = format!("gen{} age {} - old age", org.generation, org.age);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        }

        if let Some((lineage, cause)) = noted {
            self.note_death(&lineage, cause);
            let id = self.organisms[idx].id.clone();
            self.fallen.push_back((id, self.tick_count));
            while self.fallen.len() > 96 {
                self.fallen.pop_front();
            }
        }
        if let Some(g) = grave {
            if self.grave_queue.len() < 200 {
                self.grave_queue.push(g);
            }
        }

        if !self.organisms[idx].alive {
            use crate::organism::memory::MemoryKind;
            let dead = &self.organisms[idx];
            let mut legacy: Option<(String, String, u32)> = None;
            let mut best_score = 0u32;
            for m in dead.memories.entries.iter() {
                if matches!(m.kind, MemoryKind::Core) {
                    continue;
                }
                let score = m.recall_count.saturating_mul(8) + ((m.salience * 100.0) as u32);
                if score > best_score {
                    best_score = score;
                    legacy = Some((dead.name.clone(), m.text.clone(), m.recall_count));
                }
            }
            if let Some((name, text, recalls)) = legacy {
                let suffix = if recalls > 5 {
                    format!(" (held in mind {} times)", recalls)
                } else {
                    String::new()
                };
                self.headlines.push_back((
                    self.tick_count,
                    format!("{} is gone. What they carried: \"{}\"{}", name, text, suffix),
                ));
                while self.headlines.len() > 80 {
                    self.headlines.pop_front();
                }
            }
        }

        if !self.organisms[idx].alive {
            let dead = &self.organisms[idx];
            let bequest = dead.wealth;
            if bequest > 0 {
                let dead_id = dead.id.clone();
                let dead_name = dead.name.clone();
                let dead_lid = dead.lineage_id.clone();
                let partner_id = dead.partner_id.clone();
                let heir_idx: Option<usize> = {
                    let mut found: Option<usize> = None;
                    if let Some(pid) = partner_id.as_ref() {
                        found = self.organisms.iter().position(|o| o.alive && &o.id == pid);
                    }
                    if found.is_none() {
                        let mut best: Option<(usize, u32)> = None;
                        for (i, o) in self.organisms.iter().enumerate() {
                            if !o.alive {
                                continue;
                            }
                            if o.parent_id != dead_id && o.father_id.as_deref() != Some(&dead_id) {
                                continue;
                            }
                            if let Some((_, a)) = best {
                                if o.age <= a {
                                    continue;
                                }
                            }
                            best = Some((i, o.age));
                        }
                        found = best.map(|(i, _)| i);
                    }
                    if found.is_none() {
                        let mut best: Option<(usize, i32)> = None;
                        for (i, o) in self.organisms.iter().enumerate() {
                            if !o.alive || o.lineage_id != dead_lid {
                                continue;
                            }
                            let d = (o.x - self.organisms[idx].x).abs() as i32
                                + (o.y - self.organisms[idx].y).abs() as i32;
                            if let Some((_, bd)) = best {
                                if d >= bd {
                                    continue;
                                }
                            }
                            best = Some((i, d));
                        }
                        found = best.map(|(i, _)| i);
                    }
                    found
                };
                if let Some(hi) = heir_idx {
                    self.organisms[hi].wealth = self.organisms[hi].wealth.saturating_add(bequest);
                    let heir_name = self.organisms[hi].name.clone();
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "trade",
                        &dead_name,
                        &format!("{} inherited {} from {}", heir_name, bequest, dead_name),
                    );
                }
                self.organisms[idx].wealth = 0;
            }
        }

        if let Some((dx, dy, dlid)) = death_grief {
            let dead_name = self.organisms[idx].name.clone();
            let dead_id_str = self.organisms[idx].id.clone();
            // Grievers: same-lineage tile-neighbours (original)
            //         + adult children regardless of distance (father_id / parent_id match)
            //         + named friends regardless of distance
            // Without these, a parent's death didn't reach their
            // distant children or cross-tribe friends.
            let mut griever_set: rustc_hash::FxHashSet<usize> = rustc_hash::FxHashSet::default();
            for (i, o) in self.organisms.iter().enumerate() {
                if i == idx || !o.alive {
                    continue;
                }
                let near_kin =
                    o.lineage_id == dlid && (o.x as i32 - dx).abs() + (o.y as i32 - dy).abs() <= 12;
                let child =
                    o.parent_id == dead_id_str || o.father_id.as_deref() == Some(dead_id_str.as_str());
                let friend = o.friends.contains_key(&dead_id_str);
                if near_kin || child || friend {
                    griever_set.insert(i);
                }
            }
            let grievers: Vec<usize> = griever_set.into_iter().collect();

            let griever_count = grievers.len();

            let inherited_food: Vec<((i32, i32), f32)> = self.organisms[idx]
                .food_memory
                .iter()
                .filter(|(_, &v)| v > 0.5)
                .take(5)
                .map(|(&k, &v)| (k, v))
                .collect();
            let inherited_water: Vec<((i32, i32), f32)> = self.organisms[idx]
                .water_memory
                .iter()
                .filter(|(_, &v)| v > 0.5)
                .take(5)
                .map(|(&k, &v)| (k, v))
                .collect();
            let inherited_disc: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();

            let dead_id = self.organisms[idx].id.clone();
            for gi in &grievers {
                let ms = self.organisms[*gi].traits.memory_strength;
                Organism::remember(&mut self.organisms[*gi].danger_memory, dx, dy, 0.65, ms);
                self.organisms[*gi].fear_level = (self.organisms[*gi].fear_level + 0.22).min(1.0);
                // Children of the dead get heavier grief AND get marked
                // as orphaned for nearby kin to notice; adult mourners
                // get the original lighter grief.
                let is_child = (self.organisms[*gi].parent_id == dead_id_str
                    || self.organisms[*gi].father_id.as_deref() == Some(dead_id_str.as_str()))
                    && self.organisms[*gi].age < 1000;
                let grief_base = if is_child { 200 } else { 80 };
                if is_child {
                    self.organisms[*gi].orphaned_tick = self.tick_count;
                    self.organisms[*gi].add_anchor(
                        self.tick_count,
                        format!("lost parent {}", dead_name),
                        0.95,
                    );
                    use crate::organism::memory::{MemoryEntry, MemoryKind};
                    let is_father =
                        self.organisms[*gi].father_id.as_deref() == Some(self.organisms[idx].id.as_str());
                    let parent_word = if is_father { "father" } else { "mother" };
                    self.organisms[*gi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Bond,
                            format!("I lost my {} {} when I was small", parent_word, dead_name),
                            self.tick_count,
                        )
                        .with_salience(0.97)
                        .with_emotion(-3)
                        .with_related(dead_id.clone()),
                    );
                }
                self.organisms[*gi].grief_ticks = grief_base + self.rng.random_range(0u32..40);
                self.organisms[*gi].think("mourning kin", self.tick_count);
                let tc = self.tick_count;
                let dn = dead_name.clone();
                let di = dead_id.clone();
                self.organisms[*gi].log_life_rel(
                    tc,
                    "loss",
                    format!("witnessed {} die", dn),
                    Some(di),
                    Some(dn),
                );

                for &((mx, my), v) in &inherited_food {
                    Organism::remember(&mut self.organisms[*gi].food_memory, mx, my, v * 0.4, ms);
                }
                for &((mx, my), v) in &inherited_water {
                    Organism::remember(&mut self.organisms[*gi].water_memory, mx, my, v * 0.4, ms);
                }
                let is_widow = self.organisms[*gi].partner_id.as_ref() == Some(&self.organisms[idx].id);
                let is_direct_kin = is_widow
                    || self.organisms[*gi].parent_id == self.organisms[idx].id
                    || self.organisms[*gi].father_id.as_ref() == Some(&self.organisms[idx].id);
                if is_direct_kin {
                    for d in &inherited_disc {
                        if !self.organisms[*gi].discoveries.contains(d.as_str())
                            && self.rng.random::<f32>() < 0.45
                        {
                            self.organisms[*gi].discoveries.insert(d.clone());
                        }
                    }
                }
                if is_widow {
                    use crate::organism::memory::{MemoryEntry, MemoryKind};
                    self.organisms[*gi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Bond,
                            format!("I lost {}, who slept beside me through the years", dead_name),
                            self.tick_count,
                        )
                        .with_salience(0.98)
                        .with_emotion(-3)
                        .with_related(dead_id.clone()),
                    );
                    self.organisms[*gi].grief_ticks = (self.organisms[*gi].grief_ticks + 200).min(800);
                    self.organisms[*gi].comfort = (self.organisms[*gi].comfort - 0.30).max(0.0);
                    self.organisms[*gi].partner_id = None;
                }
            }

            if griever_count >= 2 {
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "mourn",
                    &dead_name,
                    &format!("{} kin gather to mourn", griever_count),
                );
            }

            let ritual_participants: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| {
                    *i != idx
                        && o.alive
                        && o.lineage_id == dlid
                        && (((o.x as i32 - dx).pow(2) + (o.y as i32 - dy).pow(2)) as f32).sqrt() <= 6.0
                })
                .map(|(i, _)| i)
                .collect();
            if !ritual_participants.is_empty() {
                let participant_ids: Vec<String> = ritual_participants
                    .iter()
                    .map(|&pi| self.organisms[pi].id.clone())
                    .collect();
                for (slot, &pi) in ritual_participants.iter().enumerate() {
                    self.organisms[pi].grief_ticks = self.organisms[pi].grief_ticks.saturating_sub(20);
                    self.organisms[pi].log_event("mourned together".to_string());
                    for (other_slot, other_id) in participant_ids.iter().enumerate() {
                        if other_slot == slot {
                            continue;
                        }
                        let cur = self.organisms[pi].org_trust.get(other_id).copied().unwrap_or(0.0);
                        self.organisms[pi]
                            .org_trust
                            .insert(other_id.clone(), (cur + 0.12).min(1.0));
                    }
                }
            }

            if let Some(&gi) = grievers.first() {
                let energy = self.organisms[gi].energy;
                let lid = self.organisms[gi].lineage_id.clone();
                self.push_think_for(
                    gi,
                    ThinkTrigger {
                        org_id: self.organisms[gi].id.clone(),
                        org_name: self.organisms[gi].name.clone(),
                        lineage_id: lid,
                        scenario: "grief".to_string(),
                        energy_avg: energy,
                        context: format!("lost {} - {} kin mourn", dead_name, griever_count),
                        ..Default::default()
                    },
                );
            }

            self.grid.add_hazard(dx, dy, 0.45);
            self.grid.reduce_fertility(dx, dy, 0.08);
            for (ndx, ndy) in [(-1i32, 0), (1, 0), (0, -1i32), (0, 1)] {
                self.grid.add_hazard(dx + ndx, dy + ndy, 0.18);
                self.grid.reduce_fertility(dx + ndx, dy + ndy, 0.03);
            }
            for ddx in -2i32..=2 {
                for ddy in -2i32..=2 {
                    if ddx.abs() + ddy.abs() == 2 {
                        self.grid.add_hazard(dx + ddx, dy + ddy, 0.06);
                    }
                }
            }

            if self.rng.random::<f32>() < 0.25 && matches!(self.grid.get(dx, dy), Tile::Grass | Tile::Ash) {
                self.grid.set(dx, dy, Tile::Food);
            }
        }
    }
}
