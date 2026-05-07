use rand::Rng;
use serde::Serialize;
use crate::world::{grid::WorldGrid, tiles::Tile};

const DIRS: [(i32, i32); 8] = [(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)];

#[derive(Clone, Copy, PartialEq)]
pub enum AnimalKind { Rabbit, Deer }

pub struct Animal {
    pub id:              usize,
    pub x:               f32,
    pub y:               f32,
    pub alive:           bool,
    pub energy:          f32,
    pub kind:            AnimalKind,
    pub last_reproduced: u64,
}

impl Animal {
    pub fn new(id: usize, x: f32, y: f32, kind: AnimalKind) -> Self {
        Animal { id, x, y, alive: true, energy: 0.8, kind, last_reproduced: 0 }
    }

    pub fn tick(&mut self, grid: &WorldGrid, org_positions: &[(f32, f32)], rng: &mut impl Rng) {
        if !self.alive { return; }
        let (ix, iy) = (self.x as i32, self.y as i32);

        // Graze on food tile
        if grid.get(ix, iy) == Tile::Food {
            self.energy = (self.energy + 0.04).min(1.0);
        }

        // Energy drain
        let drain = match self.kind { AnimalKind::Rabbit => 0.0007, AnimalKind::Deer => 0.0005 };
        self.energy = (self.energy - drain).max(0.0);
        if self.energy <= 0.0 { self.alive = false; return; }

        // Find nearest organism to flee from
        let flee_r = match self.kind { AnimalKind::Rabbit => 6.0f32, AnimalKind::Deer => 4.5f32 };
        let nearest_org = org_positions.iter()
            .map(|&(ox, oy)| ((ox - self.x).abs() + (oy - self.y).abs(), ox, oy))
            .filter(|&(d, _, _)| d < flee_r)
            .min_by(|(a,_,_),(b,_,_)| a.partial_cmp(b).unwrap());

        // Decide move target
        let (tx, ty): (i32, i32) = if let Some((_, ox, oy)) = nearest_org {
            // Flee: target tile directly opposite the organism
            let fdx = self.x - ox;
            let fdy = self.y - oy;
            let len = (fdx * fdx + fdy * fdy).sqrt().max(0.001);
            (ix + (fdx / len * 4.0).round() as i32, iy + (fdy / len * 4.0).round() as i32)
        } else if self.energy < 0.55 && rng.gen::<f32>() < 0.35 {
            // Seek nearest food
            let mut best_d = 999i32;
            let mut best_t = (ix, iy);
            for ddx in -10i32..=10 {
                for ddy in -10i32..=10 {
                    if grid.get(ix + ddx, iy + ddy) == Tile::Food {
                        let d = ddx.abs() + ddy.abs();
                        if d < best_d { best_d = d; best_t = (ix + ddx, iy + ddy); }
                    }
                }
            }
            best_t
        } else {
            // Wander in a random direction
            let di = rng.gen_range(0..8usize);
            (ix + DIRS[di].0 * 2, iy + DIRS[di].1 * 2)
        };

        // Pick the valid step closest to (tx, ty)
        let mut best_score = i32::MAX;
        let mut best_step = (0i32, 0i32);
        let mut moved = false;
        for &(ddx, ddy) in &DIRS {
            let nx = ix + ddx;
            let ny = iy + ddy;
            if nx < 1 || ny < 1 || nx > 98 || ny > 98 { continue; }
            if matches!(grid.get(nx, ny), Tile::Void | Tile::Rock | Tile::Water | Tile::Fire) { continue; }
            let score = (tx - nx).abs() + (ty - ny).abs();
            if score < best_score { best_score = score; best_step = (ddx, ddy); moved = true; }
        }
        if moved {
            self.x = (ix + best_step.0) as f32;
            self.y = (iy + best_step.1) as f32;
        }
    }
}

// ── JSON ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AnimalJson {
    pub id:   usize,
    pub x:    f32,
    pub y:    f32,
    pub kind: &'static str,
}

impl Animal {
    pub fn to_json(&self) -> AnimalJson {
        AnimalJson {
            id:   self.id,
            x:    (self.x * 10.0).round() / 10.0,
            y:    (self.y * 10.0).round() / 10.0,
            kind: match self.kind { AnimalKind::Rabbit => "rabbit", AnimalKind::Deer => "deer" },
        }
    }
}
