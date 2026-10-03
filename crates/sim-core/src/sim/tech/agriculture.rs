use crate::sim::era::Era;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgriEra {
    Foraging,
    Horticulture,
    Subsistence,
    Plough,
    CropRotation,
    Industrial,
    Genetic,
}

impl AgriEra {
    pub fn name(self) -> &'static str {
        match self {
            AgriEra::Foraging => "foraging",
            AgriEra::Horticulture => "horticulture",
            AgriEra::Subsistence => "subsistence",
            AgriEra::Plough => "plough",
            AgriEra::CropRotation => "crop_rotation",
            AgriEra::Industrial => "industrial",
            AgriEra::Genetic => "genetic",
        }
    }
    pub fn from_era(era: Era) -> AgriEra {
        match era {
            Era::PreStone | Era::Stone => AgriEra::Foraging,
            Era::Bronze => AgriEra::Horticulture,
            Era::Iron => AgriEra::Subsistence,
            Era::Classical => AgriEra::Plough,
            Era::Medieval | Era::Renaissance => AgriEra::CropRotation,
            Era::Industrial | Era::Modern => AgriEra::Industrial,
            Era::Information => AgriEra::Genetic,
            _ => AgriEra::Genetic,
        }
    }
    pub fn yield_multiplier(self) -> f32 {
        match self {
            AgriEra::Foraging => 1.0,
            AgriEra::Horticulture => 1.4,
            AgriEra::Subsistence => 1.8,
            AgriEra::Plough => 2.5,
            AgriEra::CropRotation => 3.5,
            AgriEra::Industrial => 7.0,
            AgriEra::Genetic => 12.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CropKind {
    Wheat,
    Rice,
    Maize,
    Barley,
    Potato,
    Beans,
    Cotton,
    Tobacco,
    Sugarcane,
    Coffee,
    Tea,
}

impl CropKind {
    pub fn name(self) -> &'static str {
        match self {
            CropKind::Wheat => "wheat",
            CropKind::Rice => "rice",
            CropKind::Maize => "maize",
            CropKind::Barley => "barley",
            CropKind::Potato => "potato",
            CropKind::Beans => "beans",
            CropKind::Cotton => "cotton",
            CropKind::Tobacco => "tobacco",
            CropKind::Sugarcane => "sugarcane",
            CropKind::Coffee => "coffee",
            CropKind::Tea => "tea",
        }
    }
    pub fn era_introduced(self) -> Era {
        match self {
            CropKind::Wheat | CropKind::Barley | CropKind::Rice => Era::Bronze,
            CropKind::Maize | CropKind::Beans => Era::Iron,
            CropKind::Potato => Era::Classical,
            CropKind::Cotton | CropKind::Tobacco | CropKind::Sugarcane => Era::Renaissance,
            CropKind::Coffee | CropKind::Tea => Era::Industrial,
        }
    }
    pub fn yield_per_tile(self) -> u32 {
        match self {
            CropKind::Wheat | CropKind::Rice | CropKind::Barley => 4,
            CropKind::Maize | CropKind::Beans | CropKind::Potato => 5,
            CropKind::Cotton | CropKind::Tobacco | CropKind::Sugarcane => 3,
            CropKind::Coffee | CropKind::Tea => 2,
        }
    }
    pub fn growth_ticks(self) -> u32 {
        match self {
            CropKind::Wheat | CropKind::Barley => 1200,
            CropKind::Rice => 1400,
            CropKind::Maize => 1300,
            CropKind::Potato | CropKind::Beans => 900,
            CropKind::Cotton => 1800,
            CropKind::Tobacco | CropKind::Sugarcane => 2000,
            CropKind::Coffee | CropKind::Tea => 3000,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Farm {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub owner_lineage: String,
    pub crop: CropKind,
    pub planted_tick: u64,
    pub ready_tick: u64,
    pub harvested: bool,
    /// A harvested plot must be plowed once before the dedicated sow action
    /// can reuse it. Older saves predate this bit and safely load as
    /// unprepared; the general planting action can still reclaim them.
    #[serde(default)]
    pub prepared: bool,
}

impl Farm {
    pub fn progress(&self, tick: u64) -> f32 {
        if self.harvested {
            return 0.0;
        }
        let duration = self.ready_tick.saturating_sub(self.planted_tick);
        if duration == 0 {
            return 1.0;
        }
        tick.saturating_sub(self.planted_tick) as f32 / duration as f32
    }

    pub fn stage(&self, tick: u64) -> &'static str {
        if self.harvested {
            return "fallow";
        }
        let progress = self.progress(tick);
        if progress >= 1.0 {
            "mature"
        } else if progress <= 0.05 {
            "seeded"
        } else {
            "growing"
        }
    }

    pub fn is_mature(&self, tick: u64) -> bool {
        !self.harvested && tick >= self.ready_tick
    }

    pub fn projected_yield(&self, era: Era, fertility: f32) -> u8 {
        let fertility_factor = 0.45 + fertility.clamp(0.0, 1.0) * 0.80;
        let raw =
            self.crop.yield_per_tile() as f32 * AgriEra::from_era(era).yield_multiplier() * fertility_factor;
        raw.round().clamp(1.0, 64.0) as u8
    }

    pub fn soil_depletion(&self, era: Era, fertility: f32) -> f32 {
        let fertility = fertility.clamp(0.0, 1.0);
        let crop_pressure = self.crop.yield_per_tile() as f32 / 5.0;
        let production_pressure = self.projected_yield(era, fertility) as f32 / 64.0;
        let conservation = match AgriEra::from_era(era) {
            AgriEra::CropRotation => 0.78,
            AgriEra::Industrial => 0.90,
            AgriEra::Genetic => 0.68,
            _ => 1.0,
        };
        ((0.045 + crop_pressure * 0.055 + production_pressure * 0.080)
            * (0.70 + fertility * 0.60)
            * conservation)
            .clamp(0.03, 0.20)
    }

    /// Move a growing crop's deadline while keeping all weather and care
    /// effects inside 60%-180% of its crop's natural growth time. Returning
    /// the actual signed movement makes repeated tending deterministic and
    /// prevents it from accelerating forever.
    pub fn adjust_ready_tick(&mut self, tick: u64, delta: i64) -> i64 {
        if self.harvested || tick >= self.ready_tick {
            return 0;
        }
        let base = self.crop.growth_ticks() as u64;
        let earliest = self.planted_tick.saturating_add(base.saturating_mul(3) / 5);
        let latest = self.planted_tick.saturating_add(base.saturating_mul(9) / 5);
        let old = self.ready_tick.clamp(earliest, latest);
        let proposed = (old as i128 + delta as i128).clamp(earliest as i128, latest as i128) as u64;
        self.ready_tick = proposed;
        proposed as i64 - old as i64
    }
}

/// Weather changes crop timing on a low cadence, and `Farm::adjust_ready_tick`
/// keeps even a very long drought or a heavily tended crop within sane limits.
pub fn tick_farm_weather(farms: &mut [Farm], tick: u64, drought: bool, wet: bool, season: &str) {
    if !tick.is_multiple_of(120) {
        return;
    }
    let mut delta = 0i64;
    if drought {
        delta += 18;
    }
    if wet {
        delta -= 10;
    }
    delta += match season {
        "abundance" => -3,
        "scarcity" => 6,
        _ => 0,
    };
    if delta == 0 {
        return;
    }
    for farm in farms {
        farm.adjust_ready_tick(tick, delta);
    }
}

/// Imported and legacy worlds can contain multiple records for one tile.
/// Prefer a live crop, then the newest record, so every coordinate has one
/// deterministic plot before gameplay resumes.
pub fn deduplicate_farm_plots(farms: &mut Vec<Farm>) {
    use std::cmp::Reverse;

    farms.sort_by_key(|farm| (farm.y, farm.x, farm.harvested, Reverse(farm.id)));
    farms.dedup_by_key(|farm| (farm.x, farm.y));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agri_era_grows_with_era() {
        assert_eq!(AgriEra::from_era(Era::Stone), AgriEra::Foraging);
        assert_eq!(AgriEra::from_era(Era::Information), AgriEra::Genetic);
    }

    #[test]
    fn industrial_yields_more() {
        assert!(AgriEra::Industrial.yield_multiplier() > AgriEra::Foraging.yield_multiplier());
    }

    fn farm(crop: CropKind) -> Farm {
        Farm {
            id: 1,
            x: 12,
            y: 18,
            owner_lineage: "lineage-a".to_string(),
            crop,
            planted_tick: 100,
            ready_tick: 100 + crop.growth_ticks() as u64,
            harvested: false,
            prepared: false,
        }
    }

    #[test]
    fn farm_deadline_adjustments_are_bounded() {
        let mut wheat = farm(CropKind::Wheat);
        for _ in 0..100 {
            wheat.adjust_ready_tick(101, -100);
        }
        assert_eq!(wheat.ready_tick, 100 + 1200 * 3 / 5);

        for _ in 0..100 {
            wheat.adjust_ready_tick(101, 100);
        }
        assert_eq!(wheat.ready_tick, 100 + 1200 * 9 / 5);
    }

    #[test]
    fn weather_moves_deadlines_in_bounded_opposite_directions() {
        let mut wet = farm(CropKind::Wheat);
        let mut dry = wet.clone();

        tick_farm_weather(std::slice::from_mut(&mut wet), 120, false, true, "abundance");
        tick_farm_weather(std::slice::from_mut(&mut dry), 120, true, false, "scarcity");

        assert_eq!(wet.ready_tick, 1_287);
        assert_eq!(dry.ready_tick, 1_324);
    }

    #[test]
    fn crop_era_and_fertility_scale_yield_and_depletion() {
        let wheat = farm(CropKind::Wheat);
        let potato = farm(CropKind::Potato);
        let poor_early = wheat.projected_yield(Era::Bronze, 0.2);
        let fertile_early = wheat.projected_yield(Era::Bronze, 0.9);
        let fertile_late = wheat.projected_yield(Era::Industrial, 0.9);

        assert!(fertile_early > poor_early);
        assert!(fertile_late > fertile_early);
        assert!(potato.projected_yield(Era::Bronze, 0.9) > fertile_early);
        assert!(wheat.soil_depletion(Era::Bronze, 0.9) > wheat.soil_depletion(Era::Bronze, 0.2));
        assert!((0.03..=0.20).contains(&wheat.soil_depletion(Era::Industrial, 0.9)));
    }

    #[test]
    fn farm_stage_tracks_seed_to_fallow_lifecycle() {
        let mut wheat = farm(CropKind::Wheat);
        assert_eq!(wheat.stage(100), "seeded");
        assert_eq!(wheat.stage(700), "growing");
        assert_eq!(wheat.stage(wheat.ready_tick), "mature");
        wheat.harvested = true;
        assert_eq!(wheat.stage(wheat.ready_tick), "fallow");
        assert_eq!(wheat.progress(wheat.ready_tick), 0.0);
    }

    #[test]
    fn farm_deadline_and_preparation_survive_json_save_reload() {
        let mut sim = crate::sim::simulation::Simulation::new(91);
        let mut saved_farm = farm(CropKind::Beans);
        saved_farm.ready_tick = 2_345;
        saved_farm.prepared = true;
        sim.farms.push(saved_farm);
        sim.next_farm_id = 2;

        let json = serde_json::to_string(&sim.to_save_state()).unwrap();
        let state: crate::sim::persistence::SaveState = serde_json::from_str(&json).unwrap();
        let loaded = crate::sim::simulation::Simulation::from_save(91, state);

        assert_eq!(loaded.farms.len(), 1);
        assert_eq!(loaded.farms[0].ready_tick, 2_345);
        assert!(loaded.farms[0].prepared);
        assert_eq!(loaded.next_farm_id, 2);
    }

    #[test]
    fn duplicate_imported_plots_keep_live_newest_crop() {
        let mut old_fallow = farm(CropKind::Wheat);
        old_fallow.id = 1;
        old_fallow.harvested = true;
        let mut old_live = farm(CropKind::Barley);
        old_live.id = 2;
        let mut new_live = farm(CropKind::Beans);
        new_live.id = 3;
        let mut farms = vec![old_fallow, old_live, new_live];

        deduplicate_farm_plots(&mut farms);

        assert_eq!(farms.len(), 1);
        assert_eq!(farms[0].id, 3);
        assert_eq!(farms[0].crop, CropKind::Beans);
    }

    #[test]
    fn legacy_farm_without_prepared_flag_loads_unprepared() {
        let legacy = serde_json::json!({
            "id": 5,
            "x": 12,
            "y": 18,
            "owner_lineage": "lineage-a",
            "crop": "Wheat",
            "planted_tick": 10,
            "ready_tick": 100,
            "harvested": true
        });

        let loaded: Farm = serde_json::from_value(legacy).unwrap();

        assert!(!loaded.prepared);
    }
}
