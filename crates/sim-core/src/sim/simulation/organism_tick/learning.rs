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
