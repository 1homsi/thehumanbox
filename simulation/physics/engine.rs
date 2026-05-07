use rand::Rng;
use crate::world::{grid::WorldGrid, tiles::Tile};

pub struct PhysicsEngine {
    pub tick_count: u64,
    pub growth_mult: f32,
}

impl PhysicsEngine {
    pub fn new() -> Self {
        PhysicsEngine { tick_count: 0, growth_mult: 1.0 }
    }

    pub fn tick(&mut self, grid: &mut WorldGrid, rng: &mut impl Rng) {
        self.tick_count += 1;
        self.update_fire(grid, rng);
        self.grow_plants(grid, rng);
        grid.decay_trails();

        let interval = (150.0 / self.growth_mult.max(0.3)) as u64;
        let interval = interval.max(80);
        if self.tick_count % interval == 0 {
            self.lightning_strike(grid, rng);
        }
    }

    fn update_fire(&self, grid: &mut WorldGrid, rng: &mut impl Rng) {
        use crate::world::grid::{WIDTH, HEIGHT};
        use crate::world::tiles::Biome;

        let mut burn_out  = Vec::new();
        let mut new_fires = Vec::new();

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if grid.get(x, y) != Tile::Fire { continue; }
                let intensity = grid.fire_intensity(x, y);
                let new_int = intensity - 0.015;
                if new_int <= 0.0 {
                    burn_out.push((x, y));
                } else {
                    *grid.fire_intensity_mut(x, y) = new_int;
                    // Volcanic biome has 3× faster fire spread
                    let spread_chance = if grid.biome_at(x, y) == Biome::Volcanic { 0.012 } else { 0.004 };
                    for (nx, ny) in WorldGrid::neighbors(x, y) {
                        if grid.get(nx, ny).flammable() && rng.gen::<f32>() < spread_chance {
                            new_fires.push((nx, ny));
                        }
                    }
                }
            }
        }

        for (x, y) in burn_out {
            grid.set(x, y, Tile::Ash);
            *grid.fire_intensity_mut(x, y) = 0.0;
        }
        for (x, y) in new_fires {
            grid.set(x, y, Tile::Fire);
            *grid.fire_intensity_mut(x, y) = 1.0;
        }

        // Campfires decay slowly but don't spread
        for y in 0..crate::world::grid::HEIGHT as i32 {
            for x in 0..crate::world::grid::WIDTH as i32 {
                if grid.get(x, y) == Tile::Campfire {
                    let new_int = grid.fire_intensity(x, y) - 0.00025;
                    if new_int <= 0.0 {
                        grid.set(x, y, Tile::Ash);
                        *grid.fire_intensity_mut(x, y) = 0.0;
                    } else {
                        *grid.fire_intensity_mut(x, y) = new_int;
                    }
                }
            }
        }
    }

    fn lightning_strike(&self, grid: &mut WorldGrid, rng: &mut impl Rng) {
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
                    return;
                }
            }
        }
    }

    fn grow_plants(&self, grid: &mut WorldGrid, rng: &mut impl Rng) {
        use crate::world::grid::{WIDTH, HEIGHT, TrailKind};
        let base_grow    = 0.003 * self.growth_mult;
        let recover_rate = 0.001 * (self.growth_mult * 0.7).max(0.4);

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                match grid.get(x, y) {
                    Tile::Grass => {
                        let trail = grid.trail_at(x, y, TrailKind::Food);
                        let trail_boost = 1.0 + trail * 1.2;
                        let fertility = grid.fertility[WorldGrid::idx(x, y)];
                        // Soil fertility gates regrowth — exhausted land stays bare
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
