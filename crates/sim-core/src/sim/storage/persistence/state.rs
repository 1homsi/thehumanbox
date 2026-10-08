use super::*;

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct GridSave {
    pub(super) tiles: Vec<i8>,
    /// Water depth changes at runtime as droughts, floods, and completed
    /// infrastructure reshape the map, so it cannot be regenerated from the
    /// world seed on load.
    pub(super) depth: Vec<f32>,
    /// Biomes are rewritten at runtime by the world-evolution pass (forest
    /// clearing for farmland, grassland desertifying during droughts, rivers
    /// and wetlands forming). Regenerating them from the seed on load threw
    /// all of that away and, because fertility regrowth is capped per biome,
    /// re-capped recovered tiles to their pre-evolution biome's ceiling.
    pub(super) biome: Vec<u8>,
    pub(super) fire: Vec<f32>,
    pub(super) food_trail: Vec<f32>,
    pub(super) water_trail: Vec<f32>,
    pub(super) path_trail: Vec<f32>,
    pub(super) structure: Vec<f32>,
    pub(super) fertility: Vec<f32>,
    pub(super) hazard: Vec<f32>,
    pub(super) pressure: Vec<f32>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct DroughtSave {
    pub(super) active: bool,
    pub(super) start_tick: u64,
    pub(super) dried_tiles: Vec<[i32; 2]>,
    pub(super) rain_relief: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct WeatherSave {
    pub(super) kind: u8,
    pub(super) start_tick: u64,
    pub(super) duration: u64,
    pub(super) intensity: f32,
    #[serde(default)]
    pub(super) wet_until: u64,
    pub(super) wind_x: f32,
    pub(super) wind_y: f32,
    pub(super) wind_last_tick: u64,
}

impl Default for WeatherSave {
    fn default() -> Self {
        Self {
            kind: 0,
            start_tick: 0,
            duration: 0,
            intensity: 0.0,
            wet_until: 0,
            wind_x: 0.4,
            wind_y: 0.0,
            wind_last_tick: 0,
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct WaterUseSave {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) count: u32,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SaveState {
    pub(crate) version: u32,
    pub(crate) tick_count: u64,
    pub(super) next_animal_id: usize,
    pub(super) history: History,
    pub(super) drought: DroughtSave,
    pub(super) weather: WeatherSave,
    pub(super) events: Vec<Event>,
    pub(crate) organisms: Vec<OrgSave>,
    pub(crate) animals: Vec<AnimalSave>,
    pub(crate) grid: GridSave,
    pub(super) story_history: Vec<StoryEntry>,
    pub(super) pop_history: Vec<[u64; 2]>,
    pub(super) lineage_centroid_history: HashMap<String, Vec<[i32; 3]>>,
    #[serde(default)]
    pub(super) lineage_homes: HashMap<String, [i32; 3]>,
    #[serde(default)]
    pub(super) lineage_eras: HashMap<String, crate::sim::era::Era>,
    #[serde(default)]
    pub(super) lineage_generations_reached: HashMap<String, u32>,
    pub(super) current_era: String,
    pub(super) sex_words: Vec<String>,
    pub(crate) world_seed: u64,
    pub(super) lineage_names: HashMap<String, String>,
    pub(super) lineage_strategies: HashMap<String, (String, u64)>,
    #[serde(default)]
    pub(super) lineage_strategy_objectives: HashMap<String, crate::sim::simulation::StrategyObjective>,
    #[serde(default)]
    pub(super) lineage_strategy_history: Vec<crate::sim::simulation::StrategyCampaignRecord>,
    pub(super) lineage_elders: HashMap<String, String>,
    pub(super) rng: Option<ChaCha8Rng>,
    pub(super) flood_tiles: Vec<(i32, i32, u64)>,
    #[serde(default)]
    pub(super) wards: Vec<crate::sim::civ::wards::Ward>,
    #[serde(default)]
    pub(super) plantings: std::collections::BTreeMap<u32, crate::sim::tech::plantings::Planting>,
    #[serde(default)]
    pub(super) prayers: crate::sim::civ::prayers::PrayerState,
    #[serde(default)]
    pub(super) hard_winter: bool,
    #[serde(default)]
    pub(super) hard_winter_ahead: bool,
    #[serde(default)]
    pub(super) territory: HashMap<String, Vec<[i32; 2]>>,
    #[serde(default)]
    pub(super) last_immigration_tick: u64,
    #[serde(default)]
    pub(super) settlement_tiers: HashMap<String, u8>,
    #[serde(default)]
    pub(super) buildings: Vec<crate::sim::buildings::Building>,
    #[serde(default)]
    pub(super) next_building_id: u32,
    #[serde(default)]
    pub(super) governments: HashMap<String, crate::sim::government::Government>,
    #[serde(default)]
    pub(super) religions: Vec<crate::sim::culture::Religion>,
    #[serde(default)]
    pub(super) next_religion_id: u32,
    #[serde(default)]
    pub(super) artworks: Vec<crate::sim::culture::Artwork>,
    #[serde(default)]
    pub(super) next_artwork_id: u32,
    #[serde(default)]
    pub(super) festivals: Vec<crate::sim::culture::Festival>,
    #[serde(default)]
    pub(super) next_festival_id: u32,
    #[serde(default)]
    pub(super) last_witness_tick: u64,
    #[serde(default)]
    pub(super) books: Vec<crate::sim::language_tech::Book>,
    #[serde(default)]
    pub(super) next_book_id: u32,
    #[serde(default)]
    pub(super) farms: Vec<crate::sim::agriculture::Farm>,
    #[serde(default)]
    pub(super) next_farm_id: u32,
    #[serde(default)]
    pub(super) vehicles: Vec<crate::sim::transportation::Vehicle>,
    #[serde(default)]
    pub(super) next_vehicle_id: u32,
    #[serde(default)]
    pub(super) battles: Vec<crate::sim::warfare::Battle>,
    #[serde(default)]
    pub(super) next_battle_id: u32,
    #[serde(default)]
    pub(super) treaties: Vec<crate::sim::warfare::Treaty>,
    #[serde(default)]
    pub(super) outbreaks: Vec<crate::sim::medicine::Outbreak>,
    #[serde(default)]
    pub(super) milestones_achieved: HashSet<String>,
    #[serde(default)]
    pub(super) lineage_peak_pop: HashMap<String, u32>,
    #[serde(default)]
    pub(super) headlines: Vec<(u64, String)>,
    #[serde(default)]
    pub(super) trades: Vec<crate::sim::economy::Trade>,
    #[serde(default)]
    pub(super) trade_routes: Vec<crate::sim::civ::trade_routes::TradeRoute>,
    #[serde(default)]
    pub(super) caravans: Vec<crate::sim::civ::trade_routes::Caravan>,
    #[serde(default)]
    pub(super) next_trade_route_id: u32,
    #[serde(default)]
    pub(super) next_caravan_id: u32,
    #[serde(default)]
    pub(super) water_use: Vec<WaterUseSave>,
    #[serde(default)]
    pub(super) field_fortifications: Vec<crate::sim::warfare::FieldFortification>,
}
