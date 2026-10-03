use super::*;

impl Simulation {
    /// Periodic routines: feed and teach kin, remember places, seasonal migration, and inventing new things.
    pub(super) fn org_routines(&mut self, f: &mut OrgFrame<'_>) {
        let idx = f.idx;
        let org_idx_by_id = f.org_idx_by_id;
        let spatial = f.spatial;

        if self.organisms[idx].energy > 0.82 && self.tick_count - self.organisms[idx].last_fed_kin >= 180 {
            social::share_food(
                idx,
                &mut self.organisms,
                spatial,
                self.tick_count,
                &mut self.events,
            );
        }

        // Any organism with knowledge can teach nearby kin - not just elders.
        // Stagger by idx so not all organisms try to teach on the same tick.
        let can_teach = !self.organisms[idx].discoveries.is_empty() || self.organisms[idx].is_elder;
        if can_teach && self.tick_count % 120 == (idx as u64 % 120) {
            social::teach(
                idx,
                &mut self.organisms,
                spatial,
                self.tick_count,
                &mut self.events,
                &mut self.rng,
            );
        }

        if self.tick_count % 2000 == (idx as u64 % 2000) {
            {
                let org = &mut self.organisms[idx];
                if org.danger_memory.len() > 15 {
                    org.traits.aggression = (org.traits.aggression + 0.005).min(1.0);
                    org.traits.fear = (org.traits.fear + 0.003).min(1.0);
                }
                let social_success = org.lineage_attitudes.values().filter(|&&v| v > 0.3).count();
                if social_success >= 2 {
                    org.traits.social_tendency = (org.traits.social_tendency + 0.005).min(1.0);
                }
                if org.food_memory.len() > 20 {
                    org.traits.curiosity = (org.traits.curiosity + 0.003).min(1.0);
                }
                if org.health < 0.4 {
                    org.traits.resilience = (org.traits.resilience + 0.004).min(1.0);
                }
            }
            check_earned_attributes(&mut self.organisms[idx]);
        }

        let season = self.season();
        if scarcity_driven_migration_season(season) {
            let (ox2, oy2) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let food_near = (-8i32..=8)
                .any(|ddx| (-8i32..=8).any(|ddy| self.grid.get(ox2 + ddx, oy2 + ddy) == Tile::Food));
            if !food_near
                && self.organisms[idx].food_memory.len() < 8
                && self.rng.random::<f32>() < 0.0015
                && self.organisms[idx].wander_target.is_none()
                && self.organisms[idx].energy > 0.4
            {
                let hash = self.tick_count ^ idx as u64;
                let tx = (ox2 + ((hash % 40) as i32 - 20)).clamp(5, WIDTH as i32 - 5);
                let ty = (oy2 + ((hash / 40 % 30) as i32 - 15)).clamp(5, HEIGHT as i32 - 5);
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].think("migrating for food", self.tick_count);
            }
        }

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let partner_pos = org_idx_by_id.get(pid).copied();
            let dead = partner_pos.map(|p| !self.organisms[p].alive).unwrap_or(true);
            if dead {
                let partner_name = partner_pos
                    .map(|p| self.organisms[p].name.clone())
                    .or_else(|| {
                        self.organisms
                            .iter()
                            .find(|o| &o.id == pid)
                            .map(|o| o.name.clone())
                    })
                    .unwrap_or_else(|| "partner".to_string());
                let tc = self.tick_count;
                let pid_owned = pid.clone();
                self.organisms[idx].partner_id = None;
                self.organisms[idx].grief_ticks = (self.organisms[idx].grief_ticks + 120).min(300);
                self.organisms[idx].log_life_rel(
                    tc,
                    "loss",
                    format!("lost my beloved {}", partner_name),
                    Some(pid_owned),
                    Some(partner_name),
                );
            }
        }
        if let Some(ref aid) = self.organisms[idx].attracted_to.clone() {
            let gone = !org_idx_by_id
                .get(aid)
                .is_some_and(|&i| self.organisms[i].alive && self.organisms[i].partner_id.is_none());
            if gone {
                self.organisms[idx].attracted_to = None;
            }
        }

        let tc = self.tick_count;
        let is_unpartnered_adult = self.organisms[idx].partner_id.is_none()
            && self.organisms[idx].alive
            && self.organisms[idx].age > 1000
            && self.organisms[idx].traits.social_tendency > 0.15;

        f.is_unpartnered_adult = is_unpartnered_adult;
        f.tc = tc;
    }
}
