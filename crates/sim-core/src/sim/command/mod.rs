use crate::organism::animal::{Animal, AnimalKind};
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
    /// A family founds a tribe where you click: a partnered mother and father
    /// and two children of theirs.
    Family {
        x: f32,
        y: f32,
    },
    /// Move the living person nearest the point (within the radius) onto it.
    Teleport {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Run the world toward the next season or year boundary, a chunk of ticks at a time.
    Advance {
        to: String,
        #[serde(default)]
        max_ticks: u32,
    },
    /// Heal the living person nearest the point (within the radius): full health, no infection or sickness.
    HealOne {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Place a finished building of the named kind with its top-left tile at (x, y), if the footprint is free.
    PlaceBuilding {
        x: i32,
        y: i32,
        kind: String,
    },
    /// Give the living person nearest the point a gift: `food` or `tool`.
    Gift {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
        what: String,
    },
    /// Hail beats down on the radius: plantings and wild food are flattened, people are hurt and some
    /// animals are killed.
    Hail {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// A bomb falls on the point: a crater, fallout that poisons a wide ring, and blight. Only once a
    /// tribe has reached the Industrial age.
    Nuke {
        x: i32,
        y: i32,
    },
    /// Move the clock forward to the next `dawn`, `noon`, `dusk` or `midnight`.
    SetTimeOfDay {
        phase: String,
    },
    /// Make the grown person nearest the point the ruler of their tribe.
    MakeLeader {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
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
    /// Release animals of a kind on ground that suits them. `count` animals
    /// (one per brush step) are spread over the `radius` around the point.
    SpawnAnimal {
        x: f32,
        y: f32,
        #[serde(default)]
        kind: Option<String>,
        #[serde(default)]
        count: u32,
        #[serde(default)]
        radius: f32,
    },
    /// A bright spell over the fields: growing plantings gain growth.
    Sunshine {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Give everyone in the radius more years to live.
    LongLife {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Drain fear out of everyone in the radius.
    Courage {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
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
    /// Ward a place for a season: no raid or battle begins inside, beasts
    /// do not strike there, and no sickness spreads or arrives.
    Ward {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Teach a tribe the next secret it still lacks for its next age.
    Teach {
        lineage: String,
    },
    /// Raise someone who died within the last season, near the point.
    Revive {
        x: f32,
        y: f32,
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
    /// Give a tribe a name of the player's choosing.
    RenameTribe {
        lineage: String,
        name: String,
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
    /// Marry the grown person nearest the first point to the one nearest the second: both must be adults
    /// without a partner, of different sexes.
    /// Give the person with this id a name of the player's choosing. It shows in place of the generated first name.
    RenamePerson {
        id: String,
        name: String,
    },
    Marry {
        ax: f32,
        ay: f32,
        bx: f32,
        by: f32,
    },
    /// Pull down every building the radius touches, and clear the huts and
    /// campfires there to grass. The people inside stay where they are.
    Demolish {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Restore every damaged or ruined building the radius touches to full
    /// condition, as if a crew had finished the repairs.
    Repair {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Wolves and bears in range become dogs bonded to the nearest person.
    Tame {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A gale: the wind turns to a random quarter and blows hard.
    Gale,
    /// A line of fire lit across the land at the point, driven by the wind.
    Wildfire {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// A swarm of locusts flies from the point and strips the land it crosses.
    Locusts {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// A tsunami runs up the coast nearest the point and inland.
    Tsunami {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// A tornado tears along a random heading from the point.
    Tornado {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// Erase ground changes inside the radius: water drains, fire and ash
    /// cool, and sand or snow the biome does not hold turns back to its ground.
    /// Rock, buildings and food stay as they are.
    Restore {
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
        "fox" => AnimalKind::Fox,
        "cat" => AnimalKind::Cat,
        "penguin" => AnimalKind::Penguin,
        "camel" => AnimalKind::Camel,
        "frog" => AnimalKind::Frog,
        "whale" => AnimalKind::Whale,
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
        Command::Ward { x, y, .. } => (&[Danger, Peace, Sickness], at(*x, *y)),
        Command::Harvest { x, y, .. } | Command::Bounty { x, y, .. } => (&[Hunger], at(*x, *y)),
        Command::Plant { x, y, kind, .. }
            if !matches!(
                kind.as_str(),
                "sapling" | "tree" | "trees" | "oak" | "pine" | "palm"
            ) =>
        {
            (&[Hunger], at(*x as f32, *y as f32))
        }
        Command::Paint { x, y, tile, .. } if tile == "food" => (&[Hunger], at(*x as f32, *y as f32)),
        Command::Paint { x, y, tile, .. } if tile == "water" => (&[Thirst], at(*x as f32, *y as f32)),
        Command::Paint { x, y, tile, .. } if tile == "hut" || tile == "campfire" => {
            (&[Shelter], at(*x as f32, *y as f32))
        }
        Command::Smite { x, y, .. }
        | Command::Banish { x, y, .. }
        | Command::Thunder { x, y, .. }
        | Command::Arm { x, y, .. } => (&[Danger], at(*x, *y)),
        Command::Weather { kind } if kind == "rain" || kind == "storm" => (&[Rain, Thirst, Fire], None),
        Command::Douse { x, y, .. } => (&[Fire], at(*x as f32, *y as f32)),
        Command::Drought { active: false } => (&[Rain], None),
        _ => return None,
    })
}

mod advance;
#[cfg(test)]
mod blessing_tests;
mod blessings;
mod buildings;
mod clock;
mod creation;
mod disasters;
mod gift;
mod hail;
mod heal_one;
mod leader;
#[cfg(test)]
mod locust_tests;
mod marry;
mod nuke;
mod place;
#[cfg(test)]
mod release_tests;
mod rename_person;
mod restore;
#[cfg(test)]
mod restore_tests;
mod teleport;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tornado_tests;
mod tribes;
#[cfg(test)]
mod tsunami_tests;
#[cfg(test)]
mod weather_tests;
#[cfg(test)]
mod wildfire_tests;

impl Simulation {
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
            Command::Spawn { x, y, count, lineage } => self.cmd_spawn(x, y, count, lineage),
            Command::Family { x, y } => self.cmd_family(x, y),
            Command::Teleport { x, y, radius } => self.cmd_teleport(x, y, radius),
            Command::MakeLeader { x, y, radius } => self.cmd_make_leader(x, y, radius),
            Command::PlaceBuilding { x, y, kind } => self.cmd_place_building(x, y, kind),
            Command::HealOne { x, y, radius } => self.cmd_heal_one(x, y, radius),
            Command::Advance { to, max_ticks } => self.cmd_advance(to, max_ticks),
            Command::Gift { x, y, radius, what } => self.cmd_gift(x, y, radius, what),
            Command::SetTimeOfDay { phase } => self.cmd_set_time_of_day(phase),
            Command::Hail { x, y, radius } => self.cmd_hail(x, y, radius),
            Command::Nuke { x, y } => self.cmd_nuke(x, y),
            Command::Smite { x, y, radius } => self.cmd_smite(x, y, radius),
            Command::Heal { x, y, radius } => self.cmd_heal(x, y, radius),
            Command::Paint { x, y, tile, radius } => self.cmd_paint(x, y, tile, radius),
            Command::Ignite { x, y, radius } => self.cmd_ignite(x, y, radius),
            Command::Weather { kind } => self.cmd_weather(kind),
            Command::Drought { active } => self.cmd_drought(active),
            Command::Outbreak { count } => self.cmd_outbreak(count),
            Command::SpawnAnimal {
                x,
                y,
                kind,
                count,
                radius,
            } => self.cmd_spawn_animal(x, y, kind, count, radius),
            Command::Poison { x, y, radius } => self.cmd_poison(x, y, radius),
            Command::Bless { x, y, radius } => self.cmd_bless(x, y, radius),
            Command::LongLife { x, y, radius } => self.cmd_long_life(x, y, radius),
            Command::Courage { x, y, radius } => self.cmd_courage(x, y, radius),
            Command::Sunshine { x, y, radius } => self.cmd_sunshine(x, y, radius),
            Command::Inspire { x, y, radius } => self.cmd_inspire(x, y, radius),
            Command::Earthquake { x, y, radius } => self.cmd_earthquake(x, y, radius),
            Command::War { x, y } => self.cmd_war(x, y),
            Command::Peace { x, y } => self.cmd_peace(x, y),
            Command::Meteor { x, y, radius } => self.cmd_meteor(x, y, radius),
            Command::Harvest { x, y, radius } => self.cmd_harvest(x, y, radius),
            Command::Cure { x, y, radius } => self.cmd_cure(x, y, radius),
            Command::Arm { x, y, radius } => self.cmd_arm(x, y, radius),
            Command::Bounty { x, y, radius } => self.cmd_bounty(x, y, radius),
            Command::Douse { x, y, radius } => self.cmd_douse(x, y, radius),
            Command::Ward { x, y, radius } => self.cmd_ward(x, y, radius),
            Command::Teach { lineage } => self.cmd_teach(lineage),
            Command::Revive { x, y } => self.cmd_revive(x, y),
            Command::Banish { x, y, radius } => self.cmd_banish(x, y, radius),
            Command::Blight { x, y, radius } => self.cmd_blight(x, y, radius),
            Command::Frenzy { x, y, radius } => self.cmd_frenzy(x, y, radius),
            Command::Flood { x, y, radius } => self.cmd_flood(x, y, radius),
            Command::Blizzard { x, y, radius } => self.cmd_blizzard(x, y, radius),
            Command::Thunder { x, y, radius } => self.cmd_thunder(x, y, radius),
            Command::Plant { x, y, kind, radius } => self.cmd_plant(x, y, kind, radius),
            Command::RenameTribe { lineage, name } => self.cmd_rename_tribe(lineage, name),
            Command::PaintBiome { x, y, biome, radius } => self.cmd_paint_biome(x, y, biome, radius),
            Command::Volcano { x, y, radius } => self.cmd_volcano(x, y, radius),
            Command::MeteorShower { x, y, radius } => self.cmd_meteor_shower(x, y, radius),
            Command::Love { x, y, radius } => self.cmd_love(x, y, radius),
            Command::Marry { ax, ay, bx, by } => self.cmd_marry(ax, ay, bx, by),
            Command::RenamePerson { id, name } => self.cmd_rename_person(id, name),
            Command::Tame { x, y, radius } => self.cmd_tame(x, y, radius),
            Command::Demolish { x, y, radius } => self.cmd_demolish(x, y, radius),
            Command::Repair { x, y, radius } => self.cmd_repair(x, y, radius),
            Command::Restore { x, y, radius } => self.cmd_restore(x, y, radius),
            Command::Gale => self.cmd_gale(),
            Command::Tornado { x, y, radius } => self.cmd_tornado(x, y, radius),
            Command::Tsunami { x, y, radius } => self.cmd_tsunami(x, y, radius),
            Command::Locusts { x, y, radius } => self.cmd_locusts(x, y, radius),
            Command::Wildfire { x, y, radius } => self.cmd_wildfire(x, y, radius),
            Command::Guide {
                lineage,
                strategy,
                duration_ticks,
            } => self.cmd_guide(lineage, strategy, duration_ticks),
        }
    }
}
