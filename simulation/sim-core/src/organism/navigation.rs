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
