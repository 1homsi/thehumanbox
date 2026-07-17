use crate::organism::animal::{Animal, AnimalKind};
use crate::sim::agents::growth::spawn_organism_with_home;
use crate::sim::simulation::Simulation;
use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::Tile;
use rand::Rng;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    Spawn {
        x: f32,
        y: f32,
        #[serde(default)]
        count: u32,
        #[serde(default)]
        lineage: Option<String>,
    },
    Smite {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    Heal {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    Paint {
        x: i32,
        y: i32,
        tile: String,
        #[serde(default)]
        radius: i32,
    },
    Ignite {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    Weather {
        kind: String,
    },
    Drought {
        active: bool,
    },
    Outbreak {
        #[serde(default)]
        count: u32,
    },
    SpawnAnimal {
        x: f32,
        y: f32,
        #[serde(default)]
        kind: Option<String>,
    },
}

fn tile_from_name(name: &str) -> Option<Tile> {
    Some(match name {
        "grass" => Tile::Grass,
        "water" => Tile::Water,
        "food" => Tile::Food,
        "rock" => Tile::Rock,
        "sand" => Tile::Sand,
        "snow" => Tile::Snow,
        "ash" => Tile::Ash,
        "fire" => Tile::Fire,
        "campfire" => Tile::Campfire,
        "hut" => Tile::Hut,
        "void" => Tile::Void,
        _ => return None,
    })
}

fn animal_from_name(name: &str) -> AnimalKind {
    match name {
        "rabbit" => AnimalKind::Rabbit,
        "deer" => AnimalKind::Deer,
        "boar" => AnimalKind::Boar,
        "bird" => AnimalKind::Bird,
        "fish" => AnimalKind::Fish,
        "wolf" => AnimalKind::Wolf,
        "dog" => AnimalKind::Dog,
        _ => AnimalKind::Deer,
    }
}

fn protected(tile: Tile) -> bool {
    matches!(tile, Tile::Hut | Tile::Campfire)
}

impl Simulation {
    pub fn apply_command_json(&mut self, json: &str) -> bool {
        match serde_json::from_str::<Command>(json) {
            Ok(cmd) => {
                self.apply_command(cmd);
                true
            }
            Err(_) => false,
        }
    }

    pub fn apply_command(&mut self, cmd: Command) {
        match cmd {
            Command::Spawn { x, y, count, lineage } => {
                let n = count.clamp(1, 50);
                for _ in 0..n {
                    if self.organisms.iter().filter(|o| o.alive).count() >= self.population_limit() {
                        break;
                    }
                    let lid = lineage
                        .clone()
                        .filter(|l| !l.is_empty())
                        .unwrap_or_else(|| format!("L{}", &Uuid::new_v4().to_string()[..6]));
                    let jx = (x + self.rng.random_range(-2.0..2.0)).clamp(2.0, WIDTH as f32 - 2.0);
                    let jy = (y + self.rng.random_range(-2.0..2.0)).clamp(2.0, HEIGHT as f32 - 2.0);
                    spawn_organism_with_home(
                        &self.grid,
                        &mut self.organisms,
                        jx,
                        jy,
                        jx,
                        jy,
                        lid,
                        &mut self.rng,
                    );
                }
            }
            Command::Smite { x, y, radius } => {
                let r = if radius <= 0.0 { 3.0 } else { radius };
                let mut best: Option<(usize, f32)> = None;
                for (i, o) in self.organisms.iter().enumerate() {
                    if !o.alive {
                        continue;
                    }
                    let d = (o.x - x).hypot(o.y - y);
                    if d <= r && best.map(|(_, bd)| d < bd).unwrap_or(true) {
                        best = Some((i, d));
                    }
                }
                if let Some((i, _)) = best {
                    let o = &mut self.organisms[i];
                    o.alive = false;
                    o.health = 0.0;
                }
            }
            Command::Heal { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius };
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x).hypot(o.y - y) <= r {
                        o.health = 1.0;
                        o.energy = 1.0;
                        o.hydration = 1.0;
                        o.infection = 0.0;
                    }
                }
            }
            Command::Paint { x, y, tile, radius } => {
                let Some(t) = tile_from_name(&tile) else { return };
                let r = radius.clamp(0, 24);
                for dx in -r..=r {
                    for dy in -r..=r {
                        if dx * dx + dy * dy > r * r {
                            continue;
                        }
                        let (nx, ny) = (x + dx, y + dy);
                        if WorldGrid::in_bounds(nx, ny) && !protected(self.grid.get(nx, ny)) {
                            self.grid.set(nx, ny, t);
                            if matches!(t, Tile::Fire | Tile::Campfire) {
                                *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                                self.physics.register_fire(nx, ny);
                            } else {
                                // Painting over a burning tile must clear its
                                // independent heat layer too, or a hut/resource
                                // can retain a permanent phantom flame.
                                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                            }
                        }
                    }
                }
            }
            Command::Ignite { x, y, radius } => {
                let r = radius.clamp(0, 12);
                for dx in -r..=r {
                    for dy in -r..=r {
                        if dx * dx + dy * dy > r * r {
                            continue;
                        }
                        let (nx, ny) = (x + dx, y + dy);
                        if WorldGrid::in_bounds(nx, ny) {
                            let cur = self.grid.get(nx, ny);
                            if !protected(cur) && cur != Tile::Water && cur != Tile::Void {
                                self.grid.set(nx, ny, Tile::Fire);
                                *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                            }
                        }
                    }
                }
            }
            Command::Weather { kind } => {
                let now = self.tick_count;
                match kind.as_str() {
                    "rain" => {
                        self.weather.kind = 1;
                        self.weather.start_tick = now;
                        self.weather.duration = 1800;
                        self.weather.intensity = 0.7;
                    }
                    "storm" => {
                        self.weather.kind = 2;
                        self.weather.start_tick = now;
                        self.weather.duration = 1800;
                        self.weather.intensity = 0.9;
                    }
                    _ => {
                        self.weather.kind = 0;
                        self.weather.duration = 0;
                        self.weather.intensity = 0.0;
                        self.weather.wet_until = 0;
                    }
                }
            }
            Command::Drought { active } => {
                if active {
                    self.drought.active = true;
                    self.drought.start_tick = self.tick_count;
                    self.drought.rain_relief = 0;
                } else {
                    self.drought.active = false;
                    self.drought.dried_tiles.clear();
                    self.drought.rain_relief = self.tick_count;
                }
            }
            Command::Outbreak { count } => {
                let n = count.clamp(1, 50) as usize;
                let mut hit = 0;
                for o in self.organisms.iter_mut() {
                    if hit >= n {
                        break;
                    }
                    if o.alive && o.infection < 0.2 {
                        o.infection = 0.85;
                        hit += 1;
                    }
                }
            }
            Command::SpawnAnimal { x, y, kind } => {
                if self.animals.iter().filter(|a| a.alive).count() >= 400 {
                    return;
                }
                let k = kind.as_deref().map(animal_from_name).unwrap_or(AnimalKind::Deer);
                let cx = x.clamp(2.0, WIDTH as f32 - 2.0);
                let cy = y.clamp(2.0, HEIGHT as f32 - 2.0);
                let id = self.next_animal_id;
                self.next_animal_id += 1;
                self.animals.push(Animal::new(id, cx, cy, k));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    fn alive(sim: &Simulation) -> usize {
        sim.organisms.iter().filter(|o| o.alive).count()
    }

    #[test]
    fn spawn_adds_organisms() {
        let mut sim = Simulation::new(1);
        let before = alive(&sim);
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":3}"#));
        assert_eq!(alive(&sim), before + 3);
    }

    #[test]
    fn bad_command_rejected() {
        let mut sim = Simulation::new(1);
        assert!(!sim.apply_command_json(r#"{"cmd":"definitely_not_a_command"}"#));
        assert!(!sim.apply_command_json("not even json"));
    }

    #[test]
    fn weather_and_drought_apply() {
        let mut sim = Simulation::new(1);
        assert!(sim.apply_command_json(r#"{"cmd":"weather","kind":"storm"}"#));
        assert_eq!(sim.weather.kind, 2);
        assert!(sim.apply_command_json(r#"{"cmd":"drought","active":true}"#));
        assert!(sim.drought.active);
    }

    #[test]
    fn spawn_animal_adds_one() {
        let mut sim = Simulation::new(1);
        let before = sim.animals.len();
        assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"wolf"}"#));
        assert_eq!(sim.animals.len(), before + 1);
    }

    #[test]
    fn sandbox_can_place_shelter_and_campfire() {
        use crate::world::tiles::Tile;

        let mut sim = Simulation::new(1);
        sim.grid.set(100, 100, Tile::Fire);
        *sim.grid.fire_intensity_mut(100, 100) = 0.8;
        sim.physics.register_fire(100, 100);
        assert!(sim.apply_command_json(r#"{"cmd":"paint","x":100,"y":100,"tile":"hut","radius":0}"#));
        assert_eq!(sim.grid.get(100, 100), Tile::Hut);
        assert_eq!(sim.grid.fire_intensity(100, 100), 0.0);

        assert!(sim.apply_command_json(r#"{"cmd":"paint","x":102,"y":100,"tile":"campfire","radius":0}"#));
        assert_eq!(sim.grid.get(102, 100), Tile::Campfire);
        assert_eq!(sim.grid.fire_intensity(102, 100), 1.0);
    }
}
