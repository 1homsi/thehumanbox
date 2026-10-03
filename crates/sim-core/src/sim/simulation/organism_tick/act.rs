use super::*;

impl Simulation {
    /// Carry out the chosen action: a step in one of eight directions or one of the skill actions.
    pub(super) fn org_act(&mut self, f: &mut OrgFrame<'_>) {
        let action = f.action;
        let idx = f.idx;
        let perception = std::mem::take(&mut f.perception);
        let spatial = f.spatial;

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

                if let Some((_, their_lid)) = neg_target {
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

        f.perception = perception;
        f.action_succeeded = action_succeeded;
        f.movement_reward = movement_reward;
        f.signal_reward = signal_reward;
    }
}
