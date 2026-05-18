use std::collections::{HashMap, HashSet};
use std::io;

use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

use crate::organism::animal::{Animal, AnimalKind};
use crate::organism::organism::Organism;
use crate::physics::engine::PhysicsEngine;
use crate::sim::simulation::{Event, History, SAVE_SCHEMA_VERSION, Simulation, StoryEntry, ThinkTrigger};
use crate::sim::world_events::{DroughtState, WeatherState};
use crate::world::grid::{HEIGHT, WIDTH, WorldGrid};
use crate::world::tiles::Tile;

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct GridSave {
    tiles:       Vec<i8>,
    fire:        Vec<f32>,
    food_trail:  Vec<f32>,
    water_trail: Vec<f32>,
    path_trail:  Vec<f32>,
    structure:   Vec<f32>,
    fertility:   Vec<f32>,
    hazard:      Vec<f32>,
    pressure:    Vec<f32>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct DroughtSave {
    active:      bool,
    start_tick:  u64,
    dried_tiles: Vec<[i32; 2]>,
    rain_relief: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct WeatherSave {
    kind:       u8,
    start_tick: u64,
    duration:   u64,
    intensity:  f32,
    #[serde(default)] wet_until: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct OrgSave {
    id: String, name: String,
    x: f32, y: f32,
    energy: f32, hydration: f32, health: f32,
    age: u32, alive: bool,
    thought: String,
    generation: u32, parent_id: String, lineage_id: String, max_age: u32,
    food_memory:   HashMap<String, f32>,
    water_memory:  HashMap<String, f32>,
    danger_memory: HashMap<String, f32>,
    thought_history:    Vec<crate::organism::organism::ThoughtEntry>,
    q_table:            HashMap<String, Vec<(u16, f32)>>,
    last_reproduced: u64, last_challenged: u64,
    water_ticks: u32,
    lineage_attitudes:  HashMap<String, f32>,
    org_trust:          HashMap<String, f32>,
    traits:      crate::organism::traits::Traits,
    infection:   f32, carrying: u32,
    carrying_type: u8,
    vocabulary:  crate::organism::vocabulary::Vocabulary,
    daily_story: String,
    last_story_tick: u64,
    life_log: Vec<String>,
    discoveries: Vec<String>,
    home_x: f32,
    home_y: f32,
    has_reflected: bool,
    last_invention_tick: u64,
    last_think_tick: u64,
    partner_id: Option<String>,
    children_count: u32,
    sex: String,
    attracted_to: Option<String>,
    attraction_tick: u64,
    pregnant: bool,
    pregnancy_start: u64,
    conversations: Vec<crate::organism::organism::ConversationEntry>,
    father_id: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct AnimalSave {
    id: usize, x: f32, y: f32, alive: bool, energy: f32,
    kind: u8,
    last_reproduced: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct NegotiationSave {
    a: String,
    b: String,
    tick: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct SaveState {
    pub(crate) version:        u32,
    pub(crate) tick_count:     u64,
    next_animal_id: usize,
    history:        History,
    drought:        DroughtSave,
    weather:        WeatherSave,
    events:         Vec<Event>,
    pub(crate) organisms:      Vec<OrgSave>,
    pub(crate) animals:        Vec<AnimalSave>,
    pub(crate) grid:           GridSave,
    story_history:  Vec<StoryEntry>,
    pop_history:    Vec<[u64; 2]>,
    lineage_centroid_history: HashMap<String, Vec<[i32; 3]>>,
    current_era:    String,
    sex_words:      Vec<String>,
    pub(crate) world_seed:     u64,
    lineage_names:  HashMap<String, String>,
    lineage_strategies: HashMap<String, (String, u64)>,
    lineage_last_council: HashMap<String, u64>,
    lineage_elders: HashMap<String, String>,
    lineage_negotiations: Vec<NegotiationSave>,
    pending_thinks: Vec<ThinkTrigger>,
    rng: Option<ChaCha8Rng>,
    flood_tiles: Vec<(i32, i32, u64)>,
}

fn mem_encode(m: &HashMap<(i32,i32), f32>) -> HashMap<String, f32> {
    m.iter().map(|(&(x,y), &v)| (format!("{},{}", x, y), v)).collect()
}

fn mem_decode(m: HashMap<String, f32>) -> HashMap<(i32,i32), f32> {
    m.into_iter().filter_map(|(k, v)| {
        let mut parts = k.splitn(2, ',');
        let x = parts.next()?.parse::<i32>().ok()?;
        let y = parts.next()?.parse::<i32>().ok()?;
        Some(((x, y), v))
    }).collect()
}

fn org_to_save(o: &Organism) -> OrgSave {
    OrgSave {
        id: o.id.clone(), name: o.name.clone(),
        x: o.x, y: o.y,
        energy: o.energy, hydration: o.hydration, health: o.health,
        age: o.age, alive: o.alive,
        thought: o.thought.clone(),
        generation: o.generation, parent_id: o.parent_id.clone(),
        lineage_id: o.lineage_id.clone(), max_age: o.max_age,
        food_memory:   mem_encode(&o.food_memory),
        water_memory:  mem_encode(&o.water_memory),
        danger_memory: mem_encode(&o.danger_memory),
        thought_history:   o.thought_history.iter().cloned().collect(),
        q_table:           o.q_table.clone(),
        last_reproduced:   o.last_reproduced, last_challenged: o.last_challenged,
        water_ticks:       o.water_ticks,
        lineage_attitudes: o.lineage_attitudes.clone(),
        org_trust:         o.org_trust.clone(),
        traits:      o.traits.clone(),
        infection:   o.infection, carrying: o.carrying,
        carrying_type: o.carrying_type,
        vocabulary:  o.vocabulary.clone(),
        daily_story: o.daily_story.clone(),
        last_story_tick: o.last_story_tick,
        life_log: o.life_log.iter().cloned().collect(),
        discoveries: o.discoveries.iter().cloned().collect(),
        home_x: o.home_x,
        home_y: o.home_y,
        has_reflected:       o.has_reflected,
        last_invention_tick: o.last_invention_tick,
        last_think_tick:     o.last_think_tick,
        partner_id:          o.partner_id.clone(),
        children_count:      o.children_count,
        sex:                 o.sex.as_str().to_string(),
        attracted_to:        o.attracted_to.clone(),
        attraction_tick:     o.attraction_tick,
        pregnant:            o.pregnant,
        pregnancy_start:     o.pregnancy_start,
        conversations:       o.conversations.iter().cloned().collect(),
        father_id:           o.father_id.clone(),
    }
}

fn org_from_save(s: OrgSave) -> Organism {
    let vocab_seed = {
        let lid_seed = s.lineage_id.bytes().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let id_seed  = s.id.bytes().fold(0u64, |a, b| a.wrapping_add(b as u64));
        lid_seed ^ id_seed
    };
    let needs_vocab = s.vocabulary.words.is_empty();
    let saved_vocab = s.vocabulary;
    let mut o = Organism::new(
        s.id, s.name, s.x, s.y,
        s.generation, s.parent_id, s.lineage_id,
        s.max_age, s.traits,
    );
    o.energy    = s.energy;
    o.hydration = s.hydration;
    o.health    = s.health;
    o.age       = s.age;
    o.alive     = s.alive;
    o.thought   = s.thought;
    o.food_memory   = mem_decode(s.food_memory);
    o.water_memory  = mem_decode(s.water_memory);
    o.danger_memory = mem_decode(s.danger_memory);
    o.thought_history    = s.thought_history.into_iter().collect();
    o.q_table            = s.q_table;
    o.last_reproduced    = s.last_reproduced;
    o.last_challenged    = s.last_challenged;
    o.water_ticks        = s.water_ticks;
    o.lineage_attitudes  = s.lineage_attitudes;
    o.org_trust          = s.org_trust;
    o.infection       = s.infection;
    o.carrying        = s.carrying;
    o.carrying_type   = s.carrying_type;
    o.daily_story     = s.daily_story;
    o.last_story_tick = s.last_story_tick;
    o.life_log        = s.life_log.into_iter().collect();
    o.discoveries     = s.discoveries.into_iter().collect();
    if s.home_x != 0.0 || s.home_y != 0.0 {
        o.home_x = s.home_x;
        o.home_y = s.home_y;
    }
    o.has_reflected       = s.has_reflected;
    o.last_invention_tick = s.last_invention_tick;
    o.last_think_tick     = s.last_think_tick;
    o.partner_id          = s.partner_id;
    o.children_count      = s.children_count;
    o.sex                 = crate::organism::organism::Sex::from_str(&s.sex);
    o.attracted_to        = s.attracted_to;
    o.attraction_tick     = s.attraction_tick;
    o.pregnant            = s.pregnant;
    o.pregnancy_start     = s.pregnancy_start;
    o.conversations       = s.conversations.into_iter().collect();
    o.father_id           = s.father_id;
    if needs_vocab {
        let mut voc_rng = rand::rngs::SmallRng::seed_from_u64(vocab_seed);
        o.vocabulary = crate::organism::vocabulary::Vocabulary::generate(&mut voc_rng);
    } else {
        o.vocabulary = saved_vocab;
    }
    o
}

fn animal_to_save(a: &Animal) -> AnimalSave {
    let kind = match a.kind {
        AnimalKind::Rabbit => 0,
        AnimalKind::Deer   => 1,
        AnimalKind::Boar   => 2,
        AnimalKind::Bird   => 3,
        AnimalKind::Fish   => 4,
        AnimalKind::Wolf   => 5,
        AnimalKind::Dog    => 6,
    };
    AnimalSave { id: a.id, x: a.x, y: a.y, alive: a.alive, energy: a.energy, kind, last_reproduced: a.last_reproduced }
}

fn animal_from_save(s: AnimalSave) -> Animal {
    let kind = match s.kind {
        0 => AnimalKind::Rabbit,
        1 => AnimalKind::Deer,
        2 => AnimalKind::Boar,
        3 => AnimalKind::Bird,
        4 => AnimalKind::Fish,
        5 => AnimalKind::Wolf,
        6 => AnimalKind::Dog,
        _ => AnimalKind::Rabbit,
    };
    let mut a = Animal::new(s.id, s.x, s.y, kind);
    a.alive           = s.alive;
    a.energy          = s.energy;
    a.last_reproduced = s.last_reproduced;
    a
}

impl Simulation {
    pub fn save(&self, path: &str) {
        if let Err(e) = self.save_result(path) {
            eprintln!("[save] failed to write {}: {}", path, e);
        }
    }

    pub fn save_result(&self, path: &str) -> io::Result<()> {
        let state = SaveState {
            version:        SAVE_SCHEMA_VERSION,
            tick_count:     self.tick_count,
            next_animal_id: self.next_animal_id,
            history:        self.history.clone(),
            drought: DroughtSave {
                active:      self.drought.active,
                start_tick:  self.drought.start_tick,
                dried_tiles: self.drought.dried_tiles.iter().map(|&(x,y)| [x,y]).collect(),
                rain_relief: self.drought.rain_relief,
            },
            weather: WeatherSave {
                kind:       self.weather.kind,
                start_tick: self.weather.start_tick,
                duration:   self.weather.duration,
                intensity:  self.weather.intensity,
                wet_until:  self.weather.wet_until,
            },
            pop_history:   self.pop_history.iter().cloned().collect(),
            lineage_centroid_history: self.lineage_centroid_history.iter()
                .map(|(k, v)| (k.clone(), v.iter().cloned().collect()))
                .collect(),
            events:    self.events.iter().cloned().collect(),
            organisms:     self.organisms.iter().map(org_to_save).collect(),
            animals:       self.animals.iter().map(animal_to_save).collect(),
            story_history: self.story_history.iter().cloned().collect(),
            grid: GridSave {
                tiles:       self.grid.tiles.clone(),
                fire:        self.grid.fire_intensity.clone(),
                food_trail:  self.grid.food_trail.clone(),
                water_trail: self.grid.water_trail.clone(),
                path_trail:  self.grid.path_trail.clone(),
                structure:   self.grid.structure.clone(),
                fertility:   self.grid.fertility.clone(),
                hazard:      self.grid.hazard.clone(),
                pressure:    self.grid.pressure.clone(),
            },
            current_era:    self.current_era.clone(),
            sex_words:      self.sex_words.to_vec(),
            world_seed:     self.world_seed,
            lineage_names:  self.lineage_names.clone(),
            lineage_strategies: self.lineage_strategies.clone(),
            lineage_last_council: self.lineage_last_council.clone(),
            lineage_elders: self.lineage_elders.clone(),
            lineage_negotiations: self.lineage_negotiations.iter()
                .map(|((a, b), &tick)| NegotiationSave { a: a.clone(), b: b.clone(), tick })
                .collect(),
            pending_thinks: self.pending_thinks.clone(),
            rng: Some(self.rng.clone()),
            flood_tiles: self.flood_tiles.clone(),
        };
        let json = serde_json::to_string(&state)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let tmp_path = format!("{}.tmp", path);

        {
            use std::io::Write;
            let mut f = std::fs::File::create(&tmp_path)?;
            f.write_all(json.as_bytes())?;
            f.sync_all()?;
        }
        std::fs::rename(&tmp_path, path)?;
        if let Some(parent) = std::path::Path::new(path).parent() {
            let dir = if parent.as_os_str().is_empty() { std::path::Path::new(".") } else { parent };
            if let Ok(d) = std::fs::File::open(dir) {
                let _ = d.sync_all();
            }
        }
        Ok(())
    }

    pub fn load_or_new(seed: u64, path: &str) -> Self {
        match std::fs::read_to_string(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                println!("No save at {} - starting fresh world", path);
                Self::new(seed)
            }
            Err(e) => {
                eprintln!("Save at {} unreadable ({}) - starting fresh world", path, e);
                Self::new(seed)
            }
            Ok(data) => match serde_json::from_str::<SaveState>(&data) {
                Ok(state) => {
                    println!("Loaded world from {} (tick {})", path, state.tick_count);
                    let terrain_seed = if state.world_seed > 0 { state.world_seed } else { seed };
                    Self::from_save(terrain_seed, state)
                }
                Err(e) => {
                    eprintln!(
                        "Save at {} could not be deserialized ({}) - starting fresh world. \
                         If this happened during a deploy, that's a bug: every save struct \
                         should tolerate unknown/missing fields.",
                        path, e
                    );
                    Self::new(seed)
                }
            },
        }
    }

    fn from_save(seed: u64, state: SaveState) -> Self {
        let expected = WIDTH * HEIGHT;
        let mut grid = WorldGrid::new(seed);
        if state.grid.tiles.len() == expected {
            grid.tiles          = state.grid.tiles;
            grid.fire_intensity = state.grid.fire;
            grid.food_trail     = state.grid.food_trail;
            grid.water_trail    = state.grid.water_trail;
            grid.path_trail     = state.grid.path_trail;
            if !state.grid.structure.is_empty() && state.grid.structure.len() == expected {
                grid.structure = state.grid.structure;
            }
            if !state.grid.fertility.is_empty() && state.grid.fertility.len() == expected {
                grid.fertility = state.grid.fertility;
            }
            if !state.grid.hazard.is_empty() && state.grid.hazard.len() == expected {
                grid.hazard = state.grid.hazard;
            }
            if !state.grid.pressure.is_empty() && state.grid.pressure.len() == expected {
                grid.pressure = state.grid.pressure;
            }
        } else {
            println!("Save grid size mismatch (got {}, need {}) - regenerating world", state.grid.tiles.len(), expected);
        }

        let drought = DroughtState {
            active:      state.drought.active,
            start_tick:  state.drought.start_tick,
            dried_tiles: state.drought.dried_tiles.into_iter().map(|[x,y]| (x,y)).collect(),
            rain_relief: state.drought.rain_relief,
        };

        let tick = state.tick_count;
        let is_legacy_save = state.rng.is_none();
        let mut organisms: Vec<_> = state.organisms.into_iter().map(org_from_save).collect();
        {
            use rand::Rng;
            let mut rng = rand::rngs::SmallRng::seed_from_u64(seed ^ tick ^ 0xdeadbeef);
            for org in &mut organisms {
                if is_legacy_save {
                    if tick.saturating_sub(org.last_think_tick) >= 4000 {
                        org.last_think_tick = tick - rng.gen_range(0..4000);
                    }
                    if tick.saturating_sub(org.last_invention_tick) >= 5000 {
                        org.last_invention_tick = tick - rng.gen_range(0..5000);
                    }
                }
                org.x = org.x.clamp(1.0, WIDTH as f32 - 2.0);
                org.y = org.y.clamp(1.0, HEIGHT as f32 - 2.0);
            }
        }

        let active_structure_tiles: HashSet<(i32, i32)> = {
            let mut hs = HashSet::new();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    if grid.structure_at(x, y) > 0.0 { hs.insert((x, y)); }
                }
            }
            hs
        };
        let mut physics = PhysicsEngine::new();
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if matches!(grid.get(x, y), Tile::Fire | Tile::Campfire) {
                    physics.register_fire(x, y);
                }
            }
        }

        Simulation {
            grid,
            physics,
            organisms,
            animals:              state.animals.into_iter().map(animal_from_save).collect(),
            tick_count:           state.tick_count,
            events:               state.events.into_iter().collect(),
            history:              state.history,
            drought,
            weather: WeatherState {
                kind:       state.weather.kind,
                start_tick: state.weather.start_tick,
                duration:   state.weather.duration,
                intensity:  state.weather.intensity,
                wet_until:  state.weather.wet_until,
            },
            flood_tiles:            state.flood_tiles,
            story_history:          state.story_history.into_iter().collect(),
            pending_thinks:         state.pending_thinks,
            lineage_strategies:     state.lineage_strategies,
            lineage_last_council:   state.lineage_last_council,
            lineage_elders:         state.lineage_elders,
            lineage_negotiations:   state.lineage_negotiations.into_iter()
                .map(|n| {
                    let key = if n.a < n.b { (n.a, n.b) } else { (n.b, n.a) };
                    (key, n.tick)
                })
                .collect(),
            pop_history:            state.pop_history.into_iter().collect(),
            lineage_centroid_history: state.lineage_centroid_history.into_iter()
                .map(|(k, v)| (k, v.into_iter().collect()))
                .collect(),
            current_era:            if state.current_era.is_empty() { "genesis".to_string() } else { state.current_era },
            sex_words: {
                if state.sex_words.len() >= 2 {
                    [state.sex_words[0].clone(), state.sex_words[1].clone()]
                } else {
                    use crate::organism::vocabulary::gen_phoneme_word;
                    let mut word_rng = rand::rngs::SmallRng::seed_from_u64(seed.wrapping_add(0xc0ffee));
                    let w0 = gen_phoneme_word(&mut word_rng);
                    let mut w1 = gen_phoneme_word(&mut word_rng);
                    while w1 == w0 { w1 = gen_phoneme_word(&mut word_rng); }
                    [w0, w1]
                }
            },
            world_seed:             seed,
            next_animal_id:         state.next_animal_id,
            lineage_names:          state.lineage_names,
            rng:                    state.rng.unwrap_or_else(|| ChaCha8Rng::seed_from_u64(seed ^ state.tick_count)),
            last_immigration_tick:   0,
            cached_tribal_relations: serde_json::Value::Array(vec![]),
            cached_lineage_sizes:    serde_json::Value::Array(vec![]),
            slow_compute_tick:       0,
            active_structure_tiles,
            settlement_tiers:        std::collections::HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_save_json_loads_as_default_state() {
        let parsed: SaveState = serde_json::from_str("{}")
            .expect("empty {} JSON must deserialize - did a Save struct lose its serde(default)?");
        assert_eq!(parsed.tick_count, 0);
        assert!(parsed.organisms.is_empty());
        assert!(parsed.animals.is_empty());
        assert!(parsed.grid.tiles.is_empty());

        let mut path = std::env::temp_dir();
        path.push(format!("thehumanbox-empty-save-test-{}.json", std::process::id()));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        std::fs::write(&path_s, "{}").unwrap();
        let _sim = Simulation::load_or_new(7, &path_s);
        let _ = std::fs::remove_file(&path_s);
    }
}
