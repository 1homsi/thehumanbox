use super::*;

impl Simulation {
    pub fn apply_memory_pressure(&mut self, pressure: crate::sim::memory_pressure::MemoryPressure) {
        use crate::sim::memory_pressure::MemoryPressure;
        match pressure {
            MemoryPressure::Normal => (),
            MemoryPressure::Elevated => {
                self.organisms.retain(|o| {
                    o.alive
                        || growth::is_pending_birth(o)
                        || self.tick_count.saturating_sub(o.last_story_tick) < 30_000
                });
                let mut dead_kept = 0usize;
                self.organisms.retain(|o| {
                    if o.alive || growth::is_pending_birth(o) {
                        return true;
                    }
                    dead_kept += 1;
                    dead_kept <= 400
                });
                for o in self.organisms.iter_mut().filter(|o| o.alive) {
                    o.trim_cognitive_state(false);
                }
            }
            MemoryPressure::Critical => {
                self.organisms.retain(|o| o.alive || growth::is_pending_birth(o));
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
                let alive_lineages: rustc_hash::FxHashSet<String> = self
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
