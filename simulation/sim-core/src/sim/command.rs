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
    /// Make the land fertile and grow food across it.
    Harvest {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// End every sickness inside the radius and protect people from it for a while.
    Cure {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Teach everyone inside the radius to make and use weapons.
    Arm {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Fill everyone's packs with food, wood and stone.
    Bounty {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Put out every fire inside the radius.
    Douse {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Destroy every monster and predator inside the radius.
    Banish {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Kill the crops and spoil the stores inside the radius.
    Blight {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Turn neighbours on each other.
    Frenzy {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Drown the land inside the radius.
    Flood {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Bury the land in snow and chill everyone inside the radius.
    Blizzard {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Rain several lightning strikes across the radius.
    Thunder {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Plant crops, an orchard or saplings inside the radius.
    Plant {
        x: i32,
        y: i32,
        kind: String,
        #[serde(default)]
        radius: i32,
    },
    /// Repaint the land inside the radius as a biome.
    PaintBiome {
        x: i32,
        y: i32,
        biome: String,
        #[serde(default)]
        radius: i32,
    },
    /// Raise a volcano: a rock cone around a burning crater, an ash apron,
    /// and death for anyone standing where it rises.
    Volcano {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Several small meteors scattered across the radius.
    MeteorShower {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Single adults in range pair up and feel ready for children.
    Love {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Wolves and bears in range become dogs bonded to the nearest person.
    Tame {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
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
        "zombie" => AnimalKind::Zombie,
        "demon" => AnimalKind::Demon,
        "dragon" => AnimalKind::Dragon,
        "alien" => AnimalKind::Alien,
        "ufo" => AnimalKind::Ufo,
        _ => AnimalKind::Deer,
    }
}

fn protected(tile: Tile) -> bool {
    matches!(tile, Tile::Hut | Tile::Campfire)
}

/// Which prayers a power can answer, and where it landed (`None` for
/// powers that reach the whole world).
/// The prayer kinds a power answers, and where it landed.
type PrayerAnswer = (
    &'static [crate::sim::civ::prayers::PrayerKind],
    Option<(f32, f32)>,
);

fn prayer_answers(cmd: &Command) -> Option<PrayerAnswer> {
    use crate::sim::civ::prayers::PrayerKind::*;
    let at = |x: f32, y: f32| Some((x, y));
    Some(match cmd {
        Command::Spawn { x, y, .. } | Command::Love { x, y, .. } => (&[Children], at(*x, *y)),
        Command::Heal { x, y, .. } | Command::Bless { x, y, .. } => (&[Sickness, Hunger, Thirst], at(*x, *y)),
        Command::Cure { x, y, .. } => (&[Sickness], at(*x, *y)),
        Command::Inspire { x, y, .. } => (&[Knowledge], at(*x, *y)),
        Command::Peace { x, y } => (&[Peace], at(*x, *y)),
        Command::Harvest { x, y, .. } | Command::Bounty { x, y, .. } => (&[Hunger], at(*x, *y)),
        Command::Plant { x, y, kind, .. } if kind != "sapling" => (&[Hunger], at(*x as f32, *y as f32)),
        Command::Paint { x, y, tile, .. } if tile == "food" => (&[Hunger], at(*x as f32, *y as f32)),
        Command::Paint { x, y, tile, .. } if tile == "water" => (&[Thirst], at(*x as f32, *y as f32)),
        Command::Smite { x, y, .. }
        | Command::Banish { x, y, .. }
        | Command::Thunder { x, y, .. }
        | Command::Arm { x, y, .. } => (&[Danger], at(*x, *y)),
        Command::Weather { kind } if kind == "rain" || kind == "storm" => (&[Rain, Thirst], None),
        Command::Drought { active: false } => (&[Rain], None),
        _ => return None,
    })
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
        let answers = prayer_answers(&cmd);
        let applied = self.apply_command_inner(cmd);
        if applied {
            if let Some((kinds, at)) = answers {
                self.answer_prayers(kinds, at);
            }
        }
        applied
    }

    fn apply_command_inner(&mut self, cmd: Command) -> bool {
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
                // Lightning also cracks roofs where it lands, and sometimes
                // sets them alight.
                let (bx, by) = (x as i32, y as i32);
                let roofs = crate::sim::civ::building_damage::strike_buildings(
                    self,
                    bx,
                    by,
                    1.5,
                    0.45,
                    0.2,
                    crate::sim::civ::building_damage::DamageCause::Lightning,
                );
                if roofs > 0 && self.rng.random::<f32>() < 0.4 {
                    self.ignite(bx, by);
                }
                // Lightning strikes whatever living thing is closest.
                let struck = match (nearest_person, nearest_animal) {
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
                        let kind = self.animals[i].kind.a_name();
                        push_event(
                            &mut self.events,
                            self.tick_count,
                            "smite",
                            "lightning",
                            &format!("struck down {kind}"),
                        );
                        true
                    }
                    _ => false,
                };
                struck || roofs > 0
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
                // Pouring the sea or raising rock over a building wrecks it.
                let wrecks = match t {
                    Tile::Water => Some(crate::sim::civ::building_damage::DamageCause::Flood),
                    Tile::Rock | Tile::Mineral => Some(crate::sim::civ::building_damage::DamageCause::Buried),
                    _ => None,
                };
                if let Some(cause) = wrecks {
                    crate::sim::civ::building_damage::strike_buildings(
                        self,
                        x,
                        y,
                        r as f32 + 0.5,
                        1.0,
                        1.0,
                        cause,
                    );
                }
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
                crate::sim::civ::building_damage::strike_buildings(
                    self,
                    x,
                    y,
                    r as f32 + 1.0,
                    1.0,
                    0.45,
                    crate::sim::civ::building_damage::DamageCause::Meteor,
                );
                self.wither_plantings(x, y, r + 2);
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
            Command::Harvest { x, y, radius } => {
                let r = if radius <= 0.0 { 5.0 } else { radius.min(24.0) };
                let (cx, cy, ri) = (x as i32, y as i32, r.ceil() as i32);
                let mut grown = 0;
                for dx in -ri..=ri {
                    for dy in -ri..=ri {
                        let (nx, ny) = (cx + dx, cy + dy);
                        if !WorldGrid::in_bounds(nx, ny) || ((dx * dx + dy * dy) as f32) > r * r {
                            continue;
                        }
                        let tile = self.grid.get(nx, ny);
                        if !matches!(
                            tile,
                            Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Sand
                        ) {
                            continue;
                        }
                        self.grid.fertility[WorldGrid::idx(nx, ny)] = 1.0;
                        if tile != Tile::Food && self.rng.random::<f32>() < 0.55 {
                            self.grid.set(nx, ny, Tile::Food);
                            grown += 1;
                        }
                    }
                }
                grown += self.ripen_plantings(cx, cy, ri);
                if grown > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "bless",
                        "the land",
                        "bloomed with food",
                    );
                }
                grown > 0
            }
            Command::Cure { x, y, radius } => {
                let r = if radius <= 0.0 { 10.0 } else { radius.min(48.0) };
                let until = self.tick_count + 6_000;
                let mut cured = 0;
                for o in self.organisms.iter_mut() {
                    if !o.alive || (o.x - x).hypot(o.y - y) > r {
                        continue;
                    }
                    if o.infection <= 0.0 && o.diseases.is_empty() {
                        continue;
                    }
                    for (disease, _) in o.diseases.drain(..) {
                        o.disease_immunity.insert(disease, until);
                    }
                    o.infection = 0.0;
                    o.health = o.health.max(0.6);
                    o.think("the sickness lifted", self.tick_count);
                    cured += 1;
                }
                if cured > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "bless",
                        "the gods",
                        &format!("cured {cured} people"),
                    );
                }
                cured > 0
            }
            Command::Arm { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
                let mut armed = 0;
                for o in self.organisms.iter_mut() {
                    if !o.alive || o.age < 700 || (o.x - x).hypot(o.y - y) > r {
                        continue;
                    }
                    for skill in ["stone_tools", "hunting", "spear", "bow"] {
                        o.discoveries.insert(skill.to_string());
                    }
                    o.fear_level = (o.fear_level - 0.3).max(0.0);
                    o.think("the gods taught me to fight", self.tick_count);
                    armed += 1;
                }
                if armed > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "inspire",
                        "the gods",
                        &format!("armed {armed} people"),
                    );
                }
                armed > 0
            }
            Command::Bounty { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
                let mut gifted = 0;
                for o in self.organisms.iter_mut() {
                    if !o.alive || (o.x - x).hypot(o.y - y) > r {
                        continue;
                    }
                    o.inv_food = o.inv_food.saturating_add(5).min(9);
                    o.inv_wood = o.inv_wood.saturating_add(5).min(9);
                    o.inv_stone = o.inv_stone.saturating_add(4).min(9);
                    o.comfort = (o.comfort + 0.2).min(1.0);
                    o.think("found a gift from the gods", self.tick_count);
                    gifted += 1;
                }
                if gifted > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "bless",
                        "the gods",
                        &format!("gave {gifted} people food, wood and stone"),
                    );
                }
                gifted > 0
            }
            Command::Douse { x, y, radius } => {
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = if radius <= 0 { 5 } else { radius.min(24) };
                let mut doused = 0;
                for dx in -r..=r {
                    for dy in -r..=r {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                            continue;
                        }
                        if self.grid.get(nx, ny) == Tile::Fire {
                            self.grid.set(nx, ny, Tile::Ash);
                            *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                            doused += 1;
                        }
                    }
                }
                doused > 0
            }
            Command::Banish { x, y, radius } => {
                let r = if radius <= 0.0 { 6.0 } else { radius.min(32.0) };
                let mut banished = 0;
                for a in self.animals.iter_mut() {
                    if a.alive && a.kind.hostile() && (a.x - x).hypot(a.y - y) <= r {
                        a.alive = false;
                        banished += 1;
                    }
                }
                if banished > 0 {
                    let what = if banished == 1 { "creature" } else { "creatures" };
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "smite",
                        "the gods",
                        &format!("banished {banished} {what}"),
                    );
                }
                banished > 0
            }
            Command::Blight { x, y, radius } => {
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = if radius <= 0 { 5 } else { radius.min(24) };
                let mut withered = 0;
                for dx in -r..=r {
                    for dy in -r..=r {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                            continue;
                        }
                        let i = WorldGrid::idx(nx, ny);
                        self.grid.fertility[i] *= 0.15;
                        if self.grid.get(nx, ny) == Tile::Food {
                            self.grid.set(nx, ny, Tile::Scorched);
                            withered += 1;
                        }
                    }
                }
                withered += self.wither_plantings(x, y, r);
                let rf = r as f32;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x as f32).hypot(o.y - y as f32) <= rf {
                        o.inv_food = 0;
                        o.think("our food rotted", self.tick_count);
                        withered += 1;
                    }
                }
                if withered > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "danger",
                        "a blight",
                        "rotted the crops",
                    );
                }
                withered > 0
            }
            Command::Frenzy { x, y, radius } => {
                let r = if radius <= 0.0 { 4.0 } else { radius.min(24.0) };
                let mut maddened = 0;
                for o in self.organisms.iter_mut() {
                    if !o.alive || (o.x - x).hypot(o.y - y) > r {
                        continue;
                    }
                    let hurt = 0.15 + self.rng.random::<f32>() * 0.25;
                    o.health = (o.health - hurt).max(0.01);
                    o.fear_level = (o.fear_level + 0.4).min(1.0);
                    o.hope = (o.hope - 0.3).max(0.0);
                    o.think("fought a neighbour in a frenzy", self.tick_count);
                    maddened += 1;
                }
                if maddened > 1 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "war",
                        "a frenzy",
                        &format!("set {maddened} people on each other"),
                    );
                }
                maddened > 0
            }
            Command::Flood { x, y, radius } => {
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = if radius <= 0 { 4 } else { radius.min(20) };
                let mut flooded = 0;
                for dx in -r..=r {
                    for dy in -r..=r {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                            continue;
                        }
                        let tile = self.grid.get(nx, ny);
                        if matches!(tile, Tile::Void | Tile::Rock | Tile::Water | Tile::Mineral) {
                            continue;
                        }
                        // The deep middle becomes a lake; the rim floods.
                        let deep = (dx * dx + dy * dy) * 4 <= r * r;
                        self.grid
                            .set(nx, ny, if deep { Tile::Water } else { Tile::Flooded });
                        *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                        flooded += 1;
                    }
                }
                let rf = r as f32;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x as f32).hypot(o.y - y as f32) <= rf {
                        o.health = (o.health - 0.2).max(0.01);
                        o.fear_level = (o.fear_level + 0.3).min(1.0);
                        o.think("the water rose around us", self.tick_count);
                    }
                }
                if flooded > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "danger",
                        "a flood",
                        "swept over the land",
                    );
                    crate::sim::civ::building_damage::strike_buildings(
                        self,
                        x,
                        y,
                        r as f32,
                        0.35,
                        0.1,
                        crate::sim::civ::building_damage::DamageCause::Flood,
                    );
                }
                flooded > 0
            }
            Command::Blizzard { x, y, radius } => {
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = if radius <= 0 { 6 } else { radius.min(24) };
                let mut frozen = 0;
                for dx in -r..=r {
                    for dy in -r..=r {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                            continue;
                        }
                        match self.grid.get(nx, ny) {
                            Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Sand => {
                                self.grid.set(nx, ny, Tile::Snow);
                                frozen += 1;
                            }
                            Tile::Fire => {
                                self.grid.set(nx, ny, Tile::Snow);
                                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                                frozen += 1;
                            }
                            _ => {}
                        }
                    }
                }
                let rf = r as f32;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x as f32).hypot(o.y - y as f32) <= rf {
                        o.energy = (o.energy - 0.35).max(0.05);
                        o.health = (o.health - 0.1).max(0.01);
                        o.think("freezing in the blizzard", self.tick_count);
                    }
                }
                if frozen > 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "danger",
                        "a blizzard",
                        "buried the land in snow",
                    );
                    crate::sim::civ::building_damage::strike_buildings(
                        self,
                        x,
                        y,
                        r as f32,
                        0.15,
                        0.05,
                        crate::sim::civ::building_damage::DamageCause::Frost,
                    );
                    self.frost_plantings(x, y, r);
                }
                frozen > 0
            }
            Command::Thunder { x, y, radius } => {
                let r = if radius <= 0.0 { 8.0 } else { radius.min(32.0) };
                let mut struck = false;
                for _ in 0..6 {
                    let angle = self.rng.random::<f32>() * std::f32::consts::TAU;
                    let dist = self.rng.random::<f32>().sqrt() * r;
                    let (sx, sy) = (x + angle.cos() * dist, y + angle.sin() * dist);
                    struck |= self.apply_command(Command::Smite {
                        x: sx,
                        y: sy,
                        radius: 2.0,
                    });
                    if self.rng.random::<f32>() < 0.35 {
                        let (tx, ty) = (sx as i32, sy as i32);
                        if WorldGrid::in_bounds(tx, ty) && self.grid.get(tx, ty).flammable() {
                            self.grid.set(tx, ty, Tile::Fire);
                            *self.grid.fire_intensity_mut(tx, ty) = 1.0;
                            self.physics.register_fire(tx, ty);
                            struck = true;
                        }
                    }
                }
                struck
            }
            Command::Plant { x, y, kind, radius } => {
                let Some(kind) = crate::sim::tech::plantings::PlantKind::parse(&kind) else {
                    return false;
                };
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                self.plant(x, y, kind, radius) > 0
            }
            Command::PaintBiome { x, y, biome, radius } => {
                use crate::world::tiles::Biome;
                let kind = match biome.as_str() {
                    "grassland" => Biome::Grassland,
                    "forest" => Biome::Forest,
                    "desert" => Biome::Desert,
                    "wetland" => Biome::Wetland,
                    "tundra" => Biome::Tundra,
                    "jungle" => Biome::Jungle,
                    "savanna" => Biome::Savanna,
                    "taiga" => Biome::Taiga,
                    "badlands" => Biome::Badlands,
                    _ => return false,
                };
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = if radius <= 0 { 4 } else { radius.min(24) };
                let mut painted = 0;
                for dx in -r..=r {
                    for dy in -r..=r {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                            continue;
                        }
                        let tile = self.grid.get(nx, ny);
                        if matches!(
                            tile,
                            Tile::Water | Tile::Void | Tile::Rock | Tile::Hut | Tile::Fire | Tile::Mineral
                        ) {
                            continue;
                        }
                        let i = WorldGrid::idx(nx, ny);
                        self.grid.biome[i] = kind as u8;
                        self.grid.fertility[i] = kind.base_fertility();
                        // The ground follows the biome: sand for dry lands,
                        // snow patches in the cold, grass elsewhere.
                        let roll = self.rng.random::<f32>();
                        let ground = match kind {
                            Biome::Desert | Biome::Badlands => Tile::Sand,
                            Biome::Tundra if roll < 0.4 => Tile::Snow,
                            Biome::Taiga if roll < 0.15 => Tile::Snow,
                            Biome::Jungle | Biome::Forest if roll < kind.initial_food_chance() => Tile::Food,
                            _ => Tile::Grass,
                        };
                        if tile != Tile::Food || ground != Tile::Grass {
                            self.grid.set(nx, ny, ground);
                        }
                        painted += 1;
                    }
                }
                painted > 0
            }
            Command::Volcano { x, y, radius } => {
                use crate::world::tiles::Biome;
                let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
                let r = if radius <= 0 { 6 } else { radius.clamp(3, 12) };
                let rf = r as f32;
                let mut changed = false;
                for dx in -r * 2..=r * 2 {
                    for dy in -r * 2..=r * 2 {
                        let (nx, ny) = (x + dx, y + dy);
                        if !WorldGrid::in_bounds(nx, ny) || self.grid.get(nx, ny) == Tile::Void {
                            continue;
                        }
                        let i = WorldGrid::idx(nx, ny);
                        let d = ((dx * dx + dy * dy) as f32).sqrt();
                        if d <= 1.5 {
                            self.grid.set(nx, ny, Tile::Fire);
                            *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                            self.physics.register_fire(nx, ny);
                        } else if d < rf * 0.6 {
                            self.grid.set(nx, ny, Tile::Rock);
                        } else if d < rf * 1.2 {
                            self.grid.set(nx, ny, Tile::Ash);
                        } else if d < rf * 1.5
                            && self.grid.get(nx, ny).flammable()
                            && self.rng.random::<f32>() < 0.3
                        {
                            self.grid.set(nx, ny, Tile::Fire);
                            *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                            self.physics.register_fire(nx, ny);
                        } else {
                            continue;
                        }
                        self.grid.biome[i] = Biome::Volcanic as u8;
                        self.grid.elevation[i] =
                            self.grid.elevation[i].max(0.3 + (1.0 - d / (rf * 2.0)) * 0.6);
                        changed = true;
                    }
                }
                let mut killed = 0;
                for o in self.organisms.iter_mut() {
                    if o.alive && (o.x - x as f32).hypot(o.y - y as f32) < rf * 0.6 {
                        o.health = -1.0;
                        killed += 1;
                    }
                }
                for a in self.animals.iter_mut() {
                    if a.alive && (a.x - x as f32).hypot(a.y - y as f32) < rf * 0.6 {
                        a.alive = false;
                    }
                }
                let detail = if killed > 0 {
                    format!("burst from the ground and buried {killed} people")
                } else {
                    "burst from the ground".to_string()
                };
                push_event(&mut self.events, self.tick_count, "danger", "a volcano", &detail);
                // The cone buries what it rises under; the ash fall cracks
                // roofs further out.
                let hit = crate::sim::civ::building_damage::strike_buildings(
                    self,
                    x,
                    y,
                    rf * 1.2,
                    1.0,
                    0.3,
                    crate::sim::civ::building_damage::DamageCause::Lava,
                );
                self.wither_plantings(x, y, (rf * 1.5) as i32);
                changed || hit > 0
            }
            Command::MeteorShower { x, y, radius } => {
                let r = if radius <= 0.0 { 10.0 } else { radius.min(40.0) };
                let mut hit = false;
                for _ in 0..5 {
                    let angle = self.rng.random::<f32>() * std::f32::consts::TAU;
                    let dist = self.rng.random::<f32>().sqrt() * r;
                    let (mx, my) = ((x + angle.cos() * dist) as i32, (y + angle.sin() * dist) as i32);
                    hit |= self.apply_command(Command::Meteor {
                        x: mx,
                        y: my,
                        radius: 2,
                    });
                }
                hit
            }
            Command::Love { x, y, radius } => {
                use crate::organism::organism::Sex;
                let r = if radius <= 0.0 { 5.0 } else { radius.min(32.0) };
                let in_range: Vec<usize> = (0..self.organisms.len())
                    .filter(|&i| {
                        let o = &self.organisms[i];
                        o.alive && o.age >= 700 && (o.x - x).hypot(o.y - y) <= r
                    })
                    .collect();
                let mut paired = 0;
                for &i in &in_range {
                    if self.organisms[i].sex != Sex::Female || self.organisms[i].partner_id.is_some() {
                        continue;
                    }
                    let lineage = self.organisms[i].lineage_id.clone();
                    let Some(&j) = in_range.iter().find(|&&j| {
                        let o = &self.organisms[j];
                        o.sex == Sex::Male && o.partner_id.is_none() && o.lineage_id == lineage
                    }) else {
                        continue;
                    };
                    let (a, b) = (self.organisms[i].id.clone(), self.organisms[j].id.clone());
                    self.organisms[i].partner_id = Some(b);
                    self.organisms[j].partner_id = Some(a);
                    paired += 1;
                }
                for &i in &in_range {
                    let o = &mut self.organisms[i];
                    // Ready for children now rather than after the usual wait.
                    o.last_reproduced = 0;
                    o.joy_ticks = o.joy_ticks.saturating_add(400).min(1_200);
                    o.hope = (o.hope + 0.2).min(1.0);
                    o.think("in love", self.tick_count);
                }
                if !in_range.is_empty() {
                    let detail = if paired > 0 {
                        format!("brought {paired} couples together")
                    } else {
                        format!("filled {} hearts with love", in_range.len())
                    };
                    push_event(&mut self.events, self.tick_count, "bless", "the gods", &detail);
                }
                !in_range.is_empty()
            }
            Command::Tame { x, y, radius } => {
                let r = if radius <= 0.0 { 6.0 } else { radius.min(32.0) };
                let mut tamed = 0;
                for ai in 0..self.animals.len() {
                    let a = &self.animals[ai];
                    if !a.alive
                        || !matches!(a.kind, AnimalKind::Wolf | AnimalKind::Bear)
                        || (a.x - x).hypot(a.y - y) > r
                    {
                        continue;
                    }
                    let (ax, ay) = (a.x, a.y);
                    let owner = self
                        .organisms
                        .iter()
                        .filter(|o| o.alive)
                        .min_by(|p, q| (p.x - ax).hypot(p.y - ay).total_cmp(&(q.x - ax).hypot(q.y - ay)))
                        .map(|o| o.id.clone());
                    let a = &mut self.animals[ai];
                    a.kind = AnimalKind::Dog;
                    a.energy = 1.0;
                    a.bonded_org = owner;
                    if a.name.is_none() {
                        a.name = Some(crate::organism::animal::pick_dog_name(&mut self.rng));
                    }
                    tamed += 1;
                }
                if tamed > 0 {
                    let what = if tamed == 1 { "beast" } else { "beasts" };
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "bless",
                        "the gods",
                        &format!("tamed {tamed} wild {what} into loyal dogs"),
                    );
                }
                tamed > 0
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

        let lineages: rustc_hash::FxHashSet<&str> = sim.organisms[before..]
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
        let targets: rustc_hash::FxHashSet<(i32, i32)> = sim
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

    /// A sim with one living adult standing on open grass at (100, 100).
    fn sim_with_person_at_100() -> (Simulation, usize) {
        use crate::world::tiles::Tile;
        let mut sim = Simulation::new(7);
        for dx in -10..=10 {
            for dy in -10..=10 {
                sim.grid.set(100 + dx, 100 + dy, Tile::Grass);
            }
        }
        let target = sim.organisms.iter().position(|o| o.alive).unwrap();
        let o = &mut sim.organisms[target];
        o.x = 100.0;
        o.y = 100.0;
        o.age = 2_000;
        o.health = 1.0;
        o.energy = 1.0;
        (sim, target)
    }

    #[test]
    fn helpful_powers_heal_feed_arm_and_protect() {
        use crate::organism::animal::{Animal, AnimalKind};
        use crate::world::tiles::Tile;
        let (mut sim, target) = sim_with_person_at_100();

        assert!(sim.apply_command_json(r#"{"cmd":"harvest","x":100.0,"y":100.0,"radius":5.0}"#));
        let food = (95..=105)
            .flat_map(|x| (95..=105).map(move |y| (x, y)))
            .filter(|&(x, y)| sim.grid.get(x, y) == Tile::Food)
            .count();
        assert!(food > 10, "harvest grew {food} food tiles");

        sim.organisms[target].infection = 0.9;
        sim.organisms[target].diseases.push(("plague".to_string(), 0));
        assert!(sim.apply_command_json(r#"{"cmd":"cure","x":100.0,"y":100.0}"#));
        assert_eq!(sim.organisms[target].infection, 0.0);
        assert!(sim.organisms[target].diseases.is_empty());
        assert!(
            sim.organisms[target]
                .disease_immunity
                .get("plague")
                .copied()
                .unwrap_or(0)
                > sim.tick_count
        );

        assert!(sim.apply_command_json(r#"{"cmd":"arm","x":100.0,"y":100.0,"radius":1.0}"#));
        assert!(sim.organisms[target].discoveries.contains("spear"));

        sim.organisms[target].inv_food = 0;
        assert!(sim.apply_command_json(r#"{"cmd":"bounty","x":100.0,"y":100.0,"radius":1.0}"#));
        assert!(sim.organisms[target].inv_food >= 5 && sim.organisms[target].inv_wood >= 5);

        sim.grid.set(102, 100, Tile::Fire);
        assert!(sim.apply_command_json(r#"{"cmd":"douse","x":100,"y":100,"radius":4}"#));
        assert_eq!(sim.grid.get(102, 100), Tile::Ash);

        let id = sim.next_animal_id;
        sim.next_animal_id += 1;
        sim.animals
            .push(Animal::new(id, 103.0, 100.0, AnimalKind::Dragon));
        sim.animals
            .push(Animal::new(id + 1, 104.0, 100.0, AnimalKind::Deer));
        assert!(sim.apply_command_json(r#"{"cmd":"banish","x":100.0,"y":100.0,"radius":6.0}"#));
        assert!(!sim
            .animals
            .iter()
            .any(|a| a.alive && a.kind == AnimalKind::Dragon));
        assert!(sim.animals.iter().any(|a| a.alive && a.kind == AnimalKind::Deer));
    }

    #[test]
    fn harmful_powers_spoil_flood_freeze_and_hurt() {
        use crate::world::tiles::Tile;
        let (mut sim, target) = sim_with_person_at_100();

        sim.grid.set(101, 100, Tile::Food);
        sim.organisms[target].inv_food = 6;
        assert!(sim.apply_command_json(r#"{"cmd":"blight","x":100,"y":100,"radius":3}"#));
        assert_ne!(sim.grid.get(101, 100), Tile::Food);
        assert_eq!(sim.organisms[target].inv_food, 0);

        assert!(sim.apply_command_json(r#"{"cmd":"frenzy","x":100.0,"y":100.0,"radius":1.0}"#));
        assert!(sim.organisms[target].health < 1.0);

        let energy = sim.organisms[target].energy;
        assert!(sim.apply_command_json(r#"{"cmd":"blizzard","x":100,"y":100,"radius":4}"#));
        assert_eq!(sim.grid.get(103, 100), Tile::Snow);
        assert!(sim.organisms[target].energy < energy);

        assert!(sim.apply_command_json(r#"{"cmd":"flood","x":100,"y":100,"radius":4}"#));
        assert_eq!(sim.grid.get(100, 100), Tile::Water);
        assert_eq!(sim.grid.get(103, 100), Tile::Flooded);
    }

    #[test]
    fn thunder_strikes_someone_in_range() {
        let (mut sim, target) = sim_with_person_at_100();
        // Pack everyone else far away so the strikes have one target.
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            if i != target {
                o.x = 10.0;
                o.y = 10.0;
            }
        }
        sim.animals.clear();
        let mut struck = false;
        for _ in 0..20 {
            sim.apply_command_json(r#"{"cmd":"thunder","x":100.0,"y":100.0,"radius":1.0}"#);
            if sim.organisms[target].health < 0.0 {
                struck = true;
                break;
            }
        }
        assert!(struck);
    }

    #[test]
    fn zombies_turn_their_victims() {
        use crate::organism::animal::{Animal, AnimalKind};
        let (mut sim, target) = sim_with_person_at_100();
        sim.animals.clear();
        let mut risen = false;
        for _ in 0..400 {
            if !sim
                .animals
                .iter()
                .any(|a| a.alive && a.kind == AnimalKind::Zombie)
            {
                let id = sim.next_animal_id;
                sim.next_animal_id += 1;
                let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
                sim.animals.push(Animal::new(id, x, y, AnimalKind::Zombie));
            }
            if sim.organisms[target].alive {
                sim.organisms[target].health = sim.organisms[target].health.min(0.05);
            }
            sim.tick();
            if sim.events.iter().any(|e| e.detail.contains("rose as a zombie")) {
                risen = true;
                break;
            }
        }
        assert!(risen);
    }

    #[test]
    fn biome_brush_volcano_love_and_tame() {
        use crate::organism::animal::{Animal, AnimalKind};
        use crate::world::tiles::{Biome, Tile};
        let (mut sim, target) = sim_with_person_at_100();

        assert!(
            sim.apply_command_json(r#"{"cmd":"paint_biome","x":100,"y":100,"radius":3,"biome":"badlands"}"#)
        );
        assert_eq!(sim.grid.biome_at(101, 100), Biome::Badlands);
        assert_eq!(sim.grid.get(101, 100), Tile::Sand);
        assert!(!sim.apply_command_json(r#"{"cmd":"paint_biome","x":100,"y":100,"biome":"candy"}"#));

        sim.animals.clear();
        sim.animals.push(Animal::new(1, 101.0, 100.0, AnimalKind::Wolf));
        assert!(sim.apply_command_json(r#"{"cmd":"tame","x":100.0,"y":100.0,"radius":4.0}"#));
        assert!(sim.animals[0].kind == AnimalKind::Dog);
        assert!(sim.animals[0].bonded_org.is_some());

        sim.organisms[target].last_reproduced = 999;
        assert!(sim.apply_command_json(r#"{"cmd":"love","x":100.0,"y":100.0,"radius":2.0}"#));
        assert_eq!(sim.organisms[target].last_reproduced, 0);

        assert!(sim.apply_command_json(r#"{"cmd":"volcano","x":100,"y":100,"radius":6}"#));
        assert_eq!(sim.grid.get(100, 100), Tile::Fire);
        assert_eq!(sim.grid.get(102, 100), Tile::Rock);
        assert_eq!(sim.grid.biome_at(105, 100), Biome::Volcanic);
        assert!(sim.organisms[target].health < 0.0);

        assert!(sim.apply_command_json(r#"{"cmd":"meteor_shower","x":150.0,"y":150.0,"radius":8.0}"#));
    }

    #[test]
    fn a_zombie_outbreak_grows_only_by_its_victims() {
        use crate::organism::animal::{Animal, AnimalKind};
        let mut sim = Simulation::new(42);
        for _ in 0..300 {
            sim.tick();
        }
        let (x, y) = sim
            .organisms
            .iter()
            .find(|o| o.alive)
            .map(|o| (o.x, o.y))
            .unwrap();
        let id = sim.next_animal_id;
        sim.next_animal_id += 1;
        sim.animals.push(Animal::new(id, x, y, AnimalKind::Zombie));
        let mut risen = 0usize;
        for _ in 0..400 {
            sim.tick();
            risen += sim
                .events
                .iter()
                .filter(|e| e.tick == sim.tick_count && e.detail == "rose as a zombie")
                .count();
            let zombies = sim
                .animals
                .iter()
                .filter(|a| a.alive && a.kind == AnimalKind::Zombie)
                .count();
            // The first zombie plus one per victim who rose, never a runaway.
            assert!(
                zombies <= risen + 1,
                "{zombies} zombies but only {risen} victims rose"
            );
        }
    }

    #[test]
    fn monsters_are_never_born_or_hunted_for_meat() {
        use crate::organism::animal::{Animal, AnimalKind};
        let mut sim = Simulation::new(3);
        sim.animals.clear();
        for (i, kind) in AnimalKind::MONSTERS.into_iter().enumerate() {
            let mut a = Animal::new(i, 60.0 + i as f32 * 20.0, 60.0, kind);
            a.energy = 1.0;
            sim.animals.push(a);
        }
        sim.next_animal_id = 100;
        for _ in 0..1_000 {
            sim.tick();
        }
        for kind in AnimalKind::MONSTERS {
            let count = sim.animals.iter().filter(|a| a.alive && a.kind == kind).count();
            assert!(
                count <= 1 || kind == AnimalKind::Zombie,
                "{} multiplied to {count}",
                kind.name()
            );
        }
    }
}
