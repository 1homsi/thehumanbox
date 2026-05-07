use std::collections::HashMap;
use rand::Rng;
use serde::Serialize;
use super::traits::Traits;
use super::vocabulary::Vocabulary;
use crate::world::{grid::{WorldGrid, TrailKind}, tiles::Tile};

pub const N_ACTIONS: usize = 17;

pub const DIRECTIONS: [(i32, i32); 8] =
    [(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)];

const CONSONANTS: &[u8] = b"bdfghjklmnprstvwz";
const VOWELS:     &[u8] = b"aeiou";

pub fn generate_name(rng: &mut impl Rng) -> String {
    let syllables = rng.gen_range(2..=3);
    let mut s = String::new();
    for _ in 0..syllables {
        s.push(CONSONANTS[rng.gen_range(0..CONSONANTS.len())] as char);
        s.push(VOWELS[rng.gen_range(0..VOWELS.len())] as char);
    }
    let mut c = s.chars();
    match c.next() {
        None => s,
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

fn dir_char(dx: i32, dy: i32) -> char {
    if dx == 0 && dy == 0 { return 'O'; }
    if dx.abs() >= dy.abs() { if dx > 0 { 'E' } else { 'W' } }
    else                    { if dy > 0 { 'S' } else { 'N' } }
}

#[derive(Clone, Serialize, serde::Deserialize)]
pub struct ThoughtEntry {
    pub tick: u64,
    pub text: String,
}

pub struct Organism {
    pub id:          String,
    pub name:        String,
    pub x:           f32,
    pub y:           f32,
    pub energy:      f32,
    pub hydration:   f32,
    pub health:      f32,
    pub age:         u32,
    pub alive:       bool,
    pub thought:     String,
    pub generation:  u32,
    pub parent_id:   String,
    pub lineage_id:  String,
    pub max_age:     u32,

    pub food_memory:   HashMap<(i32,i32), f32>,
    pub water_memory:  HashMap<(i32,i32), f32>,
    pub danger_memory: HashMap<(i32,i32), f32>,

    pub thought_history: Vec<ThoughtEntry>,

    pub q_table: HashMap<String, Vec<f32>>,

    pub last_reproduced: u64,
    pub last_challenged: u64,

    pub lineage_attitudes: HashMap<String, f32>,
    pub org_trust:         HashMap<String, f32>,

    pub traits:         Traits,
    pub infection:      f32,
    pub carrying:       u32,
    pub carrying_type:  u8,   // 0=none, 1=wood, 2=stone

    pub vocabulary:    Vocabulary,
    pub daily_story:   String,
    pub last_story_tick: u64,
    pub life_log:      Vec<String>,
    pub discoveries:   Vec<String>,  // "fire", "shelter", "parent"

    pub home_x: f32,
    pub home_y: f32,

    pub is_elder:            bool,
    pub has_reflected:       bool,
    pub last_invention_tick: u64,

    pub directive:       String,
    pub directive_until: u64,
    pub last_think_tick: u64,

    // Inner emotional/psychological state
    pub loneliness:  f32,  // 0=social  1=isolated
    pub boredom:     f32,  // 0=engaged 1=purposeless
    pub fear_level:  f32,  // 0=calm    1=terrified
    pub comfort:     f32,  // 0=miserable 1=content

    // Behavioral state (transient — not persisted in saves, resets on load)
    pub grief_ticks:    u32,           // countdown of active mourning
    pub sleep_debt:     f32,           // 0=rested 1=exhausted
    pub area_ticks:     u32,           // ticks in same 10×10 region
    pub last_area_cell: (i32, i32),    // current region cell for wanderlust
    pub wander_target:  Option<(i32, i32)>, // active wander destination
    pub last_groomed:   u64,           // tick of last grooming interaction
    pub last_fed_kin:   u64,           // tick of last food shared with kin
}

impl Organism {
    pub fn new(
        id: String, name: String,
        x: f32, y: f32,
        generation: u32, parent_id: String, lineage_id: String,
        max_age: u32, traits: Traits,
    ) -> Self {
        Organism {
            id, name, x, y,
            energy: 1.0, hydration: 1.0, health: 1.0,
            age: 0, alive: true,
            thought: "observing".to_string(),
            generation, parent_id, lineage_id, max_age,
            food_memory:   HashMap::new(),
            water_memory:  HashMap::new(),
            danger_memory: HashMap::new(),
            thought_history: Vec::new(),
            q_table: HashMap::new(),
            last_reproduced: 0,
            last_challenged: 0,
            lineage_attitudes: HashMap::new(),
            org_trust: HashMap::new(),
            traits, infection: 0.0,
            carrying: 0,
            carrying_type: 0,
            vocabulary: Vocabulary { words: std::collections::HashMap::new() },
            daily_story: String::new(),
            last_story_tick: 0,
            life_log: Vec::new(),
            discoveries: Vec::new(),
            home_x: x,
            home_y: y,
            is_elder: false,
            has_reflected: false,
            last_invention_tick: 0,
            directive: String::new(),
            directive_until: 0,
            last_think_tick: 0,
            loneliness:  0.0,
            boredom:     0.0,
            fear_level:  0.0,
            comfort:     0.5,
            grief_ticks:    0,
            sleep_debt:     0.0,
            area_ticks:     0,
            last_area_cell: (x as i32, y as i32),
            wander_target:  None,
            last_groomed:   0,
            last_fed_kin:   0,
        }
    }

    pub fn discover(&mut self, what: &str) -> bool {
        if !self.discoveries.contains(&what.to_string()) {
            self.discoveries.push(what.to_string());
            true
        } else {
            false
        }
    }

    pub fn log_event(&mut self, event: String) {
        self.life_log.push(event);
        if self.life_log.len() > 24 {
            self.life_log.remove(0);
        }
    }

    // ── Memory ────────────────────────────────────────────────────────────────

    pub fn remember(mem: &mut HashMap<(i32,i32), f32>, x: i32, y: i32,
                    strength: f32, mem_trait: f32) {
        let effective = (strength * (0.7 + 0.6 * mem_trait)).min(1.0);
        let v = mem.entry((x, y)).or_insert(0.0);
        *v = (*v + effective).min(1.0);
    }

    pub fn update_attitude(&mut self, other_lid: &str, delta: f32) {
        if other_lid == self.lineage_id { return; }
        let v = self.lineage_attitudes.entry(other_lid.to_string()).or_insert(0.0);
        *v = (*v + delta).max(-1.0).min(1.0);
    }

    // Called every tick with precomputed context (avoids borrow conflicts with &[Organism]).
    pub fn tick_inner_state(&mut self, kin_near: usize, near_shelter: bool,
                            hostile_near: bool, weather_kind: u8, tick: u64, night: bool) {
        // Loneliness: drifts up alone, drops with kin contact
        if kin_near == 0 {
            self.loneliness = (self.loneliness + 0.0008).min(1.0);
        } else {
            self.loneliness = (self.loneliness - kin_near as f32 * 0.012).max(0.0);
        }

        // Boredom: grows only when needs are fully met and no threat
        if self.energy > 0.75 && self.hydration > 0.75 && !hostile_near {
            self.boredom = (self.boredom + 0.0004).min(1.0);
        } else {
            self.boredom = (self.boredom - 0.004).max(0.0);
        }

        // Fear: spikes with enemies or crisis, bleeds off slowly
        if hostile_near {
            self.fear_level = (self.fear_level + 0.05).min(1.0);
        } else {
            self.fear_level = (self.fear_level - 0.006).max(0.0);
        }
        if self.energy < 0.2 || self.hydration < 0.2 {
            self.fear_level = (self.fear_level + 0.015).min(1.0);
        }
        // Low health → fear spike (injury fear)
        if self.health < 0.3 {
            self.fear_level = (self.fear_level + 0.008).min(1.0);
        }

        // Grief: countdown — fear persists while mourning
        if self.grief_ticks > 0 {
            self.grief_ticks = self.grief_ticks.saturating_sub(1);
            self.fear_level = (self.fear_level + 0.004).min(1.0);
        }

        // Sleep debt: builds at night without shelter, clears with rest
        if night && !near_shelter {
            self.sleep_debt = (self.sleep_debt + 0.0012).min(1.0);
        } else if near_shelter {
            self.sleep_debt = (self.sleep_debt - 0.005).max(0.0);
        } else {
            self.sleep_debt = (self.sleep_debt - 0.001).max(0.0);
        }
        // Exhaustion drains energy
        if self.sleep_debt > 0.5 {
            self.energy = (self.energy - 0.0003 * self.sleep_debt).max(0.0);
        }

        // Wanderlust: track time in same 10×10 region, eventually set a wander target
        let cell = (self.x as i32 / 10, self.y as i32 / 10);
        if cell == self.last_area_cell {
            self.area_ticks = self.area_ticks.saturating_add(1);
            // Set wander target when stuck in same region and bored + healthy enough
            if self.area_ticks > 400 && self.boredom > 0.60
               && self.wander_target.is_none()
               && self.energy > 0.55 && self.hydration > 0.55
            {
                let hash = self.id.bytes().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
                let angle = ((hash ^ tick) as f32) * 0.0000014;
                let dist  = 20.0 + self.boredom * 25.0;
                let tx = (self.x + angle.sin() * dist).round() as i32;
                let ty = (self.y + angle.cos() * dist).round() as i32;
                self.wander_target = Some((tx.max(5).min(195), ty.max(5).min(95)));
            }
        } else {
            self.last_area_cell = cell;
            self.area_ticks     = 0;
            // Clear wander target once we've entered a new region
            if let Some(wt) = self.wander_target {
                if (wt.0 - self.x as i32).abs() + (wt.1 - self.y as i32).abs() < 12 {
                    self.wander_target = None;
                }
            }
        }

        // Comfort: composite feel-good — shelter and kin improve it, rain and fear drag it down
        let shelter_bonus = if near_shelter { 0.25 } else { 0.0 };
        let wet_penalty   = if weather_kind >= 2 && !near_shelter { 0.2 }
                            else if weather_kind == 1 && !near_shelter { 0.08 }
                            else { 0.0 };
        self.comfort = ((self.energy + self.hydration + self.health
            + (1.0 - self.loneliness) * 0.5
            + shelter_bonus - wet_penalty
            - self.fear_level * 0.3
            - self.sleep_debt * 0.15) / 4.0).clamp(0.0, 1.0);

        // Passive thought — only overrides if organism isn't mid-action
        let passive = matches!(self.thought.as_str(),
            "observing"|"exploring"|"satisfied"|"at peace"|"restless"|"feeling alone"|
            "terrified"|"mourning kin"|"exhausted"|"wandering");
        if passive {
            if self.grief_ticks > 20 {
                self.think("mourning kin", tick);
            } else if self.sleep_debt > 0.55 {
                self.think("exhausted", tick);
            } else if self.fear_level > 0.65 {
                self.think("terrified", tick);
            } else if self.loneliness > 0.75 {
                self.think("feeling alone", tick);
            } else if self.boredom > 0.65 {
                self.think("restless", tick);
            } else if self.comfort > 0.82 {
                self.think("at peace", tick);
            }
        }
    }

    pub fn attitude_toward(&self, other_lid: &str) -> f32 {
        if other_lid == self.lineage_id { return 1.0; }
        *self.lineage_attitudes.get(other_lid).unwrap_or(&0.0)
    }

    pub fn decay_memory(&mut self) {
        for mem in [&mut self.food_memory, &mut self.water_memory, &mut self.danger_memory] {
            mem.retain(|_, v| { *v *= 0.995; *v >= 0.04 });
        }
        // Cap memories to keep RAM bounded
        fn trim_mem(mem: &mut HashMap<(i32,i32), f32>, max: usize) {
            if mem.len() > max {
                let mut e: Vec<_> = mem.iter().map(|(k,v)| (*k, *v)).collect();
                e.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
                for (k, _) in &e[..e.len() - max] { mem.remove(k); }
            }
        }
        trim_mem(&mut self.food_memory,   100);
        trim_mem(&mut self.water_memory,   50);
        trim_mem(&mut self.danger_memory,  30);
        self.lineage_attitudes.retain(|_, v| { *v *= 0.998; v.abs() >= 0.01 });
        // Positive trust decays slower — good relationships are remembered longer
        self.org_trust.retain(|_, v| {
            *v *= if *v > 0.0 { 0.9997 } else { 0.999 };
            v.abs() >= 0.01
        });

        // Cap Q-table: keep the 600 entries with the highest max Q-value
        const Q_MAX: usize = 800;
        const Q_TRIM: usize = 600;
        if self.q_table.len() > Q_MAX {
            let mut entries: Vec<(String, Vec<f32>)> = self.q_table.drain().collect();
            entries.sort_by(|a, b| {
                let va = a.1.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                let vb = b.1.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                vb.partial_cmp(&va).unwrap_or(std::cmp::Ordering::Equal)
            });
            entries.truncate(Q_TRIM);
            self.q_table.extend(entries);
        }
    }

    pub fn best_remembered(mem: &HashMap<(i32,i32), f32>, ox: f32, oy: f32)
        -> Option<(i32, i32)>
    {
        let (ix, iy) = (ox as i32, oy as i32);
        let mut best_score = 0.03f32;
        let mut best_loc   = None;
        for (&(mx, my), &val) in mem {
            let dist = (mx - ix).abs() + (my - iy).abs();
            if dist == 0 { continue; }
            let score = val / (1.0 + dist as f32 * 0.03);
            if score > best_score {
                best_score = score;
                best_loc = Some((mx, my));
            }
        }
        best_loc
    }

    // ── Thought ───────────────────────────────────────────────────────────────

    pub fn think(&mut self, text: &str, tick: u64) {
        if self.thought == text { return; }
        self.thought = text.to_string();
        self.thought_history.push(ThoughtEntry { tick, text: text.to_string() });
        if self.thought_history.len() > 80 {
            self.thought_history.remove(0);
        }
    }

    // ── Perception ────────────────────────────────────────────────────────────

    pub fn perceive(&self, grid: &WorldGrid, organisms: &[Organism], night: bool) -> String {
        let (ix, iy) = (self.x as i32, self.y as i32);
        // Curious/explorer organisms develop better night awareness
        let scan: i32 = if night {
            if self.traits.curiosity > 0.7 { 8 } else { 6 }
        } else { 8 };

        let hunger_raw = if self.energy    < 0.2 { 2 } else if self.energy    < 0.5 { 1 } else { 0 };
        let hunger = if self.infection > 0.5 { hunger_raw.max(1) } else { hunger_raw };
        let thirst = if self.hydration < 0.2 { 2 } else if self.hydration < 0.5 { 1 } else { 0 };

        let mut food_dx = 0i32; let mut food_dy = 0i32;
        let mut water_dx = 0i32; let mut water_dy = 0i32;
        let mut food_dist  = 999i32;
        let mut water_dist = 999i32;
        let mut fire_near  = false;
        let fire_r = (2.0 + 2.0 * self.traits.fear) as i32;

        for dx in -scan..=scan {
            for dy in -scan..=scan {
                let t = grid.get(ix + dx, iy + dy);
                let dist = dx.abs() + dy.abs();
                match t {
                    Tile::Food  if dist < food_dist  => { food_dist  = dist; food_dx  = dx; food_dy  = dy; }
                    Tile::Water if dist < water_dist => { water_dist = dist; water_dx = dx; water_dy = dy; }
                    Tile::Fire  if dist <= fire_r    => { fire_near = true; }
                    _ => {}
                }
            }
        }

        let food_dir  = if food_dist  == 999 { 'X' } else { dir_char(food_dx,  food_dy)  };
        let water_dir = if water_dist == 999 { 'X' } else { dir_char(water_dx, water_dy) };

        let mut org_near = 0u8;
        let mut kin_near = 0u8;
        for other in organisms {
            if std::ptr::eq(other, self) || !other.alive { continue; }
            if (other.x - self.x).abs() + (other.y - self.y).abs() <= 5.0 {
                org_near = 1;
                if other.lineage_id == self.lineage_id { kin_near = 1; }
            }
        }

        let food_tr  = if grid.detect_trail(ix, iy, TrailKind::Food,  5) > 0.4 { 1 } else { 0 };
        let water_tr = if grid.detect_trail(ix, iy, TrailKind::Water, 5) > 0.4 { 1 } else { 0 };

        let att_char = {
            let mut nearest_lid: Option<&str> = None;
            let mut nearest_d = 999.0f32;
            for other in organisms {
                if std::ptr::eq(other, self) || !other.alive || other.lineage_id == self.lineage_id { continue; }
                let d = (other.x - self.x).abs() + (other.y - self.y).abs();
                if d < nearest_d { nearest_d = d; nearest_lid = Some(&other.lineage_id); }
            }
            match nearest_lid {
                Some(lid) if nearest_d <= scan as f32 => {
                    let att = self.attitude_toward(lid);
                    if att >= 0.25 { 'A' } else if att <= -0.25 { 'H' } else { 'N' }
                }
                _ => 'X',
            }
        };

        let inf_level = if self.infection > 0.4 { '2' } else if self.infection > 0.15 { '1' } else { '0' };

        // D = hostile territory nearby (remembered danger within 5 tiles, strength > 0.3)
        let danger_near = self.danger_memory.iter().any(|(&(mx, my), &v)| {
            v > 0.30 && (mx - ix).abs() + (my - iy).abs() <= 5
        });

        // W = campfire warmth within radius 4; C = cold tile (temp < 8); N = neutral
        let warmth_char = {
            let mut has_warmth = false;
            'outer: for ddx in -4i32..=4 {
                for ddy in -4i32..=4 {
                    if grid.get(ix + ddx, iy + ddy) == crate::world::tiles::Tile::Campfire {
                        has_warmth = true; break 'outer;
                    }
                }
            }
            if has_warmth { 'W' }
            else if grid.temp_at(ix, iy) < 8.0 { 'C' }
            else { 'N' }
        };

        // K = carrying wood, R = carrying stone, 0 = empty
        let carry_char = match (self.carrying > 0, self.carrying_type) {
            (true, 2) => 'R',
            (true, _) => 'K',
            _         => '0',
        };

        // S = sheltered (near hut/rock/structure >= 0.35); E = exposed
        let shelter_char = {
            let mut s = false;
            'sh: for ddx in -2i32..=2 {
                for ddy in -2i32..=2 {
                    let nx = ix + ddx; let ny = iy + ddy;
                    if matches!(grid.get(nx, ny), Tile::Hut | Tile::Rock)
                        || grid.structure_at(nx, ny) >= 0.35
                    {
                        s = true; break 'sh;
                    }
                }
            }
            if s { 'S' } else { 'E' }
        };

        format!("{hunger}{thirst}{food_dir}{water_dir}{fire_near_c}{org_near}{food_tr}{water_tr}{kin_near}{att_char}{inf_level}{dnear}{warmth}{carry}{shelter}",
            hunger = hunger,
            thirst = thirst,
            food_dir = food_dir,
            water_dir = water_dir,
            fire_near_c = if fire_near { 1 } else { 0 },
            org_near = org_near,
            food_tr = food_tr,
            water_tr = water_tr,
            kin_near = kin_near,
            att_char = att_char,
            inf_level = inf_level,
            dnear = if danger_near { 'D' } else { 'S' },
            warmth = warmth_char,
            carry  = carry_char,
            shelter = shelter_char,
        )
    }

    // ── Action selection ──────────────────────────────────────────────────────

    // Returns (action, new_thought). Caller applies the thought to avoid &mut self + &[Organism] aliasing.
    pub fn choose_action(&self, grid: &WorldGrid, tick: u64,
                         epsilon: f32, organisms: &[Organism], night: bool,
                         weather_kind: u8, rng: &mut impl Rng) -> (usize, Option<String>)
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let tile = grid.get(ix, iy);
        let mut thought: Option<String> = None;
        macro_rules! set_thought { ($t:expr) => { thought = Some($t.to_string()); }; }

        // Prioritise standing resource
        if tile == Tile::Water && self.hydration < 0.95 {
            set_thought!("drinking"); return (9, thought);
        }
        if tile == Tile::Food && self.energy < 0.95 {
            set_thought!("eating"); return (8, thought);
        }

        // Flee fire
        let flee_r = (2.0 + 2.0 * self.traits.fear) as i32;
        let fire_tile = self.nearest_visible(grid, Tile::Fire, flee_r);
        let fire_dangerous = tile == Tile::Fire || (!night && fire_tile.is_some());
        let critical = self.energy < 0.2 || self.hydration < 0.2;
        if !critical && fire_dangerous {
            set_thought!("heat dangerous");
            if let Some((fx, fy)) = fire_tile {
                if !night {
                    let tdx = ix - fx; let tdy = iy - fy;
                    return (self.toward((ix + tdx*3, iy + tdy*3), grid), thought);
                }
            }
            return (rng.gen_range(0..8), thought);
        }

        // Sick isolation: infected organisms avoid clustering with kin to limit spread
        if self.infection > 0.35 {
            let sick_kin_near = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive && o.lineage_id == self.lineage_id)
                .filter(|o| (o.x - self.x).abs() + (o.y - self.y).abs() <= 3.0)
                .count();
            if sick_kin_near >= 2 {
                set_thought!("isolating (sick)");
                return (rng.gen_range(0..8), thought);
            }
        }

        // Urgent needs
        if self.hydration < 0.5 {
            let scan_r = if self.hydration < 0.25 { 15 } else if night { 6 } else { 8 };
            if let Some(v) = self.nearest_visible(grid, Tile::Water, scan_r) {
                set_thought!("moving to water");
                return (self.toward(v, grid), thought);
            }
            if let Some(t) = Self::best_remembered(&self.water_memory, self.x, self.y) {
                set_thought!("moving to known water");
                return (self.toward(t, grid), thought);
            }
            if let Some(t) = self.find_trail_target(grid, TrailKind::Water, 12) {
                set_thought!("following water trail");
                return (self.toward(t, grid), thought);
            }
            set_thought!("thirsty — searching");
        } else if self.energy < 0.5 {
            let scan_r = if self.energy < 0.25 { 15 } else if night { 6 } else { 8 };
            if let Some(v) = self.nearest_visible(grid, Tile::Food, scan_r) {
                set_thought!("moving to food");
                return (self.toward(v, grid), thought);
            }
            if let Some(t) = Self::best_remembered(&self.food_memory, self.x, self.y) {
                set_thought!("moving to known food");
                return (self.toward(t, grid), thought);
            }
            if let Some(t) = self.find_trail_target(grid, TrailKind::Food, 12) {
                set_thought!("following food trail");
                return (self.toward(t, grid), thought);
            }
            set_thought!("hungry — searching");
        }

        // Danger avoidance
        if !self.danger_memory.is_empty() {
            let danger_thresh = (3.0 + 2.0 * self.traits.fear) as i32;
            if let Some((&(cx, cy), _)) = self.danger_memory.iter()
                .filter(|(_,v)| **v > 0.4)
                .min_by_key(|(&(cx,cy),_)| (cx - ix).abs() + (cy - iy).abs())
            {
                let dist = (cx - ix).abs() + (cy - iy).abs();
                if dist < danger_thresh {
                    set_thought!("avoiding danger");
                    return (self.toward((ix + (ix - cx)*3, iy + (iy - cy)*3), grid), thought);
                }
            }
        }

        // Storm sheltering: seek campfire / hut structure during bad weather
        if weather_kind >= 2 && !self.near_shelter(grid) {
            if let Some(v) = self.find_shelter_tile(grid, 14) {
                set_thought!("sheltering from storm");
                return (self.toward(v, grid), thought);
            }
        }

        // Night behaviors: rest if sheltered + sleep debt; or seek campfire when cold
        if night {
            let ns = self.near_shelter(grid);
            if ns && self.sleep_debt > 0.20 && self.energy > 0.30 && rng.gen::<f32>() < 0.50 {
                set_thought!("resting");
                return (rng.gen_range(0..8), thought);
            }
            if !ns && self.energy < 0.65 && self.hydration > 0.30 {
                if let Some(camp) = self.nearest_visible(grid, Tile::Campfire, 10) {
                    if (camp.0 - ix).abs() + (camp.1 - iy).abs() > 2 {
                        set_thought!("heading to campfire");
                        return (self.toward(camp, grid), thought);
                    }
                }
            }
        }

        // Mourning: reduced agency for a spell after witnessing kin death
        if self.grief_ticks > 40 && rng.gen::<f32>() < 0.45 {
            set_thought!("mourning kin");
            return (rng.gen_range(0..8), thought);
        }

        // Rest when injured near shelter — let health recover
        if self.health < 0.35 && self.near_shelter(grid) && rng.gen::<f32>() < 0.48 {
            set_thought!("resting (healing)");
            return (rng.gen_range(0..8), thought);
        }

        // Ollama directive — intentional goal that overrides default behaviour
        if tick < self.directive_until && !self.directive.is_empty() {
            match self.directive.as_str() {
                "seek_food" if self.energy < 0.85 => {
                    if let Some(v) = self.nearest_visible(grid, Tile::Food, 20) {
                        set_thought!("pursuing food"); return (self.toward(v, grid), thought);
                    }
                    if let Some(t) = Self::best_remembered(&self.food_memory, self.x, self.y) {
                        set_thought!("heading to known food"); return (self.toward(t, grid), thought);
                    }
                }
                "seek_water" if self.hydration < 0.85 => {
                    if let Some(v) = self.nearest_visible(grid, Tile::Water, 20) {
                        set_thought!("pursuing water"); return (self.toward(v, grid), thought);
                    }
                    if let Some(t) = Self::best_remembered(&self.water_memory, self.x, self.y) {
                        set_thought!("heading to known water"); return (self.toward(t, grid), thought);
                    }
                }
                "explore" => {
                    set_thought!("venturing far");
                    return (rng.gen_range(0..8), thought);
                }
                "socialize" => {
                    set_thought!("seeking company");
                    return (if rng.gen::<f32>() < 0.5 { 10 } else { 13 }, thought);
                }
                "flee" => {
                    let (hx, hy) = (self.home_x as i32, self.home_y as i32);
                    set_thought!("fleeing to safety");
                    return (self.toward((hx, hy), grid), thought);
                }
                "fight" => {
                    set_thought!("standing ground");
                    return (12, thought);
                }
                "trade" => {
                    set_thought!("offering peace");
                    return (13, thought);
                }
                _ => {}
            }
        }

        // Young organisms imprint on and follow their lineage elder
        if self.age < 150 {
            let elder_pos: Option<(i32, i32)> = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                        && o.lineage_id == self.lineage_id && o.is_elder)
                .min_by(|a, b| {
                    let da = (a.x - self.x).abs() + (a.y - self.y).abs();
                    let db = (b.x - self.x).abs() + (b.y - self.y).abs();
                    da.partial_cmp(&db).unwrap()
                })
                .map(|o| (o.x as i32, o.y as i32));
            if let Some(ep) = elder_pos {
                let dist = (ep.0 - ix).abs() + (ep.1 - iy).abs();
                if dist > 4 && dist < 22 {
                    set_thought!("following elder");
                    return (self.toward(ep, grid), thought);
                }
            }
        }

        // Wanderlust: bored organism heads toward a distant wander target
        if let Some(wt) = self.wander_target {
            let dist = (wt.0 - ix).abs() + (wt.1 - iy).abs();
            if dist > 3 && self.boredom > 0.45 && self.energy > 0.4 && self.hydration > 0.4 {
                set_thought!("wandering");
                return (self.toward(wt, grid), thought);
            }
        }

        // Home-pull: only when truly thriving and very far from home
        if tick >= self.directive_until && self.energy > 0.86 && self.hydration > 0.86 {
            let dist_home = (self.x - self.home_x).abs() + (self.y - self.home_y).abs();
            if dist_home > 28.0 && rng.gen::<f32>() < 0.015 {
                set_thought!("heading home");
                return (self.toward((self.home_x as i32, self.home_y as i32), grid), thought);
            }
        }

        // Q-learning / exploration
        let eff_eps = (epsilon * (0.5 + self.traits.curiosity)).max(0.05).min(0.95);
        if rng.gen::<f32>() < eff_eps {
            // Low path-trail following during exploration — prevents snowball clustering
            if rng.gen::<f32>() < 0.10 {
                if let Some(p) = self.find_trail_target(grid, TrailKind::Path, 5) {
                    return (self.toward(p, grid), thought);
                }
            }
            set_thought!("exploring");
            return (rng.gen_range(0..N_ACTIONS), thought);
        }

        let perception = self.perceive(grid, organisms, night);
        let q_row = self.q_table.get(&perception).cloned()
            .unwrap_or_else(|| vec![0.0; N_ACTIONS]);
        let best = q_row.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        if best <= 0.0 { return (rng.gen_range(0..N_ACTIONS), thought); }
        (q_row.iter().position(|&v| v == best).unwrap_or(0), thought)
    }

    pub fn near_shelter(&self, grid: &WorldGrid) -> bool {
        let (ix, iy) = (self.x as i32, self.y as i32);
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| {
            let nx = ix + dx; let ny = iy + dy;
            matches!(grid.get(nx, ny), Tile::Hut | Tile::Rock)
                || grid.structure_at(nx, ny) >= 0.35
        }))
    }

    fn find_shelter_tile(&self, grid: &WorldGrid, radius: i32) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best: Option<(i32, i32)> = None;
        let mut best_dist = radius + 1;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = ix + dx; let ny = iy + dy;
                let is_shelter = matches!(grid.get(nx, ny), Tile::Hut | Tile::Campfire)
                    || grid.structure_at(nx, ny) >= 0.35;
                if is_shelter {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist { best_dist = dist; best = Some((nx, ny)); }
                }
            }
        }
        best
    }

    fn toward(&self, target: (i32, i32), grid: &WorldGrid) -> usize {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let (tx, ty) = target;
        let dx = tx - ix; let dy = ty - iy;
        let mut best_action = 0;
        let mut best_score  = i32::MIN;
        for (i, (adx, ady)) in DIRECTIONS.iter().enumerate() {
            let mut score = adx * dx + ady * dy;
            let t = grid.get(ix + adx, iy + ady);
            if matches!(t, Tile::Rock | Tile::Void) { score = i32::MIN; }
            if score > best_score { best_score = score; best_action = i; }
        }
        best_action
    }

    fn nearest_visible(&self, grid: &WorldGrid, tile_type: Tile, radius: i32)
        -> Option<(i32, i32)>
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_dist = radius + 1;
        let mut best_loc  = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                if grid.get(ix + dx, iy + dy) == tile_type {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist { best_dist = dist; best_loc = Some((ix+dx, iy+dy)); }
                }
            }
        }
        best_loc
    }

    fn find_trail_target(&self, grid: &WorldGrid, kind: TrailKind, radius: i32)
        -> Option<(i32, i32)>
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best_val = 0.35f32;
        let mut best_loc = None;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let v = grid.trail_at(ix + dx, iy + dy, kind);
                if v > best_val { best_val = v; best_loc = Some((ix+dx, iy+dy)); }
            }
        }
        best_loc
    }

    // ── Learning ──────────────────────────────────────────────────────────────

    pub fn learn(&mut self, perception: &str, action: usize, reward: f32, next_perception: &str) {
        let alpha = 0.15f32;
        let gamma = 0.9f32;
        let n = N_ACTIONS;

        let ensure = |table: &mut HashMap<String, Vec<f32>>, key: &str| {
            let row = table.entry(key.to_string()).or_insert_with(|| vec![0.0; n]);
            if row.len() < n { row.resize(n, 0.0); }
        };
        ensure(&mut self.q_table, perception);
        ensure(&mut self.q_table, next_perception);

        let best_next = self.q_table[next_perception].iter().cloned()
            .fold(f32::NEG_INFINITY, f32::max);
        let best_next = if best_next.is_infinite() { 0.0 } else { best_next };

        let old = self.q_table[perception][action];
        let new_val = old + alpha * (reward + gamma * best_next - old);
        self.q_table.get_mut(perception).unwrap()[action] = new_val;
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    pub fn to_json(&self) -> OrgJson {
        let thought_history: Vec<ThoughtJson> = self.thought_history
            .iter().rev().take(10).rev()
            .map(|e| ThoughtJson { tick: e.tick, text: e.text.clone() })
            .collect();

        let attitudes: HashMap<String, f32> = self.lineage_attitudes.iter()
            .filter(|(_, &v)| v.abs() > 0.1)
            .map(|(k, &v)| (k[..k.len().min(6)].to_string(), (v * 100.0).round() / 100.0))
            .collect();

        let org_trust: HashMap<String, f32> = self.org_trust.iter()
            .filter(|(_, &v)| v.abs() > 0.15)
            .map(|(k, &v)| (k[..k.len().min(8)].to_string(), (v * 100.0).round() / 100.0))
            .collect();

        OrgJson {
            id:       self.id.clone(),
            name:     self.name.clone(),
            x:        (self.x * 10.0).round() / 10.0,
            y:        (self.y * 10.0).round() / 10.0,
            energy:   (self.energy    * 1000.0).round() / 1000.0,
            hydration:(self.hydration * 1000.0).round() / 1000.0,
            health:   (self.health    * 1000.0).round() / 1000.0,
            age:      self.age,
            alive:    self.alive,
            thought:  self.thought.clone(),
            thought_history,
            generation: self.generation,
            parent_id:  self.parent_id.clone(),
            lineage_id: self.lineage_id.clone(),
            max_age:    self.max_age,
            memory_count: MemoryCount {
                food:   self.food_memory.len(),
                water:  self.water_memory.len(),
                danger: self.danger_memory.len(),
            },
            attitudes,
            org_trust,
            traits: TraitsJson {
                curiosity:       (self.traits.curiosity       * 100.0).round() / 100.0,
                aggression:      (self.traits.aggression      * 100.0).round() / 100.0,
                fear:            (self.traits.fear            * 100.0).round() / 100.0,
                memory_strength: (self.traits.memory_strength * 100.0).round() / 100.0,
                social_tendency: (self.traits.social_tendency * 100.0).round() / 100.0,
                resilience:      (self.traits.resilience      * 100.0).round() / 100.0,
            },
            infection:     (self.infection * 1000.0).round() / 1000.0,
            carrying:      self.carrying,
            carrying_type: self.carrying_type,
            vocabulary:    self.vocabulary.words.clone(),
            daily_story: self.daily_story.clone(),
            home_x:      (self.home_x * 10.0).round() / 10.0,
            home_y:      (self.home_y * 10.0).round() / 10.0,
            discoveries:         self.discoveries.clone(),
            life_log:            self.life_log.iter().rev().take(8).rev().cloned().collect(),
            is_elder:            self.is_elder,
            has_reflected:       self.has_reflected,
            last_invention_tick: self.last_invention_tick,
            loneliness:  (self.loneliness  * 100.0).round() / 100.0,
            boredom:     (self.boredom     * 100.0).round() / 100.0,
            fear_level:  (self.fear_level  * 100.0).round() / 100.0,
            comfort:     (self.comfort     * 100.0).round() / 100.0,
            grief_ticks: self.grief_ticks,
            sleep_debt:  (self.sleep_debt  * 100.0).round() / 100.0,
        }
    }
}

#[derive(Serialize)] pub struct ThoughtJson { pub tick: u64, pub text: String }
#[derive(Serialize)] pub struct MemoryCount  { pub food: usize, pub water: usize, pub danger: usize }
#[derive(Serialize)] pub struct TraitsJson   {
    pub curiosity: f32, pub aggression: f32, pub fear: f32,
    pub memory_strength: f32, pub social_tendency: f32, pub resilience: f32,
}
#[derive(Serialize)]
pub struct OrgJson {
    pub id: String, pub name: String,
    pub x: f32, pub y: f32,
    pub energy: f32, pub hydration: f32, pub health: f32,
    pub age: u32, pub alive: bool,
    pub thought: String,
    pub thought_history: Vec<ThoughtJson>,
    pub generation: u32, pub parent_id: String, pub lineage_id: String, pub max_age: u32,
    pub memory_count: MemoryCount,
    pub attitudes:   HashMap<String, f32>,
    pub org_trust:   HashMap<String, f32>,
    pub traits:      TraitsJson,
    pub infection:     f32,
    pub carrying:      u32,
    pub carrying_type: u8,
    pub vocabulary:    HashMap<String, String>,
    pub daily_story: String,
    pub home_x:      f32,
    pub home_y:      f32,
    pub discoveries:         Vec<String>,
    pub life_log:            Vec<String>,
    pub is_elder:            bool,
    pub has_reflected:       bool,
    pub last_invention_tick: u64,
    // Emotional / behavioral state
    pub loneliness:  f32,
    pub boredom:     f32,
    pub fear_level:  f32,
    pub comfort:     f32,
    pub grief_ticks: u32,
    pub sleep_debt:  f32,
}
