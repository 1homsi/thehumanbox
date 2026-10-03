use super::*;

impl Organism {
    pub(crate) fn begin_journey(&mut self, target: (i32, i32), description: &str, tick: u64) {
        // Don't set out again for somewhere we just found no way to reach.
        if self.route.get_mut().recently_blocked(target) {
            return;
        }
        let distance = (target.0 - self.x as i32)
            .abs()
            .max((target.1 - self.y as i32).abs()) as u64;
        self.wander_target = Some(target);
        self.journey = Some(Journey {
            target,
            description: description.to_string(),
            // Long trips need room: at the old 800-tick cap most distant
            // journeys expired before arriving.
            expires_at: tick + (distance * 4).clamp(80, 2400),
        });
        self.think(description, tick);
        self.log_life(
            tick,
            "life",
            format!("set out: {} toward ({}, {})", description, target.0, target.1),
        );
    }

    pub(crate) fn toward(&self, target: (i32, i32), grid: &WorldGrid) -> usize {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let (tx, ty) = target;
        let dx = tx - ix;
        let dy = ty - iy;
        let target_is_water = grid.get(tx, ty) == Tile::Water;
        let direct = (ix + dx.signum(), iy + dy.signum());
        let direct_tile = grid.get(direct.0, direct.1);
        let blocked = !direct_tile.walkable()
            || (!target_is_water && direct_tile == Tile::Water && grid.depth_at(direct.0, direct.1) > 0.18);
        let distance = dx.abs().max(dy.abs());
        // Already routing around something toward this goal: keep to the
        // route, or the greedy step below walks straight back into it.
        if let Some(action) = self.route.borrow_mut().follow(grid, (ix, iy), target) {
            return action;
        }
        if blocked && distance > 1 {
            let mut route = self.route.borrow_mut();
            let plan = if route.skip_blocked(target) {
                None
            } else {
                crate::organism::navigation::plan_route(grid, (ix, iy), target)
            };
            match plan {
                Some(steps) => {
                    route.goal = target;
                    route.steps = steps;
                    route.next = 0;
                    if let Some(action) = route.follow(grid, (ix, iy), target) {
                        return action;
                    }
                }
                None => {
                    if !route.recently_blocked(target) {
                        route.mark_blocked(target);
                    }
                    drop(route);
                    if let Some(action) = crate::organism::navigation::detour_step(grid, (ix, iy), target) {
                        return action;
                    }
                }
            }
        }
        let mut best_action = 0;
        let mut best_score = f32::NEG_INFINITY;
        for (i, (adx, ady)) in DIRECTIONS.iter().enumerate() {
            let nx = ix + adx;
            let ny = iy + ady;
            let progress = *adx * dx + *ady * dy;
            let mut score = progress as f32;
            // Mild momentum: stepping straight back against the current
            // velocity costs a little, so equal-progress options around an
            // obstacle don't alternate every tick. A real reversal with full
            // progress still wins.
            if *adx as f32 * self.vx_smooth + *ady as f32 * self.vy_smooth < -0.5 {
                score -= 1.5;
            }
            let t = grid.get(nx, ny);
            // `Fire` is technically walkable, but standing in it burns and
            // costs reward, so exclude it the same way `has_progress_step`
            // and `navigation::detour_step` already do.
            if !t.walkable() || t == Tile::Fire {
                score = f32::NEG_INFINITY;
            }
            if t == Tile::Water {
                let depth = grid.depth_at(nx, ny);
                if target_is_water {
                    score -= depth * 8.0;
                } else if depth > 0.18 {
                    score -= 10_000.0;
                } else {
                    score -= 6.0;
                }
            }
            let hazard = grid.hazard_at(nx, ny);
            if hazard > 0.0 {
                let cautiousness = 0.7 + self.traits.fear * 0.8 + (1.0 - self.health).max(0.0) * 0.5;
                let hazard_penalty = hazard * 14.0 * cautiousness;
                if progress <= 0 {
                    score -= hazard_penalty;
                } else {
                    score -= hazard_penalty.min(progress as f32 - 0.25);
                }
            }
            if score > best_score {
                best_score = score;
                best_action = i;
            }
        }
        best_action
    }

    pub(crate) fn nearest_land(&self, grid: &WorldGrid, radius: i32) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_dist = radius + 1;
        let mut best = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = ix + dx;
                let ny = iy + dy;
                let tile = grid.get(nx, ny);
                if matches!(
                    tile,
                    Tile::Water | Tile::Rock | Tile::Void | Tile::Fire | Tile::Hut | Tile::Mineral
                ) {
                    continue;
                }
                let dist = dx.abs() + dy.abs();
                if dist > 0 && dist < best_dist {
                    best_dist = dist;
                    best = Some((nx, ny));
                }
            }
        }
        best
    }

    pub(crate) fn nearest_visible(
        &self,
        grid: &WorldGrid,
        tile_type: Tile,
        radius: i32,
    ) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_dist = radius + 1;
        let mut best_loc = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                if grid.get(ix + dx, iy + dy) == tile_type {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist {
                        best_dist = dist;
                        best_loc = Some((ix + dx, iy + dy));
                    }
                }
            }
        }
        best_loc
    }

    pub(crate) fn find_trail_target(
        &self,
        grid: &WorldGrid,
        kind: TrailKind,
        radius: i32,
    ) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_val = 0.35f32;
        let mut best_loc = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let v = grid.trail_at(ix + dx, iy + dy, kind);
                if v > best_val {
                    best_val = v;
                    best_loc = Some((ix + dx, iy + dy));
                }
            }
        }
        best_loc
    }
}
