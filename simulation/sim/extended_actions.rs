//! Extended action set (indices 26..=125). Dispatched from
//! `Simulation::tick_organism` and discovered via Q-learning exploration.

use rand::Rng;

use crate::organism::organism::Organism;
use crate::world::grid::{TrailKind, WorldGrid};
use crate::world::tiles::Tile;
use super::world_events::push_event;
use super::simulation::Simulation;

impl Simulation {
    /// Dispatch for action indices >= 26. Returns the learning reward.
    pub(crate) fn apply_extended_action(
        &mut self, idx: usize, action: usize, ix: i32, iy: i32,
    ) -> f32 {
        let mut reward = 0.0f32;
        let tick = self.tick_count;
        let (sx, sy) = (self.organisms[idx].x, self.organisms[idx].y);
        let lid = self.organisms[idx].lineage_id.clone();
        let tile = self.grid.get(ix, iy);

        // Kin within a short radius - reused by many social acts.
        let kin: Vec<usize> = self.organisms.iter().enumerate()
            .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid)
            .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
            .map(|(i, _)| i)
            .collect();
        // Any organism within a short radius.
        let near: Vec<usize> = self.organisms.iter().enumerate()
            .filter(|(i, o)| *i != idx && o.alive)
            .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
            .map(|(i, _)| i)
            .collect();
        // Adjacency helpers.
        let rock_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
            .iter().any(|&(dx,dy)| matches!(self.grid.get(ix+dx, iy+dy), Tile::Rock | Tile::Mineral));
        let water_near = (-2i32..=2).any(|dx| (-2i32..=2).any(|dy|
            matches!(self.grid.get(ix+dx, iy+dy), Tile::Water)));
        let fire_near = [(-1,0),(1,0),(0,-1),(0,1)]
            .iter().any(|&(dx,dy)| matches!(self.grid.get(ix+dx, iy+dy), Tile::Campfire | Tile::Fire));
        let fidx = WorldGrid::idx(ix, iy);

        macro_rules! th { ($t:expr) => { self.organisms[idx].think($t, tick); }; }
        macro_rules! disc { ($what:expr, $msg:expr) => {{
            let nm = self.organisms[idx].name.clone();
            if self.organisms[idx].discover($what) {
                push_event(&mut self.events, tick, "build", &nm, $msg);
            }
        }};}
        macro_rules! evt { ($kind:expr, $msg:expr) => {{
            let nm = self.organisms[idx].name.clone();
            push_event(&mut self.events, tick, $kind, &nm, $msg);
        }};}

        match action {
            // ── Resource gathering ────────────────────────────────────
            26 => { // mine
                if rock_near && self.organisms[idx].carry_room() > 0 {
                    self.organisms[idx].inv_stone = self.organisms[idx].inv_stone.saturating_add(1);
                    reward += 0.012; th!("mining stone");
                    disc!("mining", "learned to mine");
                } else { th!("looking for ore"); }
            }
            27 => { // chop_wood
                if matches!(tile, Tile::Grass) && self.organisms[idx].carry_room() > 0
                    && self.rng.gen::<f32>() < 0.5 {
                    self.organisms[idx].inv_wood = self.organisms[idx].inv_wood.saturating_add(1);
                    reward += 0.010; th!("chopping wood");
                    disc!("woodcutting", "learned to fell wood");
                } else { th!("gathering timber"); }
            }
            28 => { // fish
                if water_near {
                    if self.rng.gen::<f32>() < 0.30 {
                        self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                        reward += 0.02; th!("caught a fish");
                        disc!("fishing", "learned to fish");
                    } else { th!("fishing the shallows"); }
                } else { th!("looking for water to fish"); }
            }
            29 => { // quarry
                if rock_near {
                    self.organisms[idx].inv_stone = self.organisms[idx].inv_stone.saturating_add(1);
                    reward += 0.008; th!("quarrying"); disc!("quarrying", "opened a quarry");
                } else { th!("seeking a rock face"); }
            }
            30 => { // plant_tree
                if matches!(tile, Tile::Grass) {
                    self.grid.fertility[fidx] = (self.grid.fertility[fidx] + 0.04).min(0.95);
                    self.grid.add_structure(ix, iy, 0.005);
                    reward += 0.006; th!("planting a sapling");
                    disc!("forestry", "planted the first tree");
                }
            }
            31 => { // clear_land
                if matches!(tile, Tile::Ash | Tile::Scorched) {
                    self.grid.set(ix, iy, Tile::Grass);
                    reward += 0.01; th!("clearing the land");
                    disc!("land-clearing", "cleared scorched ground");
                } else { th!("tidying the ground"); }
            }
            32 => { // dig_roots
                if matches!(tile, Tile::Grass) && self.rng.gen::<f32>() < 0.25 {
                    self.organisms[idx].energy = (self.organisms[idx].energy + 0.12).min(1.0);
                    reward += 0.01; th!("digging up roots");
                    disc!("root-digging", "learned to dig roots");
                } else { th!("digging for roots"); }
            }
            33 => { // collect_water
                if water_near && self.organisms[idx].carry_room() > 0 {
                    self.organisms[idx].inv_water = self.organisms[idx].inv_water.saturating_add(2);
                    reward += 0.008; th!("filling a canteen");
                } else { th!("seeking water to carry"); }
            }
            34 => { // forage_berries
                if matches!(tile, Tile::Grass) && self.rng.gen::<f32>() < 0.18 {
                    self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                    reward += 0.012; th!("picking berries");
                    disc!("berry-picking", "found a berry patch");
                } else { th!("foraging for berries"); }
            }
            35 => { // harvest
                if matches!(tile, Tile::Food) {
                    self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(2);
                    self.grid.set(ix, iy, Tile::Grass);
                    reward += 0.018; th!("harvesting"); disc!("harvest", "brought in a harvest");
                }
            }
            36 => { // compost
                if matches!(tile, Tile::Grass | Tile::Ash) && self.grid.fertility[fidx] < 0.9 {
                    self.grid.fertility[fidx] = (self.grid.fertility[fidx] + 0.06).min(0.95);
                    reward += 0.006; th!("composting"); disc!("composting", "learned composting");
                }
            }
            37 => { // irrigate
                if water_near && matches!(tile, Tile::Grass) {
                    for dx in -2..=2 { for dy in -2..=2 {
                        let i2 = WorldGrid::idx(ix+dx, iy+dy);
                        if i2 < self.grid.fertility.len() {
                            self.grid.fertility[i2] = (self.grid.fertility[i2] + 0.02).min(0.92);
                        }
                    }}
                    reward += 0.01; th!("irrigating the field");
                    disc!("irrigation", "dug an irrigation channel");
                }
            }
            38 => { // plant_crops
                if matches!(tile, Tile::Grass) && self.grid.fertility[fidx] > 0.4 {
                    self.grid.set(ix, iy, Tile::Food);
                    self.grid.reduce_fertility(ix, iy, 0.04);
                    reward += 0.014; th!("planting crops"); disc!("farm", "planted a crop field");
                }
            }

            // ── Construction ──────────────────────────────────────────
            39 => { // build_wall
                if self.organisms[idx].inv_stone > 0 || self.organisms[idx].inv_wood > 0 {
                    self.consume_material(idx);
                    self.grid.add_structure(ix, iy, 0.06);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.012; th!("raising a wall"); disc!("walls", "built the first wall");
                }
            }
            40 => { // build_well
                if matches!(tile, Tile::Sand | Tile::Grass) && self.rng.gen::<f32>() < 0.4 {
                    self.grid.set(ix, iy, Tile::Water);
                    reward += 0.05; th!("digging a well"); disc!("well", "dug a well");
                }
            }
            41 => { // build_bridge
                if water_near {
                    self.grid.leave_trail(ix, iy, TrailKind::Path, 2.0);
                    self.grid.add_structure(ix, iy, 0.03);
                    reward += 0.01; th!("building a bridge"); disc!("bridge", "spanned a bridge");
                }
            }
            42 => { // build_road
                self.grid.leave_trail(ix, iy, TrailKind::Path, 2.5);
                reward += 0.004; th!("laying a road"); disc!("roads", "laid the first road");
            }
            43 => { // build_granary
                if self.organisms[idx].inv_wood > 0 {
                    self.consume_material(idx);
                    self.grid.add_structure(ix, iy, 0.05);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.014; th!("building a granary"); disc!("granary", "raised a granary");
                }
            }
            44 => { // build_watchtower
                if self.organisms[idx].inv_wood > 0 || self.organisms[idx].inv_stone > 0 {
                    self.consume_material(idx);
                    self.grid.add_structure(ix, iy, 0.07);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.014; th!("building a watchtower");
                    disc!("watchtower", "raised a watchtower");
                }
            }
            45 => { // build_dock
                if water_near {
                    self.grid.add_structure(ix, iy, 0.04);
                    self.active_structure_tiles.insert((ix, iy));
                    reward += 0.01; th!("building a dock"); disc!("dock", "built a dock");
                }
            }
            46 => { // build_totem
                self.grid.add_structure(ix, iy, 0.03);
                self.active_structure_tiles.insert((ix, iy));
                reward += 0.006; th!("raising a totem"); disc!("totem", "carved a tribal totem");
            }
            47 => { // build_shrine
                self.grid.add_structure(ix, iy, 0.04);
                self.active_structure_tiles.insert((ix, iy));
                reward += 0.008; th!("building a shrine"); disc!("religion", "built a shrine");
            }
            48 => { // build_fence
                self.grid.add_structure(ix, iy, 0.02);
                self.active_structure_tiles.insert((ix, iy));
                reward += 0.004; th!("setting a fence"); disc!("fencing", "fenced the homestead");
            }
            49 => { // build_hut
                if self.organisms[idx].inv_wood >= 1
                    && matches!(tile, Tile::Grass | Tile::Sand | Tile::Snow) {
                    self.organisms[idx].inv_wood -= 1;
                    self.grid.set(ix, iy, Tile::Hut);
                    reward += 0.04; th!("building a hut"); disc!("shelter", "built a hut");
                }
            }
            50 => { // fortify
                self.grid.add_structure(ix, iy, 0.05);
                self.active_structure_tiles.insert((ix, iy));
                reward += 0.008; th!("fortifying the camp"); disc!("fortification", "fortified the camp");
            }

            // ── Crafting ──────────────────────────────────────────────
            51 => { self.craft(idx, "spear",     0.014, &mut reward); th!("knapping a spear"); }
            52 => { self.craft(idx, "basket",    0.010, &mut reward); th!("weaving a basket"); }
            53 => { self.craft(idx, "net",       0.012, &mut reward); th!("knotting a net"); }
            54 => { self.craft(idx, "raft",      0.016, &mut reward); th!("lashing a raft"); }
            55 => { self.craft(idx, "toolmaking",0.014, &mut reward); th!("knapping stone tools"); }
            56 => { self.craft(idx, "clothing",  0.012, &mut reward); th!("stitching hides"); }
            57 => { self.craft(idx, "leatherwork",0.010,&mut reward); th!("tanning a hide"); }
            58 => { self.craft(idx, "drum",      0.008, &mut reward); th!("building a drum"); }
            59 => { // craft_medicine
                if fire_near || self.organisms[idx].discoveries.contains("fire") {
                    self.craft(idx, "medicine", 0.016, &mut reward);
                    th!("brewing medicine");
                } else { th!("seeking herbs"); }
            }
            60 => { // cook_food
                if fire_near && matches!(tile, Tile::Food) {
                    self.organisms[idx].energy = (self.organisms[idx].energy + 0.30).min(1.0);
                    self.grid.set(ix, iy, Tile::Grass);
                    reward += 0.02; th!("cooking food"); disc!("cooking", "learned to cook");
                } else { th!("preparing a meal"); }
            }
            61 => { // smoke_meat
                if fire_near && self.organisms[idx].inv_food > 0 {
                    reward += 0.008; th!("smoking meat");
                    disc!("preservation", "learned to preserve food");
                }
            }
            62 => { // light_torch
                if fire_near || self.organisms[idx].inv_wood > 0 {
                    reward += 0.006; th!("lighting a torch"); disc!("torch", "made a torch");
                }
            }
            63 => { self.craft(idx, "pottery",   0.010, &mut reward); th!("shaping clay"); }
            64 => { self.craft(idx, "rope",      0.008, &mut reward); th!("twisting rope"); }
            65 => { self.craft(idx, "bow",       0.016, &mut reward); th!("carving a bow"); }

            // ── Knowledge & culture ───────────────────────────────────
            66 => { // study
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.10).max(0.0);
                reward += 0.003; th!("studying the world");
                if self.rng.gen::<f32>() < 0.04 { disc!("scholarship", "valued knowledge"); }
            }
            67 => { // experiment
                th!("experimenting");
                if self.rng.gen::<f32>() < 0.06 {
                    let inv = ["tinkering","invention","engineering","chemistry"];
                    let w = inv[self.rng.gen_range(0..inv.len())];
                    disc!(w, "stumbled on something new");
                    reward += 0.02;
                } else { reward += 0.002; }
            }
            68 => { // observe_stars
                if self.is_night() {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                    reward += 0.004; th!("watching the stars");
                    disc!("astronomy", "began mapping the stars");
                } else { th!("waiting for night"); }
            }
            69 => { // observe_weather
                reward += 0.003; th!("reading the weather");
                disc!("meteorology", "learned to read the sky");
            }
            70 => { // map_terrain
                let ms = self.organisms[idx].traits.memory_strength;
                for dx in -12..=12 { for dy in -12..=12 {
                    match self.grid.get(ix+dx, iy+dy) {
                        Tile::Food  => Organism::remember(&mut self.organisms[idx].food_memory,  ix+dx, iy+dy, 0.5, ms),
                        Tile::Water => Organism::remember(&mut self.organisms[idx].water_memory, ix+dx, iy+dy, 0.5, ms),
                        _ => {}
                    }
                }}
                reward += 0.004; th!("mapping the terrain");
                disc!("cartography", "drew the first map");
            }
            71 => { // name_place
                self.grid.add_structure(ix, iy, 0.01);
                reward += 0.003; th!("naming this place"); disc!("place-names", "named a landmark");
            }
            72 => { // tell_story
                for &ki in &kin {
                    self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.08).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.03).min(1.0);
                }
                reward += 0.004 * kin.len().min(5) as f32;
                th!("telling a story");
                if !kin.is_empty() { disc!("storytelling", "told the tribe a story"); }
            }
            73 => { // paint_symbol
                if matches!(tile, Tile::Rock) || self.grid.structure_at(ix, iy) > 0.1 {
                    reward += 0.005; th!("painting a symbol");
                    disc!("art", "painted the first symbol");
                    evt!("social", "left a painting on the rock");
                } else { th!("looking for a canvas"); }
            }
            74 => { // carve_idol
                if self.organisms[idx].inv_stone > 0 || self.organisms[idx].inv_wood > 0 {
                    self.consume_material(idx);
                    reward += 0.008; th!("carving an idol");
                    disc!("sculpture", "carved an idol");
                }
            }
            75 => { // perform_ritual
                if fire_near {
                    for &ki in &kin {
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.05).min(1.0);
                        self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.05).max(0.0);
                    }
                    reward += 0.005 * kin.len().min(5) as f32;
                    th!("performing a ritual");
                    disc!("ritual", "led a ritual");
                } else { th!("preparing a rite"); }
            }
            76 => { // pray
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.04).max(0.0);
                reward += 0.003; th!("praying"); disc!("faith", "found faith");
            }
            77 => { // celebrate
                for &ki in &kin {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                    self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.10).max(0.0);
                }
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                reward += 0.005 * kin.len().min(5) as f32;
                th!("celebrating");
                if !kin.is_empty() { evt!("social", "led a celebration"); }
            }
            78 => { // feast
                if matches!(tile, Tile::Food) || self.organisms[idx].inv_food > 0 {
                    if self.organisms[idx].inv_food > 0 { self.organisms[idx].inv_food -= 1; }
                    for &ki in &kin {
                        self.organisms[ki].energy = (self.organisms[ki].energy + 0.10).min(1.0);
                    }
                    reward += 0.006 * kin.len().min(5) as f32;
                    th!("sharing a feast");
                    if !kin.is_empty() { disc!("feasting", "held the first feast"); }
                }
            }
            79 => { // sing_anthem
                reward += 0.003; th!("singing the tribe's song");
                disc!("anthem", "composed a tribal anthem");
            }

            // ── Social bonding ────────────────────────────────────────
            80 => { // console
                if let Some(&ki) = kin.iter().max_by_key(|&&k| self.organisms[k].grief_ticks) {
                    self.organisms[ki].grief_ticks = self.organisms[ki].grief_ticks.saturating_sub(20);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                    reward += 0.006; th!("consoling kin");
                } else { th!("looking for someone to comfort"); }
            }
            81 => { // comfort_child
                if let Some(&ki) = kin.iter().filter(|&&k| self.organisms[k].age < 600)
                    .min_by_key(|&&k| self.organisms[k].age) {
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.08).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.06).min(1.0);
                    reward += 0.006; th!("comforting a child");
                } else { th!("watching over the young"); }
            }
            82 => { // praise
                if let Some(&ki) = kin.first() {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.05).min(1.0);
                    let oid = self.organisms[ki].id.clone();
                    let t = self.organisms[idx].org_trust.entry(oid).or_insert(0.0);
                    *t = (*t + 0.05).min(1.0);
                    reward += 0.004; th!("praising a friend");
                } else { th!("looking for someone to praise"); }
            }
            83 => { // scold
                if let Some(&ki) = near.first() {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort - 0.04).max(0.0);
                    reward += 0.001; th!("scolding");
                } else { th!("grumbling"); }
            }
            84 => { // gossip
                if let Some(&ki) = kin.first() {
                    let snap = self.organisms[idx].food_memory.iter()
                        .take(3).map(|(&k,&v)| (k,v)).collect::<Vec<_>>();
                    let ms = self.organisms[ki].traits.memory_strength;
                    for (k, v) in snap {
                        Organism::remember(&mut self.organisms[ki].food_memory, k.0, k.1, v*0.5, ms);
                    }
                    reward += 0.004; th!("trading gossip");
                } else { th!("looking for news"); }
            }
            85 => { // greet_stranger
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.03);
                    reward += 0.003; th!("greeting a stranger");
                } else { th!("looking for newcomers"); }
            }
            86 => { // apologize
                if let Some(&ki) = near.first() {
                    let oid = self.organisms[ki].id.clone();
                    let my_id = self.organisms[idx].id.clone();
                    let t = self.organisms[idx].org_trust.entry(oid).or_insert(0.0);
                    *t = (*t + 0.06).min(1.0);
                    let t2 = self.organisms[ki].org_trust.entry(my_id).or_insert(0.0);
                    *t2 = (*t2 + 0.06).min(1.0);
                    reward += 0.004; th!("making amends");
                } else { th!("regretful"); }
            }
            87 => { // mediate
                if near.len() >= 2 {
                    let (a, b) = (near[0], near[1]);
                    let la = self.organisms[a].lineage_id.clone();
                    let lb = self.organisms[b].lineage_id.clone();
                    if la != lb {
                        self.organisms[a].update_attitude(&lb, 0.04);
                        self.organisms[b].update_attitude(&la, 0.04);
                        reward += 0.008; th!("mediating a dispute");
                        disc!("diplomacy", "brokered a peace");
                    } else { th!("settling a quarrel"); }
                } else { th!("watching for trouble"); }
            }
            88 => { // boast
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                for &ki in &near {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort - 0.01).max(0.0);
                }
                reward += 0.002; th!("boasting");
            }
            89 => { // befriend
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.05);
                    let oid = self.organisms[ki].id.clone();
                    let t = self.organisms[idx].org_trust.entry(oid).or_insert(0.0);
                    *t = (*t + 0.08).min(1.0);
                    reward += 0.006; th!("making a friend");
                } else { th!("hoping for a friend"); }
            }

            // ── Diplomacy & inter-tribal ──────────────────────────────
            90 => { // form_alliance
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid
                        && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) > 0.2) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.10);
                    reward += 0.01; th!("forging an alliance");
                    disc!("alliance", "forged an alliance");
                } else { th!("seeking allies"); }
            }
            91 => { // declare_rivalry
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, -0.10);
                    reward += 0.002; th!("declaring a rival");
                } else { th!("wary of outsiders"); }
            }
            92 => { // negotiate_peace
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid
                        && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < -0.1) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.12);
                    self.organisms[ki].update_attitude(&lid, 0.10);
                    reward += 0.012; th!("negotiating peace");
                    disc!("peacemaking", "negotiated a truce");
                } else { th!("hoping for peace"); }
            }
            93 => { // surrender
                for &ki in &near {
                    let their = self.organisms[ki].lineage_id.clone();
                    if their != lid { self.organisms[idx].update_attitude(&their, 0.06); }
                }
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.05).max(0.0);
                reward += 0.001; th!("standing down");
            }
            94 => { // trade_goods
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid) {
                    if self.organisms[idx].inv_food > 0 && self.organisms[ki].carry_room() > 0 {
                        self.organisms[idx].inv_food -= 1;
                        self.organisms[ki].inv_food = self.organisms[ki].inv_food.saturating_add(1);
                        if self.organisms[ki].inv_stone > 0 {
                            self.organisms[ki].inv_stone -= 1;
                            self.organisms[idx].inv_stone = self.organisms[idx].inv_stone.saturating_add(1);
                        }
                        let their = self.organisms[ki].lineage_id.clone();
                        self.organisms[idx].update_attitude(&their, 0.04);
                        reward += 0.01; th!("trading goods");
                        disc!("trade", "opened trade with another tribe");
                    } else { th!("nothing to trade"); }
                } else { th!("looking for a trade partner"); }
            }
            95 => { // recruit
                if let Some(&ki) = near.iter()
                    .find(|&&k| self.organisms[k].lineage_id != lid) {
                    let their = self.organisms[ki].lineage_id.clone();
                    self.organisms[idx].update_attitude(&their, 0.03);
                    self.organisms[ki].loneliness = (self.organisms[ki].loneliness - 0.06).max(0.0);
                    reward += 0.003; th!("welcoming an outsider");
                } else { th!("calling for newcomers"); }
            }

            // ── Warfare & territory ───────────────────────────────────
            96 => { // raid
                reward += self.do_raid(idx, &near, false);
                if reward <= 0.0 { th!("looking for a target"); }
            }
            97 => { // ambush
                reward += self.do_raid(idx, &near, true);
                if reward <= 0.0 { th!("lying in wait"); }
            }
            98 => { // pillage
                // Damage hostile structure nearby and salvage materials.
                let mut hit = false;
                'pl: for dx in -3..=3 { for dy in -3..=3 {
                    let (px, py) = (ix+dx, iy+dy);
                    if self.grid.structure_at(px, py) > 0.2 {
                        self.grid.add_structure(px, py, -0.10);
                        self.organisms[idx].inv_wood = self.organisms[idx].inv_wood.saturating_add(1);
                        hit = true; break 'pl;
                    }
                }}
                if hit { reward += 0.012; th!("pillaging"); disc!("pillage", "pillaged a rival camp"); }
                else { th!("scouting for plunder"); }
            }
            99 => { // sabotage
                let mut hit = false;
                'sb: for dx in -3..=3 { for dy in -3..=3 {
                    if matches!(self.grid.get(ix+dx, iy+dy), Tile::Food) {
                        // Only sabotage if no kin is standing on it.
                        self.grid.set(ix+dx, iy+dy, Tile::Grass);
                        hit = true; break 'sb;
                    }
                }}
                if hit { reward += 0.008; th!("sabotaging supplies"); }
                else { th!("seeking something to spoil"); }
            }
            100 => { // patrol
                self.grid.leave_trail(ix, iy, TrailKind::Path, 1.0);
                for &ki in &kin {
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.02).max(0.0);
                }
                reward += 0.003; th!("patrolling the border");
            }
            101 => { // stand_guard
                for &ki in &kin {
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.04).max(0.0);
                }
                reward += 0.002; th!("standing guard");
            }
            102 => { // rally
                for &ki in &kin {
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.08).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.03).min(1.0);
                }
                reward += 0.005 * kin.len().min(6) as f32;
                th!("rallying the tribe");
                if kin.len() >= 3 { disc!("warband", "rallied a warband"); }
            }
            103 => { // defend
                self.organisms[idx].health = (self.organisms[idx].health + 0.02).min(1.0);
                reward += 0.003; th!("holding the line");
            }
            104 => { // retreat
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.04).max(0.0);
                reward += 0.002; th!("falling back to safety");
            }
            105 => { // scout_enemy
                let ms = self.organisms[idx].traits.memory_strength;
                let mut spotted = 0;
                let hostiles: Vec<(i32,i32)> = self.organisms.iter()
                    .filter(|o| o.alive && o.lineage_id != lid)
                    .filter(|o| (o.x - sx).abs() + (o.y - sy).abs() <= 18.0)
                    .map(|o| (o.x as i32, o.y as i32))
                    .collect();
                for (hx, hy) in hostiles {
                    if self.organisms[idx].attitude_toward(
                        &self.nearest_lineage_at(hx, hy).unwrap_or_default()) < -0.2 {
                        Organism::remember(&mut self.organisms[idx].danger_memory, hx, hy, 0.5, ms);
                        spotted += 1;
                    }
                }
                if spotted > 0 { reward += 0.005; }
                th!("scouting the enemy");
            }
            106 => { // claim_land
                self.grid.leave_trail(ix, iy, TrailKind::Path, 1.8);
                self.grid.add_structure(ix, iy, 0.015);
                self.active_structure_tiles.insert((ix, iy));
                reward += 0.004; th!("claiming this land");
                disc!("territory", "claimed new territory");
            }

            // ── Self-care ─────────────────────────────────────────────
            107 => { // bathe
                if water_near {
                    self.organisms[idx].infection = (self.organisms[idx].infection * 0.85).max(0.0);
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                    reward += 0.005; th!("bathing");
                } else { th!("looking for clean water"); }
            }
            108 => { // rest_deeply
                self.organisms[idx].sleep_debt = (self.organisms[idx].sleep_debt - 0.20).max(0.0);
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.04).min(1.0);
                reward += 0.003; th!("resting deeply");
            }
            109 => { // stretch
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.05).max(0.0);
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.02).min(1.0);
                reward += 0.002; th!("stretching");
            }
            110 => { // sunbathe
                if !self.is_night() {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.04).min(1.0);
                    self.organisms[idx].energy = (self.organisms[idx].energy + 0.015).min(1.0);
                    reward += 0.002; th!("basking in the sun");
                } else { th!("waiting for the sun"); }
            }
            111 => { // groom_self
                self.organisms[idx].infection = (self.organisms[idx].infection * 0.94).max(0.0);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.02).min(1.0);
                reward += 0.002; th!("grooming");
            }
            112 => { // meditate_deep
                self.organisms[idx].fear_level = (self.organisms[idx].fear_level - 0.10).max(0.0);
                self.organisms[idx].grief_ticks = self.organisms[idx].grief_ticks.saturating_sub(4);
                self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                reward += 0.003; th!("deep in meditation");
            }
            113 => { // play_game
                for &ki in &kin {
                    self.organisms[ki].boredom = (self.organisms[ki].boredom - 0.12).max(0.0);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.04).min(1.0);
                }
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.12).max(0.0);
                reward += 0.004 * kin.len().min(5) as f32;
                th!("playing a game");
            }
            114 => { // teach_skill
                if let Some(&ki) = kin.iter().filter(|&&k| self.organisms[k].age < 800)
                    .min_by_key(|&&k| self.organisms[k].age) {
                    let mine: Vec<String> = self.organisms[idx].discoveries.iter().cloned().collect();
                    let mut taught = false;
                    for d in mine {
                        if !self.organisms[ki].discoveries.contains(&d) {
                            self.organisms[ki].discoveries.insert(d);
                            taught = true; break;
                        }
                    }
                    if taught { reward += 0.012; }
                    th!("teaching a skill");
                } else { th!("looking for a pupil"); }
            }
            115 => { // learn_skill
                if let Some(&ki) = kin.iter().find(|&&k| self.organisms[k].is_elder) {
                    let theirs: Vec<String> = self.organisms[ki].discoveries.iter().cloned().collect();
                    for d in theirs {
                        if !self.organisms[idx].discoveries.contains(&d) {
                            self.organisms[idx].discoveries.insert(d);
                            reward += 0.012; break;
                        }
                    }
                    th!("learning from an elder");
                } else { th!("seeking a teacher"); }
            }
            116 => { // practice
                self.organisms[idx].boredom = (self.organisms[idx].boredom - 0.04).max(0.0);
                reward += 0.002; th!("practising a craft");
            }

            // ── Exploration & animals ─────────────────────────────────
            117 => { // explore_cave
                if rock_near {
                    reward += 0.006; th!("exploring a cave");
                    disc!("caves", "explored a cave");
                } else { th!("searching for caves"); }
            }
            118 => { // climb_peak
                let here = self.grid.elevation.get(fidx).copied().unwrap_or(0.0);
                if here > 0.6 {
                    self.organisms[idx].comfort = (self.organisms[idx].comfort + 0.05).min(1.0);
                    reward += 0.006; th!("standing on the peak");
                    disc!("mountaineering", "climbed the highest peak");
                } else { th!("climbing higher"); }
            }
            119 => { // tame_animal
                let near_animal = self.animals.iter()
                    .any(|a| a.alive && (a.x - sx).abs() + (a.y - sy).abs() <= 4.0);
                if near_animal {
                    if self.rng.gen::<f32>() < 0.15 {
                        reward += 0.02; th!("taming an animal");
                        disc!("animal-taming", "tamed a wild animal");
                    } else { th!("approaching an animal"); }
                } else { th!("searching for animals"); }
            }
            120 => { // herd_animals
                let near_animal = self.animals.iter()
                    .any(|a| a.alive && (a.x - sx).abs() + (a.y - sy).abs() <= 6.0);
                if near_animal {
                    reward += 0.006; th!("herding animals");
                    disc!("herding", "began herding animals");
                } else { th!("looking for a herd"); }
            }
            121 => { // hunt_small_game
                if self.rng.gen::<f32>() < 0.20 {
                    self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                    reward += 0.012; th!("caught small game");
                    disc!("trapping-game", "learned to hunt small game");
                } else { th!("tracking small game"); }
            }
            122 => { // set_trap
                self.grid.leave_trail(ix, iy, TrailKind::Food, 0.5);
                reward += 0.004; th!("setting a trap"); disc!("trap", "set a hunting trap");
            }
            123 => { // check_trap
                if self.grid.trail_at(ix, iy, TrailKind::Food) > 0.3
                    && self.rng.gen::<f32>() < 0.35 {
                    self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
                    reward += 0.012; th!("a trap caught something");
                } else { th!("checking the traps"); }
            }
            124 => { // bless_kin
                for &ki in &kin {
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.04).min(1.0);
                    self.organisms[ki].fear_level = (self.organisms[ki].fear_level - 0.03).max(0.0);
                }
                reward += 0.003 * kin.len().min(5) as f32;
                th!("blessing the tribe");
            }
            125 => { // mourn_together
                let grieving: Vec<usize> = kin.iter().copied()
                    .filter(|&k| self.organisms[k].grief_ticks > 0).collect();
                for &ki in &grieving {
                    self.organisms[ki].grief_ticks = self.organisms[ki].grief_ticks.saturating_sub(10);
                    self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.04).min(1.0);
                }
                if !grieving.is_empty() {
                    reward += 0.005; th!("mourning together");
                } else { th!("remembering the lost"); }
            }

            _ => {}
        }

        self.organisms[idx].energy = (self.organisms[idx].energy - 0.0015).max(0.0);
        reward
    }

    /// Consume one unit of any carried building material.
    fn consume_material(&mut self, idx: usize) {
        let o = &mut self.organisms[idx];
        if o.inv_stone > 0 { o.inv_stone -= 1; }
        else if o.inv_wood > 0 { o.inv_wood -= 1; }
    }

    /// Generic craft: unlock a discovery and grant a reward the first
    /// time, a smaller reward on repeats.
    fn craft(&mut self, idx: usize, what: &str, base: f32, reward: &mut f32) {
        let nm = self.organisms[idx].name.clone();
        if self.organisms[idx].discover(what) {
            *reward += base;
            push_event(&mut self.events, self.tick_count, "build", &nm,
                       &format!("crafted {} for the first time", what));
        } else {
            *reward += base * 0.3;
        }
    }

    /// A raid: strike the nearest hostile organism. Ambush bypasses the
    /// usual challenge cooldown and hits harder but is riskier socially.
    fn do_raid(&mut self, idx: usize, near: &[usize], ambush: bool) -> f32 {
        let lid = self.organisms[idx].lineage_id.clone();
        let target = near.iter().copied().find(|&k| {
            self.organisms[k].lineage_id != lid
                && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < -0.15
        });
        let Some(ti) = target else { return 0.0; };

        let dmg = if ambush { 0.10 } else { 0.06 };
        self.organisms[ti].health = (self.organisms[ti].health - dmg).max(0.0);
        self.organisms[ti].fear_level = (self.organisms[ti].fear_level + 0.15).min(1.0);

        let their = self.organisms[ti].lineage_id.clone();
        self.organisms[idx].update_attitude(&their, -0.10);
        self.organisms[ti].update_attitude(&lid, -0.15);

        // Plunder a unit of food if the target is carrying any.
        if self.organisms[ti].inv_food > 0 {
            self.organisms[ti].inv_food -= 1;
            self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
        }

        let nm = self.organisms[idx].name.clone();
        let verb = if ambush { "ambushed" } else { "raided" };
        push_event(&mut self.events, self.tick_count, "challenge", &nm,
                   &format!("{} a rival from {}", verb, their));
        self.history.challenges_total += 1;
        self.organisms[idx].think(if ambush { "springing an ambush" } else { "raiding" },
                                  self.tick_count);
        if ambush { 0.014 } else { 0.010 }
    }

    /// Lineage id of the nearest living organism to a point (for
    /// territory / scouting heuristics).
    fn nearest_lineage_at(&self, x: i32, y: i32) -> Option<String> {
        self.organisms.iter()
            .filter(|o| o.alive)
            .min_by(|a, b| {
                let da = (a.x - x as f32).abs() + (a.y - y as f32).abs();
                let db = (b.x - x as f32).abs() + (b.y - y as f32).abs();
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|o| o.lineage_id.clone())
    }
}
