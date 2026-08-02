use crate::world::{
    grid::{WorldGrid, HEIGHT, WIDTH},
    tiles::Tile,
};
use rand::{Rng, RngExt};
use serde::Serialize;

const DIRS: [(i32, i32); 8] = [
    (0, -1),
    (0, 1),
    (-1, 0),
    (1, 0),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AnimalKind {
    Rabbit,
    Deer,
    Boar,
    Bird,
    Fish,
    Wolf,
    Dog,
}

impl AnimalKind {
    pub fn drain(self) -> f32 {
        match self {
            AnimalKind::Rabbit => 0.0007,
            AnimalKind::Deer => 0.0005,
            AnimalKind::Boar => 0.0006,
            AnimalKind::Bird => 0.0009,
            AnimalKind::Fish => 0.0004,
            AnimalKind::Wolf => 0.0008,
            AnimalKind::Dog => 0.0006,
        }
    }
    pub fn flee_radius(self) -> f32 {
        match self {
            AnimalKind::Rabbit => 6.0,
            AnimalKind::Deer => 4.5,
            AnimalKind::Boar => 3.0,
            AnimalKind::Bird => 7.0,
            AnimalKind::Fish => 0.0,
            AnimalKind::Wolf => 0.0,
            AnimalKind::Dog => 0.0,
        }
    }
    pub fn step_size(self) -> i32 {
        match self {
            AnimalKind::Rabbit => 2,
            AnimalKind::Deer => 2,
            AnimalKind::Boar => 1,
            AnimalKind::Bird => 3,
            AnimalKind::Fish => 1,
            AnimalKind::Wolf => 2,
            AnimalKind::Dog => 2,
        }
    }
    pub fn aquatic(self) -> bool {
        matches!(self, AnimalKind::Fish)
    }
    pub fn predator(self) -> bool {
        matches!(self, AnimalKind::Wolf)
    }
    pub fn herbivore(self) -> bool {
        matches!(
            self,
            AnimalKind::Rabbit | AnimalKind::Deer | AnimalKind::Boar | AnimalKind::Bird
        )
    }
    fn fire_awareness_radius(self) -> i32 {
        match self {
            AnimalKind::Bird => 10,
            AnimalKind::Deer => 8,
            AnimalKind::Rabbit | AnimalKind::Boar | AnimalKind::Wolf => 7,
            AnimalKind::Dog => 6,
            AnimalKind::Fish => 0,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            AnimalKind::Rabbit => "rabbit",
            AnimalKind::Deer => "deer",
            AnimalKind::Boar => "boar",
            AnimalKind::Bird => "bird",
            AnimalKind::Fish => "fish",
            AnimalKind::Wolf => "wolf",
            AnimalKind::Dog => "dog",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AnimalTickOutcome {
    pub fled_fire: bool,
    pub grazed: bool,
    pub died_in_fire: bool,
}

pub struct Animal {
    pub id: usize,
    pub x: f32,
    pub y: f32,
    pub alive: bool,
    pub energy: f32,
    pub kind: AnimalKind,
    pub last_reproduced: u64,
    pub bonded_org: Option<String>,
    pub name: Option<String>,
}

impl Animal {
    pub fn new(id: usize, x: f32, y: f32, kind: AnimalKind) -> Self {
        Animal {
            id,
            x,
            y,
            alive: true,
            energy: 0.8,
            kind,
            last_reproduced: 0,
            bonded_org: None,
            name: None,
        }
    }

    pub fn tick(
        &mut self,
        grid: &mut WorldGrid,
        org_positions: &[(f32, f32)],
        prey_positions: &[(f32, f32)],
        fire_positions: &[(i32, i32)],
        rng: &mut impl Rng,
    ) -> AnimalTickOutcome {
        let mut outcome = AnimalTickOutcome::default();
        if !self.alive {
            return outcome;
        }
        let (ix, iy) = (self.x as i32, self.y as i32);

        if !self.kind.aquatic() {
            let radius = self.kind.fire_awareness_radius();
            let nearest_fire = fire_positions
                .iter()
                .map(|&(fire_x, fire_y)| ((fire_x - ix).abs() + (fire_y - iy).abs(), fire_y, fire_x))
                .filter(|(distance, _, _)| *distance <= radius)
                .min();
            if let Some((distance, fire_y, fire_x)) = nearest_fire {
                if distance == 0 {
                    self.energy = (self.energy - 0.22).max(0.0);
                    if self.energy <= 0.0 {
                        self.alive = false;
                        outcome.died_in_fire = true;
                        return outcome;
                    }
                } else {
                    self.energy = (self.energy - 0.004).max(0.0);
                }
                let away_x = (ix - fire_x).signum();
                let away_y = (iy - fire_y).signum();
                let flee_distance = self.kind.step_size().max(1) * 6;
                self.move_toward(
                    grid,
                    ix,
                    iy,
                    ix + away_x * flee_distance,
                    iy + away_y * flee_distance,
                );
                outcome.fled_fire = true;
                return outcome;
            }
        }

        let on_food = grid.get(ix, iy) == Tile::Food;
        if on_food && self.kind.herbivore() {
            if self.energy < 0.65 || rng.random::<f32>() < 0.08 {
                grid.set(ix, iy, Tile::Grass);
                self.energy = (self.energy + 0.16).min(1.0);
                outcome.grazed = true;
            } else {
                self.energy = (self.energy + 0.01).min(1.0);
            }
        }
        if self.kind.aquatic() && grid.get(ix, iy) == Tile::Water {
            self.energy = (self.energy + 0.02).min(1.0);
        }

        let drain = self.kind.drain();
        self.energy = (self.energy - drain).max(0.0);
        if self.energy <= 0.0 {
            self.alive = false;
            return outcome;
        }

        let step = self.kind.step_size();

        if self.kind.predator() {
            let target = prey_positions
                .iter()
                .chain(org_positions.iter())
                .map(|&(ox, oy)| ((ox - self.x).abs() + (oy - self.y).abs(), ox, oy))
                .filter(|&(d, _, _)| d < 20.0)
                .min_by(|(a, _, _), (b, _, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            if let Some((_, px, py)) = target {
                let tx = ix + ((px - self.x).signum() * step as f32) as i32;
                let ty = iy + ((py - self.y).signum() * step as f32) as i32;
                self.move_toward(grid, ix, iy, tx, ty);
                return outcome;
            }
        }

        if self.kind.aquatic() {
            if grid.get(ix, iy) != Tile::Water {
                let mut best = (ix, iy);
                let mut bd = i32::MAX;
                for ddx in -8i32..=8 {
                    for ddy in -8i32..=8 {
                        if grid.get(ix + ddx, iy + ddy) == Tile::Water {
                            let d = ddx.abs() + ddy.abs();
                            if d < bd {
                                bd = d;
                                best = (ix + ddx, iy + ddy);
                            }
                        }
                    }
                }
                if bd < i32::MAX {
                    self.move_toward(grid, ix, iy, best.0, best.1);
                    return outcome;
                }
            }
            let di = rng.random_range(0..8usize);
            self.move_toward(grid, ix, iy, ix + DIRS[di].0 * step, iy + DIRS[di].1 * step);
            return outcome;
        }

        let flee_r = self.kind.flee_radius();
        let nearest_org = if flee_r > 0.0 {
            org_positions
                .iter()
                .map(|&(ox, oy)| ((ox - self.x).abs() + (oy - self.y).abs(), ox, oy))
                .filter(|&(d, _, _)| d < flee_r)
                .min_by(|(a, _, _), (b, _, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        } else {
            None
        };

        let (tx, ty): (i32, i32) = if let Some((_, ox, oy)) = nearest_org {
            let fdx = self.x - ox;
            let fdy = self.y - oy;
            let len = (fdx * fdx + fdy * fdy).sqrt().max(0.001);
            (
                ix + (fdx / len * 4.0).round() as i32,
                iy + (fdy / len * 4.0).round() as i32,
            )
        } else if self.energy < 0.55 && rng.random::<f32>() < 0.35 {
            let mut best_d = 999i32;
            let mut best_t = (ix, iy);
            for ddx in -10i32..=10 {
                for ddy in -10i32..=10 {
                    if grid.get(ix + ddx, iy + ddy) == Tile::Food {
                        let d = ddx.abs() + ddy.abs();
                        if d < best_d {
                            best_d = d;
                            best_t = (ix + ddx, iy + ddy);
                        }
                    }
                }
            }
            best_t
        } else {
            let di = rng.random_range(0..8usize);
            (ix + DIRS[di].0 * step, iy + DIRS[di].1 * step)
        };

        self.move_toward(grid, ix, iy, tx, ty);
        outcome
    }

    pub fn habitat_quality(kind: AnimalKind, grid: &WorldGrid, x: i32, y: i32) -> f32 {
        let mut score = 0.0;
        let mut samples = 0.0;
        for dy in -2i32..=2 {
            for dx in -2i32..=2 {
                if dx.abs() + dy.abs() > 3 {
                    continue;
                }
                let tile = grid.get(x + dx, y + dy);
                if kind.aquatic() {
                    score += if tile == Tile::Water { 1.0 } else { 0.0 };
                    samples += 1.0;
                    continue;
                }
                let tile_score = match tile {
                    Tile::Food => 1.0,
                    Tile::Grass => 0.72,
                    Tile::Snow => 0.34,
                    Tile::Sand => 0.22,
                    Tile::Ash | Tile::Fire | Tile::Scorched | Tile::Flooded => 0.0,
                    Tile::Hut | Tile::Campfire | Tile::Rock | Tile::Water | Tile::Void | Tile::Mineral => {
                        0.05
                    }
                };
                score += tile_score;
                samples += 1.0;
            }
        }
        if samples <= 0.0 {
            0.0
        } else {
            score / samples
        }
    }

    fn move_toward(&mut self, grid: &WorldGrid, ix: i32, iy: i32, tx: i32, ty: i32) {
        let blocks_water = !self.kind.aquatic();
        let mut best_score = i32::MAX;
        let mut best_step = (0i32, 0i32);
        let mut moved = false;
        for &(ddx, ddy) in &DIRS {
            let nx = ix + ddx;
            let ny = iy + ddy;
            if nx < 1 || ny < 1 || nx >= WIDTH as i32 - 1 || ny >= HEIGHT as i32 - 1 {
                continue;
            }
            let t = grid.get(nx, ny);
            if matches!(t, Tile::Void | Tile::Rock | Tile::Fire) {
                continue;
            }
            if blocks_water && t == Tile::Water {
                continue;
            }
            if !blocks_water && t != Tile::Water {
                continue;
            }
            let score = (tx - nx).abs() + (ty - ny).abs();
            if score < best_score {
                best_score = score;
                best_step = (ddx, ddy);
                moved = true;
            }
        }
        if moved {
            self.x = (ix + best_step.0) as f32;
            self.y = (iy + best_step.1) as f32;
        }
    }
}

#[derive(Serialize)]
pub struct AnimalJson {
    pub id: usize,
    pub x: f32,
    pub y: f32,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl Animal {
    pub fn to_json(&self) -> AnimalJson {
        AnimalJson {
            id: self.id,
            x: (self.x * 10.0).round() / 10.0,
            y: (self.y * 10.0).round() / 10.0,
            kind: self.kind.name(),
            name: self.name.clone(),
        }
    }
}

const DOG_NAMES: &[&str] = &[
    "Argo", "Bo", "Cira", "Doro", "Elka", "Fenn", "Gola", "Huri", "Iva", "Juno", "Kato", "Lupa", "Maro",
    "Nuli", "Oro", "Pira", "Quo", "Ren", "Sila", "Tova", "Uma", "Vela", "Wira", "Xan", "Yara", "Zola", "Aki",
    "Bran", "Coro", "Dali", "Erin", "Faro", "Gala", "Hima",
];

pub fn pick_dog_name<R: rand::Rng>(rng: &mut R) -> String {
    DOG_NAMES[rng.random_range(0..DOG_NAMES.len())].to_string()
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
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(3);

        animal.tick(&mut grid, &[], &[], &[], &mut rng);

        assert_ne!((animal.x as i32, animal.y as i32), (120, 120));
    }

    #[test]
    fn prey_and_predators_flee_visible_fire_before_food_or_chase_targets() {
        let mut grid = WorldGrid::new(8);
        for y in 110..=130 {
            for x in 110..=135 {
                grid.set(x, y, Tile::Grass);
            }
        }
        grid.set(124, 120, Tile::Fire);
        *grid.fire_intensity_mut(124, 120) = 1.0;
        grid.set(121, 120, Tile::Food);
        let mut rabbit = Animal::new(1, 120.0, 120.0, AnimalKind::Rabbit);
        let mut wolf = Animal::new(2, 122.0, 122.0, AnimalKind::Wolf);
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(4);

        let fires = [(124, 120)];
        let rabbit_outcome = rabbit.tick(&mut grid, &[], &[], &fires, &mut rng);
        let wolf_outcome = wolf.tick(&mut grid, &[], &[(126.0, 122.0)], &fires, &mut rng);

        assert!(rabbit_outcome.fled_fire);
        assert!(rabbit.x < 120.0);
        assert!(wolf_outcome.fled_fire);
        assert!(wolf.x < 122.0);
    }

    #[test]
    fn direct_flame_exposure_can_kill_weakened_wildlife() {
        let mut grid = WorldGrid::new(9);
        grid.set(120, 120, Tile::Fire);
        *grid.fire_intensity_mut(120, 120) = 1.0;
        let mut animal = Animal::new(3, 120.0, 120.0, AnimalKind::Deer);
        animal.energy = 0.15;
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(5);

        let outcome = animal.tick(&mut grid, &[], &[], &[(120, 120)], &mut rng);

        assert!(outcome.died_in_fire);
        assert!(!animal.alive);
        assert_eq!(animal.energy, 0.0);
    }

    #[test]
    fn hungry_herbivore_consumes_one_real_food_tile_but_wolf_does_not_graze() {
        let mut grid = WorldGrid::new(10);
        grid.set(120, 120, Tile::Food);
        grid.set(125, 120, Tile::Food);
        let mut deer = Animal::new(4, 120.0, 120.0, AnimalKind::Deer);
        deer.energy = 0.40;
        let mut wolf = Animal::new(5, 125.0, 120.0, AnimalKind::Wolf);
        wolf.energy = 0.40;
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(6);

        let deer_outcome = deer.tick(&mut grid, &[], &[], &[], &mut rng);
        let wolf_outcome = wolf.tick(&mut grid, &[], &[], &[], &mut rng);

        assert!(deer_outcome.grazed);
        assert_eq!(grid.get(120, 120), Tile::Grass);
        assert!(deer.energy > 0.50);
        assert!(!wolf_outcome.grazed);
        assert_eq!(grid.get(125, 120), Tile::Food);
    }

    #[test]
    fn burned_ground_has_far_lower_breeding_quality_than_living_habitat() {
        let mut green = WorldGrid::new(11);
        let mut burned = WorldGrid::new(11);
        for y in 116..=124 {
            for x in 116..=124 {
                green.set(x, y, if (x + y) % 3 == 0 { Tile::Food } else { Tile::Grass });
                burned.set(x, y, if (x + y) % 4 == 0 { Tile::Fire } else { Tile::Ash });
            }
        }

        let green_quality = Animal::habitat_quality(AnimalKind::Deer, &green, 120, 120);
        let burned_quality = Animal::habitat_quality(AnimalKind::Deer, &burned, 120, 120);

        assert!(green_quality > 0.75);
        assert!(burned_quality < 0.05);
        assert!(green_quality > burned_quality * 10.0);
    }
}
