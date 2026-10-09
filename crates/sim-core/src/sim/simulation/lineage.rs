use super::*;

fn add_member(entry: &mut LineageAggregate, org: &Organism) {
    entry.population += 1;
    entry.x_sum += org.x;
    entry.y_sum += org.y;
    entry.literacy_sum += org.literacy;
    entry.energy_sum += org.energy;
}

impl Simulation {
    pub(crate) fn rebuild_lineage_aggregates(&mut self) {
        self.lineage_aggregates.clear();
        self.lineage_aggregates.reserve(self.lineage_names.len().max(8));
        // Copy a lineage's id only the first time the tick meets it.
        for org in self.organisms.iter().filter(|org| org.alive) {
            if let Some(entry) = self.lineage_aggregates.get_mut(&org.lineage_id) {
                add_member(entry, org);
            } else {
                let mut entry = LineageAggregate::default();
                add_member(&mut entry, org);
                self.lineage_aggregates.insert(org.lineage_id.clone(), entry);
            }
        }
    }

    pub(super) fn broadcast_discovery(
        &mut self,
        actor_idx: usize,
        x: i32,
        y: i32,
        rtype: &str,
        radius: i32,
        spatial: &SpatialIndex,
    ) {
        let (ax, ay) = (self.organisms[actor_idx].x, self.organisms[actor_idx].y);
        let mut buf: Vec<usize> = Vec::with_capacity(16);
        spatial.query_into(ax as i32, ay as i32, radius, &mut buf);
        for &i in &buf {
            if i == actor_idx || !self.organisms[i].alive {
                continue;
            }
            let dist = ((self.organisms[i].x - ax).abs() + (self.organisms[i].y - ay).abs()) as i32;
            if dist > radius {
                continue;
            }
            let strength = 0.25 * (1.0 - dist as f32 / radius as f32);
            let ms = self.organisms[i].traits.memory_strength;
            match rtype {
                "food" => Organism::remember(&mut self.organisms[i].food_memory, x, y, strength, ms),
                "water" => Organism::remember(&mut self.organisms[i].water_memory, x, y, strength, ms),
                "danger" => Organism::remember(&mut self.organisms[i].danger_memory, x, y, strength, ms),
                _ => {}
            }
        }
    }

    #[cfg(test)]
    pub(super) fn current_nearby_organisms(&self, x: i32, y: i32, radius: i32) -> Vec<usize> {
        let spatial = SpatialIndex::build(&self.organisms, 10);
        spatial
            .query(x, y, radius)
            .into_iter()
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive && ((o.x as i32 - x).abs() + (o.y as i32 - y).abs()) <= radius
            })
            .collect()
    }

    pub(super) fn tick_ancestral_recognition(&mut self) {
        const ANCIENT_AFTER_DAYS: u64 = 10;
        const RECOG_RADIUS: f32 = 5.0;
        const ORGS_TO_CHECK: usize = 6;
        const COOLDOWN_TICKS: u64 = 1800;

        let now = self.tick_count;
        let ancient_cutoff = now as i32 - (ANCIENT_AFTER_DAYS * DAY_LENGTH) as i32;

        let alive_indices: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, _)| i)
            .collect();
        if alive_indices.is_empty() {
            return;
        }

        for _ in 0..ORGS_TO_CHECK {
            let idx = alive_indices[self.rng.random_range(0..alive_indices.len())];
            if now.saturating_sub(self.organisms[idx].last_ancestral_thought) < COOLDOWN_TICKS {
                continue;
            }
            let org_lid = self.organisms[idx].lineage_id.clone();
            let ox = self.organisms[idx].x;
            let oy = self.organisms[idx].y;
            let Some(samples) = self.lineage_centroid_history.get(&org_lid) else {
                continue;
            };
            let mut matched: Option<i32> = None;
            for s in samples.iter() {
                if s[0] >= ancient_cutoff {
                    break;
                }
                let dx = ox - s[1] as f32;
                let dy = oy - s[2] as f32;
                if dx * dx + dy * dy <= RECOG_RADIUS * RECOG_RADIUS {
                    matched = Some(s[0]);
                    break;
                }
            }
            if let Some(sample_tick) = matched {
                let age_days = (now as i32 - sample_tick) / DAY_LENGTH as i32;
                let thought = if age_days >= 30 {
                    "ancestors walked here"
                } else if age_days >= 20 {
                    "our grandparents' land"
                } else {
                    "the elders mentioned this place"
                };
                self.organisms[idx].thought = thought.to_string();
                self.organisms[idx].last_ancestral_thought = now;
            }
        }
    }

    pub(super) fn sample_lineage_centroids(&mut self) {
        let mut sums: HashMap<&str, (f32, f32, u32)> = HashMap::default();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let e = sums.entry(o.lineage_id.as_str()).or_insert((0.0, 0.0, 0));
            e.0 += o.x;
            e.1 += o.y;
            e.2 += 1;
        }
        let tick = self.tick_count as i32;
        let alive_lineages: HashSet<String> = sums.keys().map(|s| s.to_string()).collect();
        for (lid_str, (sx, sy, n)) in sums {
            if n == 0 {
                continue;
            }
            let cx = (sx / n as f32) as i32;
            let cy = (sy / n as f32) as i32;
            let entry = self
                .lineage_centroid_history
                .entry(lid_str.to_string())
                .or_default();
            entry.push_back([tick, cx, cy]);
            if entry.len() > 60 {
                entry.pop_front();
            }
            // Stamp the ancestral home the first time we ever see
            // this lineage. Never overwritten - even when the last
            // living member is 200 tiles away, the home stays
            // anchored to where the lineage was born.
            self.lineage_homes
                .entry(lid_str.to_string())
                .or_insert([cx, cy, 30]);
        }
        let cutoff = tick - 30 * DAY_LENGTH as i32;
        self.lineage_centroid_history.retain(|lid, samples| {
            if alive_lineages.contains(lid) {
                return true;
            }
            samples.back().map(|s| s[0] >= cutoff).unwrap_or(false)
        });
    }

    pub(super) fn update_lineage_eras(&mut self) {
        use crate::sim::era::{determine_era_for_lineage, Era};
        let mut agg: HashMap<String, (HashSet<String>, usize)> = HashMap::default();
        for org in self.organisms.iter().filter(|o| o.alive) {
            let entry = agg
                .entry(org.lineage_id.clone())
                .or_insert_with(|| (HashSet::default(), 0));
            entry.1 += 1;
            for d in org.discoveries.iter() {
                entry.0.insert(d.clone());
            }
        }
        let world_population: usize = agg.values().map(|(_, population)| *population).sum();
        let mut max_era: Option<Era> = None;
        let alive_lineages: HashSet<String> = agg.keys().cloned().collect();
        for (lid, (discoveries, _lineage_population)) in agg.iter() {
            let prev = self.lineage_eras.get(lid).copied().unwrap_or(Era::PreStone);
            let discovered_era =
                determine_era_for_lineage(discoveries, world_population, self.population_limit());
            let new_era = discovered_era.max(prev);
            if new_era > prev {
                let lname = self
                    .lineage_names
                    .get(lid)
                    .cloned()
                    .unwrap_or_else(|| lid.clone());
                let detail = format!(
                    "{} entered the {} era: {}",
                    lname,
                    new_era.name(),
                    new_era.flavour()
                );
                push_event(&mut self.events, self.tick_count, "era_advance", &lname, &detail);
            }
            self.lineage_eras.insert(lid.clone(), new_era);
            max_era = Some(match max_era {
                Some(m) => {
                    if new_era > m {
                        new_era
                    } else {
                        m
                    }
                }
                None => new_era,
            });
        }
        self.lineage_eras.retain(|k, _| alive_lineages.contains(k));
        if let Some(m) = max_era {
            let mname = m.name().to_string();
            if mname != self.current_era {
                self.history.era_history.push_back(EraEntry {
                    tick: self.tick_count,
                    era: mname.clone(),
                });
                if self.history.era_history.len() > 60 {
                    self.history.era_history.pop_front();
                }
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "era",
                    "world",
                    &format!("the {} era begins: {}", mname, m.flavour()),
                );
                self.current_era = mname;
            }
        }
    }
}
