use super::*;

impl Simulation {
    /// Learn from the tick (reinforcement update), then what a well-fed, hydrated organism does: share knowledge with kin.
    pub(super) fn org_learning(&mut self, f: &mut OrgFrame<'_>) {
        let action = f.action;
        let available_buf = &mut *f.available_buf;
        let idx = f.idx;
        let lineage = std::mem::take(&mut f.lineage);
        let next_perception = std::mem::take(&mut f.next_perception);
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
            spatial.query_into(ox as i32, oy as i32, 3, spatial_buf);
            let nearby_kin = spatial_buf
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
            let nearby_stranger_count = spatial_buf
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
            // Read the current thought once: each branch below changes it.
            let thought = self.organisms[idx].thought.as_str();
            let settled = matches!(thought, "exploring" | "observing" | "satisfied");
            let open_to_strangers = matches!(
                thought,
                "exploring" | "observing" | "satisfied" | "wary" | "coexisting peacefully"
            );
            let idle = matches!(thought, "exploring" | "observing");
            if nearby_kin >= 1 && settled {
                self.organisms[idx].think("socializing", self.tick_count);
                social::social_knowledge_share(
                    idx,
                    &mut self.organisms,
                    spatial,
                    self.tick_count,
                    &mut self.rng,
                );
            } else if nearby_stranger_count >= 1 && open_to_strangers {
                ordered_nearby_filtered(&self.organisms, spatial, ox, oy, 3, spatial_buf, |_, o| {
                    o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
                });
                let nearest_lid: Option<String> = spatial_buf
                    .iter()
                    .map(|&i| &self.organisms[i])
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
            } else if idle {
                self.organisms[idx].think("satisfied", self.tick_count);
            }
        }

        {
            let unknown_lid =
                crate::sim::spatial::first_unknown_nearby_lineage(&self.organisms, idx, spatial, spatial_buf);
            if let Some(stranger_lid) = unknown_lid {
                self.organisms[idx]
                    .lineage_attitudes
                    .insert(stranger_lid.clone(), 0.001);
            }
        }

        f.lineage = lineage;
    }
}
