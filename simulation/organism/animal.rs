use rand::Rng;
use serde::Serialize;
use crate::world::{grid::{WorldGrid, WIDTH, HEIGHT}, tiles::Tile};

const DIRS: [(i32, i32); 8] = [(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)];

#[derive(Clone, Copy, PartialEq)]
pub enum AnimalKind { Rabbit, Deer, Boar, Bird, Fish, Wolf, Dog }

impl AnimalKind {
    pub fn drain(self) -> f32 {
        match self {
            AnimalKind::Rabbit => 0.0007,
            AnimalKind::Deer   => 0.0005,
            AnimalKind::Boar   => 0.0006,
            AnimalKind::Bird   => 0.0009,
            AnimalKind::Fish   => 0.0004,
            AnimalKind::Wolf   => 0.0008,
            AnimalKind::Dog    => 0.0006,
        }
    }
    pub fn flee_radius(self) -> f32 {
        match self {
            AnimalKind::Rabbit => 6.0,
            AnimalKind::Deer   => 4.5,
            AnimalKind::Boar   => 3.0,
            AnimalKind::Bird   => 7.0,
            AnimalKind::Fish   => 0.0,
            AnimalKind::Wolf   => 0.0,
            AnimalKind::Dog    => 0.0,
        }
    }
    pub fn step_size(self) -> i32 {
        match self {
            AnimalKind::Rabbit => 2,
            AnimalKind::Deer   => 2,
            AnimalKind::Boar   => 1,
            AnimalKind::Bird   => 3,
            AnimalKind::Fish   => 1,
            AnimalKind::Wolf   => 2,
            AnimalKind::Dog    => 2,
        }
    }
    pub fn aquatic(self) -> bool { matches!(self, AnimalKind::Fish) }
    pub fn predator(self) -> bool { matches!(self, AnimalKind::Wolf) }
    pub fn name(self) -> &'static str {
        match self {
            AnimalKind::Rabbit => "rabbit",
            AnimalKind::Deer   => "deer",
            AnimalKind::Boar   => "boar",
            AnimalKind::Bird   => "bird",
            AnimalKind::Fish   => "fish",
            AnimalKind::Wolf   => "wolf",
            AnimalKind::Dog    => "dog",
        }
    }
}

pub struct Animal {
    pub id:              usize,
    pub x:               f32,
    pub y:               f32,
    pub alive:           bool,
    pub energy:          f32,
    pub kind:            AnimalKind,
    pub last_reproduced: u64,
    pub bonded_org:      Option<String>,
}

impl Animal {
    pub fn new(id: usize, x: f32, y: f32, kind: AnimalKind) -> Self {
        Animal { id, x, y, alive: true, energy: 0.8, kind, last_reproduced: 0, bonded_org: None }
    }

    pub fn tick(&mut self, grid: &WorldGrid, org_positions: &[(f32, f32)],
                prey_positions: &[(f32, f32)], rng: &mut impl Rng) {
        if !self.alive { return; }
        let (ix, iy) = (self.x as i32, self.y as i32);

        let on_food = grid.get(ix, iy) == Tile::Food;
        if on_food && !self.kind.aquatic() {
            self.energy = (self.energy + 0.04).min(1.0);
        }
        if self.kind.aquatic() && grid.get(ix, iy) == Tile::Water {
            self.energy = (self.energy + 0.02).min(1.0);
        }

        let drain = self.kind.drain();
        self.energy = (self.energy - drain).max(0.0);
        if self.energy <= 0.0 { self.alive = false; return; }

        let step = self.kind.step_size();

        if self.kind.predator() {
            let target = prey_positions.iter().chain(org_positions.iter())
                .map(|&(ox, oy)| ((ox - self.x).abs() + (oy - self.y).abs(), ox, oy))
                .filter(|&(d, _, _)| d < 14.0)
                .min_by(|(a,_,_),(b,_,_)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            if let Some((_, px, py)) = target {
                let tx = ix + ((px - self.x).signum() * step as f32) as i32;
                let ty = iy + ((py - self.y).signum() * step as f32) as i32;
                self.move_toward(grid, ix, iy, tx, ty);
                return;
            }
        }

        if self.kind.aquatic() {
            if grid.get(ix, iy) != Tile::Water {
                let mut best = (ix, iy);
                let mut bd = i32::MAX;
                for ddx in -8i32..=8 {
                    for ddy in -8i32..=8 {
                        if grid.get(ix+ddx, iy+ddy) == Tile::Water {
                            let d = ddx.abs() + ddy.abs();
                            if d < bd { bd = d; best = (ix+ddx, iy+ddy); }
                        }
                    }
                }
                if bd < i32::MAX {
                    self.move_toward(grid, ix, iy, best.0, best.1);
                    return;
                }
            }
            let di = rng.gen_range(0..8usize);
            self.move_toward(grid, ix, iy, ix + DIRS[di].0 * step, iy + DIRS[di].1 * step);
            return;
        }

        let flee_r = self.kind.flee_radius();
        let nearest_org = if flee_r > 0.0 {
            org_positions.iter()
                .map(|&(ox, oy)| ((ox - self.x).abs() + (oy - self.y).abs(), ox, oy))
                .filter(|&(d, _, _)| d < flee_r)
                .min_by(|(a,_,_),(b,_,_)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        } else { None };

        let (tx, ty): (i32, i32) = if let Some((_, ox, oy)) = nearest_org {
            let fdx = self.x - ox;
            let fdy = self.y - oy;
            let len = (fdx * fdx + fdy * fdy).sqrt().max(0.001);
            (ix + (fdx / len * 4.0).round() as i32, iy + (fdy / len * 4.0).round() as i32)
        } else if self.energy < 0.55 && rng.gen::<f32>() < 0.35 {
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
            let di = rng.gen_range(0..8usize);
            (ix + DIRS[di].0 * step, iy + DIRS[di].1 * step)
        };

        self.move_toward(grid, ix, iy, tx, ty);
    }

    fn move_toward(&mut self, grid: &WorldGrid, ix: i32, iy: i32, tx: i32, ty: i32) {
        let blocks_water = !self.kind.aquatic();
        let mut best_score = i32::MAX;
        let mut best_step = (0i32, 0i32);
        let mut moved = false;
        for &(ddx, ddy) in &DIRS {
            let nx = ix + ddx;
            let ny = iy + ddy;
            if nx < 1 || ny < 1 || nx >= WIDTH as i32 - 1 || ny >= HEIGHT as i32 - 1 { continue; }
            let t = grid.get(nx, ny);
            if matches!(t, Tile::Void | Tile::Rock | Tile::Fire) { continue; }
            if blocks_water && t == Tile::Water { continue; }
            if !blocks_water && t != Tile::Water { continue; }
            let score = (tx - nx).abs() + (ty - ny).abs();
            if score < best_score { best_score = score; best_step = (ddx, ddy); moved = true; }
        }
        if moved {
            self.x = (ix + best_step.0) as f32;
            self.y = (iy + best_step.1) as f32;
        }
    }
}

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
            kind: self.kind.name(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;

    #[test]
    fn animals_can_move_outside_the_old_100_by_100_world_bounds() {
        let mut grid = WorldGrid::new(7);
        grid.set(121, 120, Tile::Food);
        let mut animal = Animal::new(1, 120.0, 120.0, AnimalKind::Rabbit);
        animal.energy = 0.3;
        let mut rng = rand::rngs::SmallRng::seed_from_u64(3);

        animal.tick(&grid, &[], &[], &mut rng);

        assert_ne!((animal.x as i32, animal.y as i32), (120, 120));
    }
}
