//! Grazer herds: deer, sheep, cows and horses that find each other travel as
//! one. Each herd has a leader (its lowest-id member, so the lead is stable),
//! the others close up on it, and in the seasons when the grass moves the
//! leaders set off: south as the year turns to decline, back north in recovery.

use super::*;

/// How far (Manhattan tiles) a grazer looks for its herd.
pub(super) const HERD_RANGE: f32 = 8.0;
/// A herd member farther than this from its leader closes up.
const CLOSE_UP_DISTANCE: f32 = 3.0;

/// The heading (index into the animal headings) a herd leader takes this season:
/// south in the decline, north in the recovery, and no set course otherwise.
fn migration_heading(season: &str) -> Option<u8> {
    match season {
        // Headings: 0 north (0,-1), 1 south (0,1).
        "decline" => Some(1),
        "recovery" => Some(0),
        _ => None,
    }
}

fn herding(kind: AnimalKind) -> bool {
    matches!(
        kind,
        AnimalKind::Deer | AnimalKind::Sheep | AnimalKind::Cow | AnimalKind::Horse
    )
}

impl Simulation {
    /// One herding step for every grazer that has herd company. Positions are
    /// read before any herd member moves, so the order of the list does not
    /// change where a herd goes.
    pub(super) fn tick_herds(&mut self) {
        let grazers: Vec<usize> = (0..self.animals.len())
            .filter(|&i| {
                let a = &self.animals[i];
                a.alive && herding(a.kind) && !a.sleeping && !a.away && a.bonded_org.is_none()
            })
            .collect();
        let snap: Vec<(usize, AnimalKind, f32, f32)> = grazers
            .iter()
            .map(|&i| {
                (
                    self.animals[i].id,
                    self.animals[i].kind,
                    self.animals[i].x,
                    self.animals[i].y,
                )
            })
            .collect();
        let season = self.season();
        let migrating = migration_heading(season);

        // The leader of each member: the lowest id of its kind within range.
        let mut leader_of: Vec<Option<usize>> = vec![None; grazers.len()];
        for (k, &(_, kind, x, y)) in snap.iter().enumerate() {
            let mut lowest: Option<(usize, usize)> = None;
            for (j, &(id, okind, ox, oy)) in snap.iter().enumerate() {
                if okind != kind || (ox - x).abs() + (oy - y).abs() > HERD_RANGE {
                    continue;
                }
                if lowest.is_none_or(|(best_id, _)| id < best_id) {
                    lowest = Some((id, j));
                }
            }
            leader_of[k] = lowest.map(|(_, j)| j);
        }

        for k in 0..grazers.len() {
            let ai = grazers[k];
            let Some(lj) = leader_of[k] else { continue };
            let (_, _, x, y) = snap[k];
            if lj == k {
                // A leader sets the course of the whole herd when the seasons move it.
                if let Some(h) = migrating {
                    self.animals[ai].heading = h;
                }
                continue;
            }
            let (_, _, lx, ly) = snap[lj];
            if (lx - x).abs() + (ly - y).abs() <= CLOSE_UP_DISTANCE || self.rng.random::<f32>() < 0.4 {
                continue;
            }
            let step = |d: f32| {
                if d > 0.5 {
                    1
                } else if d < -0.5 {
                    -1
                } else {
                    0
                }
            };
            let dx = step(lx - x);
            let dy = step(ly - y);
            // Close up through open ground: diagonal first, then the free axis.
            for (sx, sy) in [(dx, dy), (dx, 0), (0, dy)] {
                if sx == 0 && sy == 0 {
                    continue;
                }
                let nx = x as i32 + sx;
                let ny = y as i32 + sy;
                if matches!(
                    self.grid.get(nx, ny),
                    Tile::Void | Tile::Rock | Tile::Water | Tile::Fire
                ) {
                    continue;
                }
                self.animals[ai].x = nx as f32;
                self.animals[ai].y = ny as f32;
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grassland(sim: &mut Simulation) {
        for x in 30..=70 {
            for y in 30..=70 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
    }

    #[test]
    fn deer_that_find_each_other_close_up_on_the_leader() {
        let mut sim = Simulation::new(0xDEE2);
        grassland(&mut sim);
        sim.animals.clear();
        for (id, x) in [(1usize, 40.0f32), (2, 46.0), (3, 52.0)] {
            sim.animals.push(Animal::new(id, x, 50.0, AnimalKind::Deer));
        }
        let spread = |sim: &Simulation| {
            let xs: Vec<f32> = sim.animals.iter().map(|a| a.x).collect();
            xs.iter().cloned().fold(f32::MIN, f32::max) - xs.iter().cloned().fold(f32::MAX, f32::min)
        };
        let before = spread(&sim);
        sim.tick_count = 100;
        for _ in 0..60 {
            sim.tick_herds();
        }
        assert!(
            spread(&sim) < before,
            "the herd should close up ({} -> {})",
            before,
            spread(&sim)
        );
    }

    #[test]
    fn herd_leaders_head_south_in_decline_and_north_in_recovery() {
        let mut sim = Simulation::new(0xDEE3);
        grassland(&mut sim);
        sim.animals.clear();
        for id in 1..=3usize {
            sim.animals
                .push(Animal::new(id, 50.0 + id as f32, 50.0, AnimalKind::Sheep));
        }
        // SEASON_LENGTH is 3000 ticks, and "decline" is the second season.
        sim.tick_count = 3500;
        sim.tick_herds();
        assert_eq!(sim.animals[0].heading, 1, "the lead sheep turns south");
        let follower_heading = sim.animals[1].heading;
        sim.tick_herds();
        assert_eq!(
            sim.animals[1].heading, follower_heading,
            "followers keep their own heading"
        );

        sim.tick_count = 9500;
        sim.tick_herds();
        assert_eq!(
            sim.animals[0].heading, 0,
            "the lead sheep turns north in recovery"
        );
    }
}
