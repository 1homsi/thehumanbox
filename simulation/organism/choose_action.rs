use rand::Rng;

use crate::world::{grid::{TrailKind, WorldGrid}, tiles::Tile};

use super::organism::{N_ACTIONS, Organism};

impl Organism {
    pub fn choose_action(&self, grid: &WorldGrid, tick: u64,
                         epsilon: f32, organisms: &[Organism], night: bool,
                         weather_kind: u8, rng: &mut impl Rng, _animal_near: bool,
                         cached_perception: &str) -> (usize, Option<String>)
    {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let tile = grid.get(ix, iy);
        let mut thought: Option<String> = None;
        macro_rules! set_thought { ($t:expr) => { thought = Some($t.to_string()); }; }

        // Prioritise standing resource
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

        // Sick isolation: infected organisms walk away from healthy kin so
        // they don't spread the infection. Real disease behaviour: the
        // afflicted withdraw. Stronger response when very sick.
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
                // Step away from the kin centroid (opposite direction).
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

        // ── Genuine thirst / hunger - lowered thresholds so needs win less often ──
        // Organisms now only urgently chase resources when noticeably low,
        // not at the first hint of any deficit.
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
            if let Some(t) = self.find_trail_target(grid, TrailKind::Food, 12) {
                set_thought!("following food trail");
                return (self.toward(t, grid), thought);
            }
            set_thought!("hungry - searching");
        }

        // Danger avoidance (personal memory)
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

        // World hazard sensing - organisms avoid cursed/death-scarred land
        // Fearful organisms are more sensitive; brave ones push through
        {
            let hz = grid.hazard_at(ix, iy);
            let hz_flee_thresh = 0.60 - self.traits.fear * 0.25; // cowards flee at 0.35, brave at 0.60
            if hz > hz_flee_thresh {
                set_thought!("cursed land");
                // Find direction of lowest hazard among 8 neighbors
                let best = (0..8usize).min_by_key(|&d| {
                    let (dx, dy) = crate::organism::organism::DIRECTIONS[d];
                    let (nx, ny) = (ix + dx, iy + dy);
                    (grid.hazard_at(nx, ny) * 1000.0) as i32
                }).unwrap_or_else(|| rng.gen_range(0..8));
                return (best, thought);
            }
        }

        // Storm sheltering: seek campfire / hut structure during bad weather
        if weather_kind >= 2 && !self.near_shelter(grid) {
            if let Some(v) = self.find_shelter_tile(grid, 14) {
                set_thought!("sheltering from storm");
                return (self.toward(v, grid), thought);
            }
        }

        // Night behaviors: shelter is the primary destination after dark
        if night {
            let ns = self.near_shelter(grid);
            // Sheltered: rest readily - even light sleep debt triggers rest
            if ns && self.sleep_debt > 0.08 && self.energy > 0.25 && rng.gen::<f32>() < 0.65 {
                set_thought!("resting");
                return (17, thought); // REST: stay in place
            }
            // Not sheltered: seek any structure, then campfire
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
                if dist_home > 25.0 && rng.gen::<f32>() < 0.20 {
                    set_thought!("heading home");
                    return (self.toward((self.home_x as i32, self.home_y as i32), grid), thought);
                }
            }
        }

        // Mourning: reduced agency for a spell after witnessing kin death
        if self.grief_ticks > 40 && rng.gen::<f32>() < 0.45 {
            set_thought!("mourning kin");
            return (17, thought); // REST: stay in place while grieving
        }

        // Rest near shelter - health recovery, grief, sleep debt
        let should_rest = self.health < 0.65
            || self.sleep_debt > 0.30
            || (self.grief_ticks > 0 && self.near_shelter(grid));
        if should_rest && self.near_shelter(grid) && rng.gen::<f32>() < 0.52 {
            set_thought!("resting");
            return (17, thought); // REST: stay in place
        }

        // Ollama directive - intentional goal that overrides default behaviour
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

        // ── Play behaviour (young) ────────────────────────────────────────────
        // Juveniles run around excitedly, especially when kin are nearby.
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

        // ── Campfire socialising ──────────────────────────────────────────────
        // Near a campfire with kin → linger and socialise rather than wander off
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
                    let s = ["socialising by the fire", "warming by the fire",
                             "telling stories", "resting with kin",
                             "tending the fire", "sharing a meal"];
                    set_thought!(s[rng.gen_range(0..s.len())]);
                    return (17, thought); // REST: linger by fire, don't drift
                }
            }
        }

        // ── Altruism: lead hungry kin to food ─────────────────────────────────
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

        // Attraction: seek the organism you're drawn to
        if let Some(ref aid) = self.attracted_to {
            let target = organisms.iter()
                .find(|o| o.alive && &o.id == aid)
                .map(|o| (o.x as i32, o.y as i32));
            if let Some(tp) = target {
                let dist = (tp.0 - ix).abs() + (tp.1 - iy).abs();
                // Increased from 30 → 60 tiles so mates actually find each other
                if dist > 3 && dist < 60 {
                    set_thought!("drawn to someone");
                    return (self.toward(tp, grid), thought);
                }
            }
        }

        // ── Partner companionship ─────────────────────────────────────────────
        // Bonded partners drift toward each other when their basic needs
        // are met. Real human pairs spend most of their time together;
        // this gives bonded couples a visible "walking together" signature
        // on the map and lets the partners view-toggle render a meaningful
        // bond line.
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

        // Colony formation: lonely organisms seek their kin or friendly strangers.
        // This drives natural clustering / settlement behaviour.
        if self.loneliness > 0.35 && needs_ok && self.fear_level < 0.5 {
            // Look for nearest kin within 100 tiles
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
            // No kin nearby - high-social organisms seek any friendly organism
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

        // Pregnant: shelter-seeking before birth
        if self.pregnant && !self.near_shelter(grid) && self.energy > 0.3 {
            if let Some(s) = self.find_shelter_tile(grid, 18) {
                set_thought!("nesting");
                return (self.toward(s, grid), thought);
            }
        }
        if self.pregnant && rng.gen::<f32>() < 0.08 {
            set_thought!("expecting");
        }

        // Migration corridor following - social organisms prefer established routes
        // High path-trail signals a well-traveled corridor; follow it rather than blazing new ground
        if self.traits.social_tendency > 0.5 && self.energy > 0.55 && self.hydration > 0.55 {
            if rng.gen::<f32>() < self.traits.social_tendency * 0.18 {
                if let Some(t) = self.find_trail_target(grid, TrailKind::Path, 14) {
                    let dist = (t.0 - ix).abs() + (t.1 - iy).abs();
                    if dist > 5 {
                        set_thought!("following migration path");
                        return (self.toward(t, grid), thought);
                    }
                }
            }
        }

        // Wanderlust: follow active wander target as long as not in survival emergency.
        // (Arrival clearing happens in tick_inner_state via the area_ticks logic.)
        if let Some(wt) = self.wander_target {
            let dist = (wt.0 - ix).abs() + (wt.1 - iy).abs();
            if dist > 4 && self.energy > 0.20 && self.hydration > 0.20 {
                set_thought!("wandering");
                return (self.toward(wt, grid), thought);
            }
        }

        // Home pull - accessible whenever basic needs are covered
        // Stronger pull the farther away and the lower the energy/hydration
        if tick >= self.directive_until && self.energy > 0.45 && self.hydration > 0.45
            && self.wander_target.is_none()
        {
            let dist_home = (self.x - self.home_x).abs() + (self.y - self.home_y).abs();
            let pull_prob = if dist_home > 80.0 { 0.02 }
                           else if dist_home > 40.0 { 0.008 }
                           else if dist_home > 20.0 { 0.003 }
                           else { 0.0 };
            if pull_prob > 0.0 && rng.gen::<f32>() < pull_prob {
                set_thought!("heading home");
                return (self.toward((self.home_x as i32, self.home_y as i32), grid), thought);
            }
        }

        // Q-learning / exploration - varied thoughts so no organism just says "exploring"
        let eff_eps = (epsilon * (0.5 + self.traits.curiosity)).max(0.05).min(0.95);
        if rng.gen::<f32>() < eff_eps {
            // Low path-trail following during exploration - prevents snowball clustering
            if rng.gen::<f32>() < 0.10 {
                if let Some(p) = self.find_trail_target(grid, TrailKind::Path, 5) {
                    return (self.toward(p, grid), thought);
                }
            }
            // Pick an alive-feeling description based on context
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
            return (rng.gen_range(0..N_ACTIONS), thought);
        }

        let q_row = self.q_table.get(cached_perception).cloned()
            .unwrap_or_else(|| vec![0.0; N_ACTIONS]);
        let best = q_row.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        if best <= 0.0 { return (rng.gen_range(0..N_ACTIONS), thought); }
        (q_row.iter().position(|&v| v == best).unwrap_or(0), thought)
    }
}
