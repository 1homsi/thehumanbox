//! Fish schools: fish that have company in the water drift toward its middle,
//! so shoals gather in the same pools and a net finds them.

use super::*;

/// How far (Manhattan tiles) a fish looks for schoolmates.
pub(super) const SCHOOL_RANGE: f32 = 5.0;

impl Simulation {
    /// One schooling step for every fish that has schoolmates in range. The
    /// positions are read before any fish moves, so the order of the fish in
    /// the list does not change where a school ends up.
    pub(super) fn tick_fish_schools(&mut self) {
        let fish: Vec<usize> = (0..self.animals.len())
            .filter(|&i| {
                let a = &self.animals[i];
                a.alive && a.kind == AnimalKind::Fish && !a.sleeping && !a.away
            })
            .collect();
        let pos: Vec<(f32, f32)> = fish
            .iter()
            .map(|&i| (self.animals[i].x, self.animals[i].y))
            .collect();
        for (k, &ai) in fish.iter().enumerate() {
            let (x, y) = pos[k];
            let (mut sx, mut sy, mut n) = (0.0f32, 0.0f32, 0u32);
            for (j, &(ox, oy)) in pos.iter().enumerate() {
                if j == k {
                    continue;
                }
                if (ox - x).abs() + (oy - y).abs() <= SCHOOL_RANGE {
                    sx += ox;
                    sy += oy;
                    n += 1;
                }
            }
            if n == 0 || self.rng.random::<f32>() < 0.5 {
                continue;
            }
            let cx = sx / n as f32;
            let cy = sy / n as f32;
            // f32::signum(0.0) is 1.0, so a fish already in the middle would
            // drift; step only along an axis that is off-centre.
            let step = |d: f32| {
                if d > 0.5 {
                    1
                } else if d < -0.5 {
                    -1
                } else {
                    0
                }
            };
            let dx = step(cx - x);
            let dy = step(cy - y);
            // Step toward the school through water only: diagonal first, then
            // whichever axis is open.
            let candidates = [(dx, dy), (dx, 0), (0, dy)];
            for (sx_, sy_) in candidates {
                if sx_ == 0 && sy_ == 0 {
                    continue;
                }
                let nx = x as i32 + sx_;
                let ny = y as i32 + sy_;
                if self.grid.get(nx, ny) == Tile::Water {
                    self.animals[ai].x = nx as f32;
                    self.animals[ai].y = ny as f32;
                    break;
                }
            }
        }
    }

    /// Lands the fish nearest to (x, y) from its shoal.
    pub(crate) fn take_nearest_fish(&mut self, x: f32, y: f32) {
        let nearest = self
            .animals
            .iter_mut()
            .filter(|a| a.alive && a.kind == AnimalKind::Fish)
            .min_by(|a, b| {
                let da = (a.x - x).abs() + (a.y - y).abs();
                let db = (b.x - x).abs() + (b.y - y).abs();
                da.total_cmp(&db)
            });
        if let Some(fish) = nearest {
            fish.alive = false;
        }
    }

    /// How many fish swim within a short cast of (x, y). A bigger school
    /// makes a catch more likely, since the net meets more of them.
    pub(crate) fn fish_school_near(&self, x: f32, y: f32) -> usize {
        self.animals
            .iter()
            .filter(|a| {
                a.alive && a.kind == AnimalKind::Fish && (a.x - x).abs() + (a.y - y).abs() <= SCHOOL_RANGE
            })
            .count()
    }
}
