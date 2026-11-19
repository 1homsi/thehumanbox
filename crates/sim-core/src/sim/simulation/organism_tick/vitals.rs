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
        let dormant = f.dormant;

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

        if !dormant {
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
        }

        if self.organisms[idx].carrying > 0 {
            let spent = self.organisms[idx].carrying.min(f.dt.min(255) as u32);
            self.organisms[idx].carrying -= spent;
            if self.organisms[idx].carrying == 0 {
                self.organisms[idx].carrying_type = 0;
            }
        }

        // A home shelter already as solid as it gets takes no more wood: the
        // armful goes on the woodpile. Without this, people stood at home
        // 'packing' a finished shelter for most of a day.
        if self.organisms[idx].carrying > 0
            && self.organisms[idx].carrying_type != 2
            && self.grid.structure_at(cx, cy) >= 0.99
            && (cx - self.organisms[idx].home_x as i32).abs() <= 2
            && (cy - self.organisms[idx].home_y as i32).abs() <= 2
        {
            let o = &mut self.organisms[idx];
            let (load, kind) = (o.carrying, o.carrying_type);
            o.carrying = 0;
            o.carrying_type = 0;
            if o.carry_room() > 0 {
                o.inv_wood = o.inv_wood.saturating_add(1);
                o.think("stacking the woodpile", self.tick_count);
            } else {
                // No room to stack it: they keep holding the armful rather than drop it.
                o.carrying = load;
                o.carrying_type = kind;
            }
        }

        if self.organisms[idx].carrying > 0 {
            let tile = self.grid.get(cx, cy);
            if matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Ash | Tile::Hut | Tile::Snow | Tile::Sand
            ) {
                let prev_s = self.grid.structure_at(cx, cy);
                let has_masonry = self.organisms[idx].discoveries.has(Hot::Masonry);
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

        let shelter_strength = if dormant {
            0.0
        } else {
            shelter_strength(&self.grid, cx, cy)
        };
        let rng = &mut self.rng;
        shelter_comfort(&mut self.organisms[idx], shelter_strength, || rng.random::<f32>());

        if decision_origin.starts_with("boat_") {
            if let Some(thought) = new_thought {
                self.organisms[idx].think(&thought, self.tick_count);
            }
        }

        if !dormant {
            let climate = self.climate(night);
            drain_and_eat(
                &mut self.organisms[idx],
                water_near(&self.grid, cx, cy),
                &climate,
                shelter_strength,
            );
            self.apply_water_fatigue(idx, cx, cy);
            weather_and_sickness(
                &mut self.organisms[idx],
                &self.grid,
                &climate,
                cx,
                cy,
                shelter_strength,
            );
        }

        if self.organisms[idx].inv_water >= 2
            && crate::sim::simulation::town_lod::due(self.tick_count, f.dt, 7, idx as u64)
        {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let lid = &self.organisms[idx].lineage_id;
            ordered_nearby_filtered(&self.organisms, spatial, sx, sy, 3, spatial_buf, |i, o| {
                i != idx
                    && o.alive
                    && o.lineage_id == *lid
                    && o.hydration < 0.30
                    && (o.x - sx).abs() + (o.y - sy).abs() < 2.5
            });
            let recipient = spatial_buf
                .iter()
                .map(|&i| (i, &self.organisms[i]))
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

        if night && crate::sim::simulation::town_lod::due(self.tick_count, f.dt, 17, idx as u64) {
            let (sx, sy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let near_fire = (-2i32..=2).any(|ddx| {
                (-2i32..=2)
                    .any(|ddy| matches!(self.grid.get(sx + ddx, sy + ddy), Tile::Campfire | Tile::Fire))
            });
            if near_fire {
                let (fx, fy) = (self.organisms[idx].x, self.organisms[idx].y);
                let lid = &self.organisms[idx].lineage_id;
                ordered_nearby_filtered(&self.organisms, spatial, fx, fy, 4, spatial_buf, |i, o| {
                    i != idx
                        && o.alive
                        && o.lineage_id == *lid
                        && o.age < 1800
                        && (o.x - fx).abs() + (o.y - fy).abs() < 3.5
                });
                let listener = spatial_buf
                    .iter()
                    .map(|&i| (i, &self.organisms[i]))
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

        if self.organisms[idx].energy > 0.75
            && crate::sim::simulation::town_lod::due(self.tick_count, f.dt, 5, idx as u64)
        {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            let lid = &self.organisms[idx].lineage_id;
            ordered_nearby_filtered(&self.organisms, spatial, sx, sy, 3, spatial_buf, |i, o| {
                i != idx
                    && o.alive
                    && o.lineage_id == *lid
                    && o.energy < 0.30
                    && (o.x - sx).abs() + (o.y - sy).abs() < 2.5
            });
            let recipient = spatial_buf
                .iter()
                .map(|&i| (i, &self.organisms[i]))
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

        if self.organisms[idx].discoveries.has(Hot::Trap) {
            let (cx2, cy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_trail = self.grid.detect_trail(cx2, cy2, TrailKind::Food, 3);
            if food_trail > 0.45
                && self.rng.random::<f32>() < crate::sim::simulation::town_lod::chance(0.0025, f.dt)
            {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.14).min(1.0);
                self.organisms[idx].think("trap caught something", self.tick_count);
                let name = self.organisms[idx].name.clone();
                push_event(&mut self.events, self.tick_count, "hunt", &name, "trap catch");
            }
        }

        if !dormant {
            ritual_comfort(&mut self.organisms[idx], &self.grid, night);
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
            if self.organisms[idx].infection < 0.05
                && self.rng.random::<f32>() < crate::sim::simulation::town_lod::chance(pathogen_rate, f.dt)
            {
                self.organisms[idx].infection = 0.35 * (1.0 - self.organisms[idx].traits.resilience * 0.4);
            }
        }

        if !dormant && self.organisms[idx].infection < 0.8 {
            let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
            spatial.query_into(sx as i32, sy as i32, 2, spatial_buf);
            let organisms = &self.organisms;
            let caught = caught_infection(&organisms[idx], idx, spatial_buf, |i| {
                let o = &organisms[i];
                (o.x, o.y, o.infection, o.alive)
            });
            if set_infection(&mut self.organisms[idx], caught) {
                self.history.sickness_events += 1;
            }
        }

        f.current_tile = current_tile;
        f.resilience = self.organisms[idx].traits.resilience;
    }

    pub(super) fn climate(&self, night: bool) -> Climate {
        let (heat_thirst, heat_tire) = if self.weather.heat_active(self.tick_count) {
            (1.6, 1.25)
        } else {
            (1.0, 1.0)
        };
        Climate {
            night,
            heat_thirst,
            heat_tire,
            hunger: self.goals.difficulty.hunger_mult(),
            season_temp: self.season_temperature_now(),
            tick: self.tick_count,
        }
    }
}

#[derive(Clone, Copy)]
pub(super) struct Climate {
    pub(super) night: bool,
    heat_thirst: f32,
    heat_tire: f32,
    hunger: f32,
    season_temp: f32,
    tick: u64,
}

impl Climate {
    pub(super) fn at(self, tick: u64) -> Self {
        Climate { tick, ..self }
    }
}

pub(super) fn shelter_strength(grid: &WorldGrid, cx: i32, cy: i32) -> f32 {
    let mut s = 0.0f32;
    for ddx in -3i32..=3 {
        for ddy in -3i32..=3 {
            let nx = cx + ddx;
            let ny = cy + ddy;
            let t = grid.get(nx, ny);
            if t == Tile::Campfire {
                return 0.55;
            }
            if t == Tile::Hut {
                return 0.90;
            }
            let st = grid.structure_at(nx, ny);
            if st >= 0.35 {
                s = s.max(st);
            }
        }
    }
    s
}

pub(super) fn shelter_comfort(o: &mut Organism, shelter: f32, roll: impl FnOnce() -> f32) {
    if shelter <= 0.0 {
        return;
    }
    o.energy = (o.energy + (0.0008 + shelter * 0.0022)).min(1.0);
    o.health = (o.health + (0.0006 + shelter * 0.0010)).min(1.0);
    if o.infection > 0.01 {
        let inf_mult = 0.992 - shelter * 0.006;
        o.infection = (o.infection * inf_mult.max(0.980)).max(0.0);
    }
    if o.fear_level > 0.0 {
        o.fear_level = (o.fear_level - shelter * 0.008).max(0.0);
    }
    if o.grief_ticks > 0 && roll() < shelter * 0.12 {
        o.grief_ticks = o.grief_ticks.saturating_sub(3);
    }
}

fn drain_mult(shelter: f32) -> f32 {
    if shelter > 0.0 {
        (1.0 - shelter * 0.35).max(0.65)
    } else {
        1.0
    }
}

pub(super) fn water_near(grid: &WorldGrid, cx: i32, cy: i32) -> bool {
    (-4i32..=4).any(|ddx| (-4i32..=4).any(|ddy| grid.get(cx + ddx, cy + ddy) == Tile::Water))
}

pub(super) fn drain_and_eat(o: &mut Organism, water_near: bool, climate: &Climate, shelter: f32) {
    let hydration_mult = if water_near { 0.5 } else { 1.0 };
    o.energy = (o.energy - 0.0022 * drain_mult(shelter) * climate.heat_tire * climate.hunger).max(0.0);
    o.hydration = (o.hydration - 0.0014 * hydration_mult * climate.heat_thirst).max(0.0);
    let (used_food_reserve, _) = use_needed_reserves(o, climate.tick);
    if used_food_reserve {
        o.think("eating stored food", climate.tick);
    }
}

pub(super) fn weather_and_sickness(
    o: &mut Organism,
    grid: &WorldGrid,
    climate: &Climate,
    cx: i32,
    cy: i32,
    shelter: f32,
) {
    if climate.night {
        let night_base = if o.discoveries.has(Hot::Torch) {
            0.0002
        } else {
            0.0005
        };
        o.energy = (o.energy - night_base * drain_mult(shelter)).max(0.0);
    }
    let temp = grid.temp_at(cx, cy) + climate.season_temp;
    if !(10.0..=30.0).contains(&temp) {
        let stress = if temp < 10.0 {
            (10.0 - temp) / 40.0
        } else {
            (temp - 30.0) / 70.0
        };
        let drain = stress * 0.003 * (1.1 - o.traits.resilience * 0.2) * (1.0 - shelter * 0.60);
        o.energy = (o.energy - drain).max(0.0);
        if temp > 40.0 {
            o.hydration = (o.hydration - drain * 0.5).max(0.0);
        }
    }
    let inf = o.infection;
    if inf > 0.01 {
        o.energy = (o.energy - 0.001 * inf).max(0.0);
        if inf > 0.6 {
            o.health = (o.health - 0.001 * (inf - 0.6)).max(0.0);
            o.mark_harm(crate::organism::organism::Harm::Sickness, climate.tick);
        }
        if inf > 0.25
            && matches!(
                o.thought.as_str(),
                "exploring" | "observing" | "satisfied" | "on path"
            )
        {
            o.think("feeling weak", climate.tick);
        }
    }
    if o.infection > 0.01 {
        let d = &o.discoveries;
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
        o.infection = (o.infection * med_mult).max(0.0);
    }
}

pub(super) fn ritual_comfort(o: &mut Organism, grid: &WorldGrid, night: bool) {
    if !night || !o.discoveries.has(Hot::Ritual) {
        return;
    }
    let (cx, cy) = (o.x as i32, o.y as i32);
    ritual_warmth(o, campfire_near(grid, cx, cy));
}

pub(super) fn campfire_near(grid: &WorldGrid, cx: i32, cy: i32) -> bool {
    (-3i32..=3).any(|ddx| (-3i32..=3).any(|ddy| grid.get(cx + ddx, cy + ddy) == Tile::Campfire))
}

pub(super) fn ritual_warmth(o: &mut Organism, near_fire: bool) {
    if near_fire {
        o.comfort = (o.comfort + 0.003).min(1.0);
        o.loneliness = (o.loneliness - 0.005).max(0.0);
    }
}

pub(super) fn caught_infection(
    o: &Organism,
    idx: usize,
    candidates: &[usize],
    neighbour: impl Fn(usize) -> (f32, f32, f32, bool),
) -> f32 {
    let (sx, sy) = (o.x, o.y);
    let res = o.traits.resilience;
    let mut infection = o.infection;
    for &i in candidates {
        if i == idx {
            continue;
        }
        let (x, y, other_inf, alive) = neighbour(i);
        if !(alive && other_inf >= 0.15 && (x - sx).abs() + (y - sy).abs() <= 2.0) {
            continue;
        }
        infection = (infection + 0.015 * other_inf * (1.0 - res * 0.8)).min(1.0);
    }
    infection
}

pub(super) fn set_infection(o: &mut Organism, infection: f32) -> bool {
    let fell_sick = o.infection < 0.15 && infection >= 0.15;
    o.infection = infection;
    fell_sick
}
