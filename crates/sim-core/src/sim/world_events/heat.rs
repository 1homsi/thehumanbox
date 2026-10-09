use super::*;
use crate::sim::tech::agriculture::Farm;

/// How long a heat wave lasts, in ticks.
pub const HEAT_WAVE_TICKS: u64 = 1800;
/// Every this many ticks during a heat wave, the shallow water is checked for drying up.
const DRY_EVERY: u64 = 60;
/// Chance that a shallow water tile (one with land beside it) dries on a pass.
const DRY_CHANCE: f32 = 0.02;
/// Every this many ticks, each farm's harvest is pushed back a little (the crops wilt).
const WILT_EVERY: u64 = 120;
const WILT_DELAY: i64 = 12;

impl WeatherState {
    /// A heat wave is on: shore water dries, people drink more and tire faster, and crops wilt.
    pub fn heat_active(&self, tick: u64) -> bool {
        self.heat_until != 0 && tick < self.heat_until
    }
}

/// Drying and wilting for a heat wave, once per tick. Draws from the RNG only while a wave is on,
/// so a world without one keeps its random sequence.
pub fn tick_heat_wave(
    weather: &mut WeatherState,
    grid: &mut WorldGrid,
    farms: &mut [Farm],
    tick: u64,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    rng: &mut impl Rng,
) {
    if weather.heat_until == 0 {
        return;
    }
    if tick >= weather.heat_until {
        weather.heat_until = 0;
        push_event(events, tick, "weather", "world", "the heat breaks");
        return;
    }
    if tick.is_multiple_of(DRY_EVERY) {
        for y in 1..HEIGHT as i32 - 1 {
            for x in 1..WIDTH as i32 - 1 {
                if grid.get(x, y) == Tile::Water
                    && has_land_beside(grid, x, y)
                    && rng.random::<f32>() < DRY_CHANCE
                {
                    grid.set(x, y, Tile::Sand);
                }
            }
        }
    }
    if tick.is_multiple_of(WILT_EVERY) {
        for farm in farms.iter_mut() {
            farm.adjust_ready_tick(tick, WILT_DELAY);
        }
    }
}

/// Shallow water: a water tile with dry land on one of its four sides.
fn has_land_beside(grid: &WorldGrid, x: i32, y: i32) -> bool {
    [(1, 0), (-1, 0), (0, 1), (0, -1)]
        .iter()
        .any(|&(dx, dy)| !matches!(grid.get(x + dx, y + dy), Tile::Water | Tile::Void))
}
