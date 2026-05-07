use rand::Rng;
use serde::Serialize;
use super::tiles::{Tile, Biome};

pub const WIDTH:  usize = 600;
pub const HEIGHT: usize = 300;

// Viewport = full world — entire grid is serialised every tick
pub const VP_W: usize = WIDTH;
pub const VP_H: usize = HEIGHT;


pub struct WorldGrid {
    pub tiles:          Vec<i8>,
    pub fire_intensity: Vec<f32>,
    pub food_trail:     Vec<f32>,
    pub water_trail:    Vec<f32>,
    pub path_trail:     Vec<f32>,
    pub biome:          Vec<u8>,
    pub temperature:    Vec<f32>,
    pub structure:      Vec<f32>,
    pub pool_centers:   Vec<(i32, i32)>,
    // Persistent world memory layers
    pub fertility:  Vec<f32>,  // 0.0–1.0  soil richness; depletes when food eaten, recovers slowly
    pub hazard:     Vec<f32>,  // 0.0–1.0  accumulated danger from fire/death/disease; very slow decay
    pub pressure:   Vec<f32>,  // 0.0–10.0 historical footprint of organism movement
}

impl WorldGrid {
    pub fn new(seed: u64) -> Self {
        let size = WIDTH * HEIGHT;
        let mut g = WorldGrid {
            tiles:          vec![Tile::Grass as i8; size],
            fire_intensity: vec![0.0; size],
            food_trail:     vec![0.0; size],
            water_trail:    vec![0.0; size],
            path_trail:     vec![0.0; size],
            biome:          vec![0u8; size],
            temperature:    vec![22.0f32; size],
            structure:      vec![0.0f32; size],
            pool_centers:   Vec::new(),
            fertility:      vec![0.5f32; size],
            hazard:         vec![0.0f32; size],
            pressure:       vec![0.0f32; size],
        };
        g.generate(seed);
        g
    }

    pub fn idx(x: i32, y: i32) -> usize {
        y as usize * WIDTH + x as usize
    }

    pub fn in_bounds(x: i32, y: i32) -> bool {
        x >= 0 && x < WIDTH as i32 && y >= 0 && y < HEIGHT as i32
    }

    pub fn get(&self, x: i32, y: i32) -> Tile {
        if Self::in_bounds(x, y) { Tile::from_i8(self.tiles[Self::idx(x, y)]) } else { Tile::Void }
    }

    pub fn set(&mut self, x: i32, y: i32, tile: Tile) {
        if Self::in_bounds(x, y) { self.tiles[Self::idx(x, y)] = tile as i8; }
    }

    pub fn fire_intensity(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) { self.fire_intensity[Self::idx(x, y)] } else { 0.0 }
    }

    pub fn fire_intensity_mut(&mut self, x: i32, y: i32) -> &mut f32 {
        let i = Self::idx(x, y);
        &mut self.fire_intensity[i]
    }

    pub fn biome_at(&self, x: i32, y: i32) -> Biome {
        if Self::in_bounds(x, y) { Biome::from_u8(self.biome[Self::idx(x, y)]) } else { Biome::Grassland }
    }

    pub fn temp_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) { self.temperature[Self::idx(x, y)] } else { 22.0 }
    }

    pub fn biome_growth_mult(&self, x: i32, y: i32) -> f32 {
        self.biome_at(x, y).food_growth_mult()
    }

    pub fn structure_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) { self.structure[Self::idx(x, y)] } else { 0.0 }
    }

    pub fn structure_at_mut(&mut self, x: i32, y: i32) -> &mut f32 {
        let i = Self::idx(x, y);
        &mut self.structure[i]
    }

    pub fn add_structure(&mut self, x: i32, y: i32, amount: f32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            self.structure[i] = (self.structure[i] + amount).min(1.0);
        }
    }

    pub fn leave_trail(&mut self, x: i32, y: i32, kind: TrailKind, strength: f32) {
        if !Self::in_bounds(x, y) { return; }
        let i = Self::idx(x, y);
        match kind {
            TrailKind::Food  => self.food_trail[i]  = (self.food_trail[i]  + strength).min(3.0),
            TrailKind::Water => self.water_trail[i] = (self.water_trail[i] + strength).min(3.0),
            TrailKind::Path  => self.path_trail[i]  = (self.path_trail[i]  + strength).min(5.0),
        }
    }

    pub fn trail_at(&self, x: i32, y: i32, kind: TrailKind) -> f32 {
        if !Self::in_bounds(x, y) { return 0.0; }
        let i = Self::idx(x, y);
        match kind {
            TrailKind::Food  => self.food_trail[i],
            TrailKind::Water => self.water_trail[i],
            TrailKind::Path  => self.path_trail[i],
        }
    }

    pub fn detect_trail(&self, x: i32, y: i32, kind: TrailKind, radius: i32) -> f32 {
        let mut best = 0.0f32;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let v = self.trail_at(x + dx, y + dy, kind);
                if v > best { best = v; }
            }
        }
        best
    }

    pub fn decay_trails(&mut self) {
        for v in &mut self.food_trail  { *v *= 0.988; }
        for v in &mut self.water_trail { *v *= 0.988; }
        for v in &mut self.path_trail  { *v *= 0.997; }
    }

    pub fn reduce_fertility(&mut self, x: i32, y: i32, amount: f32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            self.fertility[i] = (self.fertility[i] - amount).max(0.0);
        }
    }

    pub fn add_hazard(&mut self, x: i32, y: i32, amount: f32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            self.hazard[i] = (self.hazard[i] + amount).min(1.0);
        }
    }

    pub fn stamp_pressure(&mut self, x: i32, y: i32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            self.pressure[i] = (self.pressure[i] + 0.015).min(10.0);
        }
    }

    // Called every 500 ticks — fertility recovers toward biome cap, hazard & pressure decay slowly
    pub fn decay_world_layers(&mut self) {
        for (i, v) in self.fertility.iter_mut().enumerate() {
            let cap = Biome::from_u8(self.biome[i]).base_fertility();
            if *v < cap { *v = (*v + 0.00006).min(cap); }
        }
        for v in &mut self.hazard   { *v *= 0.9997; }
        for v in &mut self.pressure { *v *= 0.9992; }
    }

    pub fn neighbors(x: i32, y: i32) -> impl Iterator<Item = (i32, i32)> {
        [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
            .iter()
            .map(move |(dx, dy)| (x + dx, y + dy))
            .filter(|(nx, ny)| Self::in_bounds(*nx, *ny))
            .collect::<Vec<_>>()
            .into_iter()
    }

    // ── World generation ───────────────────────────────────────────────────────

    fn generate(&mut self, seed: u64) {
        use rand::SeedableRng;
        use std::f32::consts::TAU;
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);

        let phases: [f32; 8] = std::array::from_fn(|_| rng.gen::<f32>() * TAU);

        // ── 0. Multi-continent land mask ──────────────────────────────────────
        // Three separate landmasses with ocean gaps between them.
        // Each entry: (center_nx, center_ny, mul_x, mul_y, sx, sy)
        //   mul_x/mul_y scale the coordinate before distance calc (higher = smaller continent)
        //   sx/sy are ellipse axis stretches
        let continents: [(f32, f32, f32, f32, f32, f32); 3] = [
            (0.20, 0.49,  6.2, 4.8,  0.85, 1.15),  // west
            (0.76, 0.47,  6.0, 4.6,  0.88, 1.10),  // east (slightly larger)
            (0.50, 0.77,  9.5, 7.5,  0.75, 1.00),  // south archipelago
        ];

        let mut land_mask = vec![false; WIDTH * HEIGHT];
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let nx = x as f32 / WIDTH  as f32;
                let ny = y as f32 / HEIGHT as f32;

                let mut max_elev = -999.0f32;
                for &(cx, cy, mx, my, sx, sy) in &continents {
                    let dx = (nx - cx) * mx;
                    let dy = (ny - cy) * my;
                    let e  = 1.0 - (dx * dx * sx + dy * dy * sy).sqrt();
                    if e > max_elev { max_elev = e; }
                }

                // Organic coastline noise (4 octaves)
                let noise =
                    0.11 * ((nx * 5.3 * TAU + phases[0]).sin() * (ny * 4.1 * TAU + phases[1]).cos()) +
                    0.07 * ((nx * 11.7 * TAU + phases[2]).sin() * (ny * 8.9 * TAU + phases[3]).cos()) +
                    0.04 * ((nx * 23.1 * TAU + phases[4]).sin() * (ny * 17.3 * TAU + phases[5]).cos()) +
                    0.02 * ((nx * 47.0 * TAU + phases[6]).sin() * (ny * 36.0 * TAU + phases[7]).cos());

                // Hard ocean floor below -0.35 prevents continents merging through noise
                land_mask[Self::idx(x, y)] = max_elev > -0.35 && (max_elev + noise) > 0.06;
            }
        }

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if !land_mask[Self::idx(x, y)] {
                    self.tiles[Self::idx(x, y)] = Tile::Water as i8;
                }
            }
        }

        // ── 1. Latitude-based biome assignment ───────────────────────────────
        // lat=0 at equator (center row), lat=1 at poles (top/bottom rows).
        // Desert belts sit in the subtropical Hadley-cell zone.
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if !land_mask[Self::idx(x, y)] { continue; }
                let nx = x as f32 / WIDTH  as f32;
                let ny = y as f32 / HEIGHT as f32;
                let lat = (ny - 0.5).abs() * 2.0;
                // Longitude-varying wave breaks up perfectly uniform latitude bands
                let lon_wave = ((nx * 4.7 + ny * 1.8) * TAU + phases[0]).sin() * 0.10;

                let biome = if lat > 0.72 + lon_wave * 0.10 {
                    Biome::Tundra
                } else if lat > 0.52 + lon_wave * 0.10 {
                    if rng.gen::<f32>() < 0.80 { Biome::Tundra } else { Biome::Grassland }
                } else if lat > 0.36 + lon_wave * 0.08 {
                    // Subtropical desert belt
                    let dp = ((lat - 0.36) / 0.18).powf(1.3) * 0.85 + lon_wave * 0.15;
                    let r = rng.gen::<f32>();
                    if r < dp { Biome::Desert } else { Biome::Grassland }
                } else if lat > 0.18 {
                    // Temperate
                    let r = rng.gen::<f32>();
                    if r < 0.38      { Biome::Forest   }
                    else if r < 0.72 { Biome::Grassland }
                    else if r < 0.88 { Biome::Wetland   }
                    else             { Biome::Volcanic  }
                } else {
                    // Equatorial / tropical
                    let r = rng.gen::<f32>();
                    if r < 0.52      { Biome::Forest   }
                    else if r < 0.72 { Biome::Wetland   }
                    else if r < 0.90 { Biome::Grassland }
                    else             { Biome::Volcanic  }
                };

                self.biome[Self::idx(x, y)] = biome as u8;
            }
        }

        // ── 2. Inland water pools — skip desert and polar zones ──────────────
        let zones_x = 8usize;
        let zones_y = 5usize;
        let zone_w  = WIDTH  / zones_x;
        let zone_h  = HEIGHT / zones_y;
        let mut pool_centers: Vec<(i32, i32)> = Vec::new();
        for zy in 0..zones_y {
            for zx in 0..zones_x {
                let x0 = (zx * zone_w + 4) as i32;
                let y0 = (zy * zone_h + 4) as i32;
                let x1 = ((zx + 1) * zone_w - 4) as i32;
                let y1 = ((zy + 1) * zone_h - 4) as i32;
                let candidates: Vec<(i32, i32)> = (y0..y1)
                    .flat_map(|y| (x0..x1).map(move |x| (x, y)))
                    .filter(|&(x, y)| {
                        if !Self::in_bounds(x, y) || !land_mask[Self::idx(x, y)] { return false; }
                        let b = Biome::from_u8(self.biome[Self::idx(x, y)]);
                        !matches!(b, Biome::Desert | Biome::Tundra)
                    })
                    .collect();
                if !candidates.is_empty() {
                    let &(cx, cy) = &candidates[rng.gen_range(0..candidates.len())];
                    pool_centers.push((cx, cy));
                }
            }
        }
        for &(cx, cy) in &pool_centers {
            let radius = rng.gen_range(3i32..=5);
            for dx in -radius..=radius {
                for dy in -radius..=radius {
                    if dx.abs() + dy.abs() <= radius {
                        let (x, y) = (cx + dx, cy + dy);
                        if Self::in_bounds(x, y) && land_mask[Self::idx(x, y)] {
                            self.set(x, y, Tile::Water);
                            self.biome[Self::idx(x, y)] = Biome::Wetland as u8;
                        }
                    }
                }
            }
        }

        // ── 3. Rivers ─────────────────────────────────────────────────────────
        let n = pool_centers.len();
        if n >= 2 {
            for i in 0..n.saturating_sub(1) {
                if rng.gen::<f32>() < 0.55 {
                    let a = pool_centers[i];
                    let b = pool_centers[(i + rng.gen_range(1..=3.min(n - 1 - i).max(1))) % n];
                    self.carve_river(a, b, &mut rng, &land_mask);
                }
            }
        }

        // ── 4. Rocks ──────────────────────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass { continue; }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).rock_chance();
                if rng.gen::<f32>() < chance { self.set(x, y, Tile::Rock); }
            }
        }

        // ── 5. Initial food (Grass only — Snow/Sand follow in step 6) ─────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass { continue; }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).initial_food_chance();
                if rng.gen::<f32>() < chance { self.set(x, y, Tile::Food); }
            }
        }

        // ── 6. Snow and Sand tiles ────────────────────────────────────────────
        // Applied after food placement: converts Grass/Food in polar zones to Snow,
        // and Grass in desert zones to Sand.
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if !land_mask[Self::idx(x, y)] { continue; }
                let idx = Self::idx(x, y);
                let tile  = Tile::from_i8(self.tiles[idx]);
                if !matches!(tile, Tile::Grass | Tile::Food) { continue; }
                let biome = Biome::from_u8(self.biome[idx]);
                let ny    = y as f32 / HEIGHT as f32;
                let lat   = (ny - 0.5).abs() * 2.0;
                match biome {
                    Biome::Tundra => {
                        // Deep polar = near-100% snow; sub-polar = partial
                        let snow_p = ((lat - 0.48).max(0.0) / 0.52).powf(0.55) * 0.96;
                        if rng.gen::<f32>() < snow_p {
                            self.tiles[idx] = Tile::Snow as i8;
                        }
                    }
                    Biome::Desert => {
                        if matches!(tile, Tile::Grass) && rng.gen::<f32>() < 0.82 {
                            self.tiles[idx] = Tile::Sand as i8;
                        }
                    }
                    _ => {}
                }
            }
        }

        // ── 7. Volcanic fire seeds ────────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if Biome::from_u8(self.biome[Self::idx(x, y)]) == Biome::Volcanic
                    && self.get(x, y) == Tile::Grass
                    && rng.gen::<f32>() < 0.04
                {
                    self.set(x, y, Tile::Fire);
                    self.fire_intensity[Self::idx(x, y)] = 1.0;
                }
            }
        }

        // ── 8. Temperature (biome base + latitude correction) ─────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let base  = Biome::from_u8(self.biome[Self::idx(x, y)]).base_temp();
                let ny    = y as f32 / HEIGHT as f32;
                let lat_c = (ny - 0.5).abs() * 2.0 * 8.0; // ±8°C polar correction
                self.temperature[Self::idx(x, y)] = base - lat_c;
            }
        }

        self.pool_centers = pool_centers;

        // ── 9. Initial fertility ───────────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                self.fertility[i] = Biome::from_u8(self.biome[i]).base_fertility();
            }
        }
    }

    fn carve_river(&mut self, from: (i32, i32), to: (i32, i32), rng: &mut impl Rng, land_mask: &[bool]) {
        let (mut x, mut y) = from;
        let max_steps = ((from.0 - to.0).abs() + (from.1 - to.1).abs()) * 4;
        for _ in 0..max_steps {
            if (x - to.0).abs() + (y - to.1).abs() <= 2 { break; }
            let dx = (to.0 - x).signum();
            let dy = (to.1 - y).signum();
            let (mx, my) = if rng.gen::<f32>() < 0.7 {
                if rng.gen::<bool>() { (dx, 0) } else { (0, dy) }
            } else {
                let r: i32 = rng.gen_range(-1..=1);
                if rng.gen::<bool>() { (r, 0) } else { (0, r) }
            };
            x = (x + mx).max(1).min(WIDTH as i32 - 2);
            y = (y + my).max(1).min(HEIGHT as i32 - 2);
            for rx in -1i32..=1 {
                for ry in -1i32..=1 {
                    if rx.abs() + ry.abs() <= 1 {
                        let (nx, ny) = (x + rx, y + ry);
                        if Self::in_bounds(nx, ny) && land_mask[Self::idx(nx, ny)]
                            && self.get(nx, ny) != Tile::Rock
                        {
                            self.set(nx, ny, Tile::Water);
                            self.biome[Self::idx(nx, ny)] = Biome::Wetland as u8;
                        }
                    }
                }
            }
        }
    }

    /// Slow geological coastal change — called every ~5000 ticks.
    /// Floods a handful of coastal land tiles and exposes a few coastal water tiles.
    pub fn tick_geology(&mut self, rng: &mut impl Rng) {
        let flood_count  = rng.gen_range(6..=18usize);
        let emerge_count = rng.gen_range(2..=8usize);

        // Flood random coastal land tiles
        let mut flooded = 0usize;
        for _ in 0..800 {
            if flooded >= flood_count { break; }
            let x = rng.gen_range(1..WIDTH as i32 - 1);
            let y = rng.gen_range(1..HEIGHT as i32 - 1);
            if !matches!(self.get(x, y), Tile::Grass | Tile::Snow | Tile::Sand | Tile::Food | Tile::Ash) { continue; }
            let coastal = [(x-1,y),(x+1,y),(x,y-1),(x,y+1)].iter()
                .any(|&(nx, ny)| Self::in_bounds(nx, ny) && self.get(nx, ny) == Tile::Water);
            if coastal {
                self.tiles[Self::idx(x, y)] = Tile::Water as i8;
                flooded += 1;
            }
        }

        // Expose random coastal water tiles
        let mut emerged = 0usize;
        for _ in 0..600 {
            if emerged >= emerge_count { break; }
            let x = rng.gen_range(1..WIDTH as i32 - 1);
            let y = rng.gen_range(1..HEIGHT as i32 - 1);
            if self.get(x, y) != Tile::Water { continue; }
            let coastal = [(x-1,y),(x+1,y),(x,y-1),(x,y+1)].iter()
                .any(|&(nx, ny)| Self::in_bounds(nx, ny)
                    && !matches!(self.get(nx, ny), Tile::Water | Tile::Void));
            if coastal {
                let ny_n = y as f32 / HEIGHT as f32;
                let lat  = (ny_n - 0.5).abs() * 2.0;
                let (tile, biome) = if lat > 0.65 {
                    (Tile::Snow, Biome::Tundra)
                } else if lat > 0.40 {
                    (Tile::Sand, Biome::Desert)
                } else {
                    (Tile::Grass, Biome::Grassland)
                };
                self.tiles[Self::idx(x, y)] = tile as i8;
                self.biome[Self::idx(x, y)] = biome as u8;
                emerged += 1;
            }
        }
    }

    // Serialize a viewport window centered on (cx, cy) of size vw×vh tiles.
    // origin_x / origin_y in GridJson tell the client how to offset world-space coords.
    pub fn to_json_viewport(&self, cx: i32, cy: i32, vw: usize, vh: usize) -> GridJson {
        let ox = (cx - vw as i32 / 2).clamp(0, (WIDTH as i32 - vw as i32).max(0)) as usize;
        let oy = (cy - vh as i32 / 2).clamp(0, (HEIGHT as i32 - vh as i32).max(0)) as usize;

        let slice_row = |vec: &[i8], y: usize| vec[y * WIDTH + ox .. y * WIDTH + ox + vw].to_vec();
        let slice_f32 = |vec: &[f32], y: usize| vec[y * WIDTH + ox .. y * WIDTH + ox + vw].to_vec();
        let slice_u8  = |vec: &[u8],  y: usize| vec[y * WIDTH + ox .. y * WIDTH + ox + vw].to_vec();

        let tiles_2d:  Vec<Vec<i8>>  = (oy..oy+vh).map(|y| slice_row(&self.tiles, y)).collect();
        let fire_2d:   Vec<Vec<f32>> = (oy..oy+vh).map(|y| slice_f32(&self.fire_intensity, y)).collect();
        let biome_2d:  Vec<Vec<u8>>  = (oy..oy+vh).map(|y| slice_u8(&self.biome, y)).collect();
        let struct_2d: Vec<Vec<f32>> = (oy..oy+vh).map(|y| {
            self.structure[y * WIDTH + ox .. y * WIDTH + ox + vw].iter()
                .map(|&v| (v * 100.0).round() / 100.0)
                .collect()
        }).collect();
        let fertility_map: Vec<Vec<u8>> = (oy..oy+vh).map(|y|
            self.fertility[y * WIDTH + ox .. y * WIDTH + ox + vw].iter()
                .map(|&v| (v * 255.0) as u8).collect()
        ).collect();
        let hazard_map: Vec<Vec<u8>> = (oy..oy+vh).map(|y|
            self.hazard[y * WIDTH + ox .. y * WIDTH + ox + vw].iter()
                .map(|&v| (v * 255.0) as u8).collect()
        ).collect();
        let pressure_map: Vec<Vec<u8>> = (oy..oy+vh).map(|y|
            self.pressure[y * WIDTH + ox .. y * WIDTH + ox + vw].iter()
                .map(|&v| (v / 10.0 * 255.0).min(255.0) as u8).collect()
        ).collect();

        GridJson {
            width: vw, height: vh,
            origin_x: ox as i32, origin_y: oy as i32,
            tiles: tiles_2d, fire_intensity: fire_2d, biomes: biome_2d, structure: struct_2d,
            fertility_map, hazard_map, pressure_map,
        }
    }

    // Full-grid serialization (used by headless binary for payload benchmarking)
    pub fn to_json(&self) -> GridJson {
        self.to_json_viewport(WIDTH as i32 / 2, HEIGHT as i32 / 2, WIDTH, HEIGHT)
    }
}

#[derive(Clone, Copy)]
pub enum TrailKind { Food, Water, Path }

#[derive(Serialize)]
pub struct GridJson {
    pub width:          usize,
    pub height:         usize,
    pub origin_x:       i32,
    pub origin_y:       i32,
    pub tiles:          Vec<Vec<i8>>,
    pub fire_intensity: Vec<Vec<f32>>,
    pub biomes:         Vec<Vec<u8>>,
    pub structure:      Vec<Vec<f32>>,
    pub fertility_map:  Vec<Vec<u8>>,
    pub hazard_map:     Vec<Vec<u8>>,
    pub pressure_map:   Vec<Vec<u8>>,
}
