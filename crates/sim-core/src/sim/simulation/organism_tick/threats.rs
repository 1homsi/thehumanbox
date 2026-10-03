use super::*;

impl Simulation {
    /// Scan for dangerous animals, build the organism's perception of its surroundings, and note an emergency storm shelter.
    pub(super) fn org_threats(&mut self, f: &mut OrgFrame<'_>) {
        let animal_spatial = f.animal_spatial;
        let idx = f.idx;
        let lineage_members = &mut *f.lineage_members;
        let night = f.night;
        let perception_buf = &mut *f.perception_buf;
        let spatial = f.spatial;
        let spatial_buf = &mut *f.spatial_buf;

        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let fear_trait = self.organisms[idx].traits.fear;
        let wolf_flee_radius = 6.0 + fear_trait * 8.0;

        // Animal positions are stable until tick_animals, after all human
        // actions. Query only local candidates, in original animal order.
        let mut animal_near = false;
        let mut wolf_threat: Option<(f32, f32, f32)> = None;
        let mut threat_kind = AnimalKind::Wolf;
        animal_spatial.query_into(
            ox as i32,
            oy as i32,
            wolf_flee_radius.max(8.0).ceil() as i32,
            spatial_buf,
        );
        spatial_buf.sort_unstable();
        for &animal_idx in spatial_buf.iter() {
            let a = &self.animals[animal_idx];
            if !a.alive {
                continue;
            }
            let d = (a.x - ox).abs() + (a.y - oy).abs();
            if d <= 8.0 {
                animal_near = true;
            }
            if a.kind.hostile()
                && !a.sleeping
                && d <= wolf_flee_radius
                && wolf_threat.map(|(bd, _, _)| d < bd).unwrap_or(true)
            {
                wolf_threat = Some((d, a.x, a.y));
                threat_kind = a.kind;
            }
        }

        let perception = self.organisms[idx].perceive_into(
            &self.grid,
            &self.organisms,
            night,
            animal_near,
            spatial,
            perception_buf,
        );
        let prior_lineage = self.organisms[idx].lineage_id.clone();
        self.validate_or_assign_wander_target_indexed(idx, spatial, lineage_members);
        if self.organisms[idx].lineage_id != prior_lineage {
            if let Some(members) = lineage_members.get_mut(&prior_lineage) {
                members.retain(|&member_idx| member_idx != idx);
            }
            let members = lineage_members
                .entry(self.organisms[idx].lineage_id.clone())
                .or_default();
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
    }
}
