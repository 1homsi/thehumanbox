use super::*;

#[derive(Default)]
pub struct DroughtState {
    pub active: bool,
    pub start_tick: u64,
    pub dried_tiles: Vec<(i32, i32)>,
    pub rain_relief: u64,
}

#[allow(clippy::too_many_arguments)]
pub fn tick_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    _organisms: &[Organism],
    weather: &WeatherState,
    tick: u64,
    season: &str,
    disaster_mult: f32,
    history: &mut crate::sim::simulation::History,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
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
    let prob = DROUGHT_BASE_PROB * disaster_mult * if season == "scarcity" { 3.0 } else { 1.0 };
    if rng.random::<f32>() < prob {
        start_drought(drought, grid, tick, history, events, rng);
    }
}

pub(super) fn start_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    tick: u64,
    history: &mut crate::sim::simulation::History,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    rng: &mut impl Rng,
) {
    drought.active = true;
    drought.start_tick = tick;
    drought.rain_relief = 0;
    use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
    use std::collections::VecDeque;
    let w = WIDTH as i32;
    let h = HEIGHT as i32;

    let mut ocean = vec![false; WIDTH * HEIGHT];
    let mut q: VecDeque<(i32, i32)> = VecDeque::new();
    let seed_ocean = |x: i32, y: i32, ocean: &mut Vec<bool>, q: &mut VecDeque<(i32, i32)>| {
        if grid.get(x, y) == Tile::Water {
            let i = WorldGrid::idx(x, y);
            if !ocean[i] {
                ocean[i] = true;
                q.push_back((x, y));
            }
        }
    };
    for x in 0..w {
        seed_ocean(x, 0, &mut ocean, &mut q);
        seed_ocean(x, h - 1, &mut ocean, &mut q);
    }
    for y in 0..h {
        seed_ocean(0, y, &mut ocean, &mut q);
        seed_ocean(w - 1, y, &mut ocean, &mut q);
    }
    while let Some((x, y)) = q.pop_front() {
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let (nx, ny) = (x + dx, y + dy);
            if nx >= 0 && nx < w && ny >= 0 && ny < h && grid.get(nx, ny) == Tile::Water {
                let ni = WorldGrid::idx(nx, ny);
                if !ocean[ni] {
                    ocean[ni] = true;
                    q.push_back((nx, ny));
                }
            }
        }
    }

    let mut shoreline: Vec<(i32, i32)> = Vec::new();
    for y in 0..h {
        for x in 0..w {
            if grid.get(x, y) != Tile::Water {
                continue;
            }
            if WorldGrid::is_edge_border(x, y) || ocean[WorldGrid::idx(x, y)] {
                continue;
            }
            let edge = !matches!(grid.get(x - 1, y), Tile::Water)
                || !matches!(grid.get(x + 1, y), Tile::Water)
                || !matches!(grid.get(x, y - 1), Tile::Water)
                || !matches!(grid.get(x, y + 1), Tile::Water);
            if edge {
                shoreline.push((x, y));
            }
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
    push_event(
        events,
        tick,
        "drought",
        "world",
        &format!("drought begins - {} shoreline tiles retreat", count),
    );
}

pub(super) fn end_drought(
    drought: &mut DroughtState,
    grid: &mut WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
) {
    drought.active = false;
    // Only restore tiles proportionally to rain_relief. A drought that
    // ended via the rng cutoff (rain_relief == 0) doesn't fully refill;
    // some tiles stay dry permanently. This is the geographic memory
    // the world-evolution spec wants - past droughts leave shoreline
    // scars instead of fully reverting to pre-drought.
    let total = drought.dried_tiles.len();
    // 0 relief → restore 50% of tiles; >= 200 ticks of rain → 100%.
    // Read `rain_relief` BEFORE clearing it: zeroing first made `frac` a
    // compile-time constant 0.5 and silently discarded every tick of rain.
    let frac = ((drought.rain_relief as f32 / 200.0).clamp(0.0, 1.0) * 0.5) + 0.5;
    drought.rain_relief = 0;
    let restore_count = ((total as f32) * frac).round() as usize;
    let mut restored = 0usize;
    // Restore deepest-water tiles first (those closer to other water)
    // so the partial restoration looks like shoreline retreat, not
    // random patches.
    let mut by_neighbor_water: Vec<(i32, i32, u8)> = drought
        .dried_tiles
        .iter()
        .map(|&(x, y)| {
            let mut n = 0u8;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    if matches!(grid.get(x + dx, y + dy), Tile::Water) {
                        n += 1;
                    }
                }
            }
            (x, y, n)
        })
        .collect();
    by_neighbor_water.sort_by_key(|e| std::cmp::Reverse(e.2));
    for (x, y, _) in by_neighbor_water.into_iter().take(restore_count) {
        if matches!(grid.get(x, y), Tile::Grass | Tile::Ash) {
            grid.set(x, y, Tile::Water);
            restored += 1;
        }
    }
    let scars = total.saturating_sub(restored);
    drought.dried_tiles.clear();
    if scars > 0 {
        push_event(
            events,
            tick,
            "drought",
            "world",
            &format!("drought ends - {} restored, {} permanent scars", restored, scars),
        );
    } else {
        push_event(
            events,
            tick,
            "drought",
            "world",
            &format!("drought ends - {} water tiles restored", restored),
        );
    }
}

pub fn tick_outbreak(
    organisms: &mut [Organism],
    grid: &mut WorldGrid,
    tick: u64,
    season: &str,
    disaster_mult: f32,
    history: &mut crate::sim::simulation::History,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    rng: &mut impl Rng,
) {
    use crate::world::grid::{HEIGHT, WIDTH};
    let prob = OUTBREAK_BASE_PROB
        * disaster_mult
        * if season == "scarcity" || season == "recovery" {
            2.0
        } else {
            1.0
        };
    if rng.random::<f32>() >= prob {
        return;
    }

    let cx = rng.random_range(5..WIDTH as i32 - 5) as f32;
    let cy = rng.random_range(5..HEIGHT as i32 - 5) as f32;
    let radius = rng.random_range(8.0f32..=14.0);

    let mut names: Vec<String> = Vec::new();
    for org in organisms.iter_mut() {
        if !org.alive || org.infection > 0.1 {
            continue;
        }
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
        push_event(
            events,
            tick,
            "outbreak",
            "world",
            &format!("disease wave - {}", preview),
        );
        let hx = cx as i32;
        let hy = cy as i32;
        let hr = radius as i32;
        for dx in -hr..=hr {
            for dy in -hr..=hr {
                if dx * dx + dy * dy <= hr * hr {
                    let fade = 1.0 - (dx * dx + dy * dy) as f32 / (hr * hr) as f32;
                    grid.add_hazard(hx + dx, hy + dy, 0.12 * fade);
                }
            }
        }
    }
}
