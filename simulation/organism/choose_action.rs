use rand::Rng;

use crate::world::{grid::{TrailKind, WorldGrid}, tiles::Tile};

use super::organism::{N_ACTIONS, Organism, QRowExt};

impl Organism {
    pub fn choose_action(&self, grid: &WorldGrid, tick: u64,
                         epsilon: f32, organisms: &[Organism], night: bool,
                         weather_kind: u8, rng: &mut impl Rng, _animal_near: bool,
                         cached_perception: &str, available: &[usize]) -> (usize, Option<String>)
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let tile = grid.get(ix, iy);
        let mut thought: Option<String> = None;
        macro_rules! set_thought { ($t:expr) => { thought = Some($t.to_string()); }; }

        if tile == Tile::Water && self.hydration < 0.95 {
            set_thought!("drinking"); return (9, thought);
        }
        if tile == Tile::Water
            && (self.hydration >= 0.75 || self.water_ticks > 5 || self.energy < 0.55 || self.health < 0.90)
        {
            if let Some(land) = self.nearest_land(grid, 14) {
                set_thought!("swimming ashore");
                return (self.toward(land, grid), thought);
            }
        }
        if tile == Tile::Food && self.energy < 0.95 {
            set_thought!("eating"); return (8, thought);
        }

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

        if self.infection > 0.30 {
            let healthy_kin_nearby: Vec<(f32, f32)> = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                    && o.lineage_id == self.lineage_id && o.infection < 0.10)
                .filter(|o| (o.x - self.x).abs() + (o.y - self.y).abs() <= 4.0)
                .map(|o| (o.x, o.y))
                .collect();
            if !healthy_kin_nearby.is_empty() {
                set_thought!("isolating (sick)");
                let cx = healthy_kin_nearby.iter().map(|p| p.0).sum::<f32>() / healthy_kin_nearby.len() as f32;
                let cy = healthy_kin_nearby.iter().map(|p| p.1).sum::<f32>() / healthy_kin_nearby.len() as f32;
                let dx = self.x - cx;
                let dy = self.y - cy;
                let target = (ix + (dx * 4.0).round() as i32, iy + (dy * 4.0).round() as i32);
                return (self.toward(target, grid), thought);
            }
        }

        let needs_ok = self.hydration > 0.62 && self.energy > 0.50;
        if needs_ok && !self.pregnant {
            if (self.health < 0.80 || self.sleep_debt > 0.12) && !self.near_shelter(grid) {
                if let Some(s) = self.find_shelter_tile(grid, 14) {
                    set_thought!("returning to shelter");
                    return (self.toward(s, grid), thought);
                }
            }
        }

        if self.hydration < 0.38 {
            let scan_r = if self.hydration < 0.20 { 24 } else if night { 8 } else { 14 };
            if let Some(v) = self.nearest_visible(grid, Tile::Water, scan_r) {
                set_thought!("moving to water");
                return (self.toward(v, grid), thought);
            }
            if let Some(t) = Self::best_remembered(&self.water_memory, self.x, self.y) {
                set_thought!("moving to known water");
                return (self.toward(t, grid), thought);
            }
            let kin_at_water = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                            && o.lineage_id == self.lineage_id
                            && (o.x - self.x).abs() + (o.y - self.y).abs() <= 14.0)
                .find(|o| matches!(grid.get(o.x as i32, o.y as i32), Tile::Water));
            if let Some(k) = kin_at_water {
                set_thought!("following kin to water");
                return (self.toward((k.x as i32, k.y as i32), grid), thought);
            }
            if let Some(t) = self.find_trail_target(grid, TrailKind::Water, 12) {
                set_thought!("following water trail");
                return (self.toward(t, grid), thought);
            }
            set_thought!("thirsty - searching");
        } else if self.energy < 0.42 {
            let scan_r = if self.energy < 0.20 { 16 } else if night { 6 } else { 9 };
            if let Some(v) = self.nearest_visible(grid, Tile::Food, scan_r) {
                set_thought!("moving to food");
                return (self.toward(v, grid), thought);
            }
            if let Some(t) = Self::best_remembered(&self.food_memory, self.x, self.y) {
                set_thought!("moving to known food");
                return (self.toward(t, grid), thought);
            }
            let kin_eating = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                            && o.lineage_id == self.lineage_id
                            && (o.x - self.x).abs() + (o.y - self.y).abs() <= 14.0)
                .find(|o| matches!(grid.get(o.x as i32, o.y as i32), Tile::Food));
            if let Some(k) = kin_eating {
                set_thought!("following kin to food");
                return (self.toward((k.x as i32, k.y as i32), grid), thought);
            }
            if let Some(t) = self.find_trail_target(grid, TrailKind::Food, 12) {
                set_thought!("following food trail");
                return (self.toward(t, grid), thought);
            }
            set_thought!("hungry - searching");
        }

        let needs_easy = self.hydration > 0.55 && self.energy > 0.50 && self.health > 0.55;
        let dist_home  = (self.x - self.home_x).abs() + (self.y - self.home_y).abs();
        let at_home_zone = dist_home < 6.0;
        let in_shelter = self.near_shelter(grid);

        if needs_easy && !night && !fire_dangerous {
            if self.carrying > 0 && self.carrying_type != 2 {
                if at_home_zone {
                    let hx = self.home_x as i32;
                    let hy = self.home_y as i32;
                    let on_home = ix == hx && iy == hy;
                    if !on_home {
                        set_thought!("building shelter");
                        return (self.toward((hx, hy), grid), thought);
                    }
                    set_thought!("packing shelter");
                    return (17, thought);
                }
                if dist_home < 60.0 {
                    set_thought!("carrying wood home");
                    return (self.toward((self.home_x as i32, self.home_y as i32), grid), thought);
                }
            }
            if self.carrying == 0
               && !in_shelter
               && self.energy > 0.55
               && self.hydration > 0.55
               && rng.gen::<f32>() < 0.25 + 0.20 * self.traits.curiosity
            {
                let gather_target = self.nearest_visible(grid, Tile::Grass, 10)
                    .or_else(|| self.nearest_visible(grid, Tile::Food, 10));
                if let Some(t) = gather_target {
                    let on_it = t == (ix, iy);
                    if on_it {
                        set_thought!("gathering wood");
                        return (14, thought);
                    }
                    set_thought!("seeking wood");
                    return (self.toward(t, grid), thought);
                }
            }
            if self.energy < 0.78 && self.energy > 0.42 {
                if let Some(v) = self.nearest_visible(grid, Tile::Food, 8) {
                    let dist = (v.0 - ix).abs() + (v.1 - iy).abs();
                    if dist <= 6 {
                        set_thought!("topping up food");
                        return (self.toward(v, grid), thought);
                    }
                }
            }
            if self.hydration < 0.82 && self.hydration > 0.45 {
                if let Some(v) = self.nearest_visible(grid, Tile::Water, 6) {
                    let dist = (v.0 - ix).abs() + (v.1 - iy).abs();
                    if dist <= 4 {
                        set_thought!("topping up water");
                        return (self.toward(v, grid), thought);
                    }
                }
            }
        }

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

        {
            let hz = grid.hazard_at(ix, iy);
            let hz_flee_thresh = 0.60 - self.traits.fear * 0.25;
            if hz > hz_flee_thresh {
                set_thought!("cursed land");
                let best = (0..8usize).min_by_key(|&d| {
                    let (dx, dy) = crate::organism::organism::DIRECTIONS[d];
                    let (nx, ny) = (ix + dx, iy + dy);
                    (grid.hazard_at(nx, ny) * 1000.0) as i32
                }).unwrap_or_else(|| rng.gen_range(0..8));
                return (best, thought);
            }
        }

        if weather_kind >= 2 && !self.near_shelter(grid) {
            if let Some(v) = self.find_shelter_tile(grid, 14) {
                set_thought!("sheltering from storm");
                return (self.toward(v, grid), thought);
            }
        }

        if night {
            let ns = self.near_shelter(grid);
            if ns && self.sleep_debt > 0.08 && self.energy > 0.25 && rng.gen::<f32>() < 0.65 {
                set_thought!("resting");
                return (17, thought);
            }
            if !ns && self.hydration > 0.25 {
                if let Some(s) = self.find_shelter_tile(grid, 16) {
                    set_thought!("finding shelter");
                    return (self.toward(s, grid), thought);
                }
                if let Some(camp) = self.nearest_visible(grid, Tile::Campfire, 12) {
                    if (camp.0 - ix).abs() + (camp.1 - iy).abs() > 2 {
                        set_thought!("heading to campfire");
                        return (self.toward(camp, grid), thought);
                    }
                }
                let dist_home = (self.x - self.home_x).abs() + (self.y - self.home_y).abs();
                if dist_home > 25.0 && rng.gen::<f32>() < 0.03 {
                    set_thought!("heading home");
                    return (self.toward((self.home_x as i32, self.home_y as i32), grid), thought);
                }
            }
        }

        if self.grief_ticks > 40 && rng.gen::<f32>() < 0.45 {
            set_thought!("mourning kin");
            return (17, thought);
        }

        let should_rest = self.health < 0.65
            || self.sleep_debt > 0.30
            || (self.grief_ticks > 0 && self.near_shelter(grid));
        if should_rest && self.near_shelter(grid) && rng.gen::<f32>() < 0.52 {
            set_thought!("resting");
            return (17, thought);
        }

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
                "rest" => {
                    if let Some(s) = self.find_shelter_tile(grid, 18) {
                        if (s.0 - ix).abs() + (s.1 - iy).abs() > 1 {
                            set_thought!("retreating to rest");
                            return (self.toward(s, grid), thought);
                        }
                    }
                    set_thought!("resting");
                    return (17, thought);
                }
                "isolate" => {
                    let kin_cx_opt: Option<(f32, f32)> = {
                        let mut sum_x = 0.0f32;
                        let mut sum_y = 0.0f32;
                        let mut n = 0usize;
                        for o in organisms.iter() {
                            if std::ptr::eq(o, self) || !o.alive { continue }
                            if o.lineage_id != self.lineage_id { continue }
                            if (o.x - self.x).abs() + (o.y - self.y).abs() > 12.0 { continue }
                            sum_x += o.x; sum_y += o.y; n += 1;
                        }
                        if n > 0 { Some((sum_x / n as f32, sum_y / n as f32)) } else { None }
                    };
                    if let Some((kx, ky)) = kin_cx_opt {
                        let dx = self.x - kx;
                        let dy = self.y - ky;
                        let target = (ix + (dx * 4.0).round() as i32, iy + (dy * 4.0).round() as i32);
                        set_thought!("isolating");
                        return (self.toward(target, grid), thought);
                    }
                    set_thought!("isolating");
                    return (rng.gen_range(0..8), thought);
                }
                "wander" => {
                    set_thought!("wandering on impulse");
                    return (rng.gen_range(0..8), thought);
                }
                "seek_help" => {
                    let elder_pos: Option<(i32, i32)> = organisms.iter()
                        .filter(|o| !std::ptr::eq(*o, self) && o.alive
                                && o.lineage_id == self.lineage_id && o.is_elder)
                        .min_by(|a, b| {
                            let da = (a.x - self.x).abs() + (a.y - self.y).abs();
                            let db = (b.x - self.x).abs() + (b.y - self.y).abs();
                            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                        })
                        .map(|o| (o.x as i32, o.y as i32));
                    if let Some(ep) = elder_pos {
                        set_thought!("seeking the elder");
                        return (self.toward(ep, grid), thought);
                    }
                    set_thought!("calling for help");
                    return (11, thought);
                }
                "settle" => {
                    let (hx, hy) = (self.home_x as i32, self.home_y as i32);
                    if (hx - ix).abs() + (hy - iy).abs() > 4 {
                        set_thought!("settling near home");
                        return (self.toward((hx, hy), grid), thought);
                    }
                    set_thought!("settling in");
                    return (17, thought);
                }
                "hunt" => {
                    set_thought!("hunting");
                    return (12, thought);
                }
                "forage" => {
                    if let Some(v) = self.nearest_visible(grid, Tile::Food, 16) {
                        set_thought!("foraging");
                        return (self.toward(v, grid), thought);
                    }
                    set_thought!("foraging the brush");
                    return (19, thought);
                }
                "defend" => {
                    set_thought!("defending");
                    return (12, thought);
                }
                "migrate" => {
                    let hash = self.id.bytes().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
                    let angle = ((hash ^ tick) as f32) * 0.0000019;
                    let dist  = 80.0 + 220.0 * self.traits.curiosity;
                    let tx = (self.x + angle.sin() * dist).round() as i32;
                    let ty = (self.y + angle.cos() * dist).round() as i32;
                    set_thought!("migrating");
                    return (self.toward((tx, ty), grid), thought);
                }
                _ => {}
            }
        }

        if self.age < 900 && self.energy > 0.6 && self.hydration > 0.6 && !night {
            let kin_nearby = organisms.iter().any(|o| {
                !std::ptr::eq(o, self) && o.alive && o.lineage_id == self.lineage_id
                    && (o.x - self.x).abs() + (o.y - self.y).abs() <= 8.0
            });
            let play_prob = if kin_nearby { 0.04 } else { 0.015 };
            if rng.gen::<f32>() < play_prob * self.traits.curiosity {
                let play_thoughts = ["playing", "chasing", "exploring with curiosity", "bounding around"];
                set_thought!(play_thoughts[rng.gen_range(0..play_thoughts.len())]);
                return (rng.gen_range(0..8), thought);
            }
        }

        {
            let near_fire = (-3i32..=3).any(|dx| (-3i32..=3).any(|dy| {
                matches!(grid.get(ix + dx, iy + dy), Tile::Campfire)
            }));
            let kin_nearby = organisms.iter().filter(|o| {
                !std::ptr::eq(*o, self) && o.alive && o.lineage_id == self.lineage_id
                    && (o.x - self.x).abs() + (o.y - self.y).abs() <= 6.0
            }).count();
            if near_fire && kin_nearby >= 1 && self.energy > 0.5 && self.hydration > 0.5 {
                if rng.gen::<f32>() < 0.12 * self.traits.social_tendency {
                    let roll = rng.gen::<f32>();
                    if roll < 0.30 {
                        set_thought!("dancing by the fire");
                        return (20, thought);
                    } else if roll < 0.55 {
                        set_thought!("singing by the fire");
                        return (21, thought);
                    }
                    let s = ["socialising by the fire", "warming by the fire",
                             "telling stories", "resting with kin",
                             "tending the fire", "sharing a meal"];
                    set_thought!(s[rng.gen_range(0..s.len())]);
                    return (17, thought);
                }
            }
        }

        if self.energy > 0.82 && needs_ok {
            let hungry_kin_nearby = organisms.iter().any(|o| {
                !std::ptr::eq(o, self) && o.alive && o.lineage_id == self.lineage_id
                    && o.energy < 0.30
                    && (o.x - self.x).abs() + (o.y - self.y).abs() <= 14.0
            });
            if hungry_kin_nearby {
                if let Some(f) = self.nearest_visible(grid, Tile::Food, 12) {
                    set_thought!("leading kin to food");
                    return (self.toward(f, grid), thought);
                }
            }
        }

        if self.age < 350 {
            let elder_pos: Option<(i32, i32)> = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                        && o.lineage_id == self.lineage_id && o.is_elder)
                .min_by(|a, b| {
                    let da = (a.x - self.x).abs() + (a.y - self.y).abs();
                    let db = (b.x - self.x).abs() + (b.y - self.y).abs();
                    da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|o| (o.x as i32, o.y as i32));
            if let Some(ep) = elder_pos {
                let dist = (ep.0 - ix).abs() + (ep.1 - iy).abs();
                if dist > 4 && dist < 30 {
                    set_thought!("following elder");
                    return (self.toward(ep, grid), thought);
                }
            }
        }
        if needs_easy && self.age > 600 && rng.gen::<f32>() < 0.025 {
            let mut sum_x = 0.0f32;
            let mut sum_y = 0.0f32;
            let mut n = 0usize;
            let mut nearest = f32::INFINITY;
            for o in organisms.iter() {
                if std::ptr::eq(o, self) || !o.alive || o.lineage_id != self.lineage_id { continue }
                let d = (o.x - self.x).abs() + (o.y - self.y).abs();
                if d < nearest { nearest = d }
                sum_x += o.x; sum_y += o.y; n += 1;
            }
            if n > 0 && nearest > 45.0 && nearest.is_finite() {
                let cx_kin = (sum_x / n as f32) as i32;
                let cy_kin = (sum_y / n as f32) as i32;
                set_thought!("rejoining the tribe");
                return (self.toward((cx_kin, cy_kin), grid), thought);
            }
        }

        if let Some(ref aid) = self.attracted_to {
            let target = organisms.iter()
                .find(|o| o.alive && &o.id == aid)
                .map(|o| (o.x as i32, o.y as i32));
            if let Some(tp) = target {
                let dist = (tp.0 - ix).abs() + (tp.1 - iy).abs();
                if dist > 3 && dist < 60 {
                    set_thought!("drawn to someone");
                    return (self.toward(tp, grid), thought);
                }
            }
        }

        if let Some(ref pid) = self.partner_id {
            if needs_ok && self.fear_level < 0.5 {
                let partner = organisms.iter()
                    .find(|o| o.alive && &o.id == pid)
                    .map(|o| (o.x as i32, o.y as i32));
                if let Some(pp) = partner {
                    let dist = (pp.0 - ix).abs() + (pp.1 - iy).abs();
                    if dist > 4 && dist < 40 && rng.gen::<f32>() < 0.30 {
                        set_thought!("walking with partner");
                        return (self.toward(pp, grid), thought);
                    }
                }
            }
        }

        if !self.friends.is_empty() && needs_ok && self.fear_level < 0.4
            && self.loneliness > 0.40 && rng.gen::<f32>() < 0.20
        {
            let friend_pos: Option<(i32, i32)> = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                            && self.friends.contains_key(&o.id))
                .map(|o| {
                    let d = ((o.x - self.x).abs() + (o.y - self.y).abs()) as i32;
                    (o.x as i32, o.y as i32, d)
                })
                .filter(|&(_, _, d)| d > 4 && d < 60)
                .min_by_key(|&(_, _, d)| d)
                .map(|(x, y, _)| (x, y));
            if let Some(tp) = friend_pos {
                set_thought!("visiting a friend");
                return (self.toward(tp, grid), thought);
            }
        }

        if self.loneliness > 0.60 && needs_ok && self.fear_level < 0.5
            && self.wander_target.is_none()
            && rng.gen::<f32>() < 0.35
        {
            let kin_pos: Option<(i32, i32)> = organisms.iter()
                .filter(|o| !std::ptr::eq(*o, self) && o.alive
                            && o.lineage_id == self.lineage_id)
                .map(|o| {
                    let d = ((o.x - self.x).abs() + (o.y - self.y).abs()) as i32;
                    (o.x as i32, o.y as i32, d)
                })
                .filter(|&(_, _, d)| d > 5 && d < 100)
                .min_by_key(|&(_, _, d)| d)
                .map(|(x, y, _)| (x, y));
            if let Some(tp) = kin_pos {
                set_thought!("seeking kin");
                return (self.toward(tp, grid), thought);
            }
            if self.traits.social_tendency > 0.4 {
                let social_pos: Option<(i32, i32)> = organisms.iter()
                    .filter(|o| !std::ptr::eq(*o, self) && o.alive)
                    .filter(|o| self.attitude_toward(&o.lineage_id) >= -0.1)
                    .map(|o| {
                        let d = ((o.x - self.x).abs() + (o.y - self.y).abs()) as i32;
                        (o.x as i32, o.y as i32, d)
                    })
                    .filter(|&(_, _, d)| d > 5 && d < 70)
                    .min_by_key(|&(_, _, d)| d)
                    .map(|(x, y, _)| (x, y));
                if let Some(tp) = social_pos {
                    set_thought!("seeking company");
                    return (self.toward(tp, grid), thought);
                }
            }
        }

        if self.pregnant && !self.near_shelter(grid) && self.energy > 0.3 {
            if let Some(s) = self.find_shelter_tile(grid, 18) {
                set_thought!("nesting");
                return (self.toward(s, grid), thought);
            }
        }
        if self.pregnant && rng.gen::<f32>() < 0.08 {
            set_thought!("expecting");
        }

        if self.traits.social_tendency > 0.5 && self.energy > 0.55 && self.hydration > 0.55 {
            if rng.gen::<f32>() < self.traits.social_tendency * 0.06 {
                if let Some(t) = self.find_trail_target(grid, TrailKind::Path, 14) {
                    let dist = (t.0 - ix).abs() + (t.1 - iy).abs();
                    if dist > 5 {
                        set_thought!("following migration path");
                        return (self.toward(t, grid), thought);
                    }
                }
            }
        }

        if let Some(wt) = self.wander_target {
            let dist = (wt.0 - ix).abs() + (wt.1 - iy).abs();
            if dist > 4 && self.energy > 0.20 && self.hydration > 0.20 {
                set_thought!("wandering");
                return (self.toward(wt, grid), thought);
            }
        }

        if tick >= self.directive_until && self.energy > 0.45 && self.hydration > 0.45
            && self.wander_target.is_none()
        {
            let dist_home = (self.x - self.home_x).abs() + (self.y - self.home_y).abs();
            let pull_prob = if dist_home > 200.0 { 0.0015 }
                           else if dist_home > 100.0 { 0.0006 }
                           else if dist_home > 50.0 { 0.0002 }
                           else { 0.0 };
            if pull_prob > 0.0 && rng.gen::<f32>() < pull_prob {
                set_thought!("heading home");
                return (self.toward((self.home_x as i32, self.home_y as i32), grid), thought);
            }
        }

        {
            if self.hydration < 0.45 && tile == Tile::Sand {
                set_thought!("digging for water");
                return (18, thought);
            }
            if self.energy < 0.50 && tile == Tile::Grass
                && self.nearest_visible(grid, Tile::Food, 8).is_none()
                && rng.gen::<f32>() < 0.30
            {
                set_thought!("foraging the brush");
                return (19, thought);
            }
            if self.boredom > 0.55 && needs_ok && self.near_shelter(grid)
                && rng.gen::<f32>() < 0.25
            {
                set_thought!("taking a quiet moment");
                return (22, thought);
            }
            if self.traits.curiosity > 0.6 && needs_ok && !night
                && rng.gen::<f32>() < 0.05 * self.traits.curiosity
            {
                set_thought!("surveying the land");
                return (24, thought);
            }
            if needs_ok && self.comfort > 0.5
                && (self.x - self.home_x).abs() + (self.y - self.home_y).abs() < 10.0
                && rng.gen::<f32>() < 0.04
            {
                set_thought!("marking the homeland");
                return (25, thought);
            }

            let kin_nearby_n = organisms.iter().filter(|o|
                !std::ptr::eq(*o, self) && o.alive
                && o.lineage_id == self.lineage_id
                && (o.x - self.x).abs() + (o.y - self.y).abs() <= 6.0
            ).count();

            let fire_adj = matches!(tile, Tile::Campfire | Tile::Fire)
                || self.nearest_visible(grid, Tile::Campfire, 2).is_some()
                || self.nearest_visible(grid, Tile::Fire, 2).is_some();

            if self.infection > 0.20 && self.inv_water > 0 && fire_adj
                && rng.gen::<f32>() < 0.18
            {
                set_thought!("boiling water clean");
                return (141, thought);
            }

            if self.inv_food >= 2
                && (self.x - self.home_x).abs() + (self.y - self.home_y).abs() < 8.0
                && rng.gen::<f32>() < 0.06
            {
                set_thought!("caching food");
                return (146, thought);
            }

            if self.inv_food > 0 && kin_nearby_n >= 2 && self.energy > 0.7
                && rng.gen::<f32>() < 0.08
            {
                set_thought!("sharing a meal");
                return (147, thought);
            }

            if self.inv_water > 0 && fire_adj && self.energy > 0.55
                && self.boredom > 0.40 && rng.gen::<f32>() < 0.05
            {
                set_thought!("brewing tea");
                return (148, thought);
            }

            let has_blade = self.discoveries.contains("knife")
                         || self.discoveries.contains("axe")
                         || self.discoveries.contains("spear");
            if has_blade && self.boredom > 0.50 && self.near_shelter(grid)
                && rng.gen::<f32>() < 0.04
            {
                set_thought!("sharpening a blade");
                return (157, thought);
            }

            if self.hydration < 0.30 && tile == Tile::Sand
                && rng.gen::<f32>() < 0.10
            {
                set_thought!("digging deeper");
                return (166, thought);
            }

            let kin_afraid = organisms.iter().filter(|o|
                !std::ptr::eq(*o, self) && o.alive
                && o.lineage_id == self.lineage_id
                && o.fear_level > 0.55
                && (o.x - self.x).abs() + (o.y - self.y).abs() <= 8.0
            ).count();
            if kin_afraid >= 1 && self.inv_wood > 0 && rng.gen::<f32>() < 0.10 {
                set_thought!("lighting a signal fire");
                return (179, thought);
            }

            let far_from_home = (self.x - self.home_x).abs() + (self.y - self.home_y).abs() > 40.0;
            if far_from_home && self.inv_stone > 0 && rng.gen::<f32>() < 0.05 {
                set_thought!("stacking a cairn");
                return (216, thought);
            }

            if self.comfort > 0.55
                && self.nearest_visible(grid, Tile::Water, 2).is_some()
                && rng.gen::<f32>() < 0.05
            {
                set_thought!("sitting by the water");
                return (225, thought);
            }

            if night && kin_nearby_n >= 1 && rng.gen::<f32>() < 0.04 {
                set_thought!("howling at the moon");
                return (223, thought);
            }

            let kid_kin = organisms.iter().any(|o|
                !std::ptr::eq(o, self) && o.alive && o.age < 500
                && o.lineage_id == self.lineage_id
                && (o.x - self.x).abs() + (o.y - self.y).abs() <= 4.0
            );
            if kid_kin && self.energy > 0.5 && rng.gen::<f32>() < 0.06 {
                set_thought!("playing with the kids");
                return (224, thought);
            }

            if self.is_elder && kin_nearby_n >= 1 && self.comfort > 0.55
                && rng.gen::<f32>() < 0.06
            {
                set_thought!("reciting a proverb");
                return (135, thought);
            }

            if self.is_elder && kin_nearby_n == 0 && self.sleep_debt > 0.20
                && self.comfort > 0.40 && rng.gen::<f32>() < 0.05
            {
                set_thought!("on a vision quest");
                return (205, thought);
            }

            if matches!(tile, Tile::Food)
                && self.comfort > 0.50
                && rng.gen::<f32>() < 0.04
            {
                set_thought!("blessing the field");
                return (210, thought);
            }

            if self.sleep_debt > 0.35 && self.near_shelter(grid)
                && rng.gen::<f32>() < 0.12
            {
                set_thought!("taking a nap");
                return (221, thought);
            }
        }

        let age_decay = 1.0 / (1.0 + self.age as f32 / 2000.0);
        let eff_eps = (epsilon * (0.5 + self.traits.curiosity) * age_decay).max(0.02).min(0.80);
        if rng.gen::<f32>() < eff_eps {
            if rng.gen::<f32>() < 0.10 {
                if let Some(p) = self.find_trail_target(grid, TrailKind::Path, 5) {
                    return (self.toward(p, grid), thought);
                }
            }
            let explore_thought = if night {
                let opts = ["watching the stars", "listening to the dark",
                            "patrolling at night", "restless"];
                opts[rng.gen_range(0..opts.len())]
            } else if self.traits.curiosity > 0.65 {
                let opts = ["scouting ahead", "investigating", "searching for something new",
                            "following a scent", "pushing further out"];
                opts[rng.gen_range(0..opts.len())]
            } else {
                let opts = ["foraging", "wandering", "looking around",
                            "exploring", "checking the area", "roaming"];
                opts[rng.gen_range(0..opts.len())]
            };
            set_thought!(explore_thought);
            let last_dx = (self.x - self.prev_x).signum() as i32;
            let last_dy = (self.y - self.prev_y).signum() as i32;
            if (last_dx != 0 || last_dy != 0) && rng.gen::<f32>() < 0.75 {
                let target = (ix + last_dx * 5, iy + last_dy * 5);
                return (self.toward(target, grid), thought);
            }
            let on_food  = tile == Tile::Food;
            let on_water = tile == Tile::Water;
            let filtered: Vec<usize> = available.iter().copied()
                .filter(|&a| match a {
                    8 => on_food,
                    9 => on_water,
                    15 => self.carrying > 0 && self.carrying_type != 2,
                    14 => self.carrying == 0,
                    _ => true,
                })
                .collect();
            let pool: &[usize] = if filtered.is_empty() { available } else { &filtered };
            let pick = if pool.is_empty() {
                rng.gen_range(0..N_ACTIONS)
            } else {
                pool[rng.gen_range(0..pool.len())]
            };
            return (pick, thought);
        }

        let q_row = self.q_table.get(cached_perception);
        // Optimistic initialisation for never-visited actions: small
        // positive seed proportional to action_id. Higher-tier phase-3
        // actions (id ≥ 140) get a slightly larger seed so they get
        // picked by ties early on, breaking the cold-start where they
        // sat at Q=0 and never accumulated reward signal.
        let seed_q = |a: usize| -> f32 {
            if a >= 140 { 0.02 } else { 0.01 }
        };
        let lookup = |a: usize| -> f32 {
            q_row.map(|r| {
                let v = r.get_q(a as u16);
                if v == 0.0 { seed_q(a) } else { v }
            }).unwrap_or_else(|| seed_q(a))
        };
        let best_avail = available.iter().copied()
            .max_by(|&a, &b| {
                lookup(a).partial_cmp(&lookup(b)).unwrap_or(std::cmp::Ordering::Equal)
            });
        // Commit to the best available action even when best_val ≤ 0.
        // The previous gate (`if best_val > 0.0`) silently fell through
        // to a uniform-random pick whenever every learned Q was negative,
        // so the agent kept re-trying punished actions instead of
        // settling on the least-bad. Greedy-on-best is the right policy
        // here; exploration is already gated by `eff_eps` upstream.
        if let Some(best_idx) = best_avail {
            return (best_idx, thought);
        }
        let pool = if available.is_empty() { &[][..] } else { available };
        let pick = if pool.is_empty() {
            rng.gen_range(0..N_ACTIONS)
        } else {
            pool[rng.gen_range(0..pool.len())]
        };
        (pick, thought)
    }
}
