//! Bird flocks: birds that fly close together take up the heading most of
//! the flock is flying and turn back when they drift off its middle, so a
//! flock wheels across the sky as one.

use super::*;

/// How far (Manhattan tiles) a bird looks for flockmates.
pub(super) const FLOCK_RANGE: f32 = 6.0;

/// The eight headings in the order `organism::animal` uses for `Animal::heading`.
const HEADINGS: [(i32, i32); 8] = [
    (0, -1),
    (0, 1),
    (-1, 0),
    (1, 0),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

impl Simulation {
    /// One flocking step for every bird that has flockmates in range. Headings
    /// and positions are read before any bird changes, so the order of the
    /// birds in the list does not change what the flock does.
    pub(super) fn tick_bird_flocks(&mut self) {
        let birds: Vec<usize> = (0..self.animals.len())
            .filter(|&i| {
                let a = &self.animals[i];
                a.alive && a.kind == AnimalKind::Bird && !a.sleeping && !a.away
            })
            .collect();
        let snap: Vec<(f32, f32, u8)> = birds
            .iter()
            .map(|&i| (self.animals[i].x, self.animals[i].y, self.animals[i].heading))
            .collect();
        for (k, &bi) in birds.iter().enumerate() {
            let (x, y, _) = snap[k];
            let mut votes = [0u32; 8];
            let (mut sx, mut sy, mut n) = (0.0f32, 0.0f32, 0u32);
            for (j, &(ox, oy, oh)) in snap.iter().enumerate() {
                if j == k {
                    continue;
                }
                if (ox - x).abs() + (oy - y).abs() <= FLOCK_RANGE {
                    votes[usize::from(oh % 8)] += 1;
                    sx += ox;
                    sy += oy;
                    n += 1;
                }
            }
            if n == 0 {
                continue;
            }
            // Alignment: most of the time, take the heading the flock is flying.
            if self.rng.random::<f32>() < 0.5 {
                let mut best = 0usize;
                for h in 1..8 {
                    if votes[h] > votes[best] {
                        best = h;
                    }
                }
                self.animals[bi].heading = best as u8;
            }
            // Cohesion: a bird that has drifted off the flock's middle turns back.
            let cx = sx / n as f32;
            let cy = sy / n as f32;
            if (cx - x).abs() + (cy - y).abs() > 3.0 {
                let dx = if cx - x > 0.5 {
                    1
                } else if cx - x < -0.5 {
                    -1
                } else {
                    0
                };
                let dy = if cy - y > 0.5 {
                    1
                } else if cy - y < -0.5 {
                    -1
                } else {
                    0
                };
                if let Some(h) = HEADINGS.iter().position(|&d| d == (dx, dy)) {
                    self.animals[bi].heading = h as u8;
                }
            }
        }
    }
}
