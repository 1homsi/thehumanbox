use super::*;

/// Event kinds worth keeping in the log ahead of everyday chatter.
/// Most flooded tiles the world tracks draining at once.
pub const MAX_FLOOD_TILES: usize = 8000;
/// Ticks a flood's rim stays under water, and its deep middle.
pub const FLOOD_RIM_TICKS: u64 = 1200;
pub const FLOOD_DEEP_TICKS: u64 = 2400;
/// Ticks a drained lake bed stays flooded before it dries.
pub(super) const FLOOD_SHALLOW_TICKS: u64 = 900;
/// How much richer the soil is where floodwater drains away.
pub(super) const FLOOD_SILT: f32 = 0.25;

pub fn tick_world_evolution(
    grid: &mut WorldGrid,
    organisms: &mut [Organism],
    flood_tiles: &mut Vec<(i32, i32, u64)>,
    tick: u64,
    season: &str,
    drought_active: bool,
    weather: &WeatherState,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    rng: &mut impl Rng,
) -> Vec<(i32, i32)> {
    let mut ignited_fires = Vec::new();
    if season != "scarcity" {
        let mut food_tiles: Vec<(i32, i32)> = Vec::new();
        for _ in 0..1400 {
            let x = rng.random_range(0..WIDTH as i32);
            let y = rng.random_range(0..HEIGHT as i32);
            if grid.get(x, y) == Tile::Food {
                food_tiles.push((x, y));
                if food_tiles.len() >= 14 {
                    break;
                }
            }
        }
        for (fx, fy) in food_tiles {
            if rng.random::<f32>() < 0.55 {
                let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
                let (dx, dy) = dirs[rng.random_range(0..4)];
                let (nx, ny) = (fx + dx, fy + dy);
                if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                    let near_water = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)].iter().any(|&(ox, oy)| {
                        WorldGrid::in_bounds(nx + ox, ny + oy) && grid.get(nx + ox, ny + oy) == Tile::Water
                    });
                    if near_water && rng.random::<f32>() < 0.75 {
                        continue;
                    }
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
            if grid.get(x, y) != Tile::Water {
                continue;
            }
            if grid.depth_at(x, y) > 0.35 {
                continue;
            }
            let mut land_neighbours = 0;
            let mut total = 0;
            for dy in -2i32..=2 {
                for dx in -2i32..=2 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let (nx, ny) = (x + dx, y + dy);
                    if !WorldGrid::in_bounds(nx, ny) {
                        continue;
                    }
                    total += 1;
                    if !matches!(grid.get(nx, ny), Tile::Water | Tile::Flooded) {
                        land_neighbours += 1;
                    }
                }
            }
            if total > 0 && land_neighbours * 5 > total * 3 {
                lake_candidates.push((x, y));
                if lake_candidates.len() >= 4 {
                    break;
                }
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
            if grid.get(x, y) != Tile::Sand {
                continue;
            }
            let water_adj = (-1i32..=1)
                .flat_map(|dx| (-1i32..=1).map(move |dy| (dx, dy)))
                .filter(|&(dx, dy)| {
                    (dx != 0 || dy != 0)
                        && WorldGrid::in_bounds(x + dx, y + dy)
                        && grid.get(x + dx, y + dy) == Tile::Water
                })
                .count();
            if water_adj >= 3 {
                refill.push((x, y));
                if refill.len() >= 3 {
                    break;
                }
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
                if desert_grass.len() >= 3 {
                    break;
                }
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
                if water_tiles.len() >= 10 {
                    break;
                }
            }
        }
        let expiry = tick + rng.random_range(600..1800);
        for (wx, wy) in water_tiles {
            if flood_tiles.len() >= 200 {
                break;
            }
            let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
            let (dx, dy) = dirs[rng.random_range(0..4)];
            let (nx, ny) = (wx + dx, wy + dy);
            if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                grid.set(nx, ny, Tile::Flooded);
                flood_tiles.push((nx, ny, expiry));
            }
        }
    }

    // Floodwater drains: a flood's deep middle shallows to flooded ground
    // first, and flooded ground dries to grass over a layer of rich silt.
    let mut i = 0;
    let mut shallowed = Vec::new();
    let mut drained = 0;
    while i < flood_tiles.len() {
        let (fx, fy, expiry) = flood_tiles[i];
        if tick > expiry {
            match grid.get(fx, fy) {
                Tile::Water => {
                    grid.set(fx, fy, Tile::Flooded);
                    shallowed.push((fx, fy, tick + FLOOD_SHALLOW_TICKS));
                }
                Tile::Flooded => {
                    grid.set(fx, fy, Tile::Grass);
                    grid.enrich_soil(fx, fy, FLOOD_SILT);
                    drained += 1;
                }
                _ => {}
            }
            flood_tiles.swap_remove(i);
        } else {
            i += 1;
        }
    }
    flood_tiles.extend(shallowed);
    if drained >= 12 {
        push_event(
            events,
            tick,
            "weather",
            "the floodwaters",
            "drained away and left rich silt behind",
        );
    }

    {
        let x = rng.random_range(0..WIDTH as i32);
        let y = rng.random_range(0..HEIGHT as i32);
        if grid.biome_at(x, y) == Biome::Volcanic && rng.random::<f32>() < 0.000005 {
            grid.set(x, y, Tile::Fire);
            *grid.fire_intensity_mut(x, y) = 1.0;
            ignited_fires.push((x, y));
            for _ in 0..4 {
                let dx = rng.random_range(-3i32..=3);
                let dy = rng.random_range(-3i32..=3);
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) {
                    grid.set(nx, ny, Tile::Fire);
                    *grid.fire_intensity_mut(nx, ny) = 1.0;
                    ignited_fires.push((nx, ny));
                }
            }
            let mut placed = 0;
            for _ in 0..30 {
                if placed >= 3 {
                    break;
                }
                let dx = rng.random_range(-8i32..=8);
                let dy = rng.random_range(-8i32..=8);
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny) == Tile::Grass {
                    grid.set(nx, ny, Tile::Mineral);
                    placed += 1;
                }
            }
            push_event(
                events,
                tick,
                "eruption",
                "world",
                &format!("volcanic eruption at ({},{})", x, y),
            );
        }
    }

    for _ in 0..20 {
        let x = rng.random_range(0..WIDTH as i32);
        let y = rng.random_range(0..HEIGHT as i32);
        let i = WorldGrid::idx(x, y);
        let biome = grid.biome_at(x, y);
        let fert = grid.fertility[i];
        let pressure = grid.pressure[i];
        let hazard = grid.hazard[i];

        if biome == Biome::Forest && fert < 0.25 && pressure > 2.0 && rng.random::<f32>() < 0.003 {
            grid.biome[i] = Biome::Grassland as u8;
            if grid.get(x, y) == Tile::Food {
                grid.set(x, y, Tile::Grass);
            }
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

        if biome == Biome::Desert
            && fert > 0.55
            && pressure < 0.5
            && (season == "recovery" || season == "abundance")
            && rng.random::<f32>() < 0.001
        {
            grid.biome[i] = Biome::Grassland as u8;
        }
        if biome == Biome::Grassland
            && fert > 0.80
            && pressure < 0.3
            && (season == "abundance" || weather.kind >= 1)
        {
            let near_water = (-6i32..=6).any(|dx| {
                (-6i32..=6)
                    .any(|dy| WorldGrid::in_bounds(x + dx, y + dy) && grid.get(x + dx, y + dy) == Tile::Water)
            });
            if near_water && rng.random::<f32>() < 0.0008 {
                grid.biome[i] = Biome::Forest as u8;
                if grid.get(x, y) == Tile::Grass {
                    grid.set(x, y, Tile::Food);
                }
            }
        }
        if biome == Biome::Grassland && fert > 0.70 {
            let flood_adj = (-2i32..=2).any(|dx| {
                (-2i32..=2).any(|dy| {
                    WorldGrid::in_bounds(x + dx, y + dy)
                        && matches!(grid.get(x + dx, y + dy), Tile::Water | Tile::Flooded)
                })
            });
            if flood_adj && rng.random::<f32>() < 0.0003 {
                grid.biome[i] = Biome::Wetland as u8;
            }
        }

        if biome == Biome::Volcanic
            && grid.get(x, y) == Tile::Grass
            && fert < 0.50
            && rng.random::<f32>() < 0.008
        {
            grid.fertility[i] = (grid.fertility[i] + 0.18).min(0.95);
        }
        if biome == Biome::Volcanic && grid.get(x, y) == Tile::Fire {
            grid.add_hazard(x, y, 0.001);
        }

        if grid.get(x, y) == Tile::Ash && hazard > 0.45 && rng.random::<f32>() < 0.02 {
            grid.set(x, y, Tile::Scorched);
        }
    }

    if tick.is_multiple_of(600) {
        for _ in 0..120 {
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if grid.get(x, y) != Tile::Water {
                continue;
            }
            for (nx, ny) in WorldGrid::neighbors(x, y) {
                let tile = grid.get(nx, ny);
                if matches!(
                    tile,
                    Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
                ) {
                    let i = WorldGrid::idx(nx, ny);
                    let biome_cap = Biome::from_u8(grid.biome[i]).base_fertility();
                    grid.fertility[i] = (grid.fertility[i] + 0.003).min(biome_cap.max(0.80));
                }
            }
        }
    }

    if tick.is_multiple_of(6000) && tick >= 9000 {
        let mut edge_water: Vec<(i32, i32)> = Vec::new();
        for _ in 0..2000 {
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if grid.get(x, y) != Tile::Water {
                continue;
            }
            let has_land_neighbor = [(-1, 0), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| {
                let t = grid.get(x + dx, y + dy);
                !matches!(t, Tile::Water | Tile::Void | Tile::Rock)
            });
            if has_land_neighbor {
                edge_water.push((x, y));
            }
            if edge_water.len() >= 12 {
                break;
            }
        }

        let shifts = 1.min(edge_water.len());
        for _ in 0..shifts {
            let (wx, wy) = edge_water[rng.random_range(0..edge_water.len())];
            let mut candidates: Vec<(i32, i32)> = Vec::new();
            for ddx in -6i32..=6 {
                for ddy in -6i32..=6 {
                    let d = ddx.abs() + ddy.abs();
                    if !(3..=6).contains(&d) {
                        continue;
                    }
                    let (nx, ny) = (wx + ddx, wy + ddy);
                    if WorldGrid::in_bounds(nx, ny) && matches!(grid.get(nx, ny), Tile::Grass | Tile::Food) {
                        candidates.push((nx, ny));
                    }
                }
            }
            if candidates.is_empty() {
                continue;
            }
            let (nx, ny) = candidates[rng.random_range(0..candidates.len())];
            let biome = grid.biome_at(wx, wy);
            let dry_tile = if biome == Biome::Desert {
                Tile::Ash
            } else {
                Tile::Grass
            };
            grid.set(wx, wy, dry_tile);
            let wi = WorldGrid::idx(wx, wy);
            grid.fertility[wi] = (grid.fertility[wi] + 0.15).min(0.7);
            grid.set(nx, ny, Tile::Water);
        }
    }

    // Bumped from 18000 → 6000 so coastline drift is observable within
    // one session (~10 min real between events instead of ~30 min).
    if tick.is_multiple_of(6000) && tick >= 6000 {
        grid.tick_geology(rng);
    }
    // River meander: a single bank-flip per call, much faster cadence
    // than geology - gives mid-session lakes a visible "shifted" feel
    // without bulldozing them.
    if tick.is_multiple_of(1800) && tick >= 1800 {
        grid.tick_river_meander(rng);
    }
    // Forest spread: counterbalance to the shrink-only forest drift
    // already in the biome system. Closes the "forests spread or die"
    // loop the world-evolution spec asks for.
    if tick.is_multiple_of(900) && tick >= 900 {
        grid.tick_forest_spread(rng);
    }
    // Forest die-back: paired with the spread loop. Only fires under
    // active drought + low-fertility tiles, so the world's forests
    // shrink during sustained dry spells.
    if tick.is_multiple_of(600) && tick >= 600 {
        grid.tick_forest_dieback(drought_active, rng);
    }
    // Rare tectonic event: every 30k ticks, flip a coin. On average one
    // earthquake per ~60k ticks - uncommon enough that organisms can't
    // build a routine around it, frequent enough that long-running worlds
    // accumulate a few visible fault scars.
    if tick.is_multiple_of(30000) && tick >= 30000 && rng.random_bool(0.5) {
        grid.tick_earthquake(rng);
        push_event(
            events,
            tick,
            "earthquake",
            "world",
            "the ground shudders; a fault line lifts new rock and dry land",
        );
    }

    for org in organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let biome = grid.biome_at(org.x as i32, org.y as i32);
        match biome {
            Biome::Desert => {
                org.traits.resilience = (org.traits.resilience + 0.001).clamp(0.1, 0.9);
                org.traits.social_tendency = (org.traits.social_tendency - 0.0005).clamp(0.1, 0.9);
            }
            Biome::Tundra => {
                org.traits.resilience = (org.traits.resilience + 0.0015).clamp(0.1, 0.9);
                org.traits.fear = (org.traits.fear + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Volcanic => {
                org.traits.fear = (org.traits.fear + 0.001).clamp(0.1, 0.9);
                org.traits.curiosity = (org.traits.curiosity - 0.0005).clamp(0.1, 0.9);
            }
            Biome::Jungle => {
                org.traits.curiosity = (org.traits.curiosity + 0.0005).clamp(0.1, 0.9);
                org.traits.fear = (org.traits.fear + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Savanna => {
                org.traits.social_tendency = (org.traits.social_tendency + 0.0005).clamp(0.1, 0.9);
                org.traits.resilience = (org.traits.resilience + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Taiga => {
                org.traits.resilience = (org.traits.resilience + 0.001).clamp(0.1, 0.9);
            }
            Biome::Badlands => {
                org.traits.resilience = (org.traits.resilience + 0.001).clamp(0.1, 0.9);
                org.traits.aggression = (org.traits.aggression + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Forest => {
                org.traits.social_tendency = (org.traits.social_tendency + 0.001).clamp(0.1, 0.9);
                org.traits.curiosity = (org.traits.curiosity + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Wetland => {
                org.traits.memory_strength = (org.traits.memory_strength + 0.0005).clamp(0.1, 0.9);
            }
            Biome::Grassland => {}
        }
    }
    ignited_fires
}
