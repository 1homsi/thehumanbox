//! Bounded local detours. Ordinary open-ground steps keep the cheap steering
//! path; this search only runs when a direct step is blocked.
use std::cmp::Reverse;
use std::collections::BinaryHeap;

use super::organism::DIRECTIONS;
use crate::world::{grid::WorldGrid, tiles::Tile};

pub(crate) fn detour_step(grid: &WorldGrid, start: (i32, i32), target: (i32, i32)) -> Option<usize> {
    const RADIUS: i32 = 16;
    const SIDE: usize = (RADIUS * 2 + 1) as usize;
    const BUDGET: usize = 128;
    let index = |x: i32, y: i32| ((y - start.1 + RADIUS) as usize) * SIDE + (x - start.0 + RADIUS) as usize;
    let distance = |x: i32, y: i32| (target.0 - x).abs().max((target.1 - y).abs());
    let mut costs = [i32::MAX; SIDE * SIDE];
    let mut frontier = BinaryHeap::new();
    costs[index(start.0, start.1)] = 0;
    frontier.push(Reverse((
        distance(start.0, start.1) * 10,
        0,
        start.0,
        start.1,
        usize::MAX,
    )));
    let mut best = None;
    let mut best_distance = distance(start.0, start.1);
    let target_water = grid.get(target.0, target.1) == Tile::Water;
    for _ in 0..BUDGET {
        let Some(Reverse((_, cost, x, y, first))) = frontier.pop() else {
            break;
        };
        if cost != costs[index(x, y)] {
            continue;
        }
        let remaining = distance(x, y);
        if remaining < best_distance && first != usize::MAX {
            best_distance = remaining;
            best = Some(first);
        }
        // A useful waypoint is enough for a local detour. Do not search
        // the whole window for a destination hundreds of tiles away.
        if remaining == 0 || remaining + 4 <= distance(start.0, start.1) {
            return best;
        }
        for (direction, &(dx, dy)) in DIRECTIONS.iter().enumerate() {
            let (nx, ny) = (x + dx, y + dy);
            if (nx - start.0).abs() > RADIUS || (ny - start.1).abs() > RADIUS {
                continue;
            }
            let tile = grid.get(nx, ny);
            if !tile.walkable() || tile == Tile::Fire {
                continue;
            }
            // Seeking water permits entering the requested water tile only,
            // not taking a shortcut across a lake on the way to it.
            if tile == Tile::Water && grid.depth_at(nx, ny) > 0.18 && !(target_water && (nx, ny) == target) {
                continue;
            }
            let next_cost = cost + 10 + (grid.hazard_at(nx, ny) * 30.0) as i32;
            let idx = index(nx, ny);
            if next_cost >= costs[idx] {
                continue;
            }
            costs[idx] = next_cost;
            let first = if first == usize::MAX { direction } else { first };
            frontier.push(Reverse((
                next_cost + distance(nx, ny) * 10,
                next_cost,
                nx,
                ny,
                first,
            )));
        }
    }
    best
}

/// Window around the walker that a full route plan may search.
const PLAN_RADIUS: i32 = 40;
/// Most tiles one plan may expand; bounded so a crowd of blocked walkers
/// cannot stall a tick.
const PLAN_BUDGET: usize = 3000;

/// A remembered route toward a goal, followed one waypoint per step so the
/// next tick cannot undo the last one (the cause of people pacing between
/// two tiles in front of a mountain).
#[derive(Default, Clone, Debug)]
pub struct RouteCache {
    pub goal: (i32, i32),
    pub steps: Vec<(i32, i32)>,
    pub next: usize,
    /// The last goal a plan found no way toward, for the sim to act on.
    pub unreachable: Option<(i32, i32)>,
    /// A goal that recently failed to plan, and how many more requests to
    /// skip replanning it (so a walled-in goal costs one search, not one
    /// per tick).
    pub blocked: Option<(i32, i32)>,
    pub blocked_for: u16,
}

fn near(a: (i32, i32), b: (i32, i32)) -> bool {
    (a.0 - b.0).abs().max((a.1 - b.1).abs()) <= 3
}

impl RouteCache {
    /// True while `goal` is a recently failed one.
    pub fn recently_blocked(&self, goal: (i32, i32)) -> bool {
        self.blocked_for > 0 && self.blocked.is_some_and(|b| near(b, goal))
    }

    /// Spend one skipped replan on a recently failed goal.
    pub fn skip_blocked(&mut self, goal: (i32, i32)) -> bool {
        if self.recently_blocked(goal) {
            self.blocked_for -= 1;
            return true;
        }
        false
    }

    pub fn mark_blocked(&mut self, goal: (i32, i32)) {
        self.steps.clear();
        self.unreachable = Some(goal);
        self.blocked = Some(goal);
        self.blocked_for = 60;
    }

    /// Direction of the next waypoint when this cached route still serves
    /// `goal` from `at`.
    pub fn follow(&mut self, grid: &WorldGrid, at: (i32, i32), goal: (i32, i32)) -> Option<usize> {
        if self.steps.is_empty() || (self.goal.0 - goal.0).abs().max((self.goal.1 - goal.1).abs()) > 3 {
            return None;
        }
        // Skip waypoints already reached (or overtaken by a sidestep).
        if let Some(k) = self.steps[self.next..].iter().take(4).position(|&p| p == at) {
            self.next += k + 1;
        }
        let Some(&(wx, wy)) = self.steps.get(self.next) else {
            self.steps.clear();
            return None;
        };
        let (dx, dy) = (wx - at.0, wy - at.1);
        let tile = grid.get(wx, wy);
        if dx.abs().max(dy.abs()) != 1 || !tile.walkable() || tile == Tile::Fire {
            self.steps.clear();
            return None;
        }
        DIRECTIONS.iter().position(|&d| d == (dx, dy))
    }
}

/// Plan a route from `start` toward `target` with A* inside a window
/// around the walker. Returns the steps to the target, or to the reachable
/// tile nearest it, or `None` when no tile gets meaningfully closer.
pub(crate) fn plan_route(grid: &WorldGrid, start: (i32, i32), target: (i32, i32)) -> Option<Vec<(i32, i32)>> {
    const SIDE: usize = (PLAN_RADIUS * 2 + 1) as usize;
    let inside = |x: i32, y: i32| (x - start.0).abs() <= PLAN_RADIUS && (y - start.1).abs() <= PLAN_RADIUS;
    let index =
        |x: i32, y: i32| ((y - start.1 + PLAN_RADIUS) as usize) * SIDE + (x - start.0 + PLAN_RADIUS) as usize;
    let distance = |x: i32, y: i32| (target.0 - x).abs().max((target.1 - y).abs());
    let target_water = grid.get(target.0, target.1) == Tile::Water;
    let mut costs = vec![i32::MAX; SIDE * SIDE];
    let mut parent = vec![u32::MAX; SIDE * SIDE];
    let mut frontier = BinaryHeap::new();
    costs[index(start.0, start.1)] = 0;
    frontier.push(Reverse((distance(start.0, start.1) * 10, 0, start.0, start.1)));
    let start_distance = distance(start.0, start.1);
    let mut best = (start_distance, 0, start);
    let mut expanded = 0;
    while let Some(Reverse((_, cost, x, y))) = frontier.pop() {
        if cost != costs[index(x, y)] {
            continue;
        }
        let remaining = distance(x, y);
        if (remaining, cost) < (best.0, best.1) {
            best = (remaining, cost, (x, y));
        }
        expanded += 1;
        if remaining == 0 || expanded >= PLAN_BUDGET {
            break;
        }
        for &(dx, dy) in DIRECTIONS.iter() {
            let (nx, ny) = (x + dx, y + dy);
            if !inside(nx, ny) || !WorldGrid::in_bounds(nx, ny) {
                continue;
            }
            let tile = grid.get(nx, ny);
            if !tile.walkable() || tile == Tile::Fire {
                continue;
            }
            if tile == Tile::Water && grid.depth_at(nx, ny) > 0.18 && !(target_water && (nx, ny) == target) {
                continue;
            }
            let next_cost = cost + 10 + (grid.hazard_at(nx, ny) * 30.0) as i32;
            let idx = index(nx, ny);
            if next_cost >= costs[idx] {
                continue;
            }
            costs[idx] = next_cost;
            parent[idx] = index(x, y) as u32;
            frontier.push(Reverse((next_cost + distance(nx, ny) * 10, next_cost, nx, ny)));
        }
    }
    // Only worth walking when it ends clearly closer than we started.
    if best.2 == start || best.0 + 2 > start_distance && best.0 != 0 {
        return None;
    }
    let mut steps = Vec::new();
    let mut at = index(best.2 .0, best.2 .1);
    let origin = index(start.0, start.1);
    while at != origin {
        let (x, y) = ((at % SIDE) as i32, (at / SIDE) as i32);
        steps.push((x + start.0 - PLAN_RADIUS, y + start.1 - PLAN_RADIUS));
        at = parent[at] as usize;
    }
    steps.reverse();
    Some(steps)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn walled() -> WorldGrid {
        let mut grid = WorldGrid::new(1);
        for y in 60..140 {
            for x in 60..140 {
                grid.set(x, y, Tile::Grass);
            }
        }
        // A cup-shaped ridge opening west: walking east from inside the cup
        // means going back out and around it.
        for y in 90..=110 {
            grid.set(105, y, Tile::Rock);
        }
        for x in 95..=105 {
            grid.set(x, 90, Tile::Rock);
            grid.set(x, 110, Tile::Rock);
        }
        grid
    }

    #[test]
    fn a_route_leads_out_of_a_cup_and_around_the_ridge() {
        let grid = walled();
        let steps = plan_route(&grid, (100, 100), (125, 100)).expect("a route");
        let &(ex, ey) = steps.last().unwrap();
        assert_eq!((ex, ey), (125, 100));
        for w in std::iter::once(&(100, 100))
            .chain(steps.iter())
            .collect::<Vec<_>>()
            .windows(2)
        {
            assert_eq!((w[0].0 - w[1].0).abs().max((w[0].1 - w[1].1).abs()), 1);
            assert!(grid.get(w[1].0, w[1].1).walkable());
        }
    }

    #[test]
    fn a_walled_in_goal_leads_to_the_nearest_tile_outside_its_wall() {
        let mut grid = walled();
        for y in 118..=132 {
            for x in 118..=132 {
                if y == 118 || y == 132 || x == 118 || x == 132 {
                    grid.set(x, y, Tile::Rock);
                }
            }
        }
        let steps = plan_route(&grid, (100, 100), (125, 125)).expect("a route to the wall");
        let &(ex, ey) = steps.last().unwrap();
        assert!(ex < 118 || ey < 118, "the route stays outside the walls");
        assert_eq!((125 - ex).abs().max((125 - ey).abs()), 8);
        // Standing at the wall, no tile gets any closer: that is unreachable.
        assert!(plan_route(&grid, (ex, ey), (125, 125)).is_none());
    }

    #[test]
    fn the_cache_follows_its_waypoints_in_order() {
        let grid = walled();
        let steps = plan_route(&grid, (100, 100), (125, 100)).unwrap();
        let mut cache = RouteCache {
            goal: (125, 100),
            steps: steps.clone(),
            ..Default::default()
        };
        let mut at = (100, 100);
        for _ in 0..steps.len() {
            let dir = cache.follow(&grid, at, (125, 100)).expect("a step");
            at = (at.0 + DIRECTIONS[dir].0, at.1 + DIRECTIONS[dir].1);
        }
        assert_eq!(at, (125, 100));
    }
}
