use rand::Rng;
use std::collections::HashSet;
use crate::world::{grid::WorldGrid, tiles::Tile};

pub struct PhysicsEngine {
    pub tick_count:       u64,
    pub growth_mult:      f32,
    // Hot-set of tiles currently on fire - avoids scanning entire grid every tick
    active_fire_tiles:    HashSet<(i32, i32)>,
    // Scratch buffers reused each update_fire call to avoid per-call allocation
    burn_out:  Vec<(i32, i32)>,
    new_fires: Vec<(i32, i32)>,
}

impl PhysicsEngine {
    pub fn new() -> Self {
        PhysicsEngine {
            tick_count: 0,
            growth_mult: 1.0,
            active_fire_tiles: HashSet::new(),
            burn_out:  Vec::new(),
            new_fires: Vec::new(),
        }
    }

    pub fn tick(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng, weather_kind: u8, wet: bool) {
        self.tick_count += 1;
        self.update_fire(grid, rng, weather_kind, wet);
        self.grow_plants(grid, rng);
        grid.decay_trails();

        let interval = (150.0 / self.growth_mult.max(0.3)) as u64;
        let interval = interval.max(80);
        // No spontaneous wildfires while the ground is still wet from recent rain.
        if !wet && weather_kind != 1 && weather_kind != 2 && self.tick_count % interval == 0 {
            self.lightning_strike(grid, rng);
        }
    }

    /// Register a new fire tile in the hotset. Called whenever a tile is set to Fire or Campfire.
    pub fn register_fire(&mut self, x: i32, y: i32) {
        self.active_fire_tiles.insert((x, y));
    }

    fn update_fire(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng, weather_kind: u8, wet: bool) {
        use crate::world::tiles::Biome;

        self.burn_out.clear();
        self.new_fires.clear();

        // Rain dampens every active fire and storm extinguishes them outright -
        // applied to the full hotset so a single rainstorm clears the world's
        // fires instead of relying on random tile sampling that almost never
        // hits an actual Fire tile.
        let rain_drain = match weather_kind {
            1 => 0.04,
            2 => 0.20,
            _ => if wet { 0.015 } else { 0.0 },
        };
        let spread_mult = match weather_kind {
            1 => 0.25,
            2 => 0.0,
            _ => if wet { 0.1 } else { 1.0 },
        };

        let mut campfire_burn_out: Vec<(i32, i32)> = Vec::new();

        for &(x, y) in &self.active_fire_tiles {
            match grid.get(x, y) {
                Tile::Fire => {
                    let intensity = grid.fire_intensity(x, y);
                    let new_int = intensity - 0.015 - rain_drain;
                    if new_int <= 0.0 {
                        self.burn_out.push((x, y));
                    } else {
                        *grid.fire_intensity_mut(x, y) = new_int;
                        let base = if grid.biome_at(x, y) == Biome::Volcanic { 0.012 } else { 0.004 };
                        let spread_chance = base * spread_mult;
                        if spread_chance > 0.0 {
                            for (nx, ny) in WorldGrid::neighbors(x, y) {
                                if grid.get(nx, ny).flammable() && rng.gen::<f32>() < spread_chance {
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

        let burn_out  = std::mem::take(&mut self.burn_out);
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

        // Return scratch buffers
        self.burn_out  = burn_out;
        self.new_fires = new_fires;
    }

    fn lightning_strike(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng) {
        use crate::world::grid::{WIDTH, HEIGHT};
        for _ in 0..40 {
            let x = rng.gen_range(5..WIDTH as i32 - 5);
            let y = rng.gen_range(5..HEIGHT as i32 - 5);
            if grid.get(x, y).flammable() {
                let min_pool = grid.pool_centers.iter()
                    .map(|(px, py)| (x - px).abs() + (y - py).abs())
                    .min().unwrap_or(999);
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
        use crate::world::grid::{WIDTH, HEIGHT, TrailKind};
        let base_grow    = 0.0055 * self.growth_mult;
        let recover_rate = 0.0018 * (self.growth_mult * 0.7).max(0.4);

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                match grid.get(x, y) {
                    Tile::Grass => {
                        let trail = grid.trail_at(x, y, TrailKind::Food);
                        let trail_boost = 1.0 + trail * 1.2;
                        let fertility = grid.fertility[WorldGrid::idx(x, y)];
                        // Soil fertility gates regrowth - exhausted land stays bare
                        let grow_rate = base_grow * grid.biome_growth_mult(x, y) * trail_boost * fertility;
                        if rng.gen::<f32>() < grow_rate { grid.set(x, y, Tile::Food); }
                    }
                    Tile::Ash if rng.gen::<f32>() < recover_rate => grid.set(x, y, Tile::Grass),
                    _ => {}
                }
            }
        }
    }
}
