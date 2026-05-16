//! Phase-2 extended action set (indices 126..=225). 100 additional
//! behaviours layered on top of the original 0..=125 set so the
//! local llama.cpp policy + Q-learning explorer have a much richer
//! repertoire. Dispatched from `apply_extended_action` when the
//! chosen index falls in this range.
//!
//! Grouping (index -> theme):
//!   126..=140  Knowledge & lore
//!   141..=150  Cooking & food preservation
//!   151..=165  Crafting & tools
//!   166..=180  Building & infrastructure
//!   181..=190  Politics & diplomacy
//!   191..=200  Combat, scouting & defense
//!   201..=210  Spiritual & cultural rites
//!   211..=220  Travel & exploration
//!   221..=225  Self-care & mood

use rand::Rng;

use crate::organism::organism::Organism;
use crate::world::grid::{TrailKind, WorldGrid};
use crate::world::tiles::Tile;
use super::world_events::push_event;
use super::simulation::Simulation;

impl Simulation {
    pub(crate) fn apply_extended_action_v2(
        &mut self,
        idx: usize,
        action: usize,
        ix: i32,
        iy: i32,
        kin: &[usize],
        near: &[usize],
        rock_near: bool,
        water_near: bool,
        fire_near: bool,
        fidx: usize,
        tile: Tile,
    ) -> f32 {
        let mut reward = 0.0f32;
        let tick = self.tick_count;
        let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
        let lid = self.organisms[idx].lineage_id.clone();

        macro_rules! th {
            ($t:expr) => { self.organisms[idx].think($t, tick); };
        }
        macro_rules! disc {
            ($what:expr, $msg:expr) => {{
                let nm = self.organisms[idx].name.clone();
                if self.organisms[idx].discover($what) {
                    push_event(&mut self.events, tick, "build", &nm, $msg);
                }
            }};
        }
        macro_rules! evt {
            ($kind:expr, $msg:expr) => {{
                let nm = self.organisms[idx].name.clone();
                push_event(&mut self.events, tick, $kind, &nm, $msg);
            }};
        }

        match action {
            // ── Knowledge & lore (126..=140) ─────────────────────────
            126 => { // recite_lineage
                for &ki in kin {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.03).min(1.0);
                }
                reward += 0.003 * kin.len().min(5) as f32;
                th!("reciting the ancestors");
                if !kin.is_empty() { disc!("genealogy", "remembered the ancestors"); }
            }
            127 => { // tell_creation_myth
                if fire_near {
                    for &ki in kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.05).min(1.0);
                        self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.10).max(0.0);
                    }
                    reward += 0.005 * kin.len().min(5) as f32;
                    th!("telling the creation myth");
                    disc!("mythology", "told the creation myth");
                } else { th!("recalling old stories"); }
            }
            128 => { // sketch_map
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.05).max(0.0);
                reward += 0.003; th!("sketching a map");
                disc!("cartography-deep", "improved the map");
            }
            129 => { // study_stars_deep
                if self.is_night() {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                    reward += 0.005; th!("charting constellations");
                    disc!("constellations", "charted the constellations");
                } else { th!("waiting for the stars"); }
            }
            130 => { // listen_to_wind
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.02).max(0.0);
                reward += 0.002; th!("listening to the wind");
                disc!("wind-lore", "read the winds");
            }
            131 => { // read_tracks
                let ms = self.organisms[idx].traits.memory_strength;
                let mut spotted = 0;
                let animals: Vec<(i32, i32)> = self.animals.iter()
                    .filter(|a| a.alive)
                    .filter(|a| (a.x - sx).abs() + (a.y - sy).abs() <= 12.0)
                    .map(|a| (a.x as i32, a.y as i32))
                    .collect();
                for (ax, ay) in animals {
                    Organism::remember(&mut self.organisms[idx].food_memory, ax, ay, 0.35, ms);
                    spotted += 1;
                }
                if spotted > 0 { reward += 0.005; }
                th!("reading the tracks");
                if spotted > 0 { disc!("tracking", "learned to read tracks"); }
            }
            132 => { // catalog_plants
                if matches!(tile, Tile::Grass | Tile::Food) {
                    reward += 0.004; th!("cataloguing plants");
                    disc!("botany", "began cataloguing plants");
                } else { th!("seeking new plants"); }
            }
            133 => { // catalog_minerals
                if rock_near {
                    reward += 0.004; th!("studying the stone");
                    disc!("geology", "began studying minerals");
                } else { th!("seeking ore samples"); }
            }
            134 => { // teach_word
                if let Some(&ki) = kin.iter().filter(|&&k| self.organisms[k].age < 1000)
                    .min_by_key(|&&k| self.organisms[k].age) {
                    self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.06).max(0.0);
                    reward += 0.004; th!("teaching a new word");
                    disc!("language", "spread a new word");
                    let nm = self.organisms[idx].name.clone();
                    let tn = self.organisms[ki].name.clone();
                    push_event(&mut self.events, tick, "social", &nm,
                               &format!("taught {} a new word", tn));
                } else { th!("looking for a student"); }
            }
            135 => { // recite_proverb
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
                for &ki in near {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.01).min(1.0);
                }
                reward += 0.002; th!("reciting a proverb");
                disc!("proverbs", "coined a proverb");
            }
            136 => { // study_animal_behaviour
                let near_animal = self.animals.iter()
                    .any(|a| a.alive && (a.x - sx).abs() + (a.y - sy).abs() <= 5.0);
                if near_animal {
                    reward += 0.004; th!("studying an animal");
                    disc!("ethology", "studied animal behaviour");
                } else { th!("waiting for wildlife"); }
            }
            137 => { // dream_interpretation
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.04).max(0.0);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.03).min(1.0);
                reward += 0.002; th!("interpreting a dream");
                disc!("oneiromancy", "interpreted a dream");
            }
            138 => { // record_event
                reward += 0.002; th!("recording the day's events");
                disc!("chronicle", "began a chronicle");
            }
            139 => { // observe_clouds
                reward += 0.002; th!("watching the clouds drift");
                disc!("cloud-lore", "learned cloud signs");
            }
            140 => { // forecast_weather
                if self.organisms[idx].discoveries.contains("meteorology")
                    || self.organisms[idx].discoveries.contains("cloud-lore") {
                    reward += 0.004; th!("forecasting the weather");
                    disc!("forecasting", "forecast tomorrow's weather");
                } else { th!("reading the sky"); }
            }

            // ── Cooking & food preservation (141..=150) ──────────────
            141 => { // boil_water
                if fire_near && self.organisms[idx].inv_water > 0 {
                    self.organisms[idx].infection = (self.organisms[idx].infection * 0.80).max(0.0);
                    reward += 0.005; th!("boiling water clean");
                    disc!("sanitation", "learned to boil water");
                } else { th!("needing fire and water"); }
            }
            142 => { // bake_bread
                if fire_near && self.organisms[idx].inv_food > 0 {
                    self.organisms[idx].energy = (self.organisms[idx].energy + 0.18).min(1.0);
                    reward += 0.010; th!("baking bread");
                    disc!("bread", "baked the first bread");
                } else { th!("needing grain and fire"); }
            }
            143 => { // ferment_drink
                if self.organisms[idx].inv_food > 0 {
                    self.organisms[idx].inv_food -= 1;
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                    reward += 0.006; th!("fermenting a drink");
                    disc!("fermentation", "fermented the first drink");
                } else { th!("looking for fruit to ferment"); }
            }
            144 => { // dry_herbs
                if !self.is_night() {
                    reward += 0.003; th!("drying herbs in the sun");
                    disc!("herbalism", "learned to dry herbs");
                } else { th!("herbs need sunlight"); }
            }
            145 => { // salt_meat
                if water_near && self.organisms[idx].inv_food > 0 {
                    reward += 0.006; th!("salting meat");
                    disc!("salt-curing", "learned to salt meat");
                } else { th!("needing brine"); }
            }
            146 => { // stockpile_food
                if self.organisms[idx].inv_food > 0 {
                    self.grid.leave_trail(ix, iy, TrailKind::Food, 1.5);
                    reward += 0.004; th!("caching food");
                    disc!("granaries", "stocked food for winter");
                } else { th!("no food to store"); }
            }
            147 => { // share_meal
                if self.organisms[idx].inv_food > 0 && !kin.is_empty() {
                    self.organisms[idx].inv_food -= 1;
                    for &ki in kin {
                        self.organisms[ki].energy = (self.organisms[ki].energy + 0.10).min(1.0);
                    }
                    reward += 0.005 * kin.len().min(5) as f32;
                    th!("sharing a meal");
                } else { th!("nothing to share"); }
            }
            148 => { // brew_tea
                if fire_near && self.organisms[idx].inv_water > 0 {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                    self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.05).max(0.0);
                    reward += 0.004; th!("brewing tea");
                    disc!("tea", "brewed the first tea");
                } else { th!("needing fire for tea"); }
            }
            149 => { // grind_grain
                if rock_near && self.organisms[idx].inv_food > 0 {
                    reward += 0.003; th!("grinding grain");
                    disc!("milling", "ground the first grain");
                } else { th!("needing a millstone"); }
            }
            150 => { // taste_test
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.04).max(0.0);
                if self.rng.gen::<f32>() < 0.08 {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                    reward += 0.004; th!("discovering a new flavour");
                    disc!("gastronomy", "discovered a new flavour");
                } else { th!("tasting carefully"); }
            }

            // ── Crafting & tools (151..=165) ─────────────────────────
            151 => { self.craft(idx, "flute",        0.008, &mut reward); th!("carving a flute"); }
            152 => { self.craft(idx, "carved-bone",  0.008, &mut reward); th!("carving bone"); }
            153 => { self.craft(idx, "fishing-hook", 0.010, &mut reward); th!("knapping a fishhook"); }
            154 => { self.craft(idx, "fishing-line", 0.008, &mut reward); th!("twisting a fishing line"); }
            155 => { self.craft(idx, "knife",        0.012, &mut reward); th!("knapping a knife"); }
            156 => { self.craft(idx, "axe",          0.014, &mut reward); th!("hafting an axe"); }
            157 => { // sharpen_blade
                if self.organisms[idx].discoveries.contains("knife")
                    || self.organisms[idx].discoveries.contains("axe")
                    || self.organisms[idx].discoveries.contains("spear") {
                    reward += 0.004; th!("sharpening a blade");
                    disc!("whetstones", "learned to whet stone");
                } else { th!("nothing to sharpen"); }
            }
            158 => { self.craft(idx, "torch-pitch",  0.006, &mut reward); th!("dipping a torch"); }
            159 => { self.craft(idx, "lantern",      0.010, &mut reward); th!("crafting a lantern"); }
            160 => { // craft_canoe
                if water_near && self.organisms[idx].inv_wood > 0 {
                    self.consume_material(idx);
                    self.craft(idx, "canoe", 0.018, &mut reward);
                    th!("hollowing a canoe");
                } else { th!("needing wood and water"); }
            }
            161 => { self.craft(idx, "paddle",       0.006, &mut reward); th!("carving a paddle"); }
            162 => { self.craft(idx, "sled",         0.010, &mut reward); th!("lashing a sled"); }
            163 => { self.craft(idx, "wheel",        0.020, &mut reward); th!("rounding a wheel"); }
            164 => { self.craft(idx, "loom",         0.014, &mut reward); th!("setting up a loom"); }
            165 => { self.craft(idx, "mortar",       0.008, &mut reward); th!("shaping a mortar"); }

            // ── Building & infrastructure (166..=180) ────────────────
            166 => { // dig_well_deep
                if matches!(tile, Tile::Sand | Tile::Grass) && self.rng.gen::<f32>() < 0.30 {
                    self.grid.set(ix, iy, Tile::Water);
                    reward += 0.04; th!("striking groundwater");
                    disc!("deep-well", "dug a deep well");
                } else { th!("digging deeper"); }
            }
            167 => { // build_aqueduct
                if water_near && (self.organisms[idx].inv_stone > 0
                    || self.organisms[idx].inv_wood > 0) {
                    self.consume_material(idx);
                    self.grid.leave_trail(ix, iy, TrailKind::Path, 1.5);
                    self.grid.add_structure(ix, iy, 0.04);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.012; th!("laying an aqueduct");
                    disc!("aqueducts", "engineered an aqueduct");
                } else { th!("planning an aqueduct"); }
            }
            168 => { // build_paved_road
                if self.organisms[idx].inv_stone > 0 {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.leave_trail(ix, iy, TrailKind::Path, 3.0);
                    reward += 0.006; th!("laying paving stones");
                    disc!("paved-roads", "paved a road");
                } else { th!("no stone to pave with"); }
            }
            169 => { // build_gate
                if self.organisms[idx].inv_wood > 0 || self.organisms[idx].inv_stone > 0 {
                    self.consume_material(idx);
                    self.grid.add_structure(ix, iy, 0.04);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.010; th!("hanging a gate");
                    disc!("gates", "built a gate");
                } else { th!("no material for a gate"); }
            }
            170 => { // build_kiln
                if self.organisms[idx].inv_stone > 0 {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.05);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.012; th!("firing up a kiln");
                    disc!("kilns", "fired a kiln");
                } else { th!("no stone for a kiln"); }
            }
            171 => { // build_forge
                if self.organisms[idx].inv_stone > 0 && fire_near {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.06);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.014; th!("building a forge");
                    disc!("metallurgy", "raised the first forge");
                } else { th!("no forge yet"); }
            }
            172 => { // build_market
                if !kin.is_empty() && (self.organisms[idx].inv_wood > 0
                    || self.organisms[idx].inv_stone > 0) {
                    self.consume_material(idx);
                    self.grid.add_structure(ix, iy, 0.05);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.012; th!("setting up a market");
                    disc!("markets", "founded a market");
                } else { th!("imagining a market"); }
            }
            173 => { // build_amphitheater
                if self.organisms[idx].inv_stone > 0 {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.06);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.014; th!("carving an amphitheater");
                    disc!("amphitheater", "carved an amphitheater");
                } else { th!("dreaming of an amphitheater"); }
            }
            174 => { // build_library
                if self.organisms[idx].inv_wood > 0
                    && self.organisms[idx].discoveries.contains("chronicle") {
                    self.organisms[idx].inv_wood -= 1;
                    self.grid.add_structure(ix, iy, 0.06);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.016; th!("raising a library");
                    disc!("library", "built a library of lore");
                } else { th!("dreaming of a library"); }
            }
            175 => { // build_observatory
                if self.organisms[idx].inv_stone > 0
                    && self.organisms[idx].discoveries.contains("astronomy") {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.07);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.018; th!("building an observatory");
                    disc!("observatory", "raised an observatory");
                } else { th!("planning an observatory"); }
            }
            176 => { // build_temple
                if self.organisms[idx].inv_stone > 0
                    && (self.organisms[idx].discoveries.contains("faith")
                        || self.organisms[idx].discoveries.contains("ritual")) {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.08);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.020; th!("raising a temple");
                    disc!("temple", "raised a temple");
                } else { th!("envisioning a temple"); }
            }
            177 => { // build_irrigation_canal
                if water_near && matches!(tile, Tile::Grass) {
                    for dx in -3..=3 { for dy in -3..=3 {
                        let i2 = WorldGrid::idx(ix + dx, iy + dy);
                        if i2 < self.grid.fertility.len() {
                            self.grid.fertility[i2] = (self.grid.fertility[i2] + 0.04).min(0.96);
                        }
                    }}
                    self.grid.leave_trail(ix, iy, TrailKind::Path, 1.0);
                    reward += 0.014; th!("cutting an irrigation canal");
                    disc!("canals", "cut an irrigation canal");
                } else { th!("seeking a canal site"); }
            }
            178 => { // build_quay
                if water_near && self.organisms[idx].inv_stone > 0 {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.05);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.012; th!("laying a quay");
                    disc!("quay", "built a stone quay");
                } else { th!("no stone for a quay"); }
            }
            179 => { // build_signal_fire
                if self.organisms[idx].inv_wood > 0 {
                    self.organisms[idx].inv_wood -= 1;
                    self.grid.set(ix, iy, Tile::Campfire);
                    for &ki in kin {
                        self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.05).max(0.0);
                    }
                    reward += 0.010; th!("lighting a signal fire");
                    disc!("signal-fires", "lit a signal fire");
                } else { th!("no wood for a signal"); }
            }
            180 => { // build_drying_rack
                if self.organisms[idx].inv_wood > 0 {
                    self.organisms[idx].inv_wood -= 1;
                    self.grid.add_structure(ix, iy, 0.02);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.006; th!("hammering a drying rack");
                    disc!("drying-rack", "built a drying rack");
                } else { th!("no wood for a rack"); }
            }

            // ── Politics & diplomacy (181..=190) ─────────────────────
            181 => { // propose_truce
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid
                        && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < 0.0) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.08);
                    self.organisms[ki].update_attitude(&lid, 0.06);
                    reward += 0.008; th!("proposing a truce");
                    disc!("truce", "proposed a truce");
                } else { th!("looking for a quarrel to settle"); }
            }
            182 => { // swear_oath
                for &ki in kin {
                    let oid = self.organisms[ki].id.clone();
                    let my_id = self.organisms[idx].id.clone();
                    let t = self.organisms[idx].org_trust.entry(oid).or_insert(0.0);
                    *t = (*t + 0.08).min(1.0);
                    let t2 = self.organisms[ki].org_trust.entry(my_id).or_insert(0.0);
                    *t2 = (*t2 + 0.08).min(1.0);
                }
                reward += 0.003 * kin.len().min(5) as f32;
                th!("swearing an oath");
                if !kin.is_empty() { disc!("oaths", "swore a binding oath"); }
            }
            183 => { // send_envoy
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.04);
                    reward += 0.006; th!("sending an envoy");
                    disc!("envoys", "sent an envoy abroad");
                } else { th!("no stranger to envoy to"); }
            }
            184 => { // host_summit
                if kin.len() >= 2 {
                    for &ki in kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.03).min(1.0);
                    }
                    reward += 0.004 * kin.len().min(5) as f32;
                    th!("hosting a summit");
                    disc!("summit", "held a tribal summit");
                } else { th!("waiting for kin"); }
            }
            185 => { // arrange_marriage
                let mates: Vec<usize> = kin.iter().copied()
                    .filter(|&k| self.organisms[k].age >= 800 && self.organisms[k].age < 4000)
                    .collect();
                if mates.len() >= 2 {
                    let a = mates[0]; let b = mates[1];
                    let bid = self.organisms[b].id.clone();
                    let aid = self.organisms[a].id.clone();
                    let t = self.organisms[a].org_trust.entry(bid).or_insert(0.0);
                    *t = (*t + 0.20).min(1.0);
                    let t2 = self.organisms[b].org_trust.entry(aid).or_insert(0.0);
                    *t2 = (*t2 + 0.20).min(1.0);
                    reward += 0.012; th!("arranging a marriage");
                    disc!("marriage-rite", "arranged a marriage");
                } else { th!("seeking matches"); }
            }
            186 => { // hold_council
                if kin.len() >= 2 {
                    for &ki in kin {
                        self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.04).max(0.0);
                    }
                    reward += 0.003 * kin.len().min(6) as f32;
                    th!("holding a council");
                    disc!("council", "convened a council");
                } else { th!("waiting on the council"); }
            }
            187 => { // grant_amnesty
                for &ki in near {
                    let their = self.organisms[ki].lineage_id.clone();
                    if their != lid {
                        self.organisms[idx].update_attitude(&their, 0.05);
                    }
                }
                reward += 0.004; th!("granting amnesty");
                disc!("amnesty", "granted amnesty");
            }
            188 => { // declare_independence
                if kin.len() >= 3 {
                    reward += 0.012; th!("declaring independence");
                    disc!("independence", "declared independence");
                    evt!("social", "declared a new way for the tribe");
                } else { th!("dreaming of independence"); }
            }
            189 => { // appoint_elder
                if let Some(&ki) = kin.iter()
                    .max_by_key(|&&k| self.organisms[k].age) {
                    self.organisms[ki].is_elder = true;
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.08).min(1.0);
                    reward += 0.008; th!("naming an elder");
                    disc!("elders", "named the first elder");
                } else { th!("looking for wisdom"); }
            }
            190 => { // pledge_loyalty
                if let Some(&ki) = kin.first() {
                    let oid = self.organisms[ki].id.clone();
                    let my_id = self.organisms[idx].id.clone();
                    let t = self.organisms[idx].org_trust.entry(oid).or_insert(0.0);
                    *t = (*t + 0.10).min(1.0);
                    let t2 = self.organisms[ki].org_trust.entry(my_id).or_insert(0.0);
                    *t2 = (*t2 + 0.05).min(1.0);
                    reward += 0.005; th!("pledging loyalty");
                } else { th!("loyal in spirit"); }
            }

            // ── Combat, scouting & defense (191..=200) ───────────────
            191 => { // muster_warband
                let warband: Vec<usize> = kin.iter().copied()
                    .filter(|&k| self.organisms[k].age >= 800).collect();
                if warband.len() >= 2 {
                    for &ki in &warband {
                        self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.06).max(0.0);
                    }
                    reward += 0.004 * warband.len().min(6) as f32;
                    th!("mustering a warband");
                    disc!("warband-deep", "mustered a warband");
                } else { th!("calling for warriors"); }
            }
            192 => { // fortify_position
                self.grid.add_structure(ix, iy, 0.04);
                self.active_structure_tiles.insert((ix, iy));
                reward += 0.005; th!("digging in");
            }
            193 => { // throw_stone
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid
                        && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < -0.10) {
                    self.organisms[ki].health = (self.organisms[ki].health - 0.03).max(0.0);
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level + 0.05).min(1.0);
                    reward += 0.004; th!("hurling a stone");
                } else { th!("no target for a stone"); }
            }
            194 => { // duel_rival
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid
                        && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < -0.20) {
                    self.organisms[ki].health = (self.organisms[ki].health - 0.08).max(0.0);
                    self.organisms[idx].health = (self.organisms[idx].health - 0.04).max(0.0);
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, -0.05);
                    reward += 0.006; th!("duelling a rival");
                    disc!("duelling", "duelled a rival");
                } else { th!("no rival in sight"); }
            }
            195 => { // shield_kin
                if let Some(&ki) = kin.first() {
                    self.organisms[ki].health = (self.organisms[ki].health + 0.03).min(1.0);
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.06).max(0.0);
                    reward += 0.005; th!("shielding kin");
                } else { th!("on guard"); }
            }
            196 => { // rally_cry
                for &ki in kin {
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.10).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.04).min(1.0);
                }
                reward += 0.004 * kin.len().min(6) as f32;
                th!("raising a rally cry");
            }
            197 => { // spy_on_rival
                let ms = self.organisms[idx].traits.memory_strength;
                let mut spotted = 0;
                let hostiles: Vec<(i32,i32)> = self.organisms.iter()
                    .filter(|o| o.alive && o.lineage_id != lid)
                    .filter(|o| (o.x - sx).abs() + (o.y - sy).abs() <= 14.0)
                    .map(|o| (o.x as i32, o.y as i32))
                    .collect();
                for (hx, hy) in hostiles {
                    Organism::remember(&mut self.organisms[idx].danger_memory, hx, hy, 0.35, ms);
                    spotted += 1;
                }
                if spotted > 0 { reward += 0.004; th!("spying on rivals"); }
                else { th!("watching the horizon"); }
            }
            198 => { // raid_stockpile
                let mut hit = false;
                'rs: for dx in -3..=3 { for dy in -3..=3 {
                    if self.grid.trail_at(ix + dx, iy + dy, TrailKind::Food) > 0.4 {
                        self.grid.leave_trail(ix + dx, iy + dy, TrailKind::Food, -0.5);
                        self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                        hit = true; break 'rs;
                    }
                }}
                if hit { reward += 0.010; th!("raiding a stockpile"); disc!("stockpile-raid", "raided a cache"); }
                else { th!("scouting for caches"); }
            }
            199 => { // intercept_raid
                if near.iter().any(|&k| self.organisms[k].lineage_id != lid) {
                    for &ki in kin {
                        self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.05).max(0.0);
                    }
                    reward += 0.008; th!("intercepting raiders");
                    disc!("defense", "intercepted a raid");
                } else { th!("no raid to intercept"); }
            }
            200 => { // negotiate_ransom
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid
                        && self.organisms[k].health < 0.4) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.06);
                    self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                    reward += 0.008; th!("negotiating a ransom");
                    disc!("ransom", "negotiated a ransom");
                } else { th!("no hostage to ransom"); }
            }

            // ── Spiritual & cultural rites (201..=210) ───────────────
            201 => { // chant_at_dawn
                if !self.is_night() {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                    for &ki in kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.02).min(1.0);
                    }
                    reward += 0.003 + 0.001 * kin.len().min(5) as f32;
                    th!("chanting at dawn");
                    disc!("dawn-chant", "chanted at dawn");
                } else { th!("awaiting dawn"); }
            }
            202 => { // paint_body
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
                reward += 0.002; th!("painting the body");
                disc!("body-paint", "painted the body");
            }
            203 => { // carve_totem_pole
                if self.organisms[idx].inv_wood > 0 {
                    self.organisms[idx].inv_wood -= 1;
                    self.grid.add_structure(ix, iy, 0.04);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.010; th!("carving a totem pole");
                    disc!("totem-pole", "raised a totem pole");
                } else { th!("no wood for a pole"); }
            }
            204 => { // offer_sacrifice
                if self.organisms[idx].inv_food > 0 {
                    self.organisms[idx].inv_food -= 1;
                    self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.05).max(0.0);
                    reward += 0.004; th!("offering a sacrifice");
                    disc!("sacrifice", "offered a sacrifice");
                } else { th!("nothing to offer"); }
            }
            205 => { // vision_quest
                self.organisms[idx].sleep_debt = (self.organisms[idx].sleep_debt - 0.10).max(0.0);
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.08).max(0.0);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.06).min(1.0);
                reward += 0.005; th!("on a vision quest");
                if self.rng.gen::<f32>() < 0.10 {
                    disc!("vision", "returned with a vision");
                }
            }
            206 => { // burial_rite
                let grieving: Vec<usize> = kin.iter().copied()
                    .filter(|&k| self.organisms[k].grief_ticks > 0).collect();
                if !grieving.is_empty() {
                    for &ki in &grieving {
                        self.organisms[ki].grief_ticks = self.organisms[ki].grief_ticks.saturating_sub(30);
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.05).min(1.0);
                    }
                    reward += 0.006; th!("performing a burial rite");
                    disc!("burial-rite", "buried the dead with honour");
                } else { th!("honouring the lost"); }
            }
            207 => { // wedding_ceremony
                if kin.len() >= 2 {
                    for &ki in kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                    }
                    reward += 0.006 * kin.len().min(5) as f32;
                    th!("celebrating a wedding");
                    disc!("wedding", "held a wedding ceremony");
                } else { th!("dreaming of a wedding"); }
            }
            208 => { // coming_of_age
                if let Some(&ki) = kin.iter().filter(|&&k| {
                    let a = self.organisms[k].age;
                    a >= 700 && a < 900
                }).min_by_key(|&&k| self.organisms[k].age) {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.08).min(1.0);
                    reward += 0.008; th!("a coming-of-age rite");
                    disc!("rites-of-passage", "marked a coming of age");
                } else { th!("watching the young grow"); }
            }
            209 => { // harvest_festival
                if matches!(tile, Tile::Food) || self.organisms[idx].inv_food >= 2 {
                    for &ki in kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.05).min(1.0);
                        self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.08).max(0.0);
                    }
                    reward += 0.005 * kin.len().min(6) as f32;
                    th!("a harvest festival");
                    disc!("harvest-festival", "held a harvest festival");
                } else { th!("planning a festival"); }
            }
            210 => { // bless_a_field
                if matches!(tile, Tile::Grass | Tile::Food) {
                    self.grid.fertility[fidx] = (self.grid.fertility[fidx] + 0.05).min(0.97);
                    reward += 0.004; th!("blessing the field");
                    disc!("field-blessing", "blessed the fields");
                } else { th!("seeking fields to bless"); }
            }

            // ── Travel & exploration (211..=220) ─────────────────────
            211 => { // swim_across
                if water_near {
                    self.organisms[idx].energy = (self.organisms[idx].energy - 0.04).max(0.0);
                    reward += 0.004; th!("swimming across");
                    disc!("swimming", "learned to swim");
                } else { th!("seeking a crossing"); }
            }
            212 => { // ford_river
                if water_near {
                    self.grid.leave_trail(ix, iy, TrailKind::Path, 0.8);
                    reward += 0.004; th!("fording the river");
                    disc!("fords", "found a ford");
                } else { th!("no river here"); }
            }
            213 => { // climb_tree
                if matches!(tile, Tile::Grass) && self.rng.gen::<f32>() < 0.5 {
                    let ms = self.organisms[idx].traits.memory_strength;
                    for dx in -8..=8 { for dy in -8..=8 {
                        if matches!(self.grid.get(ix + dx, iy + dy), Tile::Food) {
                            Organism::remember(&mut self.organisms[idx].food_memory,
                                               ix + dx, iy + dy, 0.4, ms);
                        }
                    }}
                    reward += 0.004; th!("scanning from a tree");
                } else { th!("no good tree to climb"); }
            }
            214 => { // follow_river
                if water_near {
                    self.grid.leave_trail(ix, iy, TrailKind::Path, 0.6);
                    reward += 0.003; th!("following the river");
                } else { th!("seeking the river"); }
            }
            215 => { // blaze_trail
                self.grid.leave_trail(ix, iy, TrailKind::Path, 1.4);
                reward += 0.003; th!("blazing a trail");
                disc!("trailblazing", "blazed a new trail");
            }
            216 => { // build_cairn
                if self.organisms[idx].inv_stone > 0 {
                    self.organisms[idx].inv_stone -= 1;
                    self.grid.add_structure(ix, iy, 0.015);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.004; th!("stacking a cairn");
                    disc!("cairn", "built a navigation cairn");
                } else { th!("no stone for a cairn"); }
            }
            217 => { // chart_coast
                if water_near {
                    let ms = self.organisms[idx].traits.memory_strength;
                    Organism::remember(&mut self.organisms[idx].water_memory, ix, iy, 0.5, ms);
                    reward += 0.004; th!("charting the coast");
                    disc!("coastal-charts", "charted the coast");
                } else { th!("looking for the shore"); }
            }
            218 => { // retrace_steps
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.04).max(0.0);
                reward += 0.002; th!("retracing my steps");
            }
            219 => { // descend_canyon
                let here = self.grid.elevation.get(fidx).copied().unwrap_or(0.0);
                if here < 0.3 {
                    reward += 0.005; th!("descending into the canyon");
                    disc!("canyons", "descended a canyon");
                } else { th!("walking the rim"); }
            }
            220 => { // map_landmark
                self.grid.add_structure(ix, iy, 0.008);
                let ms = self.organisms[idx].traits.memory_strength;
                Organism::remember(&mut self.organisms[idx].food_memory, ix, iy, 0.4, ms);
                reward += 0.003; th!("noting a landmark");
                disc!("landmarks", "noted a landmark");
            }

            // ── Self-care & mood (221..=225) ─────────────────────────
            221 => { // nap
                self.organisms[idx].sleep_debt = (self.organisms[idx].sleep_debt - 0.15).max(0.0);
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.06).min(1.0);
                reward += 0.003; th!("taking a nap");
            }
            222 => { // daydream
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.04).max(0.0);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
                reward += 0.002; th!("daydreaming");
            }
            223 => { // howl_at_moon
                if self.is_night() {
                    for &ki in kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.02).min(1.0);
                    }
                    reward += 0.002 + 0.001 * kin.len().min(5) as f32;
                    th!("howling at the moon");
                    disc!("howl", "howled with the tribe");
                } else { th!("waiting for the moon"); }
            }
            224 => { // play_with_kids
                let kids: Vec<usize> = kin.iter().copied()
                    .filter(|&k| self.organisms[k].age < 500).collect();
                if !kids.is_empty() {
                    for &ki in &kids {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                        self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.10).max(0.0);
                    }
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.03).min(1.0);
                    reward += 0.004 * kids.len().min(4) as f32;
                    th!("playing with the kids");
                } else { th!("looking for kids to play"); }
            }
            225 => { // sit_by_water
                if water_near {
                    self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.05).max(0.0);
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                    reward += 0.003; th!("sitting by the water");
                } else { th!("looking for water to sit by"); }
            }

            _ => {}
        }

        let _ = (sx, sy);  // silence unused-var warnings for actions that don't reference them
        reward
    }
}
