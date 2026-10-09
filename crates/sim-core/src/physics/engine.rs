use crate::hashing::FxHashSet as HashSet;
use crate::world::{grid::WorldGrid, tiles::Tile};
use rand::{Rng, RngExt};

/// Tiles whose usual temperature is below this hold snow all year: the
/// same line world generation draws snow on the foothills with.
pub const SNOW_LINE: f32 = 2.0;
/// Fastest a snow tile melts per physics step, on the warmest land.
const SNOW_MELT: f32 = 0.02;
/// How much meltwater waters the soil it soaks into.
const MELTWATER: f32 = 0.08;

/// Chance per physics step that a snow tile melts: never on land that is
/// snowy by nature, never below freezing, and faster the warmer it is.
pub fn snow_melt_chance(biome: crate::world::tiles::Biome, usual_temp: f32, season_temp: f32) -> f32 {
    use crate::world::tiles::Biome;
    if biome == Biome::Tundra || usual_temp < SNOW_LINE {
        return 0.0;
    }
    let warmth = usual_temp + season_temp;
    if warmth <= 0.0 {
        return 0.0;
    }
    SNOW_MELT * (warmth / 10.0).min(1.0)
}

/// Degrees below freezing before winter snow settles on open grass.
const SNOWFALL_FROST: f32 = 2.0;
/// Fastest winter snow settles on a grass tile per physics step.
const SNOWFALL: f32 = 0.015;

/// Chance per physics step that winter snow settles on open grass: only
/// where snow would melt again in spring, and thicker the colder it is.
/// A hard winter's extra chill carries the snow further south.
pub fn snowfall_chance(biome: crate::world::tiles::Biome, usual_temp: f32, season_temp: f32) -> f32 {
    use crate::world::tiles::Biome;
    if matches!(biome, Biome::Tundra | Biome::Desert | Biome::Badlands) || usual_temp < SNOW_LINE {
        return 0.0;
    }
    let frost = -(usual_temp + season_temp) - SNOWFALL_FROST;
    if frost <= 0.0 {
        return 0.0;
    }
    SNOWFALL * (frost / 8.0).min(1.0)
}

/// What a melted snow tile turns back into.
fn thawed_tile(biome: crate::world::tiles::Biome) -> Tile {
    use crate::world::tiles::Biome;
    match biome {
        Biome::Desert | Biome::Badlands => Tile::Sand,
        _ => Tile::Grass,
    }
}

/// How much slower scorched ground greens than ash does.
const SCORCHED_RECOVERY: f32 = 0.3;

/// How much richer ash leaves the soil when grass grows back over it.
/// Volcanic ash weathers into the best soil there is; burned forest feeds
/// the next crop; ash on desert sand is only dried-out grass.
fn ash_soil_bonus(biome: crate::world::tiles::Biome) -> f32 {
    use crate::world::tiles::Biome;
    match biome {
        Biome::Volcanic => 0.5,
        Biome::Desert | Biome::Badlands => 0.0,
        _ => 0.2,
    }
}

/// Chance per physics step that fertile open grass sprouts wild food.
pub const WILD_FOOD_GROWTH: f32 = 0.0004;

pub struct PhysicsEngine {
    pub tick_count: u64,
    pub growth_mult: f32,
    /// How readily wild food sprouts this season (none in winter).
    pub food_season: f32,
    /// Degrees the season adds to every tile's usual temperature.
    pub season_temp: f32,
    active_fire_tiles: HashSet<(i32, i32)>,
    burn_out: Vec<(i32, i32)>,
    new_fires: Vec<(i32, i32)>,
}

impl Default for PhysicsEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl PhysicsEngine {
    pub fn new() -> Self {
        PhysicsEngine {
            tick_count: 0,
            growth_mult: 1.0,
            food_season: 1.0,
            season_temp: 0.0,
            active_fire_tiles: HashSet::default(),
            burn_out: Vec::new(),
            new_fires: Vec::new(),
        }
    }

    pub fn tick(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng, weather_kind: u8, wet: bool) {
        self.tick_count += 1;
        self.update_fire(grid, rng, weather_kind, wet);
        self.grow_plants(grid, rng);
        // Decay trails less often. Per audit, decay_trails iterates 3
        // full grid layers (~540k cells × 3 = ~1.6M float mul/add per
        // call) — the dominant CPU cost in this module. With food/water
        // half-life of ~285 sim ticks and path half-life ~1150, running
        // decay every 3rd physics tick (every 15 sim ticks) is still
        // well below those time constants. Apply a stronger decay factor
        // so the effective half-life stays the same.
        if self.tick_count.is_multiple_of(3) {
            grid.decay_trails_strong();
        }

        let interval = (150.0 / self.growth_mult.max(0.3)) as u64;
        let interval = interval.max(80);
        if !wet && weather_kind != 1 && weather_kind != 2 && self.tick_count.is_multiple_of(interval) {
            self.lightning_strike(grid, rng);
        }
    }

    pub fn register_fire(&mut self, x: i32, y: i32) {
        self.active_fire_tiles.insert((x, y));
    }

    /// Register fire tiles created before the physics engine existed, such as
    /// volcanic fires from initial world generation.
    pub fn register_existing_fires(&mut self, grid: &WorldGrid) {
        use crate::world::grid::{HEIGHT, WIDTH};

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if matches!(grid.get(x, y), Tile::Fire | Tile::Campfire) {
                    self.active_fire_tiles.insert((x, y));
                }
            }
        }
    }

    fn update_fire(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng, weather_kind: u8, wet: bool) {
        use crate::world::tiles::Biome;

        self.burn_out.clear();
        self.new_fires.clear();

        let rain_drain = match weather_kind {
            1 => 0.04,
            2 => 0.20,
            _ => {
                if wet {
                    0.015
                } else {
                    0.0
                }
            }
        };
        let spread_mult = match weather_kind {
            1 => 0.25,
            2 => 0.0,
            _ => {
                if wet {
                    0.1
                } else {
                    1.0
                }
            }
        };

        let mut campfire_burn_out: Vec<(i32, i32)> = Vec::new();

        // Iterate in a stable order. `active_fire_tiles` is a `HashSet` with
        // per-process random seeding, and this loop draws from `rng` once per
        // flammable neighbour, so both the *number* and the *order* of draws
        // per physics tick depended on hash order. That diverged the shared
        // RNG stream and with it every downstream system. Measured: four
        // processes with the same seed produced 60/61/62/66 fires.
        let mut fire_tiles: Vec<(i32, i32)> = self.active_fire_tiles.iter().copied().collect();
        fire_tiles.sort_unstable();
        for &(x, y) in &fire_tiles {
            match grid.get(x, y) {
                Tile::Fire => {
                    let intensity = grid.fire_intensity(x, y);
                    let new_int = intensity - 0.015 - rain_drain;
                    if new_int <= 0.0 {
                        self.burn_out.push((x, y));
                    } else {
                        *grid.fire_intensity_mut(x, y) = new_int;
                        let base = if grid.biome_at(x, y) == Biome::Volcanic {
                            0.012
                        } else {
                            0.004
                        };
                        let spread_chance = base * spread_mult;
                        if spread_chance > 0.0 {
                            for (nx, ny) in WorldGrid::neighbors(x, y) {
                                if grid.get(nx, ny).flammable() && rng.random::<f32>() < spread_chance {
                                    self.new_fires.push((nx, ny));
                                }
                            }
                        }
                    }
                }
                Tile::Campfire => {
                    let new_int = grid.fire_intensity(x, y) - 0.00025 - rain_drain * 0.5;
                    if new_int <= 0.0 {
                        campfire_burn_out.push((x, y));
                    } else {
                        *grid.fire_intensity_mut(x, y) = new_int;
                    }
                }
                _ => {
                    self.burn_out.push((x, y));
                }
            }
        }

        let burn_out = std::mem::take(&mut self.burn_out);
        let new_fires = std::mem::take(&mut self.new_fires);

        for (x, y) in &burn_out {
            self.active_fire_tiles.remove(&(*x, *y));
            if grid.get(*x, *y) == Tile::Fire {
                grid.set(*x, *y, Tile::Ash);
                *grid.fire_intensity_mut(*x, *y) = 0.0;
            }
        }
        for (x, y) in &campfire_burn_out {
            self.active_fire_tiles.remove(&(*x, *y));
            grid.set(*x, *y, Tile::Ash);
            *grid.fire_intensity_mut(*x, *y) = 0.0;
        }
        for (x, y) in &new_fires {
            grid.set(*x, *y, Tile::Fire);
            *grid.fire_intensity_mut(*x, *y) = 1.0;
            self.active_fire_tiles.insert((*x, *y));
        }

        self.burn_out = burn_out;
        self.new_fires = new_fires;
    }

    fn lightning_strike(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng) {
        use crate::world::grid::{HEIGHT, WIDTH};
        for _ in 0..40 {
            let x = rng.random_range(5..WIDTH as i32 - 5);
            let y = rng.random_range(5..HEIGHT as i32 - 5);
            if grid.get(x, y).flammable() {
                let min_pool = grid
                    .pool_centers
                    .iter()
                    .map(|(px, py)| (x - px).abs() + (y - py).abs())
                    .min()
                    .unwrap_or(999);
                if min_pool >= 8 {
                    grid.set(x, y, Tile::Fire);
                    *grid.fire_intensity_mut(x, y) = 1.0;
                    self.active_fire_tiles.insert((x, y));
                    return;
                }
            }
        }
    }

    fn grow_plants(&self, grid: &mut WorldGrid, rng: &mut impl Rng) {
        use crate::world::grid::{TrailKind, HEIGHT, WIDTH};
        // Wild food sprouts slowly enough that people eat into it, and not
        // at all in winter (see `sim::seasons` for the dieback).
        let base_grow = WILD_FOOD_GROWTH * self.food_season;
        let recover_rate = 0.0018 * (self.growth_mult * 0.7).max(0.4);
        let freezing = self.season_temp < -SNOWFALL_FROST;

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                match grid.get(x, y) {
                    Tile::Grass => {
                        if freezing {
                            let chance =
                                snowfall_chance(grid.biome_at(x, y), grid.temp_at(x, y), self.season_temp);
                            if chance > 0.0 && rng.random::<f32>() < chance {
                                grid.set(x, y, Tile::Snow);
                                continue;
                            }
                        }
                        let trail = grid.trail_at(x, y, TrailKind::Food);
                        let trail_boost = 1.0 + trail * 1.2;
                        let fertility = grid.fertility[WorldGrid::idx(x, y)];
                        let grow_rate = base_grow * grid.biome_growth_mult(x, y) * trail_boost * fertility;
                        if rng.random::<f32>() < grow_rate {
                            grid.set(x, y, Tile::Food);
                        }
                    }
                    Tile::Ash if rng.random::<f32>() < recover_rate => {
                        grid.set(x, y, Tile::Grass);
                        grid.enrich_soil(x, y, ash_soil_bonus(grid.biome_at(x, y)));
                    }
                    // Snow melts where the land is warm enough, and waters
                    // the soil under it. Peaks and tundra keep theirs.
                    Tile::Snow => {
                        let chance =
                            snow_melt_chance(grid.biome_at(x, y), grid.temp_at(x, y), self.season_temp);
                        if chance > 0.0 && rng.random::<f32>() < chance {
                            grid.set(x, y, thawed_tile(grid.biome_at(x, y)));
                            grid.restore_fertility(x, y, MELTWATER);
                        }
                    }
                    // Blighted and burned-black ground greens again as its
                    // soil comes back: slowly, and slower still on poor soil.
                    Tile::Scorched => {
                        let i = WorldGrid::idx(x, y);
                        let cap = grid.biome_at(x, y).base_fertility().max(0.05);
                        let health = (grid.fertility[i] / cap).clamp(0.15, 1.0);
                        if rng.random::<f32>() < recover_rate * SCORCHED_RECOVERY * health {
                            grid.set(x, y, Tile::Grass);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Biome;
    use rand::SeedableRng;

    fn patch(grid: &mut WorldGrid, tile: Tile, biome: Biome, fertility: f32) {
        for x in 10..30 {
            for y in 10..30 {
                grid.set(x, y, tile);
                let i = WorldGrid::idx(x, y);
                grid.biome[i] = biome as u8;
                grid.fertility[i] = fertility;
            }
        }
    }

    fn count(grid: &WorldGrid, tile: Tile) -> usize {
        (10..30)
            .flat_map(|x| (10..30).map(move |y| (x, y)))
            .filter(|&(x, y)| grid.get(x, y) == tile)
            .count()
    }

    #[test]
    fn ash_grows_back_over_richer_soil() {
        let mut grid = WorldGrid::new(7);
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let mut engine = PhysicsEngine::new();
        engine.food_season = 0.0;
        patch(&mut grid, Tile::Ash, Biome::Volcanic, 0.1);
        for _ in 0..4000 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        assert!(count(&grid, Tile::Ash) < 40, "ash never greened");
        let regrown = (10..30)
            .flat_map(|x| (10..30).map(move |y| (x, y)))
            .filter(|&(x, y)| grid.get(x, y) == Tile::Grass)
            .map(|(x, y)| grid.fertility_at(x, y))
            .fold(f32::INFINITY, f32::min);
        assert!(
            regrown > Biome::Volcanic.base_fertility() + 0.3,
            "volcanic ash left poor soil: {regrown}"
        );
    }

    #[test]
    fn blizzard_snow_melts_as_the_land_warms_but_peaks_keep_theirs() {
        let mut grid = WorldGrid::new(9);
        let mut rng = rand::rngs::StdRng::seed_from_u64(9);
        let mut engine = PhysicsEngine::new();
        engine.food_season = 0.0;
        patch(&mut grid, Tile::Snow, Biome::Grassland, 0.4);
        for x in 10..30 {
            for y in 10..30 {
                // The left half is a cold peak, the right half warm meadow.
                grid.temperature[WorldGrid::idx(x, y)] = if x < 20 { -3.0 } else { 16.0 };
            }
        }

        // Deep winter: nothing melts, even on the meadow.
        engine.season_temp = -18.0;
        for _ in 0..2000 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        assert_eq!(count(&grid, Tile::Snow), 400);

        // Summer: the meadow thaws to watered grass; the peak stays white.
        engine.season_temp = 3.0;
        for _ in 0..2000 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        let meadow_snow = (20..30)
            .flat_map(|x| (10..30).map(move |y| (x, y)))
            .filter(|&(x, y)| grid.get(x, y) == Tile::Snow)
            .count();
        assert!(meadow_snow < 10, "the meadow kept its snow: {meadow_snow}");
        assert_eq!(
            count(&grid, Tile::Snow),
            200 + meadow_snow,
            "the peak lost its snow"
        );
        assert!(
            grid.fertility_at(25, 20) > 0.4,
            "meltwater never watered the soil"
        );
    }

    #[test]
    fn a_new_worlds_own_snow_survives_summer() {
        for seed in [1, 2, 3] {
            let mut grid = WorldGrid::new(seed);
            let snow = |g: &WorldGrid| {
                g.tiles
                    .iter()
                    .filter(|&&t| Tile::from_i8(t) == Tile::Snow)
                    .count()
            };
            let before = snow(&grid);
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let mut engine = PhysicsEngine::new();
            engine.food_season = 0.0;
            engine.season_temp = 3.0;
            for _ in 0..300 {
                engine.grow_plants(&mut grid, &mut rng);
            }
            assert_eq!(snow(&grid), before, "seed {seed} lost its natural snow");
        }
    }

    #[test]
    fn winter_snow_settles_on_cold_land_and_further_south_in_a_hard_winter() {
        assert_eq!(
            snowfall_chance(Biome::Grassland, 20.0, -12.0),
            0.0,
            "warm land got snow"
        );
        assert!(snowfall_chance(Biome::Grassland, 6.0, -12.0) > 0.0);
        assert_eq!(snowfall_chance(Biome::Grassland, 6.0, 3.0), 0.0, "snow in summer");
        assert_eq!(snowfall_chance(Biome::Tundra, 6.0, -12.0), 0.0);
        assert_eq!(
            snowfall_chance(Biome::Grassland, 1.0, -12.0),
            0.0,
            "snow that could never melt"
        );
        // A hard winter reaches land a normal winter spares.
        assert_eq!(snowfall_chance(Biome::Grassland, 12.0, -12.0), 0.0);
        assert!(snowfall_chance(Biome::Grassland, 12.0, -20.0) > 0.0);

        let mut grid = WorldGrid::new(10);
        let mut rng = rand::rngs::StdRng::seed_from_u64(10);
        let mut engine = PhysicsEngine::new();
        engine.food_season = 0.0;
        patch(&mut grid, Tile::Grass, Biome::Grassland, 0.5);
        for x in 10..30 {
            for y in 10..30 {
                grid.temperature[WorldGrid::idx(x, y)] = 4.0;
            }
        }
        engine.season_temp = -12.0;
        for _ in 0..400 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        assert!(
            count(&grid, Tile::Snow) > 380,
            "winter left the cold meadow green"
        );
        engine.season_temp = -2.0;
        for _ in 0..1500 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        assert!(count(&grid, Tile::Snow) < 20, "spring never melted the snow");
    }

    #[test]
    fn snow_melts_faster_on_warmer_land() {
        let cool = snow_melt_chance(Biome::Grassland, 6.0, 0.0);
        let warm = snow_melt_chance(Biome::Grassland, 24.0, 0.0);
        assert!(cool > 0.0 && warm > cool);
        assert_eq!(snow_melt_chance(Biome::Tundra, 24.0, 3.0), 0.0);
        assert_eq!(snow_melt_chance(Biome::Grassland, 1.0, 3.0), 0.0);
        assert_eq!(snow_melt_chance(Biome::Grassland, 8.0, -12.0), 0.0);
    }

    #[test]
    fn scorched_ground_greens_as_its_soil_returns() {
        let mut grid = WorldGrid::new(8);
        let mut rng = rand::rngs::StdRng::seed_from_u64(8);
        let mut engine = PhysicsEngine::new();
        engine.food_season = 0.0;
        patch(&mut grid, Tile::Scorched, Biome::Grassland, 0.72);
        for _ in 0..6000 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        let healthy_left = count(&grid, Tile::Scorched);
        assert!(
            healthy_left < 200,
            "healthy scorched ground stayed black: {healthy_left}/400"
        );

        // Blighted soil holds the scar much longer.
        patch(&mut grid, Tile::Scorched, Biome::Grassland, 0.05);
        for _ in 0..6000 {
            engine.grow_plants(&mut grid, &mut rng);
        }
        assert!(
            count(&grid, Tile::Scorched) > healthy_left,
            "poor soil recovered as fast as good soil"
        );
    }
}
