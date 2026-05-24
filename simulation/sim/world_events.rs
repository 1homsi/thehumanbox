use rand::Rng;
use crate::world::{grid::{WorldGrid, WIDTH, HEIGHT}, tiles::{Tile, Biome}};
use crate::organism::organism::Organism;
use super::config::{DROUGHT_DURATION, DROUGHT_BASE_PROB, OUTBREAK_BASE_PROB};

pub struct WeatherState {
    pub kind:       u8,
    pub start_tick: u64,
    pub duration:   u64,
    pub intensity:  f32,
    pub wet_until:  u64,
    /// Wind direction unit-ish vector. Magnitude ∈ [0, ~1]. Drifts
    /// slowly via `tick_wind`. Storms inherit wind direction so rain
    /// streaks slant the right way and storms move across the map.
    pub wind_x:     f32,
    pub wind_y:     f32,
    /// Last-updated tick for the wind drift, used to clamp the
    /// integration step so paused/laggy worlds don't fling wind.
    pub wind_last_tick: u64,
}

impl Default for WeatherState {
    fn default() -> Self {
        WeatherState {
            kind: 0, start_tick: 0, duration: 0, intensity: 0.0, wet_until: 0,
            wind_x: 0.4, wind_y: 0.0, wind_last_tick: 0,
        }
    }
}

impl WeatherState {
    /// Drift the wind vector. Called once per tick. The wind takes a
    /// random walk on its angle and a small additive nudge on
    /// magnitude, clamped to [0, 1]. Cheap (a handful of floats),
    /// gives the world a coherent "today the wind is from the west,
    /// strong" feel that downstream systems (rain slant, storm move,
    /// dispatch fire spread) can read.
    ///
    /// `season` biases both magnitude (stronger in scarcity / decline,
    /// gentle in abundance / recovery) and the target heading
    /// (continental dry winds in scarcity, onshore moisture in
    /// recovery). The bias is weak - random walk still dominates
    /// hour-to-hour - but over a session you can feel the prevailing
    /// "monsoon" / "dry" wind shift.
    pub fn tick_wind(&mut self, tick: u64, season: &str, rng: &mut impl Rng) {
        let (target_m, bias_theta, bias_strength) = match season {
            "abundance" => (0.45f32,  std::f32::consts::FRAC_PI_4,            0.005f32),
            "recovery"  => (0.40,    -std::f32::consts::FRAC_PI_4,            0.005),
            "decline"   => (0.60,     std::f32::consts::PI * 0.75,            0.008),
            "scarcity"  => (0.75,     std::f32::consts::PI,                   0.010),
            _           => (0.50,     0.0,                                    0.0),
        };
        // Small random nudge on direction (≈ ±5° per tick) + a tiny
        // seasonal pull toward `bias_theta`.
        let cur_theta = self.wind_y.atan2(self.wind_x);
        let mut delta_theta = (rng.random::<f32>() - 0.5) * 0.08;
        let theta_err = (bias_theta - cur_theta + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU) - std::f32::consts::PI;
        delta_theta += theta_err * bias_strength;
        let theta = cur_theta + delta_theta;
        // Magnitude drifts toward the season-specific baseline.
        let m = (self.wind_x * self.wind_x + self.wind_y * self.wind_y).sqrt();
        let new_m = (m + (target_m - m) * 0.02 + (rng.random::<f32>() - 0.5) * 0.04)
            .clamp(0.05, 1.0);
        self.wind_x = theta.cos() * new_m;
        self.wind_y = theta.sin() * new_m;
        self.wind_last_tick = tick;
    }

    pub fn is_raining(&self) -> bool { self.kind >= 1 }
    pub fn is_wet(&self, tick: u64) -> bool { self.kind >= 1 || tick < self.wet_until }
    pub fn kind_str(&self) -> &'static str {
        match self.kind { 1 => "rain", 2 => "storm", _ => "clear" }
    }
    pub fn phase(&self, tick: u64) -> &'static str {
        match self.kind {
            2 => "storm",
            1 => "rain",
            _ => if tick < self.wet_until { "wet" } else { "clear" },
        }
    }
    pub fn effective_intensity(&self, tick: u64) -> f32 {
        if self.kind == 0 || self.duration == 0 { return 0.0; }
        let elapsed = tick.saturating_sub(self.start_tick) as f32;
        let total   = self.duration as f32;
        let p       = (elapsed / total).clamp(0.0, 1.0);
        let taper   = if p < 0.10 { p / 0.10 }
                      else if p > 0.75 { ((1.0 - p) / 0.25).max(0.0) }
                      else { 1.0 };
        self.intensity * taper
    }
}

const RAIN_BASE_PROB: f32 = 0.0005;
const MAX_RECENT_EVENTS: usize = 600;
const WET_AFTERMATH_TICKS: u64 = 1200;

pub fn tick_weather(
    weather: &mut WeatherState,
    grid: &mut WorldGrid,
    organisms: &mut Vec<Organism>,
    tick: u64,
    season: &str,
    events: &mut std::collections::VecDeque<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    // Wind drifts every tick, independent of whether there's active
    // precipitation. The downstream renderer reads (wind_x, wind_y)
    // to slant rain and orient storm motion. Season biases the
    // target heading + magnitude so the world has a persistent
    // "monsoon" / "dry" feel.
    weather.tick_wind(tick, season, rng);
    if weather.kind != 0 {
        apply_weather(weather, grid, organisms, tick, rng);
        let elapsed = tick.saturating_sub(weather.start_tick);
        if weather.kind == 2 && elapsed >= (weather.duration * 70 / 100) {
            weather.kind      = 1;
            weather.intensity = (weather.intensity * 0.55).max(0.25);
            push_event(events, tick, "weather", "world", "the storm weakens into rain");
        }
        if elapsed >= weather.duration {
            weather.kind      = 0;
            weather.intensity = 0.0;
            weather.wet_until = tick + WET_AFTERMATH_TICKS;
            push_event(events, tick, "weather", "world", "the rain stops; the ground is wet");
        }
        return;
    }

    if tick < weather.wet_until {
        apply_wet_aftermath(weather, grid, tick, rng);
        return;
    } else if weather.wet_until != 0 && tick >= weather.wet_until {
        push_event(events, tick, "weather", "world", "the ground is dry again");
        weather.wet_until = 0;
    }

    let mult = match season {
        "recovery"  => 2.2,
        "abundance" => 1.3,
        "decline"   => 0.7,
        "scarcity"  => 0.2,
        _ => 1.0,
    };
    if rng.random::<f32>() < RAIN_BASE_PROB * mult {
        let storm = rng.random::<f32>() < 0.22;
        weather.kind      = if storm { 2 } else { 1 };
        weather.start_tick = tick;
        weather.duration  = rng.random_range(300..1000);
        weather.intensity = 0.4 + rng.random::<f32>() * 0.6;
        let kind_str = weather.kind_str().to_string();
        push_event(events, tick, "weather", "world", &format!("{} begins", kind_str));
    }
}

fn apply_wet_aftermath(
    weather: &WeatherState,
    grid: &mut WorldGrid,
    tick: u64,
    rng: &mut impl Rng,
) {
    if tick % 30 != 0 { return; }
    for _ in 0..3 {
        let x = rng.random_range(1..WIDTH as i32 - 1);
        let y = rng.random_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Fire {
            grid.set(x, y, Tile::Ash);
            *grid.fire_intensity_mut(x, y) = 0.0;
        }
    }
    if tick % 60 == 0 {
        let _ = weather;
        for _ in 0..4 {
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            let idx = WorldGrid::idx(x, y);
            if grid.fertility[idx] < 0.5 {
                grid.fertility[idx] = (grid.fertility[idx] + 0.005).min(0.6);
            }
        }
    }
}

fn apply_weather(
    weather: &WeatherState,
    grid: &mut WorldGrid,
    organisms: &mut Vec<Organism>,
    tick: u64,
    rng: &mut impl Rng,
) {
    use crate::world::grid::{WIDTH, HEIGHT};
    if tick % 20 != 0 { return; }

    for _ in 0..3 {
        let x = rng.random_range(1..WIDTH as i32 - 1);
        let y = rng.random_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Grass {
            let near_water = (-2i32..=2).any(|dx|
                (-2i32..=2).any(|dy| grid.get(x+dx, y+dy) == Tile::Water));
            if near_water { grid.set(x, y, Tile::Water); }
        }
    }

    let eff = weather.effective_intensity(tick);
    let snuff_passes = (10.0 + eff * 18.0) as i32;
    for _ in 0..snuff_passes {
        let x = rng.random_range(1..WIDTH as i32 - 1);
        let y = rng.random_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Fire {
            grid.set(x, y, Tile::Ash);
            *grid.fire_intensity_mut(x, y) = 0.0;
        }
    }

    for _ in 0..8 {
        let x = rng.random_range(1..WIDTH as i32 - 1);
        let y = rng.random_range(1..HEIGHT as i32 - 1);
        let idx = WorldGrid::idx(x, y);
        if grid.fertility[idx] < 0.35 {
            grid.fertility[idx] = (grid.fertility[idx] + 0.015 * weather.intensity).min(0.55);
        }
    }

    if weather.kind == 2 {
        for org in organisms.iter_mut().filter(|o| o.alive) {
            org.energy = (org.energy - 0.0006 * weather.intensity).max(0.0);
        }
        // Storm lightning ignitions are a known runaway hazard: the
        // suppression at engine.rs:52-56 only fires while kind==2, so
        // any fires lit late in a storm explode the moment rain ends.
        // Cap ignitions per storm at 3, and reject tiles adjacent to
        // water (those would be soaked enough to fizzle realistically).
        let ignitions_this_storm = (tick - weather.start_tick) / 20;
        if ignitions_this_storm < 3 && rng.random::<f32>() < 0.06 * weather.intensity {
            for _ in 0..30 {
                let x = rng.random_range(5..WIDTH as i32 - 5);
                let y = rng.random_range(5..HEIGHT as i32 - 5);
                if !grid.get(x, y).flammable() { continue; }
                // Don't ignite within 2 tiles of water - wet ground.
                let mut near_water = false;
                'wcheck: for dy in -2i32..=2 {
                    for dx in -2i32..=2 {
                        if matches!(grid.get(x + dx, y + dy), Tile::Water) {
                            near_water = true; break 'wcheck;
                        }
                    }
                }
                if near_water { continue; }
                grid.set(x, y, Tile::Fire);
                *grid.fire_intensity_mut(x, y) = 1.0;
                break;
            }
        }
    }
}

pub struct DroughtState {
    pub active:        bool,
    pub start_tick:    u64,
    pub dried_tiles:   Vec<(i32, i32)>,
    pub rain_relief:   u64,
}

impl Default for DroughtState {
    fn default() -> Self {
        DroughtState { active: false, start_tick: 0, dried_tiles: Vec::new(), rain_relief: 0 }
    }
}

pub fn tick_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    _organisms: &[Organism],
    weather: &WeatherState,
    tick: u64,
    season: &str,
    history: &mut super::simulation::History,
    events: &mut std::collections::VecDeque<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    if drought.active {
        if weather.is_raining() {
            drought.rain_relief += 1;
        }
        let effective_elapsed = (tick - drought.start_tick) + drought.rain_relief;
        if effective_elapsed >= DROUGHT_DURATION {
            end_drought(drought, grid, tick, events);
        }
        return;
    }
    let prob = DROUGHT_BASE_PROB * if season == "scarcity" { 3.0 } else { 1.0 };
    if rng.random::<f32>() < prob {
        start_drought(drought, grid, tick, history, events, rng);
    }
}

fn start_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    tick: u64,
    history: &mut super::simulation::History,
    events: &mut std::collections::VecDeque<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    drought.active       = true;
    drought.start_tick   = tick;
    drought.rain_relief  = 0;
    // Find every water tile that touches non-water - i.e. the
    // shoreline. We dry a fraction of that, which gives a natural
    // "lake retreated" look instead of the prior Manhattan-3 dotted
    // ring pattern. Shrink-from-edge is what real droughts do.
    use crate::world::grid::{WIDTH, HEIGHT};
    let mut shoreline: Vec<(i32, i32)> = Vec::new();
    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            if grid.get(x, y) != Tile::Water { continue; }
            let edge = matches!(grid.get(x - 1, y), Tile::Water) == false
                    || matches!(grid.get(x + 1, y), Tile::Water) == false
                    || matches!(grid.get(x, y - 1), Tile::Water) == false
                    || matches!(grid.get(x, y + 1), Tile::Water) == false;
            if edge { shoreline.push((x, y)); }
        }
    }
    // Pick ~30% of the shoreline to dry up. We shuffle by random
    // partition order so successive droughts don't always retreat from
    // the same side.
    use rand::seq::SliceRandom;
    shoreline.shuffle(rng);
    let target = ((shoreline.len() as f32) * 0.30).round() as usize;
    let mut dried: Vec<(i32, i32)> = Vec::with_capacity(target);
    for &(x, y) in shoreline.iter().take(target) {
        if grid.get(x, y) == Tile::Water {
            grid.set(x, y, Tile::Grass);
            dried.push((x, y));
        }
    }
    let count = dried.len();
    drought.dried_tiles = dried;
    history.droughts += 1;
    push_event(events, tick, "drought", "world",
        &format!("drought begins - {} shoreline tiles retreat", count));
}

fn end_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<super::simulation::Event>,
) {
    drought.active      = false;
    drought.rain_relief = 0;
    // Only restore tiles proportionally to rain_relief. A drought that
    // ended via the rng cutoff (rain_relief == 0) doesn't fully refill;
    // some tiles stay dry permanently. This is the geographic memory
    // the world-evolution spec wants - past droughts leave shoreline
    // scars instead of fully reverting to pre-drought.
    let total = drought.dried_tiles.len();
    // 0 relief → restore 50% of tiles; >= 200 ticks of rain → 100%.
    let frac = ((drought.rain_relief as f32 / 200.0).clamp(0.0, 1.0) * 0.5) + 0.5;
    let restore_count = ((total as f32) * frac).round() as usize;
    let mut restored = 0usize;
    // Restore deepest-water tiles first (those closer to other water)
    // so the partial restoration looks like shoreline retreat, not
    // random patches.
    let mut by_neighbor_water: Vec<(i32, i32, u8)> = drought.dried_tiles.iter()
        .map(|&(x, y)| {
            let mut n = 0u8;
            for dy in -1i32..=1 { for dx in -1i32..=1 {
                if dx == 0 && dy == 0 { continue; }
                if matches!(grid.get(x + dx, y + dy), Tile::Water) { n += 1; }
            }}
            (x, y, n)
        })
        .collect();
    by_neighbor_water.sort_by(|a, b| b.2.cmp(&a.2));
    for (x, y, _) in by_neighbor_water.into_iter().take(restore_count) {
        if matches!(grid.get(x, y), Tile::Grass | Tile::Ash) {
            grid.set(x, y, Tile::Water);
            restored += 1;
        }
    }
    let scars = total.saturating_sub(restored);
    drought.dried_tiles.clear();
    if scars > 0 {
        push_event(events, tick, "drought", "world",
            &format!("drought ends - {} restored, {} permanent scars", restored, scars));
    } else {
        push_event(events, tick, "drought", "world",
            &format!("drought ends - {} water tiles restored", restored));
    }
}

pub fn tick_outbreak(
    organisms: &mut Vec<Organism>,
    grid: &mut WorldGrid,
    tick: u64,
    season: &str,
    history: &mut super::simulation::History,
    events: &mut std::collections::VecDeque<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    use crate::world::grid::{WIDTH, HEIGHT};
    let prob = OUTBREAK_BASE_PROB
        * if season == "scarcity" || season == "recovery" { 2.0 } else { 1.0 };
    if rng.random::<f32>() >= prob { return; }

    let cx = rng.random_range(5..WIDTH as i32 - 5) as f32;
    let cy = rng.random_range(5..HEIGHT as i32 - 5) as f32;
    let radius = rng.random_range(8.0f32..=14.0);

    let mut names: Vec<String> = Vec::new();
    for org in organisms.iter_mut() {
        if !org.alive || org.infection > 0.1 { continue; }
        if (org.x - cx).abs() + (org.y - cy).abs() <= radius {
            org.infection = 0.3 * (1.0 - org.traits.resilience * 0.5);
            names.push(org.name.clone());
        }
    }

    if !names.is_empty() {
        history.outbreaks += 1;
        history.sickness_events += names.len() as u64;
        let preview = if names.len() > 3 {
            format!("{}...", names[..3].join(", "))
        } else {
            names.join(", ")
        };
        push_event(events, tick, "outbreak", "world",
            &format!("disease wave - {}", preview));
        let hx = cx as i32; let hy = cy as i32;
        let hr = radius as i32;
        for dx in -hr..=hr {
            for dy in -hr..=hr {
                if dx*dx + dy*dy <= hr*hr {
                    let fade = 1.0 - (dx*dx + dy*dy) as f32 / (hr*hr) as f32;
                    grid.add_hazard(hx+dx, hy+dy, 0.12 * fade);
                }
            }
        }
    }
}

pub fn push_event(events: &mut std::collections::VecDeque<super::simulation::Event>,
                  tick: u64, etype: &str, actor: &str, detail: &str) {
    events.push_back(super::simulation::Event {
        tick,
        etype: etype.to_string(),
        actor: actor.to_string(),
        detail: detail.to_string(),
    });
    if events.len() > MAX_RECENT_EVENTS { events.pop_front(); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn recent_events_keep_enough_context_for_debugging() {
        let mut events = VecDeque::new();
        for i in 0..40 {
            push_event(&mut events, i, "test", "world", "event");
        }

        assert_eq!(events.len(), 40);
        assert_eq!(events.front().unwrap().tick, 0);
    }
}

pub fn tick_world_evolution(
    grid: &mut WorldGrid,
    organisms: &mut Vec<Organism>,
    flood_tiles: &mut Vec<(i32, i32, u64)>,
    tick: u64,
    season: &str,
    drought_active: bool,
    weather: &WeatherState,
    events: &mut std::collections::VecDeque<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    if season != "scarcity" {
        let mut food_tiles: Vec<(i32, i32)> = Vec::new();
        for _ in 0..1400 {
            let x = rng.random_range(0..WIDTH as i32);
            let y = rng.random_range(0..HEIGHT as i32);
            if grid.get(x, y) == Tile::Food {
                food_tiles.push((x, y));
                if food_tiles.len() >= 14 { break; }
            }
        }
        for (fx, fy) in food_tiles {
            if rng.random::<f32>() < 0.55 {
                let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
                let (dx, dy) = dirs[rng.random_range(0..4)];
                let (nx, ny) = (fx + dx, fy + dy);
                if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                    let near_water = [(-1i32,0i32),(1,0),(0,-1),(0,1)].iter()
                        .any(|&(ox,oy)| WorldGrid::in_bounds(nx+ox, ny+oy)
                            && grid.get(nx+ox, ny+oy) == Tile::Water);
                    if near_water && rng.random::<f32>() < 0.75 { continue; }
                    grid.set(nx, ny, Tile::Food);
                }
            }
        }
    }

    if drought_active || season == "scarcity" {
        let mut lake_candidates: Vec<(i32, i32)> = Vec::new();
        for _ in 0..400 {
            let x = rng.random_range(2..(WIDTH as i32 - 2));
            let y = rng.random_range(2..(HEIGHT as i32 - 2));
            if grid.get(x, y) != Tile::Water { continue; }
            if grid.depth_at(x, y) > 0.35 { continue; }
            let mut land_neighbours = 0;
            let mut total = 0;
            for dy in -2i32..=2 { for dx in -2i32..=2 {
                if dx == 0 && dy == 0 { continue; }
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) { continue; }
                total += 1;
                if !matches!(grid.get(nx, ny), Tile::Water | Tile::Flooded) {
                    land_neighbours += 1;
                }
            }}
            if total > 0 && land_neighbours * 5 > total * 3 {
                lake_candidates.push((x, y));
                if lake_candidates.len() >= 4 { break; }
            }
        }
        for (lx, ly) in lake_candidates {
            if rng.random::<f32>() < 0.12 {
                grid.set(lx, ly, Tile::Sand);
                let i = WorldGrid::idx(lx, ly);
                grid.depth[i] = 0.0;
            }
        }
    }

    if !drought_active && (weather.kind >= 1 || season == "abundance" || season == "recovery") {
        let mut refill: Vec<(i32, i32)> = Vec::new();
        for _ in 0..400 {
            let x = rng.random_range(2..(WIDTH as i32 - 2));
            let y = rng.random_range(2..(HEIGHT as i32 - 2));
            if grid.get(x, y) != Tile::Sand { continue; }
            let water_adj = (-1i32..=1).flat_map(|dx| (-1i32..=1).map(move |dy| (dx, dy)))
                .filter(|&(dx, dy)| (dx != 0 || dy != 0)
                    && WorldGrid::in_bounds(x + dx, y + dy)
                    && grid.get(x + dx, y + dy) == Tile::Water)
                .count();
            if water_adj >= 3 {
                refill.push((x, y));
                if refill.len() >= 3 { break; }
            }
        }
        for (rx, ry) in refill {
            if rng.random::<f32>() < 0.10 {
                grid.set(rx, ry, Tile::Water);
                let i = WorldGrid::idx(rx, ry);
                grid.depth[i] = 0.20;
            }
        }
    }

    if drought_active || season == "scarcity" {
        let mut desert_grass: Vec<(i32, i32)> = Vec::new();
        for _ in 0..600 {
            let x = rng.random_range(0..WIDTH as i32);
            let y = rng.random_range(0..HEIGHT as i32);
            if grid.biome_at(x, y) == Biome::Desert && grid.get(x, y) == Tile::Grass {
                desert_grass.push((x, y));
                if desert_grass.len() >= 3 { break; }
            }
        }
        for (dx, dy) in desert_grass {
            if rng.random::<f32>() < 0.30 {
                grid.set(dx, dy, Tile::Ash);
            }
        }
    }

    if weather.kind == 2 {
        let mut water_tiles: Vec<(i32, i32)> = Vec::new();
        for _ in 0..1000 {
            let x = rng.random_range(0..WIDTH as i32);
            let y = rng.random_range(0..HEIGHT as i32);
            if grid.get(x, y) == Tile::Water {
                water_tiles.push((x, y));
                if water_tiles.len() >= 10 { break; }
            }
        }
        let expiry = tick + rng.random_range(600..1800);
        for (wx, wy) in water_tiles {
            if flood_tiles.len() >= 200 { break; }
            let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
            let (dx, dy) = dirs[rng.random_range(0..4)];
            let (nx, ny) = (wx + dx, wy + dy);
            if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                grid.set(nx, ny, Tile::Flooded);
                flood_tiles.push((nx, ny, expiry));
            }
        }
    }

    let mut i = 0;
    while i < flood_tiles.len() {
        let (fx, fy, expiry) = flood_tiles[i];
        if tick > expiry {
            if grid.get(fx, fy) == Tile::Flooded {
                grid.set(fx, fy, Tile::Grass);
            }
            flood_tiles.swap_remove(i);
        } else {
            i += 1;
        }
    }

    {
        let x = rng.random_range(0..WIDTH as i32);
        let y = rng.random_range(0..HEIGHT as i32);
        if grid.biome_at(x, y) == Biome::Volcanic && rng.random::<f32>() < 0.000005 {
            grid.set(x, y, Tile::Fire);
            *grid.fire_intensity_mut(x, y) = 1.0;
            for _ in 0..4 {
                let dx = rng.random_range(-3i32..=3);
                let dy = rng.random_range(-3i32..=3);
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) {
                    grid.set(nx, ny, Tile::Fire);
                    *grid.fire_intensity_mut(nx, ny) = 1.0;
                }
            }
            let mut placed = 0;
            for _ in 0..30 {
                if placed >= 3 { break; }
                let dx = rng.random_range(-8i32..=8);
                let dy = rng.random_range(-8i32..=8);
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                    grid.set(nx, ny, Tile::Mineral);
                    placed += 1;
                }
            }
            push_event(events, tick, "eruption", "world",
                &format!("volcanic eruption at ({},{})", x, y));
        }
    }

    for _ in 0..20 {
        let x = rng.random_range(0..WIDTH as i32);
        let y = rng.random_range(0..HEIGHT as i32);
        if grid.get(x, y) == Tile::Scorched && rng.random::<f32>() < 0.002 {
            grid.set(x, y, Tile::Grass);
        }
    }

    for _ in 0..20 {
        let x = rng.random_range(0..WIDTH as i32);
        let y = rng.random_range(0..HEIGHT as i32);
        let i = WorldGrid::idx(x, y);
        let biome    = grid.biome_at(x, y);
        let fert     = grid.fertility[i];
        let pressure = grid.pressure[i];
        let hazard   = grid.hazard[i];

        if biome == Biome::Forest && fert < 0.25 && pressure > 2.0 && rng.random::<f32>() < 0.003 {
            grid.biome[i] = Biome::Grassland as u8;
            if grid.get(x, y) == Tile::Food { grid.set(x, y, Tile::Grass); }
            for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny)
                    && grid.get(nx, ny) == Tile::Food
                    && rng.random::<f32>() < 0.35
                {
                    grid.set(nx, ny, Tile::Grass);
                }
            }
        }
        if biome == Biome::Wetland && drought_active && fert < 0.35 && rng.random::<f32>() < 0.002 {
            grid.biome[i] = Biome::Grassland as u8;
        }
        if biome == Biome::Grassland && fert < 0.07 && rng.random::<f32>() < 0.004 {
            grid.biome[i] = Biome::Desert as u8;
        }

        if biome == Biome::Desert && fert > 0.55 && pressure < 0.5
            && (season == "recovery" || season == "abundance") && rng.random::<f32>() < 0.001
        {
            grid.biome[i] = Biome::Grassland as u8;
        }
        if biome == Biome::Grassland && fert > 0.80 && pressure < 0.3
            && (season == "abundance" || weather.kind >= 1)
        {
            let near_water = (-6i32..=6).any(|dx| (-6i32..=6).any(|dy| {
                WorldGrid::in_bounds(x+dx, y+dy) && grid.get(x+dx, y+dy) == Tile::Water
            }));
            if near_water && rng.random::<f32>() < 0.0008 {
                grid.biome[i] = Biome::Forest as u8;
                if grid.get(x, y) == Tile::Grass { grid.set(x, y, Tile::Food); }
            }
        }
        if biome == Biome::Grassland && fert > 0.70 {
            let flood_adj = (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| {
                WorldGrid::in_bounds(x+dx, y+dy) && matches!(grid.get(x+dx, y+dy), Tile::Water | Tile::Flooded)
            }));
            if flood_adj && rng.random::<f32>() < 0.0003 {
                grid.biome[i] = Biome::Wetland as u8;
            }
        }

        if biome == Biome::Volcanic && grid.get(x, y) == Tile::Grass && fert < 0.50 && rng.random::<f32>() < 0.008 {
            grid.fertility[i] = (grid.fertility[i] + 0.18).min(0.95);
        }
        if biome == Biome::Volcanic && grid.get(x, y) == Tile::Fire {
            grid.add_hazard(x, y, 0.001);
        }

        if grid.get(x, y) == Tile::Ash && hazard > 0.45 && rng.random::<f32>() < 0.02 {
            grid.set(x, y, Tile::Scorched);
        }
    }

    if tick % 600 == 0 {
        for _ in 0..120 {
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if grid.get(x, y) != Tile::Water { continue; }
            for (nx, ny) in WorldGrid::neighbors(x, y) {
                let tile = grid.get(nx, ny);
                if matches!(tile, Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash) {
                    let i = WorldGrid::idx(nx, ny);
                    let biome_cap = Biome::from_u8(grid.biome[i]).base_fertility();
                    grid.fertility[i] = (grid.fertility[i] + 0.003).min(biome_cap.max(0.80));
                }
            }
        }
    }

    if tick % 6000 == 0 && tick >= 9000 {
        let mut edge_water: Vec<(i32, i32)> = Vec::new();
        for _ in 0..2000 {
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if grid.get(x, y) != Tile::Water { continue; }
            let has_land_neighbor = [(-1,0),(1,0),(0,-1),(0,1)].iter()
                .any(|&(dx,dy)| {
                    let t = grid.get(x+dx, y+dy);
                    !matches!(t, Tile::Water | Tile::Void | Tile::Rock)
                });
            if has_land_neighbor { edge_water.push((x, y)); }
            if edge_water.len() >= 12 { break; }
        }

        let shifts = 1.min(edge_water.len());
        for _ in 0..shifts {
            let (wx, wy) = edge_water[rng.random_range(0..edge_water.len())];
            let mut candidates: Vec<(i32, i32)> = Vec::new();
            for ddx in -6i32..=6 {
                for ddy in -6i32..=6 {
                    let d = ddx.abs() + ddy.abs();
                    if d < 3 || d > 6 { continue; }
                    let (nx, ny) = (wx + ddx, wy + ddy);
                    if WorldGrid::in_bounds(nx, ny) && matches!(grid.get(nx, ny), Tile::Grass | Tile::Food) {
                        candidates.push((nx, ny));
                    }
                }
            }
            if candidates.is_empty() { continue; }
            let (nx, ny) = candidates[rng.random_range(0..candidates.len())];
            let biome = grid.biome_at(wx, wy);
            let dry_tile = if biome == Biome::Desert { Tile::Ash } else { Tile::Grass };
            grid.set(wx, wy, dry_tile);
            let wi = WorldGrid::idx(wx, wy);
            grid.fertility[wi] = (grid.fertility[wi] + 0.15).min(0.7);
            grid.set(nx, ny, Tile::Water);
        }

    }

    // Bumped from 18000 → 6000 so coastline drift is observable within
    // one session (~10 min real between events instead of ~30 min).
    if tick % 6000 == 0 && tick >= 6000 {
        grid.tick_geology(rng);
    }
    // River meander: a single bank-flip per call, much faster cadence
    // than geology - gives mid-session lakes a visible "shifted" feel
    // without bulldozing them.
    if tick % 1800 == 0 && tick >= 1800 {
        grid.tick_river_meander(rng);
    }
    // Forest spread: counterbalance to the shrink-only forest drift
    // already in the biome system. Closes the "forests spread or die"
    // loop the world-evolution spec asks for.
    if tick % 900 == 0 && tick >= 900 {
        grid.tick_forest_spread(rng);
    }
    // Forest die-back: paired with the spread loop. Only fires under
    // active drought + low-fertility tiles, so the world's forests
    // shrink during sustained dry spells.
    if tick % 600 == 0 && tick >= 600 {
        grid.tick_forest_dieback(drought_active, rng);
    }
    // Rare tectonic event: every 30k ticks, flip a coin. On average one
    // earthquake per ~60k ticks - uncommon enough that organisms can't
    // build a routine around it, frequent enough that long-running worlds
    // accumulate a few visible fault scars.
    if tick % 30000 == 0 && tick >= 30000 && rng.random_bool(0.5) {
        grid.tick_earthquake(rng);
        push_event(events, tick, "earthquake", "world",
            "the ground shudders; a fault line lifts new rock and dry land");
    }

    for org in organisms.iter_mut() {
        if !org.alive { continue; }
        let biome = grid.biome_at(org.x as i32, org.y as i32);
        match biome {
            Biome::Desert => {
                org.traits.resilience      = (org.traits.resilience      + 0.001 ).clamp(0.1, 0.9);
                org.traits.social_tendency = (org.traits.social_tendency - 0.0005).clamp(0.1, 0.9);
            }
            Biome::Tundra => {
                org.traits.resilience = (org.traits.resilience + 0.0015).clamp(0.1, 0.9);
                org.traits.fear       = (org.traits.fear       + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Volcanic => {
                org.traits.fear      = (org.traits.fear      + 0.001 ).clamp(0.1, 0.9);
                org.traits.curiosity = (org.traits.curiosity - 0.0005).clamp(0.1, 0.9);
            }
            Biome::Forest => {
                org.traits.social_tendency = (org.traits.social_tendency + 0.001 ).clamp(0.1, 0.9);
                org.traits.curiosity       = (org.traits.curiosity       + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Wetland => {
                org.traits.memory_strength = (org.traits.memory_strength + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Grassland => {}
        }
    }
}
