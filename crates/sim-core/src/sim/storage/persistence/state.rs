use super::*;

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct GridSave {
    pub(super) tiles: Vec<i8>,
    /// Keep the terrain of migrated worlds instead of regenerating a larger map on reload.
    #[serde(default, skip_serializing_if = "Vec::is_empty", with = "packed::f32s")]
    pub(super) elevation: Vec<f32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty", with = "packed::f32s")]
    pub(super) temperature: Vec<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) volcanoes: Option<Vec<crate::world::grid::Volcano>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) pool_centers: Option<Vec<(i32, i32)>>,
    /// Water depth changes at runtime as droughts, floods, and completed
    /// infrastructure reshape the map, so it cannot be regenerated from the
    /// world seed on load.
    #[serde(with = "packed::f32s")]
    pub(super) depth: Vec<f32>,
    /// Biomes are rewritten at runtime by the world-evolution pass (forest
    /// clearing for farmland, grassland desertifying during droughts, rivers
    /// and wetlands forming). Regenerating them from the seed on load threw
    /// all of that away and, because fertility regrowth is capped per biome,
    /// re-capped recovered tiles to their pre-evolution biome's ceiling.
    #[serde(with = "packed::u8s")]
    pub(super) biome: Vec<u8>,
    #[serde(with = "packed::f32s")]
    pub(super) fire: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) food_trail: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) water_trail: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) path_trail: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) structure: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) fertility: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) hazard: Vec<f32>,
    #[serde(with = "packed::f32s")]
    pub(super) pressure: Vec<f32>,
    /// Road kinds per cell (`ROAD_*`). Saves from before roads load with none.
    #[serde(default, with = "packed::u8s")]
    pub(super) road: Vec<u8>,
    /// Volcanoes raised with the god tool; world generation's own come back from the seed.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) placed_volcanoes: Vec<crate::world::grid::Volcano>,
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
    #[serde(default)]
    pub(super) heat_until: u64,
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
            heat_until: 0,
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

pub struct SaveWriter {
    rest: Option<SaveState>,
    keys: Vec<String>,
    head: Vec<u8>,
    body: Vec<u8>,
    tail: Vec<u8>,
    organisms: std::vec::IntoIter<OrgSave>,
    writing: compact::q_table::Writing,
}

impl SaveWriter {
    pub fn write(&mut self, count: usize) -> bool {
        if let Some(rest) = self.rest.take() {
            self.write_rest(rest);
            return self.organisms.len() == 0;
        }
        let body = &mut self.body;
        let organisms = &mut self.organisms;
        self.writing.run(|| {
            for org in organisms.by_ref().take(count) {
                rmp_serde::encode::write_named(body, &org).expect("a save state always encodes");
            }
        });
        self.organisms.len() == 0
    }

    fn write_rest(&mut self, mut rest: SaveState) {
        let keys = std::mem::take(&mut self.keys);
        self.writing = compact::q_table::Writing::new(&keys, false);
        let mut out = compact::MAGIC.to_vec();
        self.writing.run(|| {
            rmp_serde::encode::write_named(&mut out, &(&keys, &rest)).expect("a save state always encodes");
        });
        let marker = b"\xa9organisms\x90";
        let mut found = out.windows(marker.len()).enumerate().filter(|(_, w)| w == marker);
        let Some(at) = (match (found.next(), found.next()) {
            (Some((at, _)), None) => Some(at + marker.len() - 1),
            _ => None,
        }) else {
            rest.organisms = std::mem::take(&mut self.organisms).collect();
            self.head = rest.to_bytes();
            return;
        };
        self.tail = out.split_off(at + 1);
        out.truncate(at);
        self.head = out;
        let n = self.organisms.len();
        match u32::try_from(n) {
            Ok(n) if n < 16 => self.body.push(0x90 | n as u8),
            Ok(n) if n <= u32::from(u16::MAX) => {
                self.body.push(0xdc);
                self.body.extend_from_slice(&(n as u16).to_be_bytes());
            }
            _ => {
                self.body.push(0xdd);
                self.body.extend_from_slice(&(n as u32).to_be_bytes());
            }
        }
    }

    pub fn finish(mut self) -> Vec<u8> {
        while !self.write(usize::MAX) {}
        let mut out = self.head;
        out.reserve(self.body.len() + self.tail.len());
        out.extend_from_slice(&self.body);
        out.extend_from_slice(&self.tail);
        out
    }
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
    /// Wary game by patch of land: (patch x, patch y, wariness), sorted.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) game_wariness: Vec<(i32, i32, f32)>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) focus_points: Vec<(i32, i32, u64)>,
    #[serde(default)]
    pub(crate) carcasses: Vec<CarcassSave>,
    pub(crate) grid: GridSave,
    pub(super) story_history: Vec<StoryEntry>,
    pub(super) pop_history: Vec<[u64; 2]>,
    pub(super) lineage_centroid_history: HashMap<String, Vec<[i32; 3]>>,
    #[serde(default)]
    pub(super) lineage_homes: HashMap<String, [i32; 3]>,
    #[serde(default)]
    pub(super) lineage_eras: HashMap<crate::intern::Sym, crate::sim::era::Era>,
    #[serde(default)]
    pub(super) lineage_generations_reached: HashMap<String, u32>,
    #[serde(default)]
    pub(super) lineage_unrest: HashMap<String, f32>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub(super) lineage_winter_memory: HashMap<String, crate::sim::civ::society::hard_winters::WinterMemory>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub(super) lineage_war_weariness: HashMap<String, crate::sim::civ::society::war_weariness::WarWeariness>,
    #[serde(default)]
    pub(super) lineage_crime: HashMap<String, crate::sim::civ::society::crime::CrimeTally>,
    #[serde(default)]
    pub(super) goals: crate::sim::goals::GoalBook,
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
    pub(super) fallout: Vec<crate::sim::world_events::Fallout>,
    /// The recent dead the revive tool may still raise.
    #[serde(default)]
    pub(super) fallen: std::collections::VecDeque<(String, u64)>,
    #[serde(default)]
    pub(super) plantings: std::collections::BTreeMap<u32, crate::sim::tech::plantings::Planting>,
    #[serde(default)]
    pub(super) prayers: crate::sim::civ::prayers::PrayerState,
    #[serde(default)]
    pub(super) hard_winter: bool,
    #[serde(default)]
    pub(super) hard_winter_ahead: bool,
    #[serde(default)]
    pub(super) territory: HashMap<crate::intern::Sym, Vec<[i32; 2]>>,
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
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub(super) trade_income: std::collections::BTreeMap<String, u64>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub(super) trade_barter: std::collections::BTreeMap<String, u64>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub(super) specialties: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub(super) water_use: Vec<WaterUseSave>,
    #[serde(default)]
    pub(super) field_fortifications: Vec<crate::sim::warfare::FieldFortification>,
    #[serde(default)]
    pub(super) village_roads: Vec<crate::sim::civ::land::village_roads::VillageRoad>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) rail_lines: Vec<crate::sim::tech::railways::RailLine>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) rail_remnants: Vec<crate::sim::tech::networks::RailRemnant>,
    #[serde(
        default,
        skip_serializing_if = "crate::sim::civ::land::road_net::RoadNet::is_empty"
    )]
    pub(super) road_net: crate::sim::civ::land::road_net::RoadNet,
    #[serde(
        default,
        skip_serializing_if = "crate::sim::civ::land::land_memory::LandMemory::is_empty"
    )]
    pub(super) land: crate::sim::civ::land::land_memory::LandMemory,
    #[serde(
        default,
        skip_serializing_if = "crate::sim::civ::society::diplomacy::Diplomacy::is_empty"
    )]
    pub(super) diplomacy: crate::sim::civ::society::diplomacy::Diplomacy,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) cart_grain: Vec<crate::sim::civ::land::village_carts::CartGrain>,
    #[serde(default, alias = "town_plazas")]
    pub(super) towns: Vec<crate::sim::civ::civ_tick::town::Town>,
    #[serde(default)]
    pub(super) next_town_id: u32,
    #[serde(
        default,
        skip_serializing_if = "crate::sim::command::world_mods::WorldMods::is_empty"
    )]
    pub(super) world_mods: crate::sim::command::world_mods::WorldMods,
}

impl SaveState {
    pub fn to_bytes(&self) -> Vec<u8> {
        self.encode(compact::MAGIC, false)
    }

    #[cfg(test)]
    pub(crate) fn to_bytes_v1(&self) -> Vec<u8> {
        self.encode(compact::MAGIC_V1, true)
    }

    fn q_keys(&self) -> Vec<String> {
        let mut seen = crate::hashing::FxHashSet::default();
        let mut keys: Vec<String> = Vec::new();
        for o in &self.organisms {
            for key in o.q_table.keys() {
                if seen.insert(key.as_str()) {
                    keys.push(key.clone());
                }
            }
        }
        keys
    }

    fn encode(&self, magic: &[u8; 8], wide: bool) -> Vec<u8> {
        let keys = self.q_keys();
        let mut out = magic.to_vec();
        compact::q_table::writing_with(&keys, wide, || {
            rmp_serde::encode::write_named(&mut out, &(&keys, self)).expect("a save state always encodes");
        });
        out
    }

    pub fn into_writer(mut self) -> SaveWriter {
        let keys = self.q_keys();
        let organisms = std::mem::take(&mut self.organisms);
        SaveWriter {
            rest: Some(self),
            writing: compact::q_table::Writing::new(&[], false),
            keys,
            head: Vec::new(),
            body: Vec::new(),
            tail: Vec::new(),
            organisms: organisms.into_iter(),
        }
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        let (body, wide) = if let Some(body) = bytes.strip_prefix(compact::MAGIC.as_slice()) {
            (body, false)
        } else if let Some(body) = bytes.strip_prefix(compact::MAGIC_V1.as_slice()) {
            (body, true)
        } else {
            return serde_json::from_slice(bytes).map_err(|err| err.to_string());
        };
        WIDE.with(|w| w.set(wide));
        let out = rmp_serde::from_slice::<Compact>(body).map(|c| c.0);
        compact::q_table::reading_done();
        out.map_err(|err| err.to_string())
    }
}

thread_local! {
    static WIDE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

struct Compact(SaveState);

impl<'de> Deserialize<'de> for Compact {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> serde::de::Visitor<'de> for V {
            type Value = Compact;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("the q_table keys, then the world")
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut seq: A) -> Result<Compact, A::Error> {
                let keys: Vec<String> = seq
                    .next_element()?
                    .ok_or_else(|| serde::de::Error::custom("a compact save has no q_table keys"))?;
                compact::q_table::reading_with(keys, WIDE.with(std::cell::Cell::get));
                let state: SaveState = seq
                    .next_element()?
                    .ok_or_else(|| serde::de::Error::custom("a compact save has no world"))?;
                Ok(Compact(state))
            }
        }
        deserializer.deserialize_seq(V)
    }
}
