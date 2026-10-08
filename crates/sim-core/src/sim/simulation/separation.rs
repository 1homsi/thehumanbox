//! Personal space. People do not walk through one another: when two living
//! people stand closer than `PERSONAL_SPACE` tiles, each is eased half of the
//! overlap away from the other, onto ground they can walk on. It is a gentle
//! push applied once a tick before people act, so a crowd spreads out instead
//! of stacking on one tile. Deterministic: no random numbers.

use super::*;
use crate::sim::spatial::SpatialIndex;
use crate::world::grid::WorldGrid;

/// Closest two people may stand before they push apart, in tiles.
pub const PERSONAL_SPACE: f32 = 0.7;
/// Share of the overlap each person is moved by in one tick.
const PUSH_SHARE: f32 = 0.25;

impl Simulation {
    pub(super) fn separate_crowds(&mut self) {
        if self.organisms.iter().filter(|o| o.alive).count() < 2 {
            return;
        }
        let index = SpatialIndex::build(&self.organisms, 4);
        let mut near: Vec<usize> = Vec::new();
        for i in 0..self.organisms.len() {
            if !self.organisms[i].alive {
                continue;
            }
            let (xi, yi) = (self.organisms[i].x, self.organisms[i].y);
            index.query_into(xi as i32, yi as i32, 1, &mut near);
            near.sort_unstable();
            for &j in &near {
                if j <= i || !self.organisms[j].alive {
                    continue;
                }
                let (xj, yj) = (self.organisms[j].x, self.organisms[j].y);
                let (dx, dy) = (xi - xj, yi - yj);
                let d2 = dx * dx + dy * dy;
                if d2 >= PERSONAL_SPACE * PERSONAL_SPACE {
                    continue;
                }
                // Two people on one spot have no direction between them, so
                // they are eased apart along a fixed axis.
                let (d, ux, uy) = if d2 < 1e-8 {
                    (0.0, 1.0, 0.0)
                } else {
                    let d = d2.sqrt();
                    (d, dx / d, dy / d)
                };
                let push = (PERSONAL_SPACE - d) * PUSH_SHARE;
                let (ni_x, ni_y) = (xi + ux * push, yi + uy * push);
                let (nj_x, nj_y) = (xj - ux * push, yj - uy * push);
                if self.walkable_at(ni_x, ni_y) {
                    self.organisms[i].x = ni_x;
                    self.organisms[i].y = ni_y;
                }
                if self.walkable_at(nj_x, nj_y) {
                    self.organisms[j].x = nj_x;
                    self.organisms[j].y = nj_y;
                }
            }
        }
    }

    fn walkable_at(&self, x: f32, y: f32) -> bool {
        let (tx, ty) = (x as i32, y as i32);
        WorldGrid::in_bounds(tx, ty) && self.grid.get(tx, ty).walkable()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;
    use crate::world::tiles::Tile;

    fn person(id: &str, x: f32, y: f32) -> Organism {
        let mut o = Organism::new(
            id.into(),
            "x".into(),
            x,
            y,
            0,
            String::new(),
            "lin".into(),
            9000,
            Traits::default(),
        );
        o.alive = true;
        o
    }

    #[test]
    fn two_people_on_one_tile_move_apart() {
        let mut sim = Simulation::new(5);
        sim.organisms.clear();
        for y in 40..44 {
            for x in 40..44 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.push(person("a", 41.5, 41.5));
        sim.organisms.push(person("b", 41.5, 41.5));
        sim.separate_crowds();
        let gap = (sim.organisms[1].x - sim.organisms[0].x).abs();
        assert!(gap > 0.1, "people on one spot are eased apart, gap {gap}");
    }

    #[test]
    fn a_close_pair_is_eased_apart_but_not_pushed_into_water() {
        let mut sim = Simulation::new(5);
        sim.organisms.clear();
        for y in 40..44 {
            for x in 40..44 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.push(person("a", 41.3, 41.5));
        sim.organisms.push(person("b", 41.7, 41.5));
        let gap = |sim: &Simulation| sim.organisms[1].x - sim.organisms[0].x;
        let before = gap(&sim);
        sim.separate_crowds();
        assert!(
            gap(&sim) > before,
            "the pair moved apart ({before} -> {})",
            gap(&sim)
        );
        assert!(gap(&sim) <= PERSONAL_SPACE + 0.2, "and not past personal space");
    }

    #[test]
    fn nobody_is_pushed_onto_unwalkable_ground() {
        let mut sim = Simulation::new(5);
        sim.organisms.clear();
        for y in 40..44 {
            for x in 40..44 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        // Rock lies just left of the pair; the left-hand person would be
        // pushed onto it, so that move is refused.
        sim.grid.set(39, 41, Tile::Rock);
        sim.organisms.push(person("a", 40.05, 41.5));
        sim.organisms.push(person("b", 40.35, 41.5));
        sim.separate_crowds();
        assert!(
            (sim.organisms[0].x - 40.05).abs() < 1e-6,
            "the left person did not move onto rock"
        );
        for o in &sim.organisms {
            assert_ne!(
                sim.grid.get(o.x as i32, o.y as i32),
                Tile::Rock,
                "{} stepped onto rock",
                o.id
            );
        }
    }
}
