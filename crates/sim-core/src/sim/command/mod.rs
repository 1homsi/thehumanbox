use crate::organism::animal::{Animal, AnimalKind};
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::Tile;
use rand::RngExt;
use serde::Deserialize;

pub(crate) const MAX_BRUSH_RADIUS: i32 = 64;

pub(crate) const MAX_BRUSH_REACH: f32 = MAX_BRUSH_RADIUS as f32;

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
        /// Where a people already lives: the new people take the words of the
        /// nearest living person within a few tiles of this point, so they
        /// speak the same tongue as that people until their words drift apart.
        #[serde(default)]
        speak_like: Option<[f32; 2]>,
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
    /// Heal the living person nearest the point (within the radius): full health, no infection or sickness.
    HealOne {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Set a boat down on the water beside the shore at (x, y): a fishing boat of the nearest tribe.
    PlaceBoat {
        x: i32,
        y: i32,
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
    /// Sets the world's difficulty: `calm`, `normal` or `harsh` (see `sim/goals.rs`).
    SetDifficulty {
        level: String,
    },
    /// The tribe of the nearest person in reach is taught the next secret it lacks for its age.
    TeachNearby {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// The nearest person in reach gains a mutation: one trait jumps.
    Mutate {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A curse falls on the nearest person in reach: they are hurt, frightened and sick.
    Curse {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Two tribes become one: the second click's tribe joins the first click's tribe.
    MergeTribes {
        ax: f32,
        ay: f32,
        bx: f32,
        by: f32,
    },
    /// Part of the tribe nearest the click founds a new tribe of its own.
    SplitTribe {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// The whole tribe of the person nearest the click is cured of its sickness.
    CureTribe {
        x: f32,
        y: f32,
    },
    /// A guardian dog appears beside the person nearest the click and bonds to them.
    Guardian {
        x: f32,
        y: f32,
    },
    /// Wipes everything living in the brush area: people, animals, plantings and wild food.
    ClearRegion {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A rain cloud bursts over a patch of the land: fires in it go out and people in it drink.
    RainPatch {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// The sun goes dark for a while: everyone alive is frightened and awed.
    Eclipse,
    /// Lights dance across the night sky: everyone alive is awed and a little less afraid.
    Aurora,
    /// A heat wave settles over the land for a while: shore water dries, people drink more, crops wilt.
    HeatWave,
    /// Freeze the water inside the radius into ice: people can walk across it until it melts.
    Freeze {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// The river blesses the land: fish gather in the water nearest the point.
    BlessRiver {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A forest surges: wild food sprouts among the trees, and the plantings there grow on.
    BlessForest {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Every living member of the tribe nearest the point gets food (a portion each) or a stone tool.
    TribeGift {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
        what: String,
    },
    /// The tribe nearest the point moves to it: its living members are set down around the click.
    MigrateTribe {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Two tribes trade: the tribe of the first click sends food to the tribe of the second.
    TradeGift {
        ax: f32,
        ay: f32,
        bx: f32,
        by: f32,
    },
    /// A tribe of the named age settles where you click, already knowing the discoveries of that age.
    EraTribe {
        x: f32,
        y: f32,
        era: String,
    },
    ShapeLand {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
        by: f32,
    },
    BlessSoil {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    Spring {
        x: i32,
        y: i32,
    },
    BountifulHunt {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A rare gift for the living person nearest the point: a talent that lifts one of their traits for good.
    Talent {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A comet streaks across the sky over the point: everyone within the reach is awed.
    Comet {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// A bomb falls on the point: a crater, fallout that poisons a wide ring, and blight. Only once a
    /// tribe has reached the Industrial age.
    Nuke {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: Option<i32>,
    },
    /// Move the clock forward to the next `dawn`, `noon`, `dusk` or `midnight`. The dock sends it as
    /// `time_of_day`.
    #[serde(alias = "time_of_day")]
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
    /// Plague breaks out: among the people nearest (x, y) within the radius when a point is given,
    /// else among the first people of the world.
    Outbreak {
        #[serde(default)]
        count: u32,
        #[serde(default)]
        x: Option<f32>,
        #[serde(default)]
        y: Option<f32>,
        #[serde(default)]
        radius: f32,
    },
    /// The ground opens into a pit that fills with water: everyone over it falls in and dies.
    Sinkhole {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
    },
    /// A black hole swallows everyone near the point and drags the rest toward it.
    BlackHole {
        x: f32,
        y: f32,
        #[serde(default)]
        radius: f32,
    },
    /// Acid falls over the radius, burning people, beasts, crops and soil.
    AcidRain {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
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
    Follow {
        #[serde(default)]
        id: Option<String>,
    },
    Marry {
        ax: f32,
        ay: f32,
        bx: f32,
        by: f32,
    },
    /// Lay a road over open ground inside the radius (`kind` "road"), or clear the roads there (`kind` "erase").
    Road {
        x: i32,
        y: i32,
        #[serde(default)]
        radius: i32,
        kind: String,
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
    Composite {
        steps: Vec<Command>,
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

/// The tile under a float command coordinate, clamped like `clamp_cmd_coord`: a bare `as i32`
/// saturates at `i32::MAX`, and the handlers then add a radius-sized offset to it.
fn cmd_tile(v: f32) -> i32 {
    clamp_cmd_coord(v as i32)
}

fn tile_from_name(name: &str) -> Option<Tile> {
    Some(match name {
        "grass" => Tile::Grass,
        "water" => Tile::Water,
        "food" => Tile::Food,
        "rock" => Tile::Rock,
        "sand" => Tile::Sand,
        "lava" => Tile::Lava,
        "snow" => Tile::Snow,
        "ash" => Tile::Ash,
        "ice" => Tile::Ice,
        "mineral" => Tile::Mineral,
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
        "duck" => AnimalKind::Duck,
        "bee" => AnimalKind::Bee,
        "owl" => AnimalKind::Owl,
        "eagle" => AnimalKind::Eagle,
        "snake" => AnimalKind::Snake,
        "crocodile" => AnimalKind::Crocodile,
        "monkey" => AnimalKind::Monkey,
        "goat" => AnimalKind::Goat,
        "elephant" => AnimalKind::Elephant,
        "lion" => AnimalKind::Lion,
        "zebra" => AnimalKind::Zebra,
        "polar_bear" => AnimalKind::PolarBear,
        "kangaroo" => AnimalKind::Kangaroo,
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
        Command::Spring { x, y } => (&[Thirst], at(*x as f32, *y as f32)),
        Command::BlessSoil { x, y, .. } | Command::BountifulHunt { x, y, .. } => (&[Hunger], at(*x, *y)),
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

#[cfg(test)]
mod blessing_tests;
mod blessings;
mod boat;
#[cfg(test)]
mod brush_cap_tests;
mod buildings;
mod catastrophes;
mod clear_region;
mod clock;
mod composite;
#[cfg(test)]
mod composite_tests;
mod creation;
mod disasters;
#[cfg(test)]
mod dock_audit_tests;
mod era_tribe;
mod follow;
mod frost;
mod gift;
mod hail;
mod heal_one;
mod heat_wave;
mod heavens;
mod leader;
#[cfg(test)]
mod locust_tests;
mod marry;
mod miracles;
mod mutation;
mod nuke;
pub mod outcome;
#[cfg(test)]
mod outcome_tests;
mod place;
mod rain_patch;
pub mod registry;
#[cfg(test)]
mod registry_tests;
#[cfg(test)]
mod release_tests;
mod rename_person;
mod restore;
#[cfg(test)]
mod restore_tests;
mod roads;
#[cfg(test)]
mod roads_tests;
#[cfg(test)]
mod speak_like_tests;
mod teach_nearby;
mod teleport;
mod terraform;
#[cfg(test)]
mod terraform_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tornado_tests;
mod tribe_care;
mod tribe_gifts;
mod tribe_regroup;
mod tribes;
#[cfg(test)]
mod tsunami_tests;
#[cfg(test)]
mod weather_tests;
#[cfg(test)]
mod wildfire_tests;

impl Simulation {
    pub fn apply_command_json(&mut self, json: &str) -> bool {
        self.apply_command_json_reported(json).applied
    }

    /// Like `apply_command_json`, but says what the command did (see `outcome`).
    pub fn apply_command_json_reported(&mut self, json: &str) -> outcome::CommandOutcome {
        match serde_json::from_str::<Command>(json) {
            Ok(cmd) => self.apply_command_reported(cmd),
            Err(_) => outcome::CommandOutcome::failed(),
        }
    }

    pub fn apply_command(&mut self, cmd: Command) -> bool {
        self.apply_command_reported(cmd).applied
    }

    /// Runs a command and reports whether it changed the world and what it did.
    pub fn apply_command_reported(&mut self, cmd: Command) -> outcome::CommandOutcome {
        let answers = prayer_answers(&cmd);
        self.command_report = None;
        let disaster = self.disaster_before(&cmd);
        let applied = self.apply_command_inner(cmd);
        if let (true, Some((x, y))) = (applied, answers.as_ref().and_then(|(_, at)| *at)) {
            self.focus_points.push((
                x as i32,
                y as i32,
                self.tick_count + crate::sim::simulation::COMMAND_FOCUS_TICKS,
            ));
        }
        // A disaster says whom it hit, counted from what changed (see `report_disaster`).
        if applied {
            if let Some(before) = disaster {
                self.report_disaster(before);
            }
        }
        if applied {
            if let Some((kinds, at)) = answers {
                self.answer_prayers(kinds, at);
            }
        }
        let report = self.command_report.take().unwrap_or(outcome::Report {
            code: if applied { "applied" } else { "failed" },
            count: 0,
            name: None,
            buildings: 0,
            tribe: None,
            homes: false,
        });
        outcome::CommandOutcome {
            applied,
            code: report.code,
            count: report.count,
            name: report.name,
            buildings: report.buildings,
            tribe: report.tribe,
            homes: report.homes,
        }
    }

    fn apply_command_inner(&mut self, cmd: Command) -> bool {
        registry::lookup(cmd.id()).is_some_and(|spec| (spec.run)(self, cmd))
    }
}
