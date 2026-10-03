use super::*;

impl Simulation {
    pub(super) fn cmd_war(&mut self, x: f32, y: f32) -> bool {
        self.set_nearest_tribes_relation(x, y, -1.0)
    }

    pub(super) fn cmd_peace(&mut self, x: f32, y: f32) -> bool {
        self.set_nearest_tribes_relation(x, y, 1.0)
    }

    pub(super) fn cmd_rename_tribe(&mut self, lineage: String, name: String) -> bool {
        self.rename_tribe(&lineage, &name)
    }

    pub(super) fn cmd_teach(&mut self, lineage: String) -> bool {
        self.teach_tribe(&lineage)
    }

    pub(super) fn cmd_guide(&mut self, lineage: String, strategy: String, duration_ticks: u64) -> bool {
        let valid_strategy = matches!(
            strategy.as_str(),
            "hunt" | "explore" | "settle" | "trade" | "defend"
        );
        let valid_duration = (MIN_STRATEGY_DURATION..=MAX_STRATEGY_DURATION).contains(&duration_ticks);
        let living_lineage = self
            .organisms
            .iter()
            .any(|organism| organism.alive && organism.lineage_id == lineage);
        if !valid_strategy || !valid_duration || !living_lineage {
            return false;
        }

        let expires_at = self.tick_count.saturating_add(duration_ticks);
        for organism in self
            .organisms
            .iter_mut()
            .filter(|organism| organism.alive && organism.lineage_id == lineage)
        {
            let active_personal_directive = self.tick_count < organism.directive_until
                && !organism.directive.is_empty()
                && !matches!(
                    organism.directive.as_str(),
                    "hunt" | "explore" | "settle" | "trade" | "defend"
                );
            if !active_personal_directive {
                organism.directive.clone_from(&strategy);
                organism.directive_until = expires_at;
            }
        }
        if strategy == "explore" {
            self.launch_lineage_expedition(&lineage);
        }
        self.start_strategy_objective(&lineage, &strategy, expires_at);
        self.lineage_strategies.insert(lineage, (strategy, expires_at));
        true
    }

    /// Sets how the two lineages nearest (x, y) feel about each other:
    /// -1 is war, +1 is friendship. Fails unless two tribes are around.
    pub(super) fn set_nearest_tribes_relation(&mut self, x: f32, y: f32, attitude: f32) -> bool {
        let mut by_lineage: Vec<(String, f32)> = Vec::new();
        for o in self
            .organisms
            .iter()
            .filter(|o| o.alive && !o.lineage_id.is_empty())
        {
            let d = (o.x - x).hypot(o.y - y);
            match by_lineage.iter_mut().find(|(lid, _)| *lid == o.lineage_id) {
                Some((_, best)) => *best = best.min(d),
                None => by_lineage.push((o.lineage_id.clone(), d)),
            }
        }
        by_lineage.sort_by(|a, b| a.1.total_cmp(&b.1));
        let [(a, _), (b, _), ..] = by_lineage.as_slice() else {
            return false;
        };
        let (a, b) = (a.clone(), b.clone());
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if o.lineage_id == a {
                o.lineage_attitudes.insert(b.clone(), attitude);
            } else if o.lineage_id == b {
                o.lineage_attitudes.insert(a.clone(), attitude);
            }
        }
        let name = |lid: &str| {
            self.lineage_names
                .get(lid)
                .cloned()
                .unwrap_or_else(|| lid.to_string())
        };
        let (an, bn) = (name(&a), name(&b));
        let (kind, detail) = if attitude < 0.0 {
            ("war", format!("{an} and {bn} turned on each other"))
        } else {
            ("peace", format!("{an} and {bn} made peace"))
        };
        push_event(&mut self.events, self.tick_count, kind, "the gods", &detail);
        true
    }

    /// Lineage of the closest living person within `radius`, if any.
    pub(super) fn nearest_living_lineage(&self, x: f32, y: f32, radius: f32) -> Option<String> {
        self.organisms
            .iter()
            .filter(|o| o.alive && !o.lineage_id.is_empty())
            .map(|o| (o, (o.x - x).hypot(o.y - y)))
            .filter(|&(_, d)| d <= radius)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(o, _)| o.lineage_id.clone())
    }

    /// Guiding a lineage to explore sends its adults on one shared journey to
    /// distant good land. A directive alone only nudged action scores, so
    /// "explore" rarely made anyone travel.
    pub(super) fn launch_lineage_expedition(&mut self, lineage: &str) {
        let members: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lineage && o.age >= 700)
            .map(|(i, _)| i)
            .collect();
        if members.is_empty() {
            return;
        }
        let n = members.len() as f32;
        let cx = members.iter().map(|&i| self.organisms[i].x).sum::<f32>() / n;
        let cy = members.iter().map(|&i| self.organisms[i].y).sum::<f32>() / n;
        let Some(target) = self.find_distant_land_target(cx as i32, cy as i32, 40, 140) else {
            return;
        };
        let tick = self.tick_count;
        for i in members {
            self.organisms[i].begin_journey(target, "on an expedition", tick);
        }
    }

    pub(crate) fn refresh_lineage_guidance(&mut self, organism_index: usize) {
        let Some(organism) = self.organisms.get(organism_index) else {
            return;
        };
        if !organism.alive || (self.tick_count < organism.directive_until && !organism.directive.is_empty()) {
            return;
        }
        let Some((strategy, expires_at)) = self
            .lineage_strategies
            .get(&organism.lineage_id)
            .filter(|(_, expires_at)| *expires_at > self.tick_count)
            .cloned()
        else {
            return;
        };
        let organism = &mut self.organisms[organism_index];
        organism.directive = strategy;
        organism.directive_until = expires_at;
    }
}
