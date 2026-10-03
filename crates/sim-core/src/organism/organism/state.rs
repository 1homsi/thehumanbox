use super::*;

impl Organism {
    /// Remember what just hurt this person.
    pub fn mark_harm(&mut self, harm: Harm, tick: u64) {
        self.last_harm = Some((harm, tick));
    }

    /// The recent wound most likely to have killed this person.
    pub fn fatal_harm(&self, tick: u64) -> Option<Harm> {
        self.last_harm
            .filter(|&(_, at)| tick.saturating_sub(at) <= HARM_MEMORY)
            .map(|(h, _)| h)
    }

    pub fn think_ready(&self, scenario: &str, tick: u64, cooldown: u64) -> bool {
        let last = self.last_think_by_kind.get(scenario).copied().unwrap_or(0);
        tick.saturating_sub(last) >= cooldown
    }

    pub fn mark_thought(&mut self, scenario: &str, tick: u64) {
        self.last_think_by_kind.insert(scenario.to_string(), tick);
        self.last_think_tick = tick;
    }

    pub fn carry_load(&self) -> u32 {
        self.inv_water as u32 + self.inv_food as u32 + self.inv_wood as u32 + self.inv_stone as u32
    }

    pub fn carry_max(&self) -> u32 {
        let base: u32 = match self.sex {
            Sex::Male => 12,
            Sex::Female => 8,
        };
        base + (self.traits.resilience * 4.0) as u32
    }

    pub fn carry_room(&self) -> u32 {
        self.carry_max().saturating_sub(self.carry_load())
    }

    pub fn age_stage(&self) -> crate::sim::age_stage::AgeStage {
        crate::sim::age_stage::AgeStage::from_age(self.age, self.max_age)
    }

    pub fn give_tool(&mut self, tool: &str) {
        let cur = self.tools.get(tool).copied().unwrap_or(0);
        if cur < 8 {
            self.tools.insert(tool.to_string(), cur + 1);
        }
    }

    pub fn has_tool(&self, tool: &str) -> bool {
        self.tools.get(tool).copied().unwrap_or(0) > 0
    }

    pub fn add_degree(&mut self, degree: &str) {
        let d = degree.to_string();
        if !self.degrees.contains(&d) {
            self.degrees.push(d);
        }
    }

    pub fn add_anchor(&mut self, tick: u64, desc: String, strength: f32) {
        self.anchor_events.push((tick, desc, strength.clamp(0.0, 1.0)));
        if self.anchor_events.len() > 12 {
            let mut weakest_idx = 0usize;
            let mut weakest_val = f32::INFINITY;
            for (i, e) in self.anchor_events.iter().enumerate() {
                if e.2 < weakest_val {
                    weakest_val = e.2;
                    weakest_idx = i;
                }
            }
            self.anchor_events.remove(weakest_idx);
        }
    }

    // Promote an organism to named friend status.
    // Idempotent - safe to call repeatedly; only logs + mutates loneliness on first promotion.
    pub fn add_friend(&mut self, id: &str, name: &str, tick: u64) {
        if !self.friends.contains_key(id) {
            let cap_bonus = (self.traits.social_tendency * 8.0) as usize;
            let max_friends: usize = 12 + cap_bonus;
            const MAX_FRIENDS: usize = 20;
            let _ = MAX_FRIENDS;
            let max_friends = max_friends.min(MAX_FRIENDS);
            if self.friends.len() >= max_friends {
                // `friends` is a std HashMap, so with the trust key
                // quantised to 3 decimals an eviction tie was broken by
                // per-process hash order — which friend got dropped then
                // differed run to run, and that cascaded into every social
                // system keyed on friendship. Break ties on the id.
                let weakest = self
                    .friends
                    .keys()
                    .min_by(|a, b| {
                        let ta = self.org_trust.get(a.as_str()).copied().unwrap_or(0.0);
                        let tb = self.org_trust.get(b.as_str()).copied().unwrap_or(0.0);
                        ta.total_cmp(&tb).then_with(|| a.cmp(b))
                    })
                    .cloned();
                if let Some(k) = weakest {
                    self.friends.remove(&k);
                }
            }
            self.friends.insert(id.to_string(), name.to_string());
            self.log_life_rel(
                tick,
                "friendship",
                format!("became close friends with {}", name),
                Some(id.to_string()),
                Some(name.to_string()),
            );
            self.loneliness = (self.loneliness - 0.25).max(0.0);
            self.joy_ticks = (self.joy_ticks + 120).min(1200);
            self.comfort = (self.comfort + 0.05).min(1.0);
        }
    }

    pub fn trim_social_maps(&mut self) {
        const MAX_TRUST: usize = 32;
        const TRUST_KEEP: usize = 24;
        const MAX_ATTITUDES: usize = 24;
        const ATT_KEEP: usize = 18;
        if self.org_trust.len() > MAX_TRUST {
            let mut v: Vec<(String, f32)> = std::mem::take(&mut self.org_trust).into_iter().collect();
            v.sort_by(|a, b| {
                b.1.abs()
                    .partial_cmp(&a.1.abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            v.truncate(TRUST_KEEP);
            self.org_trust = v.into_iter().collect();
        }
        if self.lineage_attitudes.len() > MAX_ATTITUDES {
            let mut v: Vec<(String, f32)> = std::mem::take(&mut self.lineage_attitudes).into_iter().collect();
            v.sort_by(|a, b| {
                b.1.abs()
                    .partial_cmp(&a.1.abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            v.truncate(ATT_KEEP);
            self.lineage_attitudes = v.into_iter().collect();
        }
    }

    pub fn trim_cognitive_state(&mut self, critical: bool) {
        fn trim_mem(mem: &mut FxHashMap<(i32, i32), f32>, keep: usize) {
            if mem.len() > keep {
                let mut entries: Vec<_> = mem.drain().collect();
                entries.sort_unstable_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                entries.truncate(keep);
                mem.extend(entries);
            }
            mem.shrink_to_fit();
        }

        self.trim_social_maps();
        let (q_keep, food_keep, water_keep, danger_keep) =
            if critical { (32, 12, 8, 6) } else { (64, 24, 12, 8) };
        trim_mem(&mut self.food_memory, food_keep);
        trim_mem(&mut self.water_memory, water_keep);
        trim_mem(&mut self.danger_memory, danger_keep);

        if self.q_table.len() > q_keep {
            let mut entries: Vec<(String, QRow)> = self.q_table.drain().collect();
            entries.sort_unstable_by(|a, b| {
                let strength = |row: &QRow| row.iter().map(|(_, value)| value.abs()).fold(0.0f32, f32::max);
                strength(&b.1)
                    .partial_cmp(&strength(&a.1))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            entries.truncate(q_keep);
            self.q_table.extend(entries);
        }
        for row in self.q_table.values_mut() {
            row.shrink_to_fit();
        }
        self.q_table.shrink_to_fit();
    }

    pub fn store_conversation(&mut self, entry: ConversationEntry) {
        self.conversations.push_back(entry);
        if self.conversations.len() > 12 {
            self.conversations.pop_front();
        }
    }

    pub fn discover(&mut self, what: &str) -> bool {
        let inserted = self.discoveries.insert(what.to_string());
        if inserted {
            // Learning something new is a genuine high.
            self.joy_ticks = (self.joy_ticks + 220).min(1200);
        }
        // Cap so a future free-form discovery string (e.g. a generated
        // verb-noun pair) can't grow the set unboundedly. 64 is well
        // above the current ~25 hand-written discoveries. Eviction is
        // arbitrary because HashSet has no insertion-order - we drop
        // a random element which, on a stable interner-style set, is
        // fine: the dropped knowledge is rare or stale.
        if inserted && self.discoveries.len() > 64 {
            if let Some(victim) = self.discoveries.iter().next().cloned() {
                self.discoveries.remove(&victim);
            }
        }
        inserted
    }

    pub fn log_event(&mut self, text: String) {
        self.log_life(0, "event", text);
    }

    pub fn log_life(&mut self, tick: u64, category: &str, text: String) {
        self.log_life_rel(tick, category, text, None, None);
    }

    pub fn log_life_rel(
        &mut self,
        tick: u64,
        category: &str,
        text: String,
        related_id: Option<String>,
        related_name: Option<String>,
    ) {
        use crate::organism::memory::{MemoryEntry, MemoryKind};
        let (mem_kind, salience, emotion) = match category {
            "birth" => (MemoryKind::Bond, 0.95, 3),
            "death" => (MemoryKind::Bond, 0.90, -3),
            "loss" => (MemoryKind::Bond, 0.95, -3),
            "partnership" => (MemoryKind::Bond, 0.90, 3),
            "love" => (MemoryKind::Bond, 0.92, 3),
            "courtship" => (MemoryKind::Bond, 0.70, 2),
            "friendship" => (MemoryKind::Bond, 0.75, 2),
            "farewell" => (MemoryKind::Bond, 0.60, -1),
            "betrayal" => (MemoryKind::Bond, 0.85, -2),
            "witnessed" => (MemoryKind::Episode, 0.55, 0),
            "danger" => (MemoryKind::Episode, 0.75, -2),
            "aspiration" => (MemoryKind::Fact, 0.85, 2),
            "specialty" => (MemoryKind::Fact, 0.75, 1),
            "graduated" => (MemoryKind::Fact, 0.75, 2),
            "religion" => (MemoryKind::Fact, 0.80, 1),
            "milestone" => (MemoryKind::Episode, 0.80, 1),
            "elder" => (MemoryKind::Fact, 0.80, 1),
            _ => (MemoryKind::Episode, 0.50, 0),
        };
        let mut entry = MemoryEntry::new(mem_kind, text.clone(), tick)
            .with_salience(salience)
            .with_emotion(emotion);
        if let Some(ref rid) = related_id {
            entry = entry.with_related(rid.clone());
        }
        self.memories.insert(entry);

        self.life_log.push_back(LifeEvent {
            tick,
            category: category.to_string(),
            text,
            related_id,
            related_name,
        });
        if self.life_log.len() > 24 {
            self.life_log.pop_front();
        }
    }

    pub fn record_conversation_outcome(
        &mut self,
        other_id: &str,
        other_lineage: &str,
        other_name: &str,
        kind: &str,
        anchor_cat: Option<&str>,
        tick: u64,
    ) {
        use crate::organism::memory::{MemoryEntry, MemoryKind};
        let (trust_delta, att_delta, emotion) = match kind {
            "courtship" | "bonded" => (0.04, 0.02, 3i8),
            "excited" => (0.03, 0.015, 1),
            "gossip" => (0.01, 0.0, 0),
            "argue" => (-0.06, -0.03, -2),
            _ => (0.015, 0.0075, 0),
        };
        let t = self.org_trust.entry(other_id.to_string()).or_insert(0.0);
        *t = (*t + trust_delta).clamp(-1.0, 1.0);
        let trust_now = *t;
        if att_delta != 0.0 {
            self.update_attitude(other_lineage, att_delta);
        }
        if trust_now > 0.5 && !self.friends.contains_key(other_id) {
            self.add_friend(other_id, other_name, tick);
        }
        let about = anchor_cat.unwrap_or(kind);
        let mem_kind = if emotion.abs() >= 2 {
            MemoryKind::Bond
        } else {
            MemoryKind::Episode
        };
        let salience = if emotion.abs() >= 2 { 0.7 } else { 0.55 };
        self.memories.insert(
            MemoryEntry::new(
                mem_kind,
                format!("talked with {} about {}", other_name, about),
                tick,
            )
            .with_salience(salience)
            .with_emotion(emotion)
            .with_related(other_id.to_string()),
        );
        self.memories
            .touch(|m| m.related_id.as_deref() == Some(other_id), 0.10);
    }

    pub fn remember(mem: &mut FxHashMap<(i32, i32), f32>, x: i32, y: i32, strength: f32, mem_trait: f32) {
        let effective = (strength * (0.7 + 0.6 * mem_trait)).min(1.0);
        let v = mem.entry((x, y)).or_insert(0.0);
        *v = (*v + effective).min(1.0);
    }

    pub fn update_attitude(&mut self, other_lid: &str, delta: f32) {
        if other_lid == self.lineage_id {
            return;
        }
        let v = self.lineage_attitudes.entry(other_lid.to_string()).or_insert(0.0);
        *v = (*v + delta).clamp(-1.0, 1.0);
    }

    pub fn attitude_toward(&self, other_lid: &str) -> f32 {
        if other_lid == self.lineage_id {
            return 1.0;
        }
        *self.lineage_attitudes.get(other_lid).unwrap_or(&0.0)
    }

    pub fn compress_for_archive(&mut self) {
        if self.alive {
            return;
        }
        self.food_memory.clear();
        self.water_memory.clear();
        self.danger_memory.clear();
        self.thought_history.clear();
        self.q_table.clear();
        self.lineage_attitudes.clear();
        self.org_trust.clear();
        self.life_log.clear();
        self.discoveries.clear();
        self.conversations.clear();
        self.friends.clear();
        self.attributes.clear();
        self.memories.entries.clear();
        self.memories.entries.shrink_to_fit();
    }
}
