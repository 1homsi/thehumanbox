use super::*;

/// The age at which old age takes a person. Everyone is born with a lifespan (`max_age`); a
/// person who knows medicine lives a fifth longer, so a tribe that has learned it keeps its
/// elders for longer.
pub(super) fn lifespan(org: &crate::organism::organism::Organism) -> u32 {
    if org.max_age > 0 && org.discoveries.has(crate::organism::organism::Hot::Medicine) {
        org.max_age + org.max_age / 5
    } else {
        org.max_age
    }
}

impl Simulation {
    /// Death: starvation, thirst, injury and old age, graves, grief for the dead, and the effects on the living.
    pub(super) fn org_mortality(&mut self, f: &mut OrgFrame<'_>) {
        let idx = f.idx;

        let death_grief: Option<(i32, i32, String)> = {
            let org = &self.organisms[idx];
            let dying = org.energy <= 0.0
                || org.hydration <= 0.0
                || org.health <= 0.0
                || (org.max_age > 0 && org.age >= lifespan(org));
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
                Some(Harm::Murder) => {
                    self.history.deaths_combat += 1;
                    "murder"
                }
                Some(Harm::Execution) => {
                    self.history.deaths_combat += 1;
                    "executed"
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
            org.death_cause = cause.to_string();
            org.log_life(
                self.tick_count,
                "death",
                format!("died of {cause} at age {}", org.age),
            );
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
        } else if org.max_age > 0 && org.age >= lifespan(org) {
            org.alive = false;
            org.think("died of old age", self.tick_count);
            self.history.deaths_old_age += 1;
            noted = Some((org.lineage_id.clone(), "old_age"));
            org.death_cause = "old age".to_string();
            org.log_life(
                self.tick_count,
                "death",
                format!("died of old age at {}", org.age),
            );
            grave = Some((org.lineage_id.clone(), org.x, org.y));
            let msg = format!("gen{} age {} - old age", org.generation, org.age);
            let name = org.name.clone();
            push_event(&mut self.events, self.tick_count, "died", &name, &msg);
        }

        if let Some((lineage, cause)) = noted {
            self.note_death(&lineage, cause);
            self.history.record_death(self.tick_count);
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

        // The home passes on once, when its owner dies. Every living person
        // reaches this point each tick, so the call is gated on the death.
        if !self.organisms[idx].alive {
            self.pass_family_home(idx);
        }
        if let Some((dx, dy, dlid)) = death_grief {
            let dead_name = self.organisms[idx].name.clone();
            let dead_id_str = self.organisms[idx].id.clone();
            // Grievers: same-lineage tile-neighbours (original)
            //         + adult children regardless of distance (father_id / parent_id match)
            //         + named friends regardless of distance
            // Without these, a parent's death didn't reach their
            // distant children or cross-tribe friends.
            let mut griever_set: crate::hashing::FxHashSet<usize> = crate::hashing::FxHashSet::default();
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
                // A friend who is no family still mourns, longer than a
                // neighbour would, and remembers the loss by name.
                let friend_only = {
                    let m = &self.organisms[*gi];
                    !is_child
                        && m.friends.contains_key(&dead_id_str)
                        && m.parent_id != dead_id_str
                        && m.father_id.as_deref() != Some(dead_id_str.as_str())
                        && m.partner_id.as_deref() != Some(dead_id_str.as_str())
                };
                let grief_base = if is_child {
                    200
                } else if friend_only {
                    120
                } else {
                    80
                };
                if friend_only {
                    use crate::organism::memory::{MemoryEntry, MemoryKind};
                    self.organisms[*gi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Bond,
                            format!("I lost my friend {}", dead_name),
                            self.tick_count,
                        )
                        .with_salience(0.8)
                        .with_emotion(-2)
                        .with_related(dead_id.clone()),
                    );
                }
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
                self.organisms[*gi].think(
                    if friend_only {
                        "mourning a friend"
                    } else {
                        "mourning kin"
                    },
                    self.tick_count,
                );
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

#[cfg(test)]
mod lifespan_tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;

    fn person(max_age: u32) -> Organism {
        let mut o = Organism::new(
            "p".into(),
            "p".into(),
            0.0,
            0.0,
            0,
            String::new(),
            "clan".into(),
            9000,
            Traits::default(),
        );
        o.max_age = max_age;
        o
    }

    #[test]
    fn knowing_medicine_adds_a_fifth_to_the_lifespan() {
        let mut plain = person(1000);
        assert_eq!(lifespan(&plain), 1000);
        plain.discover("medicine");
        assert_eq!(lifespan(&plain), 1200);
        let mut no_lifespan = person(0);
        no_lifespan.discover("medicine");
        assert_eq!(
            lifespan(&no_lifespan),
            0,
            "a person with no lifespan never dies of age"
        );
    }
}

#[cfg(test)]
mod death_cause_tests {
    use super::*;

    /// A person who dies in the sim records why. Unborn children also sit
    /// with `alive == false` until their birth, so only a recorded cause
    /// counts as a death here.
    #[test]
    fn deaths_record_their_cause() {
        let mut sim = Simulation::new(42);
        for _ in 0..4000 {
            sim.tick();
        }
        let caused: Vec<&Organism> = sim
            .organisms
            .iter()
            .filter(|o| !o.death_cause.is_empty())
            .collect();
        assert!(!caused.is_empty(), "someone dies within 4000 ticks");
        for o in caused {
            assert!(!o.alive, "{} has a cause of death but is alive", o.name);
        }
    }
}
