use super::*;

impl Simulation {
    pub fn apply_memory_pressure(&mut self, pressure: crate::sim::memory_pressure::MemoryPressure) -> usize {
        use crate::sim::memory_pressure::MemoryPressure;
        let before = self.organisms.len();
        match pressure {
            MemoryPressure::Normal => return 0,
            MemoryPressure::Elevated => {
                let tick = self.tick_count;
                let mut dead_kept = 0usize;
                let keep: Vec<bool> = self
                    .organisms
                    .iter()
                    .map(|o| {
                        if o.alive || growth::is_pending_birth(o) {
                            return true;
                        }
                        if tick.saturating_sub(o.last_story_tick) >= 30_000 {
                            return false;
                        }
                        dead_kept += 1;
                        dead_kept <= 400
                    })
                    .collect();
                self.cull_dead(&keep);
                for o in self.organisms.iter_mut().filter(|o| o.alive) {
                    o.trim_cognitive_state(false);
                }
            }
            MemoryPressure::Critical => {
                let keep: Vec<bool> = self
                    .organisms
                    .iter()
                    .map(|o| o.alive || growth::is_pending_birth(o))
                    .collect();
                self.cull_dead(&keep);
                for o in self.organisms.iter_mut() {
                    o.trim_cognitive_state(true);
                    while o.life_log.len() > 24 {
                        o.life_log.pop_front();
                    }
                    while o.thought_history.len() > 16 {
                        o.thought_history.pop_front();
                    }
                    while o.conversations.len() > 12 {
                        o.conversations.pop_front();
                    }
                    o.food_memory.retain(|_, v| *v > 0.20);
                    o.water_memory.retain(|_, v| *v > 0.20);
                    o.danger_memory.retain(|_, v| *v > 0.20);
                }
                while self.events.len() > 80 {
                    self.events.pop_front();
                }
                while self.story_history.len() > 80 {
                    self.story_history.pop_front();
                }
                while self.pop_history.len() > 300 {
                    self.pop_history.pop_front();
                }
                while self.history.era_history.len() > 24 {
                    self.history.era_history.pop_front();
                }
                while self.lineage_strategy_history.len() > 16 {
                    self.lineage_strategy_history.pop_front();
                }
                let alive_lineages: crate::hashing::FxHashSet<String> = self
                    .organisms
                    .iter()
                    .filter(|o| o.alive)
                    .map(|o| o.lineage_id.clone())
                    .collect();
                self.lineage_names.retain(|k, _| alive_lineages.contains(k));
                self.lineage_strategies.retain(|k, _| alive_lineages.contains(k));
                self.lineage_strategy_objectives
                    .retain(|k, _| alive_lineages.contains(k));
                self.lineage_centroid_history
                    .retain(|k, _| alive_lineages.contains(k));
                self.lineage_elders.retain(|k, _| alive_lineages.contains(k));
            }
        }
        before - self.organisms.len()
    }

    fn cull_dead(&mut self, keep: &[bool]) {
        let tick = self.tick_count;
        for (o, _) in self.organisms.iter().zip(keep).filter(|(_, k)| !**k) {
            self.pending_memory_flushes
                .extend(PendingMemoryFlush::of(o, tick));
        }
        let mut i = 0;
        self.organisms.retain(|_| {
            i += 1;
            keep[i - 1]
        });
    }
}

pub(super) fn read_self_rss_kb_local() -> u64 {
    let s = match std::fs::read_to_string("/proc/self/status") {
        Ok(s) => s,
        Err(_) => return 0,
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            return rest
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::memory_pressure::MemoryPressure;

    fn kill_with_memories(sim: &mut Simulation, n: usize) -> Vec<String> {
        let tick = sim.tick_count;
        let mut ids = Vec::new();
        for o in sim.organisms.iter_mut().filter(|o| o.alive).take(n) {
            o.memories.insert(MemoryEntry::new(
                MemoryKind::Bond,
                String::from("a day by the river"),
                tick,
            ));
            o.alive = false;
            ids.push(o.id.clone());
        }
        ids
    }

    #[test]
    fn critical_trim_queues_the_memories_of_the_dead_it_drops() {
        let mut sim = Simulation::new(11);
        sim.pending_memory_flushes.clear();
        let dead = kill_with_memories(&mut sim, 3);
        let dropped = sim.apply_memory_pressure(MemoryPressure::Critical);
        assert_eq!(dropped, 3);
        assert!(sim.organisms.iter().all(|o| !dead.contains(&o.id)));
        let flushed: Vec<&str> = sim
            .pending_memory_flushes
            .iter()
            .map(|f| f.org_id.as_str())
            .collect();
        for id in &dead {
            assert!(flushed.contains(&id.as_str()), "{id} was dropped without a flush");
        }
    }

    #[test]
    fn elevated_trim_keeps_recent_stories_and_flushes_old_ones() {
        let mut sim = Simulation::new(11);
        sim.pending_memory_flushes.clear();
        sim.tick_count = 40_000;
        let dead = kill_with_memories(&mut sim, 2);
        for o in sim.organisms.iter_mut() {
            if o.id == dead[0] {
                o.last_story_tick = 0;
            } else if o.id == dead[1] {
                o.last_story_tick = 39_000;
            }
        }
        let dropped = sim.apply_memory_pressure(MemoryPressure::Elevated);
        assert_eq!(dropped, 1);
        assert!(sim.organisms.iter().any(|o| o.id == dead[1]));
        assert_eq!(sim.pending_memory_flushes.len(), 1);
        assert_eq!(sim.pending_memory_flushes[0].org_id, dead[0]);
        assert_eq!(sim.apply_memory_pressure(MemoryPressure::Normal), 0);
    }
}
