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
    /// Sync the hot columns, then ease the crowd. Tests call this after they
    /// move people by hand. The tick syncs once and calls
    /// [`Self::separate_crowds_indexed`] so the same copy also feeds the grid.
    #[cfg(test)]
    pub(super) fn separate_crowds(&mut self) {
        self.organism_columns.sync_from(&self.organisms);
        self.separate_crowds_indexed();
    }

    /// Ease overlapping people apart. Caller has synced [`Self::organism_columns`].
    pub(super) fn separate_crowds_indexed(&mut self) {
        debug_assert!(self.organism_columns.ready_for(self.organisms.len()));
        if self.organism_columns.alive.iter().filter(|&&a| a != 0).count() < 2 {
            return;
        }
        let index = SpatialIndex::build_columns(&self.organism_columns, 4);
        let mut near: Vec<usize> = Vec::new();
        // Someone aboard a boat stays on it: their boat only sails from the tile beside its next stretch of
        // water, so easing a waiting colonist a tile inland stranded them on the shore.
        let aboard: crate::hashing::FxHashSet<&str> = self
            .vehicles
            .iter()
            .flat_map(|v| v.occupants.iter().map(String::as_str))
            .collect();
        let held: Vec<bool> = if aboard.is_empty() {
            vec![false; self.organisms.len()]
        } else {
            self.organisms
                .iter()
                .map(|o| aboard.contains(o.id.as_str()))
                .collect()
        };
        drop(aboard);
        let n = self.organisms.len();
        for i in 0..n {
            if self.organism_columns.alive[i] == 0 {
                continue;
            }
            // `xi` stays the position at the start of this person's pass. Each
            // neighbour overwrites the result from that same point, matching the
            // spots snapshot the struct loop used.
            let (xi, yi) = (self.organism_columns.x[i], self.organism_columns.y[i]);
            index.query_into(xi as i32, yi as i32, 1, &mut near);
            near.retain(|&j| {
                let (dx, dy) = (xi - self.organism_columns.x[j], yi - self.organism_columns.y[j]);
                j > i
                    && self.organism_columns.alive[j] != 0
                    && dx * dx + dy * dy < PERSONAL_SPACE * PERSONAL_SPACE
            });
            if near.is_empty() {
                continue;
            }
            near.sort_unstable();
            for &j in &near {
                if j <= i || self.organism_columns.alive[j] == 0 {
                    continue;
                }
                let (xj, yj) = (self.organism_columns.x[j], self.organism_columns.y[j]);
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
                let (ni_x, ni_y) = keep_tile(&self.organisms[i], xi + ux * push, yi + uy * push);
                let (nj_x, nj_y) = keep_tile(&self.organisms[j], xj - ux * push, yj - uy * push);
                if !held[i] && self.walkable_at(ni_x, ni_y) {
                    self.organisms[i].x = ni_x;
                    self.organisms[i].y = ni_y;
                    self.organism_columns.store_pos(i, ni_x, ni_y);
                }
                if !held[j] && self.walkable_at(nj_x, nj_y) {
                    self.organisms[j].x = nj_x;
                    self.organisms[j].y = nj_y;
                    self.organism_columns.store_pos(j, nj_x, nj_y);
                }
            }
        }
    }

    fn walkable_at(&self, x: f32, y: f32) -> bool {
        let (tx, ty) = (x as i32, y as i32);
        WorldGrid::in_bounds(tx, ty)
            && self.grid.get(tx, ty).walkable()
            && !self.grid.is_wet(self.grid.get(tx, ty), tx, ty)
    }
}

fn keep_tile(o: &Organism, x: f32, y: f32) -> (f32, f32) {
    if o.intent.is_none() && o.journey.is_none() && o.wander_target.is_none() {
        return (x, y);
    }
    let (tx, ty) = (o.x.floor(), o.y.floor());
    (x.clamp(tx, tx + 0.95), y.clamp(ty, ty + 0.95))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;
    use crate::world::tiles::Tile;

    fn person(id: &str, x: f32, y: f32) -> Organism {
        let mut o = Organism::new(
            id,
            "x".into(),
            x,
            y,
            0,
            String::new(),
            "lin",
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
    fn someone_walking_to_a_goal_is_not_pushed_off_their_tile() {
        use crate::organism::mind::{Intent, Purpose};
        let mut sim = Simulation::new(5);
        sim.organisms.clear();
        for y in 40..44 {
            for x in 40..44 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        let mut walker = person("a", 41.0, 41.0);
        walker.intent = Some(Intent::new(
            Purpose::Roam,
            (41, 41),
            (43, 41),
            1,
            None,
            "taking a walk",
            0,
        ));
        sim.organisms.push(walker);
        sim.organisms.push(person("b", 41.3, 41.0));
        for _ in 0..12 {
            sim.separate_crowds();
        }
        let walker = &sim.organisms[0];
        assert_eq!((walker.x as i32, walker.y as i32), (41, 41));
        assert!(sim.organisms[1].x - walker.x > 0.5);
    }

    #[test]
    fn someone_aboard_a_boat_stays_on_it_while_the_crowd_eases_apart() {
        use crate::sim::tech::transportation::{TransportKind, Vehicle};
        let mut sim = Simulation::new(5);
        sim.organisms.clear();
        for y in 40..44 {
            for x in 40..44 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.push(person("a", 41.0, 41.0));
        sim.organisms.push(person("b", 41.0, 41.0));
        sim.vehicles.push(Vehicle {
            id: 1,
            kind: TransportKind::Boat,
            owner_lineage: "lin".into(),
            x: 41,
            y: 41,
            occupants: vec!["a".into()],
            cargo: 0,
            route: vec![(41, 42)],
            ready_tick: 0,
            harbour: None,
            bound_for: None,
            ferry: None,
            rail_line: None,
        });
        for _ in 0..30 {
            sim.separate_crowds();
        }
        assert_eq!(
            (sim.organisms[0].x, sim.organisms[0].y),
            (41.0, 41.0),
            "the passenger stays aboard"
        );
        assert!(sim.organisms[1].x != 41.0, "the one on foot still steps aside");
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
