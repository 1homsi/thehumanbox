use crate::world::{
    grid::{WorldGrid, HEIGHT, WIDTH},
    tiles::{Biome, Tile},
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

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum AnimalKind {
    Rabbit,
    Deer,
    Boar,
    Bird,
    Fish,
    Wolf,
    Dog,
    // Appended so saved worlds keep their numeric kinds (see storage/persistence/organism.rs).
    Bear,
    Sheep,
    Cow,
    Horse,
    Chicken,
    // Small wild animals: a fox is shy prey for wolves, a cat keeps to itself.
    Fox,
    Cat,
    // Released by the player only (no natural spawns): a penguin walks the snow,
    // a camel crosses the deserts, a frog sits by wet ground, a whale swims deep water.
    Penguin,
    Camel,
    Frog,
    Whale,
    // Monsters: summoned with god powers, never born or spawned naturally.
    Zombie,
    Demon,
    Dragon,
    Alien,
    Ufo,
}

impl AnimalKind {
    /// Every kind, for tables and tests.
    pub const ALL: [AnimalKind; 23] = [
        AnimalKind::Rabbit,
        AnimalKind::Deer,
        AnimalKind::Boar,
        AnimalKind::Bird,
        AnimalKind::Fish,
        AnimalKind::Wolf,
        AnimalKind::Dog,
        AnimalKind::Bear,
        AnimalKind::Sheep,
        AnimalKind::Cow,
        AnimalKind::Horse,
        AnimalKind::Chicken,
        AnimalKind::Fox,
        AnimalKind::Cat,
        AnimalKind::Penguin,
        AnimalKind::Camel,
        AnimalKind::Frog,
        AnimalKind::Whale,
        AnimalKind::Zombie,
        AnimalKind::Demon,
        AnimalKind::Dragon,
        AnimalKind::Alien,
        AnimalKind::Ufo,
    ];
    pub const MONSTERS: [AnimalKind; 5] = [
        AnimalKind::Zombie,
        AnimalKind::Demon,
        AnimalKind::Dragon,
        AnimalKind::Alien,
        AnimalKind::Ufo,
    ];
    pub fn drain(self) -> f32 {
        match self {
            AnimalKind::Rabbit => 0.0007,
            AnimalKind::Deer => 0.0005,
            AnimalKind::Boar => 0.0006,
            AnimalKind::Bird => 0.0009,
            AnimalKind::Fish => 0.0004,
            AnimalKind::Wolf => 0.0008,
            AnimalKind::Dog => 0.0006,
            AnimalKind::Bear => 0.0009,
            AnimalKind::Sheep => 0.0005,
            AnimalKind::Cow => 0.0004,
            AnimalKind::Horse => 0.0005,
            AnimalKind::Chicken => 0.0006,
            AnimalKind::Fox => 0.0006,
            AnimalKind::Cat => 0.0005,
            AnimalKind::Penguin => 0.0005,
            AnimalKind::Camel => 0.0004,
            AnimalKind::Frog => 0.0006,
            AnimalKind::Whale => 0.0004,
            // Monsters do not eat. A UFO's energy is its visit: it leaves
            // after roughly 1200 ticks.
            // Zombies slowly rot (about 2500 ticks), so outbreaks burn out.
            AnimalKind::Zombie => 0.00032,
            AnimalKind::Demon | AnimalKind::Dragon | AnimalKind::Alien => 0.0,
            AnimalKind::Ufo => 0.0007,
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
            AnimalKind::Bear => 0.0,
            AnimalKind::Sheep => 4.0,
            AnimalKind::Cow => 2.5,
            AnimalKind::Horse => 5.0,
            AnimalKind::Chicken => 3.0,
            AnimalKind::Fox => 5.0,
            AnimalKind::Cat => 3.5,
            AnimalKind::Penguin => 3.5,
            AnimalKind::Camel => 2.0,
            AnimalKind::Frog => 4.0,
            AnimalKind::Whale => 0.0,
            AnimalKind::Zombie
            | AnimalKind::Demon
            | AnimalKind::Dragon
            | AnimalKind::Alien
            | AnimalKind::Ufo => 0.0,
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
            AnimalKind::Bear => 1,
            AnimalKind::Sheep => 1,
            AnimalKind::Cow => 1,
            AnimalKind::Horse => 3,
            AnimalKind::Chicken => 1,
            AnimalKind::Fox => 2,
            AnimalKind::Cat => 2,
            AnimalKind::Penguin => 1,
            AnimalKind::Camel => 2,
            AnimalKind::Frog => 2,
            AnimalKind::Whale => 1,
            AnimalKind::Zombie => 1,
            AnimalKind::Demon => 2,
            AnimalKind::Dragon => 3,
            AnimalKind::Alien => 1,
            AnimalKind::Ufo => 2,
        }
    }
    pub fn aquatic(self) -> bool {
        matches!(self, AnimalKind::Fish | AnimalKind::Whale)
    }
    /// Hunts other animals, and people when hungry.
    pub fn predator(self) -> bool {
        matches!(self, AnimalKind::Wolf | AnimalKind::Bear)
    }
    /// Summoned creatures that hunt people whether or not they are hungry.
    pub fn monster(self) -> bool {
        matches!(
            self,
            AnimalKind::Zombie | AnimalKind::Demon | AnimalKind::Dragon | AnimalKind::Alien | AnimalKind::Ufo
        )
    }
    /// Anything people should fear and flee.
    pub fn hostile(self) -> bool {
        self.predator() || self.monster()
    }
    /// Crosses water and rock.
    pub fn flies(self) -> bool {
        matches!(self, AnimalKind::Dragon | AnimalKind::Ufo)
    }
    /// Animals predators hunt, and which flee from them.
    pub fn is_prey(self) -> bool {
        matches!(
            self,
            AnimalKind::Rabbit
                | AnimalKind::Deer
                | AnimalKind::Sheep
                | AnimalKind::Cow
                | AnimalKind::Horse
                | AnimalKind::Chicken
                | AnimalKind::Fox
                | AnimalKind::Frog
        )
    }
    /// Grazers stop to eat; herd animals drift toward others.
    pub fn grazes(self) -> bool {
        matches!(
            self,
            AnimalKind::Deer | AnimalKind::Sheep | AnimalKind::Cow | AnimalKind::Horse | AnimalKind::Rabbit
        )
    }
    pub fn herds(self) -> bool {
        matches!(
            self,
            AnimalKind::Deer | AnimalKind::Sheep | AnimalKind::Cow | AnimalKind::Horse | AnimalKind::Penguin
        )
    }
    /// Biomes this kind keeps to when it is placed (player releases and
    /// natural spawns alike). Empty means it does not mind where it is.
    pub fn habitat(self) -> &'static [Biome] {
        match self {
            AnimalKind::Rabbit => &[Biome::Grassland, Biome::Savanna, Biome::Forest],
            AnimalKind::Deer => &[Biome::Forest, Biome::Grassland, Biome::Taiga, Biome::Savanna],
            AnimalKind::Boar => &[Biome::Forest, Biome::Jungle, Biome::Wetland],
            AnimalKind::Wolf => &[Biome::Forest, Biome::Taiga, Biome::Tundra, Biome::Grassland],
            AnimalKind::Fox => &[Biome::Forest, Biome::Taiga, Biome::Grassland, Biome::Savanna],
            AnimalKind::Bear => &[Biome::Forest, Biome::Taiga, Biome::Tundra, Biome::Jungle],
            AnimalKind::Sheep | AnimalKind::Cow | AnimalKind::Horse => &[Biome::Grassland, Biome::Savanna],
            AnimalKind::Chicken => &[Biome::Grassland, Biome::Savanna, Biome::Forest],
            AnimalKind::Penguin => &[Biome::Tundra],
            AnimalKind::Camel => &[Biome::Desert, Biome::Badlands],
            AnimalKind::Frog => &[Biome::Wetland, Biome::Jungle],
            _ => &[],
        }
    }
    /// Whether this kind can stand (or swim) on a tile.
    pub fn fits_ground(self, tile: Tile) -> bool {
        if self.aquatic() {
            tile == Tile::Water
        } else {
            !matches!(tile, Tile::Void | Tile::Rock | Tile::Water | Tile::Fire)
        }
    }
    /// The name with "a" or "an", for event and thought text.
    pub fn a_name(self) -> String {
        let name = self.name();
        let article = if name.starts_with(['a', 'e', 'i', 'o', 'u']) {
            "an"
        } else {
            "a"
        };
        format!("{article} {name}")
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
            AnimalKind::Bear => "bear",
            AnimalKind::Sheep => "sheep",
            AnimalKind::Cow => "cow",
            AnimalKind::Horse => "horse",
            AnimalKind::Chicken => "chicken",
            AnimalKind::Fox => "fox",
            AnimalKind::Cat => "cat",
            AnimalKind::Penguin => "penguin",
            AnimalKind::Camel => "camel",
            AnimalKind::Frog => "frog",
            AnimalKind::Whale => "whale",
            AnimalKind::Zombie => "zombie",
            AnimalKind::Demon => "demon",
            AnimalKind::Dragon => "dragon",
            AnimalKind::Alien => "alien",
            AnimalKind::Ufo => "ufo",
        }
    }
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
    /// Direction kept between ticks so calm animals walk somewhere instead
    /// of picking a new random direction every tick. Not persisted.
    pub heading: u8,
    /// Asleep for the winter (wild bears). Recomputed every tick, not saved.
    pub sleeping: bool,
    /// Flown south for the winter (wild birds). Recomputed every tick.
    pub away: bool,
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
            heading: (id % 8) as u8,
            sleeping: false,
            away: false,
        }
    }

    pub fn tick(
        &mut self,
        grid: &WorldGrid,
        org_positions: &[(f32, f32)],
        prey_positions: &[(f32, f32)],
        wolf_positions: &[(f32, f32)],
        rng: &mut impl Rng,
    ) {
        if !self.alive {
            return;
        }
        let (ix, iy) = (self.x as i32, self.y as i32);

        let on_food = grid.get(ix, iy) == Tile::Food;
        if on_food && !self.kind.aquatic() && !self.kind.monster() {
            self.energy = (self.energy + 0.04).min(1.0);
        }
        if self.kind.aquatic() && grid.get(ix, iy) == Tile::Water {
            self.energy = (self.energy + 0.02).min(1.0);
        }

        let drain = self.kind.drain();
        self.energy = (self.energy - drain).max(0.0);
        if self.energy <= 0.0 {
            self.alive = false;
            return;
        }

        let step = self.kind.step_size();

        // A fed predator rests and roams instead of stalking. Monsters
        // always stalk, and only people.
        let monster = self.kind.monster();
        if monster || (self.kind.predator() && self.energy <= 0.85) {
            let prey: &[(f32, f32)] = if monster { &[] } else { prey_positions };
            let target = prey
                .iter()
                .chain(org_positions.iter())
                .map(|&(ox, oy)| ((ox - self.x).abs() + (oy - self.y).abs(), ox, oy))
                .filter(|&(d, _, _)| d < 20.0)
                .min_by(|(a, _, _), (b, _, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
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
                    return;
                }
            }
            let di = rng.random_range(0..8usize);
            self.move_toward(grid, ix, iy, ix + DIRS[di].0 * step, iy + DIRS[di].1 * step);
            return;
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
        // Prey should react to the wolves that actually hunt them. Keep the
        // predator list separate from people so only rabbits and deer flee;
        // boars, birds and tamed dogs retain their existing behavior.
        let nearest_wolf = if self.kind.is_prey() {
            wolf_positions
                .iter()
                .map(|&(wx, wy)| ((wx - self.x).abs() + (wy - self.y).abs(), wx, wy))
                .filter(|&(distance, _, _)| distance < 9.0)
                .min_by(|(a, _, _), (b, _, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        } else {
            None
        };
        let nearest_threat = match (nearest_org, nearest_wolf) {
            (Some(person), Some(wolf)) => Some(if wolf.0 < person.0 { wolf } else { person }),
            (Some(person), None) => Some(person),
            (None, Some(wolf)) => Some(wolf),
            (None, None) => None,
        };

        let (tx, ty): (i32, i32) = if let Some((_, ox, oy)) = nearest_threat {
            let fdx = self.x - ox;
            let fdy = self.y - oy;
            let len = (fdx * fdx + fdy * fdy).sqrt().max(0.001);
            (
                ix + (fdx / len * 4.0).round() as i32,
                iy + (fdy / len * 4.0).round() as i32,
            )
        } else if !self.kind.monster() && self.energy < 0.55 && rng.random::<f32>() < 0.35 {
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
            let tile = grid.get(ix, iy);
            // Grazers often stop to eat on grass.
            if self.kind.grazes() && matches!(tile, Tile::Grass | Tile::Food) && rng.random::<f32>() < 0.55 {
                return;
            }
            // Herd animals drift toward the nearest other grazer they can see.
            if self.kind.herds() && rng.random::<f32>() < 0.3 {
                let herd = prey_positions
                    .iter()
                    .map(|&(px, py)| ((px - self.x).abs() + (py - self.y).abs(), px, py))
                    .filter(|&(d, _, _)| d > 3.0 && d < 14.0)
                    .min_by(|a, b| a.0.total_cmp(&b.0));
                if let Some((_, px, py)) = herd {
                    self.move_toward(grid, ix, iy, px as i32, py as i32);
                    return;
                }
            }
            // Otherwise keep walking the same way for a while.
            if rng.random::<f32>() < 0.12 {
                self.heading = rng.random_range(0..8u8);
            }
            let (hx, hy) = DIRS[usize::from(self.heading % 8)];
            (ix + hx * step, iy + hy * step)
        };

        let (bx, by) = (self.x, self.y);
        self.move_toward(grid, ix, iy, tx, ty);
        if self.x == bx && self.y == by {
            // Blocked: turn so the next tick tries a new direction.
            self.heading = rng.random_range(0..8u8);
        }
    }

    fn move_toward(&mut self, grid: &WorldGrid, ix: i32, iy: i32, tx: i32, ty: i32) {
        let flies = self.kind.flies();
        // Demons walk through fire; dragons and UFOs fly over everything.
        let fireproof = flies || self.kind == AnimalKind::Demon;
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
            if t == Tile::Void {
                continue;
            }
            if !flies {
                if t == Tile::Rock || (t == Tile::Fire && !fireproof) {
                    continue;
                }
                if blocks_water && t == Tile::Water {
                    continue;
                }
                if !blocks_water && t != Tile::Water {
                    continue;
                }
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
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub sleeping: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub away: bool,
}

impl Animal {
    pub fn to_json(&self) -> AnimalJson {
        AnimalJson {
            id: self.id,
            x: (self.x * 10.0).round() / 10.0,
            y: (self.y * 10.0).round() / 10.0,
            kind: self.kind.name(),
            name: self.name.clone(),
            sleeping: self.sleeping,
            away: self.away,
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

        animal.tick(&grid, &[], &[], &[], &mut rng);

        assert_ne!((animal.x as i32, animal.y as i32), (120, 120));
    }

    #[test]
    fn rabbits_and_deer_flee_the_nearest_wolf_instead_of_wandering_toward_it() {
        let mut grid = WorldGrid::new(7);
        for x in 45..=55 {
            for y in 45..=55 {
                grid.set(x, y, Tile::Grass);
            }
        }

        for kind in [AnimalKind::Rabbit, AnimalKind::Deer] {
            let mut without_wolf = Animal::new(1, 50.0, 50.0, kind);
            let mut with_wolf = Animal::new(2, 50.0, 50.0, kind);
            let mut calm_rng = rand_chacha::ChaCha8Rng::seed_from_u64(3);
            let mut wary_rng = rand_chacha::ChaCha8Rng::seed_from_u64(3);

            without_wolf.tick(&grid, &[(46.0, 50.0)], &[], &[], &mut calm_rng);
            with_wolf.tick(&grid, &[(46.0, 50.0)], &[], &[(53.0, 50.0)], &mut wary_rng);

            assert!(
                without_wolf.x > 50.0,
                "{} should flee the nearby person",
                kind.name()
            );
            assert!(with_wolf.x < 50.0, "{} should flee the closer wolf", kind.name());
        }
    }
}
