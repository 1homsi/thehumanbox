use rand::Rng;
use crate::world::{grid::WorldGrid, tiles::Tile};
use crate::organism::organism::Organism;
use super::config::{DROUGHT_DURATION, DROUGHT_BASE_PROB, OUTBREAK_BASE_PROB};

// ── Weather ────────────────────────────────────────────────────────────────────

pub struct WeatherState {
    pub kind:       u8,   // 0=clear 1=rain 2=storm
    pub start_tick: u64,
    pub duration:   u64,
    pub intensity:  f32,
}

impl Default for WeatherState {
    fn default() -> Self { WeatherState { kind: 0, start_tick: 0, duration: 0, intensity: 0.0 } }
}

impl WeatherState {
    pub fn is_raining(&self) -> bool { self.kind >= 1 }
    pub fn kind_str(&self) -> &'static str {
        match self.kind { 1 => "rain", 2 => "storm", _ => "clear" }
    }
}

const RAIN_BASE_PROB: f32 = 0.0005;

pub fn tick_weather(
    weather: &mut WeatherState,
    grid: &mut WorldGrid,
    organisms: &mut Vec<Organism>,
    tick: u64,
    season: &str,
    events: &mut Vec<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    if weather.kind != 0 {
        apply_weather(weather, grid, organisms, tick, rng);
        if tick >= weather.start_tick + weather.duration {
            let kind_str = weather.kind_str().to_string();
            weather.kind      = 0;
            weather.intensity = 0.0;
            push_event(events, tick, "weather", "world", &format!("{} clears", kind_str));
        }
        return;
    }

    let mult = match season {
        "recovery"  => 2.2,
        "abundance" => 1.3,
        "decline"   => 0.7,
        "scarcity"  => 0.2,
        _ => 1.0,
    };
    if rng.gen::<f32>() < RAIN_BASE_PROB * mult {
        let storm = rng.gen::<f32>() < 0.22;
        weather.kind      = if storm { 2 } else { 1 };
        weather.start_tick = tick;
        weather.duration  = rng.gen_range(300..1000);
        weather.intensity = 0.4 + rng.gen::<f32>() * 0.6;
        let kind_str = weather.kind_str().to_string();
        push_event(events, tick, "weather", "world", &format!("{} begins", kind_str));
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

    // Rain spreads water to adjacent dry grass tiles
    for _ in 0..3 {
        let x = rng.gen_range(1..WIDTH as i32 - 1);
        let y = rng.gen_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Grass {
            let near_water = (-2i32..=2).any(|dx|
                (-2i32..=2).any(|dy| grid.get(x+dx, y+dy) == Tile::Water));
            if near_water { grid.set(x, y, Tile::Water); }
        }
    }

    // Rain extinguishes fires
    for _ in 0..4 {
        let x = rng.gen_range(1..WIDTH as i32 - 1);
        let y = rng.gen_range(1..HEIGHT as i32 - 1);
        if grid.get(x, y) == Tile::Fire {
            grid.set(x, y, Tile::Ash);
            *grid.fire_intensity_mut(x, y) = 0.0;
        }
    }

    // Rain replenishes fertility on parched/desert tiles — makes land cultivable again
    for _ in 0..8 {
        let x = rng.gen_range(1..WIDTH as i32 - 1);
        let y = rng.gen_range(1..HEIGHT as i32 - 1);
        let idx = WorldGrid::idx(x, y);
        if grid.fertility[idx] < 0.35 {
            grid.fertility[idx] = (grid.fertility[idx] + 0.015 * weather.intensity).min(0.55);
        }
    }

    // Storm effects
    if weather.kind == 2 {
        // Energy drain on all organisms (storm exposure)
        for org in organisms.iter_mut().filter(|o| o.alive) {
            org.energy = (org.energy - 0.0006 * weather.intensity).max(0.0);
        }
        // Lightning strike — starts a new fire
        if rng.gen::<f32>() < 0.06 * weather.intensity {
            for _ in 0..30 {
                let x = rng.gen_range(5..WIDTH as i32 - 5);
                let y = rng.gen_range(5..HEIGHT as i32 - 5);
                if grid.get(x, y).flammable() {
                    grid.set(x, y, Tile::Fire);
                    *grid.fire_intensity_mut(x, y) = 1.0;
                    break;
                }
            }
        }
    }
}

pub struct DroughtState {
    pub active:        bool,
    pub start_tick:    u64,
    pub dried_tiles:   Vec<(i32, i32)>,
    pub rain_relief:   u64,   // rain ticks accumulated during drought
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
    events: &mut Vec<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    if drought.active {
        // Rain accelerates drought end: each rain tick counts as 2 elapsed ticks
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
    if rng.gen::<f32>() < prob {
        start_drought(drought, grid, tick, history, events);
    }
}

fn start_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    tick: u64,
    history: &mut super::simulation::History,
    events: &mut Vec<super::simulation::Event>,
) {
    drought.active       = true;
    drought.start_tick   = tick;
    drought.rain_relief  = 0;
    let mut dried: Vec<(i32,i32)> = Vec::new();
    for (cx, cy) in grid.pool_centers.clone() {
        for dx in -4i32..=4 {
            for dy in -4i32..=4 {
                if dx.abs() + dy.abs() == 3 {
                    let (x, y) = (cx + dx, cy + dy);
                    if grid.get(x, y) == Tile::Water {
                        grid.set(x, y, Tile::Grass);
                        dried.push((x, y));
                    }
                }
            }
        }
    }
    let count = dried.len();
    drought.dried_tiles = dried;
    history.droughts += 1;
    push_event(events, tick, "drought", "world",
        &format!("drought begins — {} water tiles dry", count));
}

fn end_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    tick: u64,
    events: &mut Vec<super::simulation::Event>,
) {
    drought.active      = false;
    drought.rain_relief = 0;
    let mut restored = 0usize;
    for (x, y) in &drought.dried_tiles {
        if matches!(grid.get(*x, *y), Tile::Grass | Tile::Ash) {
            grid.set(*x, *y, Tile::Water);
            restored += 1;
        }
    }
    drought.dried_tiles.clear();
    push_event(events, tick, "drought", "world",
        &format!("drought ends — {} water tiles restored", restored));
}

pub fn tick_outbreak(
    organisms: &mut Vec<Organism>,
    grid: &mut WorldGrid,
    tick: u64,
    season: &str,
    history: &mut super::simulation::History,
    events: &mut Vec<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    use crate::world::grid::{WIDTH, HEIGHT};
    let prob = OUTBREAK_BASE_PROB
        * if season == "scarcity" || season == "recovery" { 2.0 } else { 1.0 };
    if rng.gen::<f32>() >= prob { return; }

    let cx = rng.gen_range(5..WIDTH as i32 - 5) as f32;
    let cy = rng.gen_range(5..HEIGHT as i32 - 5) as f32;
    let radius = rng.gen_range(8.0f32..=14.0);

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
            &format!("disease wave — {}", preview));
        // Disease scars the landscape — the outbreak zone remains psychologically dangerous
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

pub fn push_event(events: &mut Vec<super::simulation::Event>,
                  tick: u64, etype: &str, actor: &str, detail: &str) {
    events.push(super::simulation::Event {
        tick,
        etype: etype.to_string(),
        actor: actor.to_string(),
        detail: detail.to_string(),
    });
    if events.len() > 30 { events.remove(0); }
}

// ── World evolution — called every 300 ticks ───────────────────────────────────

pub fn tick_world_evolution(
    grid: &mut WorldGrid,
    organisms: &mut Vec<Organism>,
    flood_tiles: &mut Vec<(i32, i32, u64)>,
    tick: u64,
    season: &str,
    drought_active: bool,
    weather: &WeatherState,
    events: &mut Vec<super::simulation::Event>,
    rng: &mut impl Rng,
) {
    use crate::world::{grid::{WIDTH, HEIGHT}, tiles::Biome};

    // ── a) Forest spread — skip during scarcity ───────────────────────────────
    if season != "scarcity" {
        let mut food_tiles: Vec<(i32, i32)> = Vec::new();
        for _ in 0..800 {
            let x = rng.gen_range(0..WIDTH as i32);
            let y = rng.gen_range(0..HEIGHT as i32);
            if grid.get(x, y) == Tile::Food {
                food_tiles.push((x, y));
                if food_tiles.len() >= 8 { break; }
            }
        }
        for (fx, fy) in food_tiles {
            if rng.gen::<f32>() < 0.40 {
                let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
                let (dx, dy) = dirs[rng.gen_range(0..4)];
                let (nx, ny) = (fx + dx, fy + dy);
                if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                    grid.set(nx, ny, Tile::Food);
                }
            }
        }
    }

    // ── b) Desert creep — during drought or scarcity ──────────────────────────
    if drought_active || season == "scarcity" {
        let mut desert_grass: Vec<(i32, i32)> = Vec::new();
        for _ in 0..600 {
            let x = rng.gen_range(0..WIDTH as i32);
            let y = rng.gen_range(0..HEIGHT as i32);
            if grid.biome_at(x, y) == Biome::Desert && grid.get(x, y) == Tile::Grass {
                desert_grass.push((x, y));
                if desert_grass.len() >= 3 { break; }
            }
        }
        for (dx, dy) in desert_grass {
            if rng.gen::<f32>() < 0.30 {
                grid.set(dx, dy, Tile::Ash);
            }
        }
    }

    // ── c) Flood pulse — during storm weather ─────────────────────────────────
    if weather.kind == 2 {
        let mut water_tiles: Vec<(i32, i32)> = Vec::new();
        for _ in 0..1000 {
            let x = rng.gen_range(0..WIDTH as i32);
            let y = rng.gen_range(0..HEIGHT as i32);
            if grid.get(x, y) == Tile::Water {
                water_tiles.push((x, y));
                if water_tiles.len() >= 10 { break; }
            }
        }
        let expiry = tick + rng.gen_range(600..1800);
        for (wx, wy) in water_tiles {
            if flood_tiles.len() >= 200 { break; }
            let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
            let (dx, dy) = dirs[rng.gen_range(0..4)];
            let (nx, ny) = (wx + dx, wy + dy);
            if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                grid.set(nx, ny, Tile::Flooded);
                flood_tiles.push((nx, ny, expiry));
            }
        }
    }

    // ── Flood expiry — revert old Flooded tiles back to Grass ─────────────────
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

    // ── d) Volcanic eruption — very rare ──────────────────────────────────────
    // ~0.000005 per call × called every 300 ticks ≈ once per 60,000,000 ticks on average
    {
        let x = rng.gen_range(0..WIDTH as i32);
        let y = rng.gen_range(0..HEIGHT as i32);
        if grid.biome_at(x, y) == Biome::Volcanic && rng.gen::<f32>() < 0.000005 {
            // Set tile and 4 random neighbors to Fire
            grid.set(x, y, Tile::Fire);
            *grid.fire_intensity_mut(x, y) = 1.0;
            for _ in 0..4 {
                let dx = rng.gen_range(-3i32..=3);
                let dy = rng.gen_range(-3i32..=3);
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) {
                    grid.set(nx, ny, Tile::Fire);
                    *grid.fire_intensity_mut(nx, ny) = 1.0;
                }
            }
            // Set 3 random nearby grass tiles to Mineral
            let mut placed = 0;
            for _ in 0..30 {
                if placed >= 3 { break; }
                let dx = rng.gen_range(-8i32..=8);
                let dy = rng.gen_range(-8i32..=8);
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

    // ── e) Scorched recovery — scan up to 20 random Scorched tiles ────────────
    for _ in 0..20 {
        let x = rng.gen_range(0..WIDTH as i32);
        let y = rng.gen_range(0..HEIGHT as i32);
        if grid.get(x, y) == Tile::Scorched && rng.gen::<f32>() < 0.002 {
            grid.set(x, y, Tile::Grass);
        }
    }

    // ── g) Biome drift — overuse drives desertification; abandonment restores land ──
    for _ in 0..8 {
        let x = rng.gen_range(0..WIDTH as i32);
        let y = rng.gen_range(0..HEIGHT as i32);
        let i = crate::world::grid::WorldGrid::idx(x, y);
        let biome = grid.biome_at(x, y);
        let fert  = grid.fertility[i];
        // Exhausted grassland slowly becomes desert
        if biome == Biome::Grassland && fert < 0.07 && rng.gen::<f32>() < 0.004 {
            grid.biome[i] = Biome::Desert as u8;
        }
        // Recovered desert can revert to grassland during abundance/recovery seasons
        if biome == Biome::Desert && fert > 0.55 && (season == "recovery" || season == "abundance")
            && rng.gen::<f32>() < 0.001
        {
            grid.biome[i] = Biome::Grassland as u8;
        }
        // Fire-scorched volcanic zones build up hazard naturally
        if biome == Biome::Volcanic && grid.get(x, y) == Tile::Fire {
            grid.add_hazard(x, y, 0.001);
        }
    }

    // ── f) Biome trait pressure on organisms ──────────────────────────────────
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
