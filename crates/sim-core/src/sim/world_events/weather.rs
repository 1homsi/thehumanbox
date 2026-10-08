use super::*;

pub struct WeatherState {
    pub kind: u8,
    pub start_tick: u64,
    pub duration: u64,
    pub intensity: f32,
    pub wet_until: u64,
    /// Wind direction unit-ish vector. Magnitude ∈ [0, ~1]. Drifts
    /// slowly via `tick_wind`. Storms inherit wind direction so rain
    /// streaks slant the right way and storms move across the map.
    pub wind_x: f32,
    pub wind_y: f32,
    /// Last-updated tick for the wind drift, used to clamp the
    /// integration step so paused/laggy worlds don't fling wind.
    pub wind_last_tick: u64,
}

impl Default for WeatherState {
    fn default() -> Self {
        WeatherState {
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
            "abundance" => (0.45f32, std::f32::consts::FRAC_PI_4, 0.005f32),
            "recovery" => (0.40, -std::f32::consts::FRAC_PI_4, 0.005),
            "decline" => (0.60, std::f32::consts::PI * 0.75, 0.008),
            "scarcity" => (0.75, std::f32::consts::PI, 0.010),
            _ => (0.50, 0.0, 0.0),
        };
        // Small random nudge on direction (≈ ±5° per tick) + a tiny
        // seasonal pull toward `bias_theta`.
        let cur_theta = self.wind_y.atan2(self.wind_x);
        let mut delta_theta = (rng.random::<f32>() - 0.5) * 0.08;
        let theta_err = (bias_theta - cur_theta + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU)
            - std::f32::consts::PI;
        delta_theta += theta_err * bias_strength;
        let theta = cur_theta + delta_theta;
        // Magnitude drifts toward the season-specific baseline.
        let m = (self.wind_x * self.wind_x + self.wind_y * self.wind_y).sqrt();
        let new_m = (m + (target_m - m) * 0.02 + (rng.random::<f32>() - 0.5) * 0.04).clamp(0.05, 1.0);
        self.wind_x = theta.cos() * new_m;
        self.wind_y = theta.sin() * new_m;
        self.wind_last_tick = tick;
    }

    pub fn is_raining(&self) -> bool {
        self.kind >= 1
    }
    pub fn is_wet(&self, tick: u64) -> bool {
        self.kind >= 1 || tick < self.wet_until
    }
    pub fn kind_str(&self) -> &'static str {
        match self.kind {
            1 => "rain",
            2 => "storm",
            3 => "snow",
            4 => "fog",
            _ => "clear",
        }
    }
    pub fn phase(&self, tick: u64) -> &'static str {
        match self.kind {
            2 => "storm",
            1 => "rain",
            3 => "snow",
            4 => "fog",
            _ => {
                if tick < self.wet_until {
                    "wet"
                } else {
                    "clear"
                }
            }
        }
    }
    pub fn effective_intensity(&self, tick: u64) -> f32 {
        if self.kind == 0 || self.duration == 0 {
            return 0.0;
        }
        let elapsed = tick.saturating_sub(self.start_tick) as f32;
        let total = self.duration as f32;
        let p = (elapsed / total).clamp(0.0, 1.0);
        let taper = if p < 0.10 {
            p / 0.10
        } else if p > 0.75 {
            ((1.0 - p) / 0.25).max(0.0)
        } else {
            1.0
        };
        self.intensity * taper
    }
}

pub(super) const RAIN_BASE_PROB: f32 = 0.0005;
pub(super) const WET_AFTERMATH_TICKS: u64 = 1200;

pub fn tick_weather(
    weather: &mut WeatherState,
    grid: &mut WorldGrid,
    physics: &mut PhysicsEngine,
    organisms: &mut [Organism],
    tick: u64,
    season: &str,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    rng: &mut impl Rng,
) {
    // Wind drifts every tick, independent of whether there's active
    // precipitation. The downstream renderer reads (wind_x, wind_y)
    // to slant rain and orient storm motion. Season biases the
    // target heading + magnitude so the world has a persistent
    // "monsoon" / "dry" feel.
    weather.tick_wind(tick, season, rng);
    if weather.kind != 0 {
        apply_weather(weather, grid, physics, organisms, tick, rng);
        let elapsed = tick.saturating_sub(weather.start_tick);
        if weather.kind == 2 && elapsed >= (weather.duration * 70 / 100) {
            weather.kind = 1;
            weather.intensity = (weather.intensity * 0.55).max(0.25);
            push_event(events, tick, "weather", "world", "the storm weakens into rain");
        }
        if elapsed >= weather.duration {
            weather.kind = 0;
            weather.intensity = 0.0;
            weather.wet_until = tick + WET_AFTERMATH_TICKS;
            push_event(
                events,
                tick,
                "weather",
                "world",
                "the rain stops; the ground is wet",
            );
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
        "recovery" => 2.2,
        "abundance" => 1.3,
        "decline" => 0.7,
        "scarcity" => 0.2,
        _ => 1.0,
    };
    if rng.random::<f32>() < RAIN_BASE_PROB * mult {
        let storm = rng.random::<f32>() < 0.22;
        weather.kind = if storm { 2 } else { 1 };
        weather.start_tick = tick;
        weather.duration = rng.random_range(300..1000);
        weather.intensity = 0.4 + rng.random::<f32>() * 0.6;
        let kind_str = weather.kind_str().to_string();
        push_event(events, tick, "weather", "world", &format!("{} begins", kind_str));
    }
}

pub(super) fn apply_wet_aftermath(
    weather: &WeatherState,
    grid: &mut WorldGrid,
    tick: u64,
    rng: &mut impl Rng,
) {
    if !tick.is_multiple_of(30) {
        return;
    }
    for _ in 0..3 {
        let x = rng.random_range(1..WIDTH as i32 - 1);
        let y = rng.random_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Fire {
            grid.set(x, y, Tile::Ash);
            *grid.fire_intensity_mut(x, y) = 0.0;
        }
    }
    if tick.is_multiple_of(60) {
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

pub(super) fn apply_weather(
    weather: &WeatherState,
    grid: &mut WorldGrid,
    physics: &mut PhysicsEngine,
    organisms: &mut [Organism],
    tick: u64,
    rng: &mut impl Rng,
) {
    use crate::world::grid::{HEIGHT, WIDTH};
    if !tick.is_multiple_of(20) {
        return;
    }

    for _ in 0..3 {
        let x = rng.random_range(1..WIDTH as i32 - 1);
        let y = rng.random_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Grass {
            let near_water =
                (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| grid.get(x + dx, y + dy) == Tile::Water));
            if near_water {
                grid.set(x, y, Tile::Water);
            }
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

    if weather.kind == 3 {
        // Snow settles on open ground wherever it falls, and melts again on
        // warm land (the thaw rule in the physics). It chills everyone out in it.
        for _ in 0..6 {
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if matches!(grid.get(x, y), Tile::Grass | Tile::Sand) && rng.random::<f32>() < weather.intensity {
                grid.set(x, y, Tile::Snow);
            }
        }
        for org in organisms.iter_mut().filter(|o| o.alive) {
            org.energy = (org.energy - 0.0004 * weather.intensity).max(0.0);
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
                if !grid.get(x, y).flammable() {
                    continue;
                }
                // Don't ignite within 2 tiles of water - wet ground.
                let mut near_water = false;
                'wcheck: for dy in -2i32..=2 {
                    for dx in -2i32..=2 {
                        if matches!(grid.get(x + dx, y + dy), Tile::Water) {
                            near_water = true;
                            break 'wcheck;
                        }
                    }
                }
                if near_water {
                    continue;
                }
                grid.set(x, y, Tile::Fire);
                *grid.fire_intensity_mut(x, y) = 1.0;
                physics.register_fire(x, y);
                break;
            }
        }
    }
}
