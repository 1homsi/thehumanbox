use super::*;

impl Simulation {
    /// Scan for dangerous animals, build the organism's perception of its surroundings, and note an emergency storm shelter.
    pub(super) fn org_threats(
        &mut self,
        f: &mut OrgFrame<'_>,
        look: &super::observe::SenseLook,
        crowd: Option<crate::sim::agents::wander::KinCrowd>,
    ) {
        let idx = f.idx;
        let lineage_members = &mut *f.lineage_members;
        let night = f.night;
        let perception_buf = &mut *f.perception_buf;
        let spatial = f.spatial;

        let (ox, oy) = (look.ox, look.oy);
        let fear_trait = look.fear_trait;
        let animal_near = look.animal_near;
        let wolf_threat = look.wolf_threat;
        let threat_kind = look.threat_kind;
        let threat_summoned = look.threat_summoned;
        let summoned_threat = look.summoned_threat;

        let perception = match f.pre_perception.take() {
            Some(perception) => perception,
            None => self.organisms[idx].perceive_into(
                &self.grid,
                &self.organisms,
                night,
                animal_near,
                spatial,
                perception_buf,
            ),
        };
        let prior_lineage = self.organisms[idx].lineage_id;
        self.validate_or_assign_wander_target_indexed(idx, spatial, lineage_members, crowd);
        if self.organisms[idx].lineage_id != prior_lineage {
            if let Some(members) = lineage_members.get_mut(prior_lineage.as_str()) {
                members.retain(|&member_idx| member_idx != idx);
            }
            let members = lineage_members.entry(self.organisms[idx].lineage_id).or_default();
            let position = members.binary_search(&idx).unwrap_or_else(|position| position);
            members.insert(position, idx);
        }
        if let Some((_, wx, wy)) = wolf_threat {
            let wx_i = wx as i32;
            let wy_i = wy as i32;
            let prev = self.organisms[idx]
                .danger_memory
                .get(&(wx_i, wy_i))
                .copied()
                .unwrap_or(0.0);
            self.organisms[idx]
                .danger_memory
                .insert((wx_i, wy_i), (prev + 0.4).min(1.0));
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.05).min(1.0);
        }

        // Need-driven construction: during storms, organisms with wood and no nearby shelter
        // urgently build wherever they're standing if the tile allows it.
        let storm_build: Option<(usize, Option<String>)> = self
            .should_start_emergency_shelter(idx)
            .then(|| (49, Some("must build shelter now!".to_string())));

        f.animal_near = animal_near;
        f.fear_trait = fear_trait;
        f.ox = ox;
        f.oy = oy;
        f.perception = perception;
        f.storm_build = storm_build;
        f.threat_kind = threat_kind;
        f.wolf_threat = wolf_threat;
        f.threat_summoned = threat_summoned;
        f.summoned_threat = summoned_threat;
    }
}
