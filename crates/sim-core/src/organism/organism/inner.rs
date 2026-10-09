use super::*;
use crate::math::DetMath;

impl Organism {
    pub fn tick_inner_state(
        &mut self,
        kin_near: usize,
        near_shelter: bool,
        hostile_near: bool,
        weather_kind: u8,
        tick: u64,
        night: bool,
    ) {
        const DAY_LENGTH_LOCAL: u32 = 600;
        self.memories
            .tick(tick, DAY_LENGTH_LOCAL, self.traits.memory_strength);

        if kin_near == 0 {
            self.loneliness = (self.loneliness + 0.0008).min(1.0);
        } else {
            self.loneliness = (self.loneliness - kin_near as f32 * 0.012).max(0.0);
        }

        if hostile_near || self.energy < 0.25 || self.hydration < 0.25 {
            self.boredom = (self.boredom - 0.002).max(0.0);
        } else {
            self.boredom = (self.boredom + 0.002).min(1.0);
        }

        if hostile_near {
            self.fear_level = (self.fear_level + 0.05).min(1.0);
        } else {
            self.fear_level = (self.fear_level - 0.006).max(0.0);
        }
        if self.energy < 0.2 || self.hydration < 0.2 {
            self.fear_level = (self.fear_level + 0.015).min(1.0);
        }
        if self.health < 0.3 {
            self.fear_level = (self.fear_level + 0.008).min(1.0);
        }

        if self.grief_ticks > 0 {
            let extra = if self.discoveries.has(Hot::Herbalism) || self.discoveries.has(Hot::RitualDance) {
                1
            } else {
                0
            };
            self.grief_ticks = self.grief_ticks.saturating_sub(1 + extra);
            let fear_add = if self.discoveries.has(Hot::RitualDance) {
                0.003
            } else {
                0.004
            };
            self.fear_level = (self.fear_level + fear_add).min(1.0);
        }
        if self.joy_ticks > 0 {
            self.joy_ticks = self.joy_ticks.saturating_sub(1);
            self.comfort = (self.comfort + 0.003).min(1.0);
            self.loneliness = (self.loneliness - 0.002).max(0.0);
            self.fear_level = (self.fear_level - 0.002).max(0.0);
        }

        match weather_kind {
            1 => {
                if near_shelter {
                    self.comfort = (self.comfort + 0.002).min(1.0);
                } else {
                    self.fear_level = (self.fear_level + 0.003).min(1.0);
                    self.comfort = (self.comfort - 0.002).max(0.0);
                }
            }
            2 => {
                self.fear_level = (self.fear_level + 0.008).min(1.0);
                if !near_shelter {
                    self.comfort = (self.comfort - 0.004).max(0.0);
                }
            }
            _ => {}
        }

        let has_leather = self.discoveries.has(Hot::Leatherwork)
            || self.discoveries.has(Hot::AnimalHides)
            || self.discoveries.has(Hot::Textiles);
        if night && !near_shelter {
            let add = if has_leather { 0.0009 } else { 0.0015 };
            self.sleep_debt = (self.sleep_debt + add).min(1.0);
        } else if near_shelter {
            self.sleep_debt = (self.sleep_debt - 0.010).max(0.0);
        } else {
            self.sleep_debt = (self.sleep_debt - 0.001).max(0.0);
        }
        if self.sleep_debt > 0.4 {
            let drain = 0.0004 * self.sleep_debt * (if near_shelter { 0.4 } else { 1.0 });
            self.energy = (self.energy - drain).max(0.0);
        }

        if self.energy > 0.6 && self.hydration > 0.6 && self.health > 0.7 && !hostile_near {
            self.hope = (self.hope + 0.002).min(1.0);
        } else if self.energy < 0.25 || self.hydration < 0.25 || self.health < 0.3 {
            self.hope = (self.hope - 0.003).max(0.0);
        } else {
            self.hope = (self.hope - 0.0002).max(0.0);
        }

        if self.comfort > 0.7 && kin_near >= 2 {
            self.gratitude = (self.gratitude + 0.001).min(1.0);
        } else {
            self.gratitude = (self.gratitude * 0.9985).max(0.0);
        }

        if hostile_near {
            self.anger = (self.anger + 0.004).min(1.0);
        } else {
            self.anger = (self.anger * 0.9985).max(0.0);
        }

        if hostile_near {
            // Envy of a thriving rival nearby; faster when also struggling.
            let gain = if self.energy < 0.45 { 0.006 } else { 0.003 };
            self.jealousy = (self.jealousy + gain).min(1.0);
        } else {
            self.jealousy = (self.jealousy * 0.999).max(0.0);
        }

        if self.grief_ticks > 100 {
            self.regret = (self.regret + 0.0008).min(1.0);
        } else {
            self.regret = (self.regret * 0.9992).max(0.0);
        }

        // Awe accrues under open night sky and only erodes slowly while
        // sheltered / in daylight — an unconditional decay made it
        // impossible to ever reach a meaningful level.
        if night && !near_shelter {
            self.awe = (self.awe + 0.0016).min(1.0);
        } else {
            self.awe = (self.awe * 0.9996).max(0.0);
        }

        if self.boredom > 0.4 || self.energy > 0.55 {
            self.curiosity_drive = (self.curiosity_drive + 0.0006 * self.traits.curiosity).min(1.0);
        } else {
            self.curiosity_drive = (self.curiosity_drive * 0.999).max(0.0);
        }

        if night && near_shelter && self.comfort > 0.5 {
            self.spiritual = (self.spiritual + 0.0006).min(1.0);
        } else {
            self.spiritual = (self.spiritual * 0.99985).max(0.0);
        }

        let cell = (self.x as i32 / 10, self.y as i32 / 10);
        if cell == self.last_area_cell {
            self.area_ticks = self.area_ticks.saturating_add(1);
            if self.area_ticks > 60 && self.boredom > 0.20 && self.wander_target.is_none() {
                let hash = self
                    .id
                    .bytes()
                    .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
                // Mix the tick in before narrowing: the raw hash is ~1e19, so
                // `(hash ^ tick) as f32` dropped the tick and every trip for a
                // given person pointed the same way.
                let angle = ((hash ^ tick.wrapping_mul(0x9E37_79B9_7F4A_7C15)) % 6283) as f32 * 0.001;
                let dist = 120.0 + self.traits.curiosity * 380.0;
                let tx = (self.x + angle.det_sin() * dist).round() as i32;
                let ty = (self.y + angle.det_cos() * dist).round() as i32;
                self.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        } else {
            self.last_area_cell = cell;
            self.area_ticks = 0;
            if let Some(wt) = self.wander_target {
                if (wt.0 - self.x as i32).abs() + (wt.1 - self.y as i32).abs() < 8 {
                    self.wander_target = None;
                }
            }
        }

        if let Some(wt) = self.wander_target {
            if (wt.0 - self.x as i32).abs() + (wt.1 - self.y as i32).abs() <= 6 {
                self.wander_target = None;
            }
        }

        if self.wander_target.is_none() {
            if self.energy < 0.4 && !self.food_memory.is_empty() {
                let urgency = (0.4 - self.energy) / 0.4;
                if let Some(target) =
                    best_remembered_cell(&self.food_memory, self.x, self.y, &self.danger_memory, urgency)
                {
                    self.wander_target = Some(target);
                }
            } else if self.hydration < 0.4 && !self.water_memory.is_empty() {
                let urgency = (0.4 - self.hydration) / 0.4;
                if let Some(target) =
                    best_remembered_cell(&self.water_memory, self.x, self.y, &self.danger_memory, urgency)
                {
                    self.wander_target = Some(target);
                }
            }
        }

        if self.wander_target.is_none() {
            let id_hash = self
                .id
                .bytes()
                .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
            let period = (900u64)
                .saturating_sub((self.traits.curiosity * 300.0) as u64)
                .max(300);
            let offset = id_hash % period;
            if tick % period == offset {
                let angle = ((id_hash ^ tick.wrapping_mul(0x9E37_79B9_7F4A_7C15)) % 6283) as f32 * 0.001;
                let dist = 150.0 + self.traits.curiosity * 400.0;
                let tx = (self.x + angle.det_sin() * dist).round() as i32;
                let ty = (self.y + angle.det_cos() * dist).round() as i32;
                self.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
            }
        }

        let shelter_bonus = if near_shelter { 0.25 } else { 0.0 };
        let wet_penalty = if weather_kind >= 2 && !near_shelter {
            0.2
        } else if weather_kind == 1 && !near_shelter {
            0.08
        } else {
            0.0
        };
        self.comfort =
            ((self.energy + self.hydration + self.health + (1.0 - self.loneliness) * 0.5 + shelter_bonus
                - wet_penalty
                - self.fear_level * 0.3
                - self.sleep_debt * 0.15)
                / 4.0)
                .clamp(0.0, 1.0);

        let passive = matches!(
            self.thought.as_str(),
            "observing"
                | "exploring"
                | "satisfied"
                | "at peace"
                | "restless"
                | "feeling alone"
                | "terrified"
                | "mourning kin"
                | "exhausted"
                | "wandering"
        );
        if passive {
            if self.grief_ticks > 20 {
                self.think("mourning kin", tick);
            } else if self.sleep_debt > 0.55 {
                self.think("exhausted", tick);
            } else if self.fear_level > 0.65 {
                self.think("terrified", tick);
            } else if self.loneliness > 0.75 {
                self.think("feeling alone", tick);
            } else if self.boredom > 0.65 {
                self.think("restless", tick);
            } else if self.comfort > 0.82 {
                self.think("at peace", tick);
            }
        }
    }

    pub fn decay_memory(&mut self, tick: u64) {
        self.vocabulary.decay(tick, 5000);
        let preserves_food =
            self.discoveries.has(Hot::FoodPreservation) || self.discoveries.has(Hot::SaltHarvesting);
        let cartography = self.discoveries.has(Hot::Cartography);
        let star_charts = self.discoveries.has(Hot::StarCharts);
        let food_decay = if preserves_food { 0.998 } else { 0.995 };
        let water_decay = if cartography || star_charts { 0.998 } else { 0.995 };
        let danger_decay = 0.995;

        self.food_memory.retain(|_, v| {
            *v *= food_decay;
            *v >= 0.04
        });
        self.water_memory.retain(|_, v| {
            *v *= water_decay;
            *v >= 0.04
        });
        self.danger_memory.retain(|_, v| {
            *v *= danger_decay;
            *v >= 0.04
        });
        fn trim_mem(mem: &mut FxHashMap<(i32, i32), f32>, max: usize) {
            if mem.len() > max {
                let mut e: Vec<_> = mem.iter().map(|(k, v)| (*k, *v)).collect();
                e.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
                for (k, _) in &e[..e.len() - max] {
                    mem.swap_remove(k);
                }
            }
        }
        trim_mem(&mut self.food_memory, 32);
        trim_mem(&mut self.water_memory, 16);
        trim_mem(&mut self.danger_memory, 10);
        self.lineage_attitudes.retain(|_, v| {
            *v *= 0.998;
            v.abs() >= 0.01
        });
        self.org_trust.retain(|_, v| {
            *v *= if *v > 0.0 { 0.9997 } else { 0.999 };
            v.abs() >= 0.01
        });

        const Q_MAX: usize = 120;
        const Q_TRIM: usize = 80;
        if self.q_table.len() > Q_MAX {
            let mut entries: Vec<(String, QRow)> = self.q_table.drain(..).collect();
            entries.sort_by(|a, b| {
                let va = a.1.max_q();
                let vb = b.1.max_q();
                vb.partial_cmp(&va).unwrap_or(std::cmp::Ordering::Equal)
            });
            entries.truncate(Q_TRIM);
            self.q_table.extend(entries);
        }
    }

    pub fn best_remembered(mem: &FxHashMap<(i32, i32), f32>, ox: f32, oy: f32) -> Option<(i32, i32)> {
        Self::best_remembered_with_danger(mem, ox, oy, &FxHashMap::default(), 0.5)
    }

    pub fn best_remembered_with_danger(
        mem: &FxHashMap<(i32, i32), f32>,
        ox: f32,
        oy: f32,
        danger: &FxHashMap<(i32, i32), f32>,
        urgency: f32,
    ) -> Option<(i32, i32)> {
        let (ix, iy) = (ox as i32, oy as i32);
        let mut best_score = 0.03f32;
        let mut best_loc = None;
        let urgency = urgency.clamp(0.0, 1.0);
        let distance_weight = 0.03 + (1.0 - urgency) * 0.035;
        let danger_weight = 1.2 + urgency * 1.8;
        for (&(mx, my), &val) in mem {
            let dist = (mx - ix).abs() + (my - iy).abs();
            if dist == 0 {
                continue;
            }
            let danger_penalty = nearby_memory_strength(danger, (mx, my), 1) * danger_weight;
            let score = val * (1.0 + urgency * 0.35) / (1.0 + dist as f32 * distance_weight) - danger_penalty;
            if score > best_score {
                best_score = score;
                best_loc = Some((mx, my));
            }
        }
        best_loc
    }

    pub fn think(&mut self, text: &str, tick: u64) {
        if self.thought == text {
            return;
        }
        self.thought = text.to_string();
        self.thought_dirty = true;
        self.thought_history.push_back(ThoughtEntry {
            tick,
            text: text.to_string(),
        });
        if self.thought_history.len() > 16 {
            self.thought_history.pop_front();
        }
    }

    pub fn reflect_internally(&mut self, tick: u64) -> Option<String> {
        use crate::organism::memory::MemoryKind;
        let mood = if self.grief_ticks > 0 {
            "carrying grief"
        } else if self.joy_ticks > 0 {
            "feeling light"
        } else if self.fear_level > 0.5 {
            "uneasy"
        } else if self.loneliness > 0.6 {
            "alone"
        } else if self.energy < 0.3 {
            "weary"
        } else if self.comfort > 0.7 {
            "settled"
        } else {
            "still"
        };

        let asp_line = if self.aspiration.is_empty() {
            String::new()
        } else {
            format!(", a {} at heart", self.aspiration)
        };

        let prefer_emotional = self.fear_level > 0.4 || self.grief_ticks > 0 || self.joy_ticks > 0;
        let picked: Option<(MemoryKind, String)> = self
            .memories
            .pick_for_reflection(if prefer_emotional { Some(true) } else { None })
            .map(|m| (m.kind, m.text.clone()));

        let line = if let Some((kind, text)) = &picked {
            let lower = text.trim_end_matches('.').to_lowercase();
            let frame = match kind {
                MemoryKind::Core => format!("I remember — {}", lower),
                MemoryKind::Bond => format!("I think of them — {}", lower),
                MemoryKind::Episode => format!("I haven't forgotten — {}", lower),
                MemoryKind::Fact => format!("I know this — {}", lower),
                MemoryKind::Place => format!("that place — {}", lower),
                MemoryKind::Dream => format!("I dreamt — {}", lower),
            };
            format!("{}{}: {}", mood, asp_line, frame)
        } else {
            format!("I am {}{}, here in the world", self.name, asp_line)
        };

        if let Some((_, ref text)) = picked {
            let target = text.clone();
            self.memories.touch(|m| m.text == target, 0.02);
        }

        self.thought_history.push_back(ThoughtEntry {
            tick,
            text: line.clone(),
        });
        if self.thought_history.len() > 16 {
            self.thought_history.pop_front();
        }
        self.thought = line.clone();
        self.thought_dirty = true;
        Some(line)
    }
}
