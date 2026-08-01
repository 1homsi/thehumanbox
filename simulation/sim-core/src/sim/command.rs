use crate::organism::animal::{Animal, AnimalKind};
use crate::sim::agents::growth::spawn_organism_with_home;
use crate::sim::simulation::Simulation;
use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::Tile;
use rand::RngExt;
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
    #[serde(alias = "set_strategy")]
    Guide {
        lineage: String,
        strategy: String,
        #[serde(default = "default_strategy_duration", alias = "duration")]
        duration_ticks: u64,
    },
}

const MIN_STRATEGY_DURATION: u64 = 60;
const MAX_STRATEGY_DURATION: u64 = 7200;

fn default_strategy_duration() -> u64 {
    1200
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
    pub(crate) fn refresh_lineage_guidance(&mut self, organism_index: usize) {
        let Some(organism) = self.organisms.get(organism_index) else {
            return;
        };
        if !organism.alive || (self.tick_count < organism.directive_until && !organism.directive.is_empty()) {
            return;
        }
        let Some((strategy, expires_at)) = self
            .lineage_strategies
            .get(&organism.lineage_id)
            .filter(|(_, expires_at)| *expires_at > self.tick_count)
            .cloned()
        else {
            return;
        };
        let organism = &mut self.organisms[organism_index];
        organism.directive = strategy;
        organism.directive_until = expires_at;
    }

    pub fn apply_command_json(&mut self, json: &str) -> bool {
        match serde_json::from_str::<Command>(json) {
            Ok(cmd) => self.apply_command(cmd),
            Err(_) => false,
        }
    }

    pub fn apply_command(&mut self, cmd: Command) -> bool {
        match cmd {
            Command::Spawn { x, y, count, lineage } => {
                let n = count.clamp(1, 50);
                let lid = lineage
                    .filter(|lineage| !lineage.is_empty())
                    .unwrap_or_else(|| format!("L{}", &Uuid::new_v4().to_string()[..6]));
                for _ in 0..n {
                    if crate::sim::growth::population_slots_used(&self.organisms) >= self.population_limit() {
                        break;
                    }
                    let jx = (x + self.rng.random_range(-2.0..2.0)).clamp(2.0, WIDTH as f32 - 2.0);
                    let jy = (y + self.rng.random_range(-2.0..2.0)).clamp(2.0, HEIGHT as f32 - 2.0);
                    spawn_organism_with_home(
                        &self.grid,
                        &mut self.organisms,
                        jx,
                        jy,
                        jx,
                        jy,
                        lid.clone(),
                        &mut self.rng,
                    );
                }
                true
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
                true
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
                true
            }
            Command::Paint { x, y, tile, radius } => {
                let Some(t) = tile_from_name(&tile) else {
                    return false;
                };
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
                true
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
                                self.physics.register_fire(nx, ny);
                            }
                        }
                    }
                }
                true
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
                true
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
                true
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
                true
            }
            Command::SpawnAnimal { x, y, kind } => {
                if self.animals.iter().filter(|a| a.alive).count() >= 400 {
                    return false;
                }
                let k = kind.as_deref().map(animal_from_name).unwrap_or(AnimalKind::Deer);
                let cx = x.clamp(2.0, WIDTH as f32 - 2.0);
                let cy = y.clamp(2.0, HEIGHT as f32 - 2.0);
                let id = self.next_animal_id;
                self.next_animal_id += 1;
                self.animals.push(Animal::new(id, cx, cy, k));
                true
            }
            Command::Guide {
                lineage,
                strategy,
                duration_ticks,
            } => {
                let valid_strategy = matches!(
                    strategy.as_str(),
                    "hunt" | "explore" | "settle" | "trade" | "defend"
                );
                let valid_duration =
                    (MIN_STRATEGY_DURATION..=MAX_STRATEGY_DURATION).contains(&duration_ticks);
                let living_lineage = self
                    .organisms
                    .iter()
                    .any(|organism| organism.alive && organism.lineage_id == lineage);
                if !valid_strategy || !valid_duration || !living_lineage {
                    return false;
                }

                let expires_at = self.tick_count.saturating_add(duration_ticks);
                for organism in self
                    .organisms
                    .iter_mut()
                    .filter(|organism| organism.alive && organism.lineage_id == lineage)
                {
                    let active_personal_directive = self.tick_count < organism.directive_until
                        && !organism.directive.is_empty()
                        && !matches!(
                            organism.directive.as_str(),
                            "hunt" | "explore" | "settle" | "trade" | "defend"
                        );
                    if !active_personal_directive {
                        organism.directive.clone_from(&strategy);
                        organism.directive_until = expires_at;
                    }
                }
                self.start_strategy_objective(&lineage, &strategy, expires_at);
                self.lineage_strategies.insert(lineage, (strategy, expires_at));
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    struct ZeroRng;

    impl rand::TryRng for ZeroRng {
        type Error = core::convert::Infallible;

        fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
            Ok(0)
        }

        fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
            Ok(0)
        }

        fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
            dst.fill(0);
            Ok(())
        }
    }

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
    fn spawned_tribe_shares_one_generated_lineage() {
        let mut sim = Simulation::new(1);
        let before = sim.organisms.len();
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":5}"#));

        let lineages: std::collections::HashSet<&str> = sim.organisms[before..]
            .iter()
            .map(|organism| organism.lineage_id.as_str())
            .collect();
        assert_eq!(lineages.len(), 1);
    }

    #[test]
    fn sandbox_spawn_cannot_consume_a_pending_birth_slot() {
        let mut sim = Simulation::new(4);
        sim.set_population_limit(120);
        let mother_id = sim.organisms[1].id.clone();
        sim.organisms[1].pregnant = true;
        sim.organisms[0].alive = false;
        sim.organisms[0].age = 0;
        sim.organisms[0].parent_id = mother_id;
        sim.organisms[0].father_id = Some("father".to_string());
        let alive_before = alive(&sim);

        assert_eq!(crate::sim::growth::population_slots_used(&sim.organisms), 120);
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":1}"#));
        assert_eq!(alive(&sim), alive_before);
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

    #[test]
    fn sandbox_ignite_registers_fire_with_physics() {
        use crate::world::tiles::Tile;

        let mut sim = Simulation::new(2);
        for dx in -1..=1 {
            for dy in -1..=1 {
                sim.grid.set(100 + dx, 100 + dy, Tile::Grass);
            }
        }
        assert!(sim.apply_command_json(r#"{"cmd":"ignite","x":100,"y":100,"radius":0}"#));
        assert_eq!(sim.grid.fire_intensity(100, 100), 1.0);

        sim.physics.tick(&mut sim.grid, &mut ZeroRng, 0, false);
        assert!(sim.grid.fire_intensity(100, 100) < 1.0);
        assert_eq!(sim.grid.get(101, 100), Tile::Fire);
    }

    #[test]
    fn guide_accepts_only_living_lineages_allowed_strategies_and_bounded_duration() {
        let mut sim = Simulation::new(3);
        sim.tick_count = 500;
        let lineage = sim
            .organisms
            .iter()
            .find(|organism| organism.alive)
            .unwrap()
            .lineage_id
            .clone();

        let guide =
            format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"explore","duration_ticks":600}}"#);
        let guided_index = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.lineage_id == lineage)
            .unwrap();
        let protected_index = sim
            .organisms
            .iter()
            .enumerate()
            .find(|(index, organism)| {
                *index != guided_index && organism.alive && organism.lineage_id == lineage
            })
            .map(|(index, _)| index);
        if let Some(index) = protected_index {
            sim.organisms[index].directive = "flee".to_string();
            sim.organisms[index].directive_until = 550;
        }
        assert!(sim.apply_command_json(&guide));
        assert_eq!(
            sim.lineage_strategies.get(&lineage),
            Some(&("explore".to_string(), 1100))
        );
        let objective = sim.lineage_strategy_objectives.get(&lineage).unwrap();
        assert_eq!(objective.strategy, "explore");
        assert_eq!(objective.started_tick, 500);
        assert_eq!(objective.expires_tick, 1100);
        assert_eq!(objective.progress, 0);
        assert_eq!(objective.target, 300);
        assert_eq!(objective.completed_tick, None);
        assert_eq!(sim.organisms[guided_index].directive, "explore");
        assert_eq!(sim.organisms[guided_index].directive_until, 1100);
        if let Some(index) = protected_index {
            assert_eq!(sim.organisms[index].directive, "flee");
            assert_eq!(sim.organisms[index].directive_until, 550);
        }

        let alias =
            format!(r#"{{"cmd":"set_strategy","lineage":"{lineage}","strategy":"defend","duration":60}}"#);
        assert!(sim.apply_command_json(&alias));
        assert_eq!(
            sim.lineage_strategies.get(&lineage),
            Some(&("defend".to_string(), 560))
        );
        let objective = sim.lineage_strategy_objectives.get(&lineage).unwrap();
        assert_eq!(objective.strategy, "defend");
        assert_eq!(objective.started_tick, 500);
        assert_eq!(objective.expires_tick, 560);
        assert_eq!(objective.target, 30);
        assert_eq!(sim.lineage_strategy_history.len(), 1);
        let redirected = sim.lineage_strategy_history.back().unwrap();
        assert_eq!(redirected.lineage_id, lineage);
        assert_eq!(redirected.strategy, "explore");
        assert_eq!(redirected.outcome, "redirected");
        assert_eq!(sim.organisms[guided_index].directive, "defend");
        assert_eq!(sim.organisms[guided_index].directive_until, 560);
        if let Some(index) = protected_index {
            assert_eq!(sim.organisms[index].directive, "flee");
            assert_eq!(sim.organisms[index].directive_until, 550);
            sim.tick_count = 551;
            sim.refresh_lineage_guidance(index);
            assert_eq!(sim.organisms[index].directive, "defend");
            assert_eq!(sim.organisms[index].directive_until, 560);
        }

        for invalid in [
            format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"conquer","duration_ticks":600}}"#),
            format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"hunt","duration_ticks":59}}"#),
            r#"{"cmd":"guide","lineage":"missing","strategy":"hunt","duration_ticks":600}"#.to_string(),
        ] {
            assert!(!sim.apply_command_json(&invalid));
        }
    }
}
