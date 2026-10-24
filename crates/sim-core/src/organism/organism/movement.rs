use super::*;

/// The pull of a road on a step that also makes progress, in tiles of progress (see `toward`).
const ROAD_PULL: f32 = 1.0;

/// Hydration below which someone walks through houses to reach water.
pub(crate) const PARCHED: f32 = 0.3;

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

    /// Sets out for `target` along the road route planned from here (a road costs less to walk, so the
    /// route keeps to the roads where they go). `false` when no route exists or the journey is refused.
    pub(crate) fn march_along_roads(
        &mut self,
        grid: &WorldGrid,
        target: (i32, i32),
        description: &str,
        tick: u64,
    ) -> bool {
        let here = (self.x as i32, self.y as i32);
        let Some(steps) = crate::organism::navigation::plan_route(grid, here, target) else {
            return false;
        };
        self.begin_journey(target, description, tick);
        if self.journey.is_none() {
            return false;
        }
        let route = self.route.get_mut();
        route.goal = target;
        route.steps = steps;
        route.next = 0;
        true
    }

    /// So thirsty that houses are no longer in the way: they walk through.
    pub(crate) fn parched(&self) -> bool {
        self.hydration < PARCHED
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
            || (!target_is_water
                && grid.is_wet(direct_tile, direct.0, direct.1)
                && grid.depth_at(direct.0, direct.1) > 0.18);
        let distance = dx.abs().max(dy.abs());
        // Already routing around something toward this goal: keep to the
        // route, or the greedy step below walks straight back into it.
        if let Some(action) = self.route.borrow_mut().follow(grid, (ix, iy), target) {
            return action;
        }
        // Where the walker stood at its last decision, and where it stood before that.
        let moved = {
            let mut route = self.route.borrow_mut();
            let moved = route.here != Some((ix, iy));
            if moved {
                route.before = route.here;
                route.here = Some((ix, iy));
            }
            moved
        };
        let through_houses = self.parched();
        let mut best_action = 0;
        let mut best_score = f32::NEG_INFINITY;
        let mut best_progress = 0;
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
            // and `navigation::detour_step` already do. Someone parched cuts
            // through a house rather than die of thirst behind a row of them.
            if through_houses && t == Tile::Hut {
                score -= 0.5;
            } else if !t.walkable() || t == Tile::Fire {
                score = f32::NEG_INFINITY;
            }
            if grid.is_wet(t, nx, ny) {
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
            // People keep to the roads they pass: a step onto one that also gets them closer is preferred
            // over the same step across open ground.
            if progress > 0 && grid.is_road(nx, ny) {
                score += ROAD_PULL;
            }
            if score > best_score {
                best_score = score;
                best_action = i;
                best_progress = progress;
            }
        }
        // The greedy step is not enough when it gets no closer at all (a local minimum behind a
        // wall, water or a hut), or when it steps straight back onto the tile the walker came from.
        // One such step is ordinary wiggling; a run of them is pacing between two tiles.
        let (bdx, bdy) = DIRECTIONS[best_action];
        let reversal = self.route.borrow().before == Some((ix + bdx, iy + bdy));
        if moved {
            let mut route = self.route.borrow_mut();
            route.reversals = if reversal {
                route.reversals.saturating_add(1)
            } else {
                0
            };
        }
        let pacing = self.route.borrow().reversals >= 2;
        // First a short local detour, one step at a time: it gets round a small obstacle far more cheaply
        // than a full route. A detour that steps back onto the tile just left is not trusted.
        if distance > 1 && !blocked && (pacing || best_progress <= 0) {
            if let Some(action) = crate::organism::navigation::detour_step(grid, (ix, iy), target) {
                let (ddx, ddy) = DIRECTIONS[action];
                if self.route.borrow().before != Some((ix + ddx, iy + ddy)) {
                    return action;
                }
            }
        }
        // Otherwise plan a route round it, or give the goal up for a while when there is none.
        if distance > 1 && (blocked || pacing || best_progress <= 0) {
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
                    if blocked {
                        if let Some(action) = crate::organism::navigation::detour_step(grid, (ix, iy), target)
                        {
                            return action;
                        }
                    }
                }
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
        self.nearest_visible_where(grid, tile_type, radius, |_| true)
    }

    /// The nearest tile of `tile_type` within `radius` that `keep` accepts.
    pub(crate) fn nearest_visible_where(
        &self,
        grid: &WorldGrid,
        tile_type: Tile,
        radius: i32,
        keep: impl Fn((i32, i32)) -> bool,
    ) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        // Off the map reads as `Void`; only a search for `Void` itself needs
        // the cell-by-cell walk that sees it.
        if tile_type == Tile::Void {
            let mut best_dist = radius + 1;
            let mut best_loc = None;
            for dx in -radius..=radius {
                for dy in -radius..=radius {
                    if grid.get(ix + dx, iy + dy) == tile_type && keep((ix + dx, iy + dy)) {
                        let dist = dx.abs() + dy.abs();
                        if dist < best_dist {
                            best_dist = dist;
                            best_loc = Some((ix + dx, iy + dy));
                        }
                    }
                }
            }
            return best_loc;
        }
        // Raw rows of the tile array, as in `perceive_into`. The tile found is
        // the one the dx-then-dy walk with a strict `<` found: least distance,
        // then least dx, then least dy.
        let want = tile_type as i8;
        let x0 = (ix - radius).max(0);
        let x1 = (ix + radius).min(crate::world::grid::WIDTH as i32 - 1);
        let mut best: Option<(i32, i32, i32)> = None;
        if x0 <= x1 {
            for dy in -radius..=radius {
                let y = iy + dy;
                if y < 0 || y >= crate::world::grid::HEIGHT as i32 {
                    continue;
                }
                let row = &grid.tiles[WorldGrid::idx(x0, y)..=WorldGrid::idx(x1, y)];
                for (k, &v) in row.iter().enumerate() {
                    if v != want {
                        continue;
                    }
                    let dx = x0 + k as i32 - ix;
                    let dist = dx.abs() + dy.abs();
                    if dist > radius || best.is_some_and(|b| (dist, dx, dy) >= b) {
                        continue;
                    }
                    if keep((ix + dx, iy + dy)) {
                        best = Some((dist, dx, dy));
                    }
                }
            }
        }
        best.map(|(_, dx, dy)| (ix + dx, iy + dy))
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
