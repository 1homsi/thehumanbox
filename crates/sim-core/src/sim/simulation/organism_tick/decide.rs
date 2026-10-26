use super::*;

impl Simulation {
    /// Choose this tick's action (learned policy, directives, storm needs), drop goals walled off by terrain, and commit to a retreat from danger.
    pub(super) fn org_decide(&mut self, f: &mut OrgFrame<'_>) {
        self.organisms[f.idx].route.get_mut().decay_blocked();
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
            } else if let Some(((dist, wx, wy), from_pack)) =
                flight_threat(wolf_threat, f.threat_summoned, f.summoned_threat).filter(|&(_, from_pack)| {
                    // Already home and sheltered from a pack: no need to run, so the normal choice stands.
                    let home = (self.organisms[idx].home_x, self.organisms[idx].home_y);
                    !(from_pack && (home.0 - ox).abs() < 1.0 && (home.1 - oy).abs() < 1.0)
                })
            {
                let fdx = (ox - wx).signum();
                let fdy = (oy - wy).signum();
                // Set a distant flee target so they keep running after the wolf leaves range.
                // When home is near and lies on the far side from the threat, they run for home.
                let flee_dist = 20.0 + fear_trait * 30.0;
                let (hx, hy) = (self.organisms[idx].home_x, self.organisms[idx].home_y);
                // A summoned pack sends people home to shelter when home is within reach and the way there
                // is dry land (running home across water is how people drowned in the sweeps); otherwise
                // they run as they do from any beast.
                let shelter_near = (hx - ox).abs() + (hy - oy).abs() <= SHELTER_REACH;
                let shelter_dry = dry_line(&self.grid, (ox, oy), (hx, hy));
                let run_home = if from_pack {
                    shelter_near && shelter_dry
                } else {
                    home_is_the_way_out((hx, hy), (ox, oy), (wx, wy))
                };
                let (tx, ty) = if run_home {
                    (hx.round() as i32, hy.round() as i32)
                } else {
                    // A pack's direction uses sign_of: f32::signum would call a zero offset 1.
                    let (pdx, pdy) = if from_pack {
                        (sign_of(ox - wx), sign_of(oy - wy))
                    } else {
                        (fdx, fdy)
                    };
                    safe_flee_target(&self.grid, ox, oy, pdx, pdy, flee_dist)
                };
                // The step follows the way it is going: towards home when running there, else away.
                let (sx, sy) = if from_pack {
                    if run_home {
                        (sign_of(hx - ox), sign_of(hy - oy))
                    } else {
                        (sign_of(ox - wx), sign_of(oy - wy))
                    }
                } else {
                    (fdx, fdy)
                };
                let mut dir = match (sx as i32, sy as i32) {
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
                // A pack flight's immediate step never enters water: it takes the dry neighbour nearest
                // its target instead, or keeps the step if there is none.
                if from_pack && step_is_wet(&self.grid, ox, oy, dir) {
                    dir = dry_step_towards(&self.grid, ox, oy, tx, ty).unwrap_or(dir);
                }
                // A pack flight never aims at water; with no dry target it keeps its old course.
                let wet_target = from_pack && self.grid.is_wet(self.grid.get(tx, ty), tx, ty);
                if !wet_target {
                    self.organisms[idx].wander_target = Some((tx, ty));
                }
                // The fear grows with closeness; a threat beyond the close range adds nothing.
                self.organisms[idx].fear_level =
                    (self.organisms[idx].fear_level + 0.07 + ((2.5 - dist) * 0.02).max(0.0)).min(1.0);
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
        // A single step away from remembered danger or fire was undone by the
        // next tick's routine, so people flip-flopped on the spot. Commit to the
        // retreat by aiming the wander target further along the flee step.
        if action < 8 && matches!(new_thought.as_deref(), Some("avoiding danger" | "heat dangerous")) {
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
/// How far (Manhattan tiles) home may be for people to run there from a summoned pack.
const SHELTER_REACH: f32 = 30.0;

/// The threat a person runs from this tick, and whether it is a summoned pack. A wild wolf counts when it is
/// within 2.5 tiles, as it always has; otherwise the nearest summoned wolf within the alarm radius does.
fn flight_threat(
    wild: Option<(f32, f32, f32)>,
    wild_is_summoned: bool,
    pack: Option<(f32, f32, f32)>,
) -> Option<((f32, f32, f32), bool)> {
    match wild {
        Some(w) if w.0 <= 2.5 && !wild_is_summoned => Some((w, false)),
        _ => pack.map(|p| (p, true)),
    }
}

/// The sign of an offset: -1, 0 or 1. Unlike `f32::signum`, a zero offset gives 0.
fn sign_of(d: f32) -> f32 {
    if d > 0.0 {
        1.0
    } else if d < 0.0 {
        -1.0
    } else {
        0.0
    }
}

/// The eight steps a person can take, in the order their action numbers use (see `decide`).
const STEPS: [(i32, i32); 8] = [
    (0, -1),
    (0, 1),
    (-1, 0),
    (1, 0),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

/// True when a step onto this tile keeps a person out of water and fire.
fn dry_tile(grid: &WorldGrid, x: i32, y: i32) -> bool {
    let tile = grid.get(x, y);
    tile.walkable() && tile != Tile::Fire && !grid.is_wet(tile, x, y)
}

/// True when the step in direction `dir` from (ox, oy) lands in water.
fn step_is_wet(grid: &WorldGrid, ox: f32, oy: f32, dir: usize) -> bool {
    let (dx, dy) = STEPS[dir];
    let (x, y) = (ox as i32 + dx, oy as i32 + dy);
    grid.is_wet(grid.get(x, y), x, y)
}

/// The action number of the dry neighbour nearest (tx, ty), or None when every neighbour is wet.
fn dry_step_towards(grid: &WorldGrid, ox: f32, oy: f32, tx: i32, ty: i32) -> Option<usize> {
    let (ix, iy) = (ox as i32, oy as i32);
    (0..8)
        .filter(|&d| {
            let (dx, dy) = STEPS[d];
            dry_tile(grid, ix + dx, iy + dy)
        })
        .min_by_key(|&d| {
            let (dx, dy) = STEPS[d];
            (tx - (ix + dx)).abs() + (ty - (iy + dy)).abs()
        })
}

/// True when every tile on the straight line from `from` to `to` is dry ground a person can walk on.
/// A hut at the end is allowed: it is the shelter itself, and people walk up to its doorstep.
fn dry_line(grid: &WorldGrid, from: (f32, f32), to: (f32, f32)) -> bool {
    let steps = (to.0 - from.0).abs().max((to.1 - from.1).abs()).ceil().max(1.0) as i32;
    (0..=steps).all(|s| {
        let t = s as f32 / steps as f32;
        let x = (from.0 + (to.0 - from.0) * t).round() as i32;
        let y = (from.1 + (to.1 - from.1) * t).round() as i32;
        let end_hut = s == steps && grid.get(x, y) == Tile::Hut;
        end_hut || dry_tile(grid, x, y)
    })
}

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
