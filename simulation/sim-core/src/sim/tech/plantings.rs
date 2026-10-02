//! Crops, orchards and saplings the player plants by hand. They grow on
//! their own (faster in the rain, slower in a drought or on poor ground),
//! ripen into food anyone can eat, and regrow once eaten. Saplings grow up
//! into forest. Fire, flood and new buildings destroy them.
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::{
    grid::{WorldGrid, WIDTH},
    tiles::{Biome, Tile},
};
use rand::RngExt;
use serde::{Deserialize, Serialize};

/// Plantings advance in steps this many ticks apart.
pub const PLANT_STEP_TICKS: u64 = 10;
/// Most plantings the world keeps, so a long brush stroke can't grow
/// without bound.
pub const MAX_PLANTINGS: usize = 4000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlantKind {
    Crop,
    Orchard,
    Sapling,
}

impl PlantKind {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "crop" | "crops" | "seeds" => Some(PlantKind::Crop),
            "orchard" | "fruit" => Some(PlantKind::Orchard),
            "sapling" | "tree" | "trees" => Some(PlantKind::Sapling),
            _ => None,
        }
    }

    pub fn id(self) -> u8 {
        match self {
            PlantKind::Crop => 0,
            PlantKind::Orchard => 1,
            PlantKind::Sapling => 2,
        }
    }

    /// Growth points needed to ripen (or, for a sapling, to become forest).
    /// Normal conditions add 10 points every step.
    fn ripe_at(self) -> u16 {
        match self {
            PlantKind::Crop => 500,
            PlantKind::Orchard => 1100,
            PlantKind::Sapling => 1600,
        }
    }

    /// Where growth restarts after the food has been eaten.
    fn regrow_from(self) -> u16 {
        match self {
            PlantKind::Crop => 150,
            PlantKind::Orchard => 700,
            PlantKind::Sapling => 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Planting {
    pub kind: PlantKind,
    pub growth: u16,
    pub ripe: bool,
    #[serde(default)]
    pub harvests: u16,
}

impl Planting {
    pub fn new(kind: PlantKind) -> Self {
        Planting {
            kind,
            growth: 0,
            ripe: false,
            harvests: 0,
        }
    }

    /// 0-3 for growing plants, 4 when ripe. The client draws one sprite
    /// per stage.
    pub fn stage(&self) -> u8 {
        if self.ripe {
            return 4;
        }
        ((self.growth as u32 * 4) / self.kind.ripe_at() as u32).min(3) as u8
    }
}

/// A round brush: slightly fuller than a strict circle so small radii
/// don't come out as plus signs.
fn in_disc(dx: i32, dy: i32, r: i32) -> bool {
    dx * dx + dy * dy <= r * r + r / 2
}

fn xy(i: u32) -> (i32, i32) {
    ((i as usize % WIDTH) as i32, (i as usize / WIDTH) as i32)
}

/// Ground a plant can grow on.
fn plantable(tile: Tile) -> bool {
    matches!(tile, Tile::Grass | Tile::Sand | Tile::Ash | Tile::Food)
}

/// Ground that kills a planting outright.
fn destroys(tile: Tile) -> bool {
    matches!(
        tile,
        Tile::Water
            | Tile::Fire
            | Tile::Flooded
            | Tile::Rock
            | Tile::Hut
            | Tile::Mineral
            | Tile::Scorched
            | Tile::Void
            | Tile::Campfire
    )
}

/// How fast each kind grows in each season: crops and fruit wait out the
/// winter, young trees creep along.
fn season_growth(kind: PlantKind, season: &str) -> f32 {
    match (kind, season) {
        (_, "abundance") => 1.2,
        (PlantKind::Sapling, "scarcity") => 0.3,
        (_, "scarcity") => 0.0,
        (PlantKind::Crop, "decline") => 0.7,
        _ => 1.0,
    }
}

fn biome_growth(biome: Biome) -> f32 {
    match biome {
        Biome::Wetland | Biome::Jungle => 1.25,
        Biome::Grassland | Biome::Forest | Biome::Savanna => 1.0,
        Biome::Taiga | Biome::Volcanic => 0.8,
        Biome::Tundra | Biome::Desert | Biome::Badlands => 0.45,
    }
}

/// The forest a sapling matures into, matched to its climate.
fn forest_for(biome: Biome) -> Biome {
    match biome {
        Biome::Tundra | Biome::Taiga => Biome::Taiga,
        Biome::Jungle | Biome::Wetland => Biome::Jungle,
        _ => Biome::Forest,
    }
}

impl Simulation {
    /// Plant inside the radius. Crops fill every tile, orchards every
    /// other tile, saplings a loose scatter so a planted wood looks wild.
    pub(crate) fn plant(&mut self, x: i32, y: i32, kind: PlantKind, radius: i32) -> usize {
        let r = radius.clamp(0, 12);
        let mut planted = 0;
        for dy in -r..=r {
            for dx in -r..=r {
                if !in_disc(dx, dy, r) {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || !plantable(self.grid.get(nx, ny)) {
                    continue;
                }
                let spaced = match kind {
                    PlantKind::Crop => true,
                    PlantKind::Orchard => (nx + ny) % 2 == 0,
                    PlantKind::Sapling => r == 0 || self.rng.random::<f32>() < 0.45,
                };
                if !spaced || self.plantings.len() >= MAX_PLANTINGS {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny) as u32;
                if self.plantings.get(&i).is_some_and(|p| p.kind == kind) {
                    continue;
                }
                if self.grid.get(nx, ny) == Tile::Food {
                    self.grid.set(nx, ny, Tile::Grass);
                }
                self.plantings.insert(i, Planting::new(kind));
                planted += 1;
            }
        }
        if planted > 0 {
            self.planting_revision = self.planting_revision.wrapping_add(1);
        }
        planted
    }

    /// Make every planting inside the radius ripe at once.
    pub(crate) fn ripen_plantings(&mut self, x: i32, y: i32, radius: i32) -> usize {
        let mut ripened = 0;
        let keys: Vec<u32> = self.plantings.keys().copied().collect();
        for i in keys {
            let (px, py) = xy(i);
            if !in_disc(px - x, py - y, radius) {
                continue;
            }
            if let Some(p) = self.plantings.get_mut(&i) {
                if !p.ripe {
                    p.growth = p.kind.ripe_at();
                    ripened += 1;
                }
            }
        }
        ripened
    }

    /// Kill every planting inside the radius.
    pub(crate) fn wither_plantings(&mut self, x: i32, y: i32, radius: i32) -> usize {
        let before = self.plantings.len();
        self.plantings.retain(|&i, _| {
            let (px, py) = xy(i);
            !in_disc(px - x, py - y, radius)
        });
        let withered = before - self.plantings.len();
        if withered > 0 {
            self.planting_revision = self.planting_revision.wrapping_add(1);
        }
        withered
    }

    /// Frost kills fields of crops; orchards and saplings ride it out.
    pub(crate) fn frost_plantings(&mut self, x: i32, y: i32, radius: i32) -> usize {
        let before = self.plantings.len();
        self.plantings.retain(|&i, p| {
            let (px, py) = xy(i);
            p.kind != PlantKind::Crop || !in_disc(px - x, py - y, radius)
        });
        let killed = before - self.plantings.len();
        if killed > 0 {
            self.planting_revision = self.planting_revision.wrapping_add(1);
        }
        killed
    }

    pub(crate) fn tick_plantings(&mut self) {
        if self.plantings.is_empty() || !self.tick_count.is_multiple_of(PLANT_STEP_TICKS) {
            return;
        }
        let wet = self.weather.kind >= 1 || self.tick_count < self.weather.wet_until;
        let weather = if self.drought.active {
            0.3
        } else if wet {
            1.6
        } else {
            1.0
        };
        let season_name = self.season();
        let hard_winter = self.hard_winter;
        let mut dead: Vec<u32> = Vec::new();
        let mut eaten: Vec<(i32, i32)> = Vec::new();
        let mut forests = 0;
        let mut changed = false;
        let keys: Vec<u32> = self.plantings.keys().copied().collect();
        for i in keys {
            let (x, y) = xy(i);
            let tile = self.grid.get(x, y);
            if destroys(tile) {
                dead.push(i);
                continue;
            }
            let biome = self.grid.biome_at(x, y);
            let Some(p) = self.plantings.get_mut(&i) else {
                continue;
            };
            let stage = p.stage();
            let winter = season_name == "scarcity";
            if p.ripe {
                if tile == Tile::Food {
                    // Produce left in the field through winter rots away.
                    if winter && p.kind != PlantKind::Sapling && self.rng.random::<f32>() < 0.003 {
                        self.grid.set(x, y, Tile::Grass);
                        p.ripe = false;
                        p.growth = p.kind.regrow_from();
                        changed = true;
                    }
                    continue;
                }
                // Someone ate it: start the next crop.
                p.ripe = false;
                p.growth = p.kind.regrow_from();
                p.harvests = p.harvests.saturating_add(1);
                eaten.push((x, y));
                changed = true;
                continue;
            }
            // A hard winter's frost kills fields that have not ripened.
            if winter && hard_winter && p.kind == PlantKind::Crop && self.rng.random::<f32>() < 0.01 {
                dead.push(i);
                continue;
            }
            let season = season_growth(p.kind, season_name);
            if tile == Tile::Snow || season <= 0.0 {
                continue;
            }
            let near_water = [
                (-2i32, 0i32),
                (2, 0),
                (0, -2),
                (0, 2),
                (-1, 0),
                (1, 0),
                (0, -1),
                (0, 1),
            ]
            .iter()
            .any(|&(dx, dy)| {
                WorldGrid::in_bounds(x + dx, y + dy) && self.grid.get(x + dx, y + dy) == Tile::Water
            });
            let water = if near_water { 1.3 } else { 1.0 };
            let soil = 0.6 + self.grid.fertility[i as usize].clamp(0.0, 1.0) * 0.6;
            let step = 10.0 * weather * season * water * soil * biome_growth(biome);
            p.growth = p.growth.saturating_add(step.round().max(1.0) as u16);
            if p.growth < p.kind.ripe_at() {
                changed |= p.stage() != stage;
                continue;
            }
            changed = true;
            match p.kind {
                PlantKind::Crop | PlantKind::Orchard => {
                    p.ripe = true;
                    self.grid.set(x, y, Tile::Food);
                }
                PlantKind::Sapling => {
                    let idx = i as usize;
                    self.grid.biome[idx] = forest_for(biome) as u8;
                    self.grid.fertility[idx] = self.grid.fertility[idx].max(0.7);
                    if tile != Tile::Grass {
                        self.grid.set(x, y, Tile::Grass);
                    }
                    dead.push(i);
                    forests += 1;
                }
            }
        }
        changed |= !dead.is_empty();
        for i in dead {
            self.plantings.remove(&i);
        }
        if changed {
            self.planting_revision = self.planting_revision.wrapping_add(1);
        }
        if forests >= 6 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                "a planted wood grew tall",
            );
        }
        self.learn_farming_from(&eaten);
    }

    /// Tribes that eat from the gods' fields may learn to farm themselves.
    fn learn_farming_from(&mut self, eaten: &[(i32, i32)]) {
        for &(x, y) in eaten {
            if self.rng.random::<f32>() > 0.04 {
                continue;
            }
            let Some(o) = self
                .organisms
                .iter_mut()
                .find(|o| o.alive && (o.x - x as f32).abs() <= 2.0 && (o.y - y as f32).abs() <= 2.0)
            else {
                continue;
            };
            if o.discoveries.contains("agriculture") {
                continue;
            }
            o.discoveries.insert("agriculture".to_string());
            o.think("the gods' fields taught me to sow", self.tick_count);
            let who = o.name.clone();
            push_event(
                &mut self.events,
                self.tick_count,
                "discovery",
                &who,
                "learned to farm from the gods' fields",
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat_sim() -> Simulation {
        let mut sim = Simulation::new(7);
        for y in 80..120 {
            for x in 80..120 {
                sim.grid.set(x, y, Tile::Grass);
                let i = WorldGrid::idx(x, y);
                sim.grid.biome[i] = Biome::Grassland as u8;
                sim.grid.fertility[i] = 0.8;
            }
        }
        sim.organisms.clear();
        sim.plantings.clear();
        sim.drought.active = false;
        sim
    }

    fn run(sim: &mut Simulation, steps: u64) {
        for _ in 0..steps {
            sim.tick_count += PLANT_STEP_TICKS;
            sim.tick_plantings();
        }
    }

    #[test]
    fn crops_ripen_into_food_and_regrow_after_eating() {
        let mut sim = flat_sim();
        assert!(sim.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"crop","radius":2}"#));
        let i = WorldGrid::idx(100, 100) as u32;
        assert_eq!(sim.plantings[&i].stage(), 0);
        run(&mut sim, 120);
        assert!(sim.plantings[&i].ripe);
        assert_eq!(sim.grid.get(100, 100), Tile::Food);
        // Eaten: the tile goes back to grass and the field starts over.
        sim.grid.set(100, 100, Tile::Grass);
        run(&mut sim, 1);
        let p = &sim.plantings[&i];
        assert!(!p.ripe);
        assert_eq!(p.harvests, 1);
    }

    #[test]
    fn saplings_grow_into_forest_and_fire_kills_plantings() {
        let mut sim = flat_sim();
        assert!(sim.apply_command_json(r#"{"cmd":"plant","x":90,"y":90,"kind":"sapling","radius":0}"#));
        assert!(sim.apply_command_json(r#"{"cmd":"plant","x":110,"y":110,"kind":"crop","radius":0}"#));
        sim.grid.set(110, 110, Tile::Fire);
        run(&mut sim, 400);
        assert_eq!(sim.grid.biome_at(90, 90), Biome::Forest);
        assert!(sim.plantings.is_empty());
    }

    #[test]
    fn harvest_ripens_and_blight_withers_plantings() {
        let mut sim = flat_sim();
        assert!(sim.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"orchard","radius":3}"#));
        let n = sim.plantings.len();
        assert!(n > 4);
        sim.ripen_plantings(100, 100, 3);
        run(&mut sim, 1);
        assert!(sim.plantings.values().all(|p| p.ripe));
        assert_eq!(sim.wither_plantings(100, 100, 3), n);
    }

    #[test]
    fn frost_kills_crops_but_not_trees_and_meteors_kill_both() {
        let mut sim = flat_sim();
        sim.apply_command_json(r#"{"cmd":"plant","x":95,"y":95,"kind":"crop","radius":1}"#);
        sim.apply_command_json(r#"{"cmd":"plant","x":97,"y":95,"kind":"orchard","radius":0}"#);
        sim.apply_command_json(r#"{"cmd":"blizzard","x":96,"y":95,"radius":4}"#);
        assert!(sim.plantings.values().all(|p| p.kind == PlantKind::Orchard));
        assert_eq!(sim.plantings.len(), 1);
        sim.apply_command_json(r#"{"cmd":"meteor","x":97,"y":95,"radius":2}"#);
        assert!(sim.plantings.is_empty());
    }

    #[test]
    fn crops_wait_out_winter_and_a_hard_winter_kills_unripe_fields() {
        use crate::sim::config::SEASON_LENGTH;
        let mut sim = flat_sim();
        sim.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"crop","radius":2}"#);
        sim.apply_command_json(r#"{"cmd":"plant","x":110,"y":100,"kind":"sapling","radius":0}"#);
        let crop = WorldGrid::idx(100, 100) as u32;
        let tree = WorldGrid::idx(110, 100) as u32;
        // Midwinter in an ordinary year: crops stand still, the tree grows.
        sim.tick_count = SEASON_LENGTH * 2;
        for _ in 0..30 {
            sim.tick_count += PLANT_STEP_TICKS;
            sim.tick_plantings();
        }
        assert_eq!(sim.plantings[&crop].growth, 0);
        assert!(sim.plantings[&tree].growth > 0);
        // A hard winter's frost kills the unripe field.
        sim.hard_winter = true;
        let fields = sim
            .plantings
            .values()
            .filter(|p| p.kind == PlantKind::Crop)
            .count();
        for _ in 0..250 {
            sim.tick_count += PLANT_STEP_TICKS;
            sim.tick_plantings();
        }
        let left = sim
            .plantings
            .values()
            .filter(|p| p.kind == PlantKind::Crop)
            .count();
        assert!(
            left * 4 < fields,
            "{left} of {fields} fields survived a hard winter"
        );
    }

    #[test]
    fn plantings_survive_save_and_load() {
        let mut sim = flat_sim();
        sim.apply_command_json(r#"{"cmd":"plant","x":100,"y":100,"kind":"crop","radius":1}"#);
        run(&mut sim, 10);
        let json = serde_json::to_string(&sim.to_save_state()).expect("save");
        let loaded = Simulation::from_save(7, serde_json::from_str(&json).expect("load"));
        assert_eq!(loaded.plantings, sim.plantings);
    }
}
