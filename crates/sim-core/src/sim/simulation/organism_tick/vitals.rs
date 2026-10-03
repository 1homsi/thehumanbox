use super::*;

impl Simulation {
    /// Bodily upkeep and the environment: fire, carried goods, shelter, hunger and thirst, cold and heat, infection and its treatment.
    pub(super) fn org_vitals(&mut self, f: &mut OrgFrame<'_>) {
        let animal_spatial = f.animal_spatial;
        let decision_origin = f.decision_origin;
        let idx = f.idx;
        let new_thought = std::mem::take(&mut f.new_thought);
        let night = f.night;
        let spatial = f.spatial;
        let spatial_buf = &mut *f.spatial_buf;

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

        f.current_tile = current_tile;
        f.resilience = resilience;
    }
}
