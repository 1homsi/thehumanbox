use super::*;

impl Simulation {
    /// Learn from the tick (reinforcement update), then what a well-fed, hydrated organism does: share knowledge with kin.
    pub(super) fn org_learning(&mut self, f: &mut OrgFrame<'_>) {
        let action = f.action;
        let available_buf = &mut *f.available_buf;
        let idx = f.idx;
        let lineage = std::mem::take(&mut f.lineage);
        let lineage_members = &mut *f.lineage_members;
        let next_perception = std::mem::take(&mut f.next_perception);
        let night = f.night;
        let org_idx_by_id = f.org_idx_by_id;
        let perception = std::mem::take(&mut f.perception);
        let reward = f.reward;
        let spatial = f.spatial;
        let spatial_buf = &mut *f.spatial_buf;

        self.organisms[idx].learn_with_available_actions(
            &perception,
            action,
            reward,
            &next_perception,
            Some(available_buf),
        );

        if self.organisms[idx].energy > 0.7 && self.organisms[idx].hydration > 0.7 {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let neighbour_idxs = spatial.query(ox as i32, oy as i32, 3);
            let nearby_kin = neighbour_idxs
                .iter()
                .copied()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id == lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                })
                .count();
            let nearby_stranger_count = neighbour_idxs
                .iter()
                .copied()
                .filter(|&i| {
                    if i == idx {
                        return false;
                    }
                    let o = &self.organisms[i];
                    o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                })
                .count();
            let thought = self.organisms[idx].thought.clone();
            if nearby_kin >= 1 && matches!(thought.as_str(), "exploring" | "observing" | "satisfied") {
                self.organisms[idx].think("socializing", self.tick_count);
                social::social_knowledge_share(
                    idx,
                    &mut self.organisms,
                    spatial,
                    self.tick_count,
                    &mut self.rng,
                );
            } else if nearby_stranger_count >= 1
                && matches!(
                    thought.as_str(),
                    "exploring" | "observing" | "satisfied" | "wary" | "coexisting peacefully"
                )
            {
                let nearest_lid: Option<String> = spatial
                    .ordered_nearby(&self.organisms, ox, oy, 3)
                    .map(|(_, o)| o)
                    .filter(|o| {
                        o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                    })
                    .min_by(|a, b| {
                        let da = (a.x - ox).abs() + (a.y - oy).abs();
                        let db = (b.x - ox).abs() + (b.y - oy).abs();
                        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|o| o.lineage_id.clone());
                if let Some(lid) = nearest_lid {
                    if self.organisms[idx].attitude_toward(&lid) >= 0.25 {
                        self.organisms[idx].think("coexisting peacefully", self.tick_count);
                        if self.tick_count % 60 == (idx as u64 % 60) {
                            social::social_knowledge_share(
                                idx,
                                &mut self.organisms,
                                spatial,
                                self.tick_count,
                                &mut self.rng,
                            );
                        }
                    } else {
                        self.organisms[idx].think("wary", self.tick_count);
                    }
                }
            } else if matches!(thought.as_str(), "exploring" | "observing") {
                self.organisms[idx].think("satisfied", self.tick_count);
            }
        }

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);

            let unknown_lid =
                crate::sim::spatial::first_unknown_nearby_lineage(&self.organisms, idx, spatial, spatial_buf);
            if let Some(stranger_lid) = unknown_lid {
                self.organisms[idx]
                    .lineage_attitudes
                    .insert(stranger_lid.clone(), 0.001);
            }

            let last_council = *self.lineage_last_council.get(&my_lid).unwrap_or(&0);
            if self.tick_count - last_council >= 6000 {
                let (kin_sum, kin_count) = living_lineage_members(&self.organisms, lineage_members, &my_lid)
                    .filter(|o| (o.x - ox).abs() + (o.y - oy).abs() <= 6.0)
                    .fold((0.0f32, 0u32), |(s, n), o| (s + o.energy, n + 1));
                if kin_count >= 5 {
                    let avg = kin_sum / kin_count as f32;
                    if avg > 0.7 {
                        self.lineage_last_council.insert(my_lid.clone(), self.tick_count);
                    }
                }
            }

            {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let energy = self.organisms[idx].energy;
                let hydration = self.organisms[idx].hydration;
                let tick = self.tick_count;

                if energy < 0.25
                    && hydration < 0.25
                    && self.organisms[idx].think_ready("survival_crisis", tick, 600)
                {
                    self.organisms[idx].mark_thought("survival_crisis", tick);
                } else if energy > 0.85
                    && hydration > 0.85
                    && self.organisms[idx].think_ready("abundance", tick, 2400)
                {
                    self.organisms[idx].mark_thought("abundance", tick);
                }

                if self.organisms[idx].think_ready("threat", tick, 800) {
                    let hostile_near = {
                        let org = &self.organisms[idx];
                        spatial
                            .ordered_nearby(&self.organisms, ox2, oy2, 8)
                            .map(|(_, o)| o)
                            .filter(|o| o.alive && o.lineage_id != org.lineage_id)
                            .filter(|o| (o.x - ox2).abs() + (o.y - oy2).abs() <= 8.0)
                            .any(|o| org.attitude_toward(&o.lineage_id) < -0.3)
                    };
                    if hostile_near {
                        self.organisms[idx].mark_thought("threat", tick);
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.organisms[idx].think_ready("moral_dilemma", self.tick_count, 1500)
                && self.organisms[idx].energy < 0.18
            {
                let _ = last_think;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_partner = self.organisms[idx].partner_id.clone();
                let tempting = spatial
                    .ordered_nearby(&self.organisms, ox2, oy2, 4)
                    .map(|(_, o)| o)
                    .any(|o| {
                        o.alive
                            && o.id != self.organisms[idx].id
                            && o.inv_food > 0
                            && o.lineage_id != my_lid
                            && Some(&o.id) != my_partner.as_ref()
                            && (o.x - ox2).abs() + (o.y - oy2).abs() <= 4.0
                    });
                if tempting {
                    self.organisms[idx].last_think_tick = self.tick_count;
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 1500 {
                if let Some(partner_id) = self.organisms[idx].partner_id.clone() {
                    let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                    let my_id = self.organisms[idx].id.clone();
                    let my_sex = self.organisms[idx].sex;
                    let partner = org_idx_by_id
                        .get(&partner_id)
                        .map(|&i| &self.organisms[i])
                        .filter(|o| o.alive && (o.x - ox2).abs() + (o.y - oy2).abs() <= 5.0)
                        .map(|o| (o.x, o.y));
                    if let Some((px, py)) = partner {
                        let third = spatial
                            .ordered_nearby(&self.organisms, px, py, 5)
                            .map(|(_, o)| o)
                            .any(|o| {
                                o.alive
                                    && o.id != my_id
                                    && o.id != partner_id
                                    && o.sex != my_sex
                                    && (o.x - px).abs() + (o.y - py).abs() <= 5.0
                            });
                        if third {
                            self.organisms[idx].last_think_tick = self.tick_count;
                        }
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 2400 {
                use crate::organism::organism::Sex;
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let my_id = self.organisms[idx].id.clone();
                let my_sex = self.organisms[idx].sex;
                let my_age = self.organisms[idx].age;
                let my_eng = self.organisms[idx].energy;
                if my_sex == Sex::Male && my_age > 1200 && my_eng > 0.4 {
                    let rival = spatial
                        .ordered_nearby(&self.organisms, ox2, oy2, 6)
                        .map(|(_, o)| o)
                        .any(|o| {
                            o.alive
                                && o.id != my_id
                                && o.sex == Sex::Male
                                && o.lineage_id == my_lid
                                && o.age > 1200
                                && o.energy > 0.4
                                && (o.x - ox2).abs() + (o.y - oy2).abs() <= 6.0
                        });
                    if rival {
                        self.organisms[idx].last_think_tick = self.tick_count;
                    }
                }
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 8000
                && self.organisms[idx].age > 2000
                && self.organisms[idx].energy < 0.30
                && self.drought.active
            {
                self.organisms[idx].last_think_tick = self.tick_count;
            }

            let last_think = self.organisms[idx].last_think_tick;
            if self.tick_count - last_think >= 2400 {
                let loneliness = self.organisms[idx].loneliness;
                let boredom = self.organisms[idx].boredom;
                let energy = self.organisms[idx].energy;

                if loneliness > 0.78 || (boredom > 0.72 && energy > 0.75) {
                    self.organisms[idx].last_think_tick = self.tick_count;
                }
            }

            let season_now = self.season();
            if scarcity_driven_migration_season(season_now) {
                let (ox2, oy2) = (self.organisms[idx].x, self.organisms[idx].y);
                let last_think_m = self.organisms[idx].last_think_tick;
                let food_nearby = (-6i32..=6).any(|ddx| {
                    (-6i32..=6).any(|ddy| self.grid.get(ox2 as i32 + ddx, oy2 as i32 + ddy) == Tile::Food)
                });
                if !food_nearby && self.tick_count - last_think_m >= 8000 {
                    self.organisms[idx].last_think_tick = self.tick_count;
                }
            }

            if self.tick_count - self.organisms[idx].last_invention_tick >= 5000
                && self.organisms[idx].age > 400
            {
                let disc = &self.organisms[idx].discoveries;
                let candidates = invention_candidates(disc);
                if !candidates.is_empty() {
                    self.organisms[idx].last_invention_tick = self.tick_count;
                }
            }

            if night
                && !self.organisms[idx].has_reflected
                && self.organisms[idx].age > 800
                && self.organisms[idx].life_log.len() >= 4
            {
                self.organisms[idx].has_reflected = true;
            }
        }

        f.lineage = lineage;
    }
}
