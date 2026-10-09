use super::*;

impl Simulation {
    /// Choose this tick's action (learned policy, directives, storm needs), drop goals walled off by terrain, and commit to a retreat from danger.
    pub(super) fn org_decide(&mut self, f: &mut OrgFrame<'_>) {
        let animal_near = f.animal_near;
        let available_buf = &mut *f.available_buf;
        let epsilon = f.epsilon;
        let fear_trait = f.fear_trait;
        let idx = f.idx;
        let night = f.night;
        let ox = f.ox;
        let oy = f.oy;
        let perception = std::mem::take(&mut f.perception);
        let spatial = f.spatial;
        let spatial_buf = &mut *f.spatial_buf;
        let storm_build = std::mem::take(&mut f.storm_build);
        let threat_kind = f.threat_kind;
        let wolf_threat = f.wolf_threat;

        let (action, new_thought, decision_origin): (usize, Option<String>, &'static str) =
            if let Some(boat_action) = self.boat_action(idx) {
                boat_action
            } else if let Some((action, thought)) = storm_build {
                (action, thought, "emergency_reflex")
            } else if let Some((dist, wx, wy)) = wolf_threat.filter(|(dist, _, _)| *dist <= 2.5) {
                let fdx = (ox - wx).signum();
                let fdy = (oy - wy).signum();
                let dir = match (fdx as i32, fdy as i32) {
                    (0, -1) => 0,
                    (0, 1) => 1,
                    (-1, 0) => 2,
                    (1, 0) => 3,
                    (-1, -1) => 4,
                    (1, -1) => 5,
                    (-1, 1) => 6,
                    (1, 1) => 7,
                    _ => 0,
                };
                // Set a distant flee target so they keep running after the wolf leaves range.
                // When home is near and lies on the far side from the threat, they run for home.
                let flee_dist = 20.0 + fear_trait * 30.0;
                let (hx, hy) = (self.organisms[idx].home_x, self.organisms[idx].home_y);
                let (tx, ty) = if home_is_the_way_out((hx, hy), (ox, oy), (wx, wy)) {
                    (hx.round() as i32, hy.round() as i32)
                } else {
                    safe_flee_target(&self.grid, ox, oy, fdx, fdy, flee_dist)
                };
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level + 0.07 + (2.5 - dist) * 0.02).min(1.0);
                (
                    dir,
                    Some(format!("{}! run!", threat_kind.name())),
                    "emergency_reflex",
                )
            } else {
                self.refresh_lineage_guidance(idx);
                let (oa_ix, oa_iy) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
                crate::sim::actions::available_actions_into(
                    self,
                    idx,
                    oa_ix,
                    oa_iy,
                    spatial,
                    available_buf,
                    spatial_buf,
                );
                let q_seen = self.organisms[idx].q_table.contains_key(&perception);
                let active_directive = if self.tick_count < self.organisms[idx].directive_until
                    && !self.organisms[idx].directive.is_empty()
                {
                    Some(self.organisms[idx].directive.clone())
                } else {
                    None
                };
                let active_wander_action = self.organisms[idx]
                    .wander_target
                    .map(|target| self.organisms[idx].toward(target, &self.grid));
                spatial.query_into(oa_ix, oa_iy, 16, spatial_buf);
                // Preserve population order for tie-breaking and resource followers.
                spatial_buf.sort_unstable();
                let chosen = self.organisms[idx].choose_action_with_neighbors(
                    &self.grid,
                    &self.buildings,
                    self.tick_count,
                    epsilon,
                    &self.organisms,
                    night,
                    self.weather.kind,
                    &mut self.rng,
                    animal_near,
                    &perception,
                    available_buf,
                    Some(spatial_buf),
                );
                let decision_origin = if active_wander_action == Some(chosen.0) {
                    "soft_wander"
                } else if active_directive
                    .as_deref()
                    .is_some_and(|directive| directive_aligns_action(directive, chosen.0))
                {
                    "soft_directive"
                } else if q_seen {
                    "learned_q"
                } else {
                    "seed_or_explore"
                };
                (chosen.0, chosen.1, decision_origin)
            };
        *self.decision_counts.entry(decision_origin).or_insert(0) += 1;
        if let Some(ref t) = new_thought {
            self.organisms[idx].think(t, self.tick_count);
        }
        // A goal walled off by mountains or water is given up rather than
        // paced at forever.
        {
            let o = &mut self.organisms[idx];
            let blocked = o.route.get_mut().unreachable.take();
            if let Some(goal) = blocked {
                let mut gave_up = false;
                if o.journey.as_ref().is_some_and(|j| j.target == goal) {
                    o.journey = None;
                    gave_up = true;
                }
                if o.wander_target == Some(goal) {
                    o.wander_target = None;
                    gave_up = true;
                }
                if gave_up {
                    o.think("the way is blocked", self.tick_count);
                }
            }
        }
        // A single step away from remembered danger was undone by the next
        // tick's routine, so people flip-flopped on the spot. Commit to the
        // retreat by aiming the wander target further along the flee step.
        if action < 8 && new_thought.as_deref() == Some("avoiding danger") {
            let (dx, dy) = DIRECTIONS[action];
            let o = &mut self.organisms[idx];
            let (ox, oy) = (o.x as i32, o.y as i32);
            // A journey that leads back toward the danger is abandoned, or it
            // walks them straight back on the next tick.
            if o.journey
                .as_ref()
                .is_some_and(|j| (j.target.0 - ox) * dx + (j.target.1 - oy) * dy < 0)
            {
                o.journey = None;
            }
            if o.journey.is_none() {
                o.wander_target = Some((
                    (ox + dx * 8).clamp(1, WIDTH as i32 - 2),
                    (oy + dy * 8).clamp(1, HEIGHT as i32 - 2),
                ));
            }
        }

        f.animal_near = animal_near;
        f.perception = perception;
        f.action = action;
        f.decision_origin = decision_origin;
        f.new_thought = new_thought;
    }
}

/// True when home is within 40 tiles and lies on the far side of the threat from the person, so running for home is running away.
pub(super) fn home_is_the_way_out(home: (f32, f32), me: (f32, f32), threat: (f32, f32)) -> bool {
    let (hx, hy) = home;
    let (ox, oy) = me;
    let (wx, wy) = threat;
    (hx - ox).abs().max((hy - oy).abs()) <= 40.0 && (hx - ox) * (ox - wx) + (hy - oy) * (oy - wy) > 0.0
}

#[cfg(test)]
mod tests {
    use super::home_is_the_way_out;

    #[test]
    fn home_behind_you_is_the_way_out_and_home_past_the_wolf_is_not() {
        // A wolf to the west: home to the east is away from it.
        assert!(home_is_the_way_out((30.0, 10.0), (20.0, 10.0), (15.0, 10.0)));
        // Home to the west is past the wolf.
        assert!(!home_is_the_way_out((12.0, 10.0), (20.0, 10.0), (15.0, 10.0)));
        // Home far away is not an escape, even on the far side.
        assert!(!home_is_the_way_out((90.0, 10.0), (20.0, 10.0), (15.0, 10.0)));
    }
}
