use crate::organism::animal::{Animal, AnimalKind};
use crate::sim::agents::growth::spawn_organism_with_home;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::Tile;
use rand::RngExt;
use serde::Deserialize;

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
    /// Infect everyone inside the radius with the existing sickness.
    Poison {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Heal, energise and cheer everyone inside the radius.
    Bless {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Raise literacy and give each person inside the radius one discovery
    /// they are ready for.
    Inspire {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Crack the ground, damage buildings and hurt people inside the radius.
    Earthquake {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Turn the two tribes nearest the point against each other.
    War {
        x: f32,
        y: f32,
    },
    /// Make the two tribes nearest the point friends.
    Peace {
        x: f32,
        y: f32,
    },
    /// Kill everything inside the radius, leave a rock crater ringed with
    /// ash, and set the land around it burning.
    Meteor {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    #[serde(alias = "set_strategy")]
    Guide {
        lineage: String,
        strategy: String,
        #[serde(default = "default_strategy_duration", alias = "duration")]
        duration_ticks: u64,
    },
}

/// Natural breeding stops near 1000 animals (see `tick_animals`), so the
/// player's cap sits just above that. A lower cap meant a mature world had
/// already filled it and every animal tool silently failed.
const SANDBOX_ANIMAL_CAP: usize = 1100;

/// Safety ceiling for player-spawned people (births have their own limit).
const SANDBOX_PEOPLE_LIMIT: usize = 5000;

const MIN_STRATEGY_DURATION: u64 = 60;
const MAX_STRATEGY_DURATION: u64 = 7200;

fn default_strategy_duration() -> u64 {
    1200
}

/// Clamp a command coordinate to a range where `coord + offset` cannot
/// overflow `i32`. Command payloads are untrusted JSON, and the handlers
/// add a radius-sized offset before calling `WorldGrid::in_bounds`.
fn clamp_cmd_coord(v: i32) -> i32 {
    v.clamp(-100_000, 100_000)
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
        "bear" => AnimalKind::Bear,
        "sheep" => AnimalKind::Sheep,
        "cow" => AnimalKind::Cow,
        "horse" => AnimalKind::Horse,
        "chicken" => AnimalKind::Chicken,
        _ => AnimalKind::Deer,
    }
}

fn protected(tile: Tile) -> bool {
    matches!(tile, Tile::Hut | Tile::Campfire)
}

impl Simulation {
    /// Sets how the two lineages nearest (x, y) feel about each other:
    /// -1 is war, +1 is friendship. Fails unless two tribes are around.
    fn set_nearest_tribes_relation(&mut self, x: f32, y: f32, attitude: f32) -> bool {
        let mut by_lineage: Vec<(String, f32)> = Vec::new();
        for o in self
            .organisms
            .iter()
            .filter(|o| o.alive && !o.lineage_id.is_empty())
        {
            let d = (o.x - x).hypot(o.y - y);
            match by_lineage.iter_mut().find(|(lid, _)| *lid == o.lineage_id) {
                Some((_, best)) => *best = best.min(d),
                None => by_lineage.push((o.lineage_id.clone(), d)),
            }
        }
        by_lineage.sort_by(|a, b| a.1.total_cmp(&b.1));
        let [(a, _), (b, _), ..] = by_lineage.as_slice() else {
            return false;
        };
        let (a, b) = (a.clone(), b.clone());
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if o.lineage_id == a {
                o.lineage_attitudes.insert(b.clone(), attitude);
            } else if o.lineage_id == b {
                o.lineage_attitudes.insert(a.clone(), attitude);
            }
        }
        let name = |lid: &str| {
            self.lineage_names
                .get(lid)
                .cloned()
                .unwrap_or_else(|| lid.to_string())
        };
        let (an, bn) = (name(&a), name(&b));
        let (kind, detail) = if attitude < 0.0 {
            ("war", format!("{an} and {bn} turned on each other"))
        } else {
            ("peace", format!("{an} and {bn} made peace"))
        };
        push_event(&mut self.events, self.tick_count, kind, "the gods", &detail);
        true
    }

    /// Lineage of the closest living person within `radius`, if any.
    fn nearest_living_lineage(&self, x: f32, y: f32, radius: f32) -> Option<String> {
        self.organisms
            .iter()
            .filter(|o| o.alive && !o.lineage_id.is_empty())
            .map(|o| (o, (o.x - x).hypot(o.y - y)))
            .filter(|&(_, d)| d <= radius)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(o, _)| o.lineage_id.clone())
    }

    /// Guiding a lineage to explore sends its adults on one shared journey to
    /// distant good land. A directive alone only nudged action scores, so
    /// "explore" rarely made anyone travel.
    fn launch_lineage_expedition(&mut self, lineage: &str) {
        let members: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lineage && o.age >= 700)
            .map(|(i, _)| i)
            .collect();
        if members.is_empty() {
            return;
        }
        let n = members.len() as f32;
        let cx = members.iter().map(|&i| self.organisms[i].x).sum::<f32>() / n;
        let cy = members.iter().map(|&i| self.organisms[i].y).sum::<f32>() / n;
        let Some(target) = self.find_distant_land_target(cx as i32, cy as i32, 40, 140) else {
            return;
        };
        let tick = self.tick_count;
        for i in members {
            self.organisms[i].begin_journey(target, "on an expedition", tick);
        }
    }

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
                    .map(|l| {
                        // A caller-supplied lineage id reaches byte-slicing
                        // sites (`&lid[..6]`) in the log/telemetry paths, so
                        // clamp the length of anything supplied. Note this
                        // bounds *characters*, not bytes, and does not make
                        // the id ASCII: `chars().take(64)` happily keeps 64
                        // three-byte characters. The slicing sites are
                        // therefore still required to be char-boundary safe
                        // — see `economy_tick::lid_short`.
                        l.chars().take(64).collect()
                    })
                    .or_else(|| {
                        // One new person joins the nearest tribe so they have
                        // kin to live with; a group founds its own lineage.
                        (n == 1)
                            .then(|| self.nearest_living_lineage(x, y, 30.0))
                            .flatten()
                    })
                    .unwrap_or_else(|| {
                        format!("L{}", crate::sim::agents::spawn::seeded_id(&mut self.rng, 6))
                    });
                // A new lineage needs a name, or its people show as
                // "undefined" wherever the tribe name is displayed.
                if !self.lineage_names.contains_key(&lid) {
                    let name = crate::organism::organism::generate_tribe_name(&mut self.rng);
                    self.lineage_names.insert(lid.clone(), name);
                }
                let before = self.organisms.len();
                // Players can add as many people as they like. Births still
                // respect the natural population limit; this ceiling only
                // keeps a runaway click-fest from freezing the simulation.
                let cap = SANDBOX_PEOPLE_LIMIT;
                for _ in 0..n {
                    if crate::sim::growth::population_slots_used(&self.organisms) >= cap {
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
                // Report failure when the world is full so the player sees
                // why nobody appeared instead of a silent "applied".
                self.organisms.len() > before
            }
            Command::Smite { x, y, radius } => {
                // Clamp the upper bound too: `radius: 1e30` parses to
                // `f32::INFINITY`, which made `d <= r` true for every
                // organism in the world.
                let r = if radius <= 0.0 { 3.0 } else { radius.min(32.0) };
                let nearest_person = self
                    .organisms
                    .iter()
                    .enumerate()
                    .filter(|(_, o)| o.alive)
                    .map(|(i, o)| (i, (o.x - x).hypot(o.y - y)))
                    .filter(|&(_, d)| d <= r)
                    .min_by(|a, b| a.1.total_cmp(&b.1));
                let nearest_animal = self
                    .animals
                    .iter()
                    .enumerate()
                    .filter(|(_, a)| a.alive)
                    .map(|(i, a)| (i, (a.x - x).hypot(a.y - y)))
                    .filter(|&(_, d)| d <= r)
                    .min_by(|a, b| a.1.total_cmp(&b.1));
                // Lightning strikes whatever living thing is closest.
                match (nearest_person, nearest_animal) {
                    (Some((i, dp)), animal) if animal.is_none_or(|(_, da)| dp <= da) => {
                        // Health below zero hands the death to the normal
                        // tick, which records it and lets kin grieve.
                        self.organisms[i].health = -1.0;
                        let name = self.organisms[i].name.clone();
                        push_event(
                            &mut self.events,
                            self.tick_count,
                            "smite",
                            &name,
                            "was struck down by lightning",
                        );
                        true
                    }
                    (_, Some((i, _))) => {
                        self.animals[i].alive = false;
                        let kind = self.animals[i].kind.name();
                        push_event(
                            &mut self.events,
                            self.tick_count,
                            "smite",
                            "lightning",
                            &format!("struck down a {kind}"),
                        );
                        true
                    }
                    _ => false,
                }
            }
            Command::Heal { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
                let mut healed = 0;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x).hypot(o.y - y) <= r {
                        o.health = 1.0;
                        o.energy = 1.0;
                        o.hydration = 1.0;
                        o.infection = 0.0;
                        healed += 1;
                    }
                }
                for a in self.animals.iter_mut() {
                    if a.alive && (a.x - x).hypot(a.y - y) <= r {
                        a.energy = 1.0;
                        healed += 1;
                    }
                }
                healed > 0
            }
            Command::Paint { x, y, tile, radius } => {
                let Some(t) = tile_from_name(&tile) else {
                    return false;
                };
                // `x`/`y` arrive straight from JSON, so `x + dx` could
                // overflow `i32` (and panic in debug builds, which run the
                // command handler while holding the sim mutex).
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
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
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = radius.clamp(0, 21);
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
            Command::Poison { x, y, radius } => {
                let r = if radius <= 0.0 { 3.0 } else { radius.min(32.0) };
                let mut poisoned = 0;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x).hypot(o.y - y) <= r {
                        o.infection = o.infection.max(0.85);
                        poisoned += 1;
                    }
                }
                poisoned > 0
            }
            Command::Bless { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
                let mut blessed = 0;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x).hypot(o.y - y) <= r {
                        o.health = 1.0;
                        o.energy = 1.0;
                        o.hydration = 1.0;
                        o.infection = 0.0;
                        o.hope = (o.hope + 0.35).min(1.0);
                        o.comfort = (o.comfort + 0.25).min(1.0);
                        o.joy_ticks = o.joy_ticks.saturating_add(600).min(1_200);
                        o.think("blessed by the gods", self.tick_count);
                        blessed += 1;
                    }
                }
                if blessed > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "bless",
                        "the gods",
                        &format!("blessed {blessed} people"),
                    );
                }
                blessed > 0
            }
            Command::Inspire { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
                let tech = crate::sim::tech::tech_tree::all_tech();
                let tick = self.tick_count;
                let mut inspired = 0;
                for i in 0..self.organisms.len() {
                    let o = &self.organisms[i];
                    if !o.alive || (o.x - x).hypot(o.y - y) > r {
                        continue;
                    }
                    let ready: Vec<&str> = tech
                        .iter()
                        .filter(|node| !o.discoveries.contains(node.name))
                        .filter(|node| node.prerequisites.iter().all(|p| o.discoveries.contains(*p)))
                        .map(|node| node.name)
                        .collect();
                    let learned = (!ready.is_empty()).then(|| ready[self.rng.random_range(0..ready.len())]);
                    let o = &mut self.organisms[i];
                    o.literacy = (o.literacy + 0.15).min(1.0);
                    if let Some(name) = learned {
                        o.discoveries.insert(name.to_string());
                        o.think(&format!("inspired: {}", name.replace('_', " ")), tick);
                    }
                    inspired += 1;
                }
                if inspired > 0 {
                    push_event(
                        &mut self.events,
                        tick,
                        "inspire",
                        "the gods",
                        &format!("inspired {inspired} people"),
                    );
                }
                inspired > 0
            }
            Command::Earthquake { x, y, radius } => {
                if !WorldGrid::in_bounds(x, y) {
                    return false;
                }
                let r = if radius <= 0 { 5 } else { radius.clamp(1, 16) };
                // Jagged fault lines: random rock and sand cracks, more near
                // the centre. Protected tiles (huts, campfires) are spared.
                for dx in -r..=r {
                    for dy in -r..=r {
                        let d2 = dx * dx + dy * dy;
                        if d2 > r * r {
                            continue;
                        }
                        let (nx, ny) = (x + dx, y + dy);
                        let cur = self.grid.get(nx, ny);
                        if protected(cur) || matches!(cur, Tile::Water | Tile::Void) {
                            continue;
                        }
                        let near = 1.0 - (d2 as f32).sqrt() / r as f32;
                        if self.rng.random::<f32>() < 0.12 + 0.30 * near {
                            let crack = if self.rng.random::<f32>() < 0.6 {
                                Tile::Rock
                            } else {
                                Tile::Sand
                            };
                            self.grid.set(nx, ny, crack);
                            *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                        }
                    }
                }
                let (fx, fy, fr) = (x as f32, y as f32, r as f32);
                let mut hurt = 0;
                for o in self.organisms.iter_mut() {
                    let d = (o.x - fx).hypot(o.y - fy);
                    if o.alive && d <= fr {
                        o.health -= 0.25 + 0.35 * (1.0 - d / fr);
                        o.fear_level = (o.fear_level + 0.5).min(1.0);
                        hurt += 1;
                    }
                }
                let buildings = crate::sim::civ::building_damage::quake_damage(self, x, y, r);
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "earthquake",
                    "the earth",
                    &format!("shook, hurting {hurt} people and damaging {buildings} buildings"),
                );
                true
            }
            Command::War { x, y } => self.set_nearest_tribes_relation(x, y, -1.0),
            Command::Peace { x, y } => self.set_nearest_tribes_relation(x, y, 1.0),
            Command::Meteor { x, y, radius } => {
                if !WorldGrid::in_bounds(x, y) {
                    return false;
                }
                let r = if radius <= 0 { 4 } else { radius.clamp(1, 12) };
                let (fx, fy, fr) = (x as f32, y as f32, r as f32);
                let mut killed = 0;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - fx).hypot(o.y - fy) <= fr {
                        o.health = -1.0;
                        killed += 1;
                    }
                }
                let what = match killed {
                    0 => "a meteor fell from the sky".to_string(),
                    1 => "a meteor fell and killed one person".to_string(),
                    n => format!("a meteor fell and killed {n} people"),
                };
                push_event(&mut self.events, self.tick_count, "meteor", "the sky", &what);
                for a in self.animals.iter_mut() {
                    if a.alive && (a.x - fx).hypot(a.y - fy) <= fr {
                        a.alive = false;
                    }
                }
                let outer = r + 2;
                for dx in -outer..=outer {
                    for dy in -outer..=outer {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) {
                            continue;
                        }
                        let cur = self.grid.get(nx, ny);
                        if protected(cur) || cur == Tile::Void {
                            continue;
                        }
                        let d2 = dx * dx + dy * dy;
                        if d2 * 4 <= r * r {
                            self.grid.set(nx, ny, Tile::Rock);
                            *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                        } else if d2 <= r * r {
                            self.grid.set(nx, ny, Tile::Ash);
                            *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                        } else if d2 <= outer * outer && cur != Tile::Water {
                            self.grid.set(nx, ny, Tile::Fire);
                            *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                            self.physics.register_fire(nx, ny);
                        }
                    }
                }
                true
            }
            Command::SpawnAnimal { x, y, kind } => {
                if self.animals.iter().filter(|a| a.alive).count() >= SANDBOX_ANIMAL_CAP {
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
                if strategy == "explore" {
                    self.launch_lineage_expedition(&lineage);
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
        // Players can keep adding people past the natural limit, and the
        // pending birth keeps its slot.
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":1}"#));
        assert_eq!(alive(&sim), alive_before + 1);
        assert!(sim.organisms[1].pregnant, "the pending birth is untouched");
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":50}"#));
        assert_eq!(crate::sim::growth::population_slots_used(&sim.organisms), 171);
    }

    #[test]
    fn smite_and_heal_report_whether_anyone_was_in_range() {
        let mut sim = Simulation::new(1);
        let target = sim.organisms.iter().position(|o| o.alive).unwrap();
        let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            if i != target {
                o.alive = false;
            }
        }

        let far = format!(
            r#"{{"cmd":"heal","x":{},"y":{},"radius":2.0}}"#,
            x + 50.0,
            y + 50.0
        );
        assert!(!sim.apply_command_json(&far));
        let near = format!(r#"{{"cmd":"heal","x":{x},"y":{y},"radius":2.0}}"#);
        assert!(sim.apply_command_json(&near));

        let miss = format!(
            r#"{{"cmd":"smite","x":{},"y":{},"radius":2.0}}"#,
            x + 50.0,
            y + 50.0
        );
        assert!(!sim.apply_command_json(&miss));
        assert!(sim.organisms[target].alive);
        let hit = format!(r#"{{"cmd":"smite","x":{x},"y":{y},"radius":2.0}}"#);
        assert!(sim.apply_command_json(&hit));
        assert!(sim.organisms[target].health < 0.0);
        let deaths = sim.history.deaths_combat;
        sim.tick();
        assert!(!sim.organisms[target].alive, "dies through the normal death path");
        assert_eq!(sim.history.deaths_combat, deaths + 1, "and is counted in history");
    }

    #[test]
    fn poison_infects_only_people_in_range() {
        let mut sim = Simulation::new(1);
        let target = sim.organisms.iter().position(|o| o.alive).unwrap();
        let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
        sim.organisms[target].infection = 0.0;

        let miss = format!(
            r#"{{"cmd":"poison","x":{},"y":{},"radius":0.5}}"#,
            x + 90.0,
            y + 90.0
        );
        let reached_far = sim
            .organisms
            .iter()
            .any(|o| o.alive && (o.x - x - 90.0).hypot(o.y - y - 90.0) <= 0.5);
        assert_eq!(sim.apply_command_json(&miss), reached_far);

        let hit = format!(r#"{{"cmd":"poison","x":{x},"y":{y},"radius":0.5}}"#);
        assert!(sim.apply_command_json(&hit));
        assert!(sim.organisms[target].infection >= 0.85);
    }

    #[test]
    fn meteor_kills_in_range_and_leaves_a_burning_crater() {
        use crate::world::tiles::Tile;

        let mut sim = Simulation::new(1);
        let (cx, cy) = (100, 100);
        for dx in -8..=8 {
            for dy in -8..=8 {
                sim.grid.set(cx + dx, cy + dy, Tile::Grass);
            }
        }
        let target = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[target].x = cx as f32 + 1.0;
        sim.organisms[target].y = cy as f32;
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"meteor","x":{cx},"y":{cy},"radius":4}}"#)));
        assert!(sim.organisms[target].health < 0.0);
        assert_eq!(sim.grid.get(cx, cy), Tile::Rock);
        assert_eq!(sim.grid.get(cx + 3, cy), Tile::Ash);
        assert_eq!(sim.grid.get(cx + 5, cy), Tile::Fire);
        assert_eq!(sim.grid.get(cx + 8, cy), Tile::Grass);
        assert!(!sim.apply_command_json(r#"{"cmd":"meteor","x":-50,"y":-50,"radius":4}"#));
    }

    #[test]
    fn guiding_a_lineage_to_explore_sends_adults_on_one_shared_journey() {
        let mut sim = Simulation::new(3);
        let lineage = sim
            .organisms
            .iter()
            .find(|o| o.alive)
            .map(|o| o.lineage_id.clone())
            .expect("a living lineage");
        for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == lineage) {
            o.age = 1000;
        }
        let cmd =
            format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"explore","duration_ticks":1200}}"#);
        assert!(sim.apply_command_json(&cmd));
        let targets: std::collections::HashSet<(i32, i32)> = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage && o.age >= 700)
            .filter_map(|o| o.journey.as_ref().map(|j| j.target))
            .collect();
        let travellers = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage && o.journey.is_some())
            .count();
        assert!(travellers > 0, "someone set out");
        assert_eq!(targets.len(), 1, "adults share one destination");
    }

    #[test]
    fn smite_strikes_the_nearest_animal_when_no_one_is_closer() {
        let mut sim = Simulation::new(1);
        for o in sim.organisms.iter_mut() {
            o.x = 10.0;
            o.y = 10.0;
        }
        assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":150.0,"y":150.0,"kind":"deer"}"#));
        let deer = sim.animals.len() - 1;
        sim.animals[deer].x = 150.0;
        sim.animals[deer].y = 150.0;
        assert!(sim.apply_command_json(r#"{"cmd":"smite","x":150.0,"y":150.0,"radius":3.0}"#));
        assert!(!sim.animals[deer].alive);
    }

    #[test]
    fn a_spawned_tribe_gets_a_name() {
        let mut sim = Simulation::new(1);
        let before = sim.organisms.len();
        assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":300.0,"y":200.0,"count":5}"#));
        let lid = sim.organisms[before].lineage_id.clone();
        assert!(sim.lineage_names.get(&lid).is_some_and(|n| !n.is_empty()));
    }

    #[test]
    fn one_new_person_joins_the_nearest_tribe() {
        let mut sim = Simulation::new(1);
        let host = sim.organisms.iter().position(|o| o.alive).unwrap();
        let (x, y) = (sim.organisms[host].x, sim.organisms[host].y);
        let lineage = sim.organisms[host].lineage_id.clone();
        let before = sim.organisms.len();
        let cmd = format!(r#"{{"cmd":"spawn","x":{x},"y":{y},"count":1}}"#);
        assert!(sim.apply_command_json(&cmd));
        assert_eq!(sim.organisms.len(), before + 1);
        assert_eq!(sim.organisms[before].lineage_id, lineage);
    }

    #[test]
    fn bless_and_inspire_change_people_in_range() {
        let mut sim = Simulation::new(1);
        let target = sim.organisms.iter().position(|o| o.alive).unwrap();
        let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
        sim.organisms[target].health = 0.3;
        sim.organisms[target].hope = 0.1;
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"bless","x":{x},"y":{y},"radius":1.0}}"#)));
        assert_eq!(sim.organisms[target].health, 1.0);
        assert!(sim.organisms[target].hope > 0.4);

        let known = sim.organisms[target].discoveries.len();
        let literacy = sim.organisms[target].literacy;
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"inspire","x":{x},"y":{y},"radius":1.0}}"#)));
        assert!(sim.organisms[target].literacy > literacy);
        assert_eq!(sim.organisms[target].discoveries.len(), known + 1);
    }

    #[test]
    fn earthquake_cracks_land_and_hurts_people() {
        use crate::world::tiles::Tile;
        let mut sim = Simulation::new(1);
        for dx in -6..=6 {
            for dy in -6..=6 {
                sim.grid.set(100 + dx, 100 + dy, Tile::Grass);
            }
        }
        let target = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[target].x = 100.0;
        sim.organisms[target].y = 100.0;
        sim.organisms[target].health = 1.0;
        assert!(sim.apply_command_json(r#"{"cmd":"earthquake","x":100,"y":100,"radius":5}"#));
        assert!(sim.organisms[target].health < 0.5);
        let cracked = (-5..=5)
            .flat_map(|dx| (-5..=5).map(move |dy| (dx, dy)))
            .filter(|&(dx, dy)| sim.grid.get(100 + dx, 100 + dy) != Tile::Grass)
            .count();
        assert!(cracked > 5, "the ground cracked ({cracked} tiles)");
    }

    #[test]
    fn war_and_peace_set_attitudes_between_the_nearest_tribes() {
        let mut sim = Simulation::new(1);
        let a = sim.organisms[0].lineage_id.clone();
        let other = sim
            .organisms
            .iter()
            .position(|o| o.alive && o.lineage_id != a)
            .unwrap();
        let b = sim.organisms[other].lineage_id.clone();
        for o in sim.organisms.iter_mut() {
            if o.lineage_id == a || o.lineage_id == b {
                o.x = 50.0;
                o.y = 50.0;
            } else {
                o.x = 300.0;
                o.y = 200.0;
            }
        }
        assert!(sim.apply_command_json(r#"{"cmd":"war","x":50.0,"y":50.0}"#));
        assert_eq!(sim.organisms[0].lineage_attitudes.get(&b).copied(), Some(-1.0));
        assert!(sim.apply_command_json(r#"{"cmd":"peace","x":50.0,"y":50.0}"#));
        assert_eq!(sim.organisms[other].lineage_attitudes.get(&a).copied(), Some(1.0));
    }

    #[test]
    fn every_animal_kind_can_be_spawned_by_name() {
        use crate::organism::animal::AnimalKind;
        let mut sim = Simulation::new(1);
        for kind in AnimalKind::ALL {
            let cmd = format!(
                r#"{{"cmd":"spawn_animal","x":120.0,"y":90.0,"kind":"{}"}}"#,
                kind.name()
            );
            assert!(sim.apply_command_json(&cmd), "{}", kind.name());
            assert!(
                sim.animals.last().unwrap().kind == kind,
                "{} spawned as itself",
                kind.name()
            );
        }
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
    fn spawn_animal_still_works_in_a_crowded_mature_world() {
        let mut sim = Simulation::new(1);
        while sim.animals.iter().filter(|a| a.alive).count() < 700 {
            assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"deer"}"#));
        }
        assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"wolf"}"#));
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
