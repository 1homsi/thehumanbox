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

        // ── 0. Continent mask — creates organic "world map" shape ─────────
        let phases: [f32; 8] = std::array::from_fn(|_| rng.gen::<f32>() * TAU);
        let mut land_mask = vec![false; WIDTH * HEIGHT];
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let nx = x as f32 / WIDTH  as f32;
                let ny = y as f32 / HEIGHT as f32;
                let dx = (nx - 0.5) * 2.0;
                let dy = (ny - 0.5) * 2.0;
                let base_elev = 1.0 - (dx * dx * 1.05 + dy * dy * 1.65).sqrt();
                let noise =
                    0.10 * ((nx * 5.0 * TAU + phases[0]).sin() * (ny * 4.0 * TAU + phases[1]).cos()) +
                    0.06 * ((nx * 11.0 * TAU + phases[2]).sin() * (ny * 9.0 * TAU + phases[3]).cos()) +
                    0.03 * ((nx * 22.0 * TAU + phases[4]).sin() * (ny * 18.0 * TAU + phases[5]).cos());
                land_mask[Self::idx(x, y)] = (base_elev + noise) > 0.05;
            }
        }
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if !land_mask[Self::idx(x, y)] {
                    self.tiles[Self::idx(x, y)] = Tile::Water as i8;
                }
            }
        }

        // ── 1. Biome Voronoi (land tiles only) ───────────────────────────
        let biome_distribution: &[(u8, usize)] = &[
            (Biome::Grassland as u8, 8),
            (Biome::Forest    as u8, 6),
            (Biome::Desert    as u8, 4),
            (Biome::Wetland   as u8, 4),
            (Biome::Tundra    as u8, 3),
            (Biome::Volcanic  as u8, 2),
        ];
        let land_tiles: Vec<(i32, i32)> = (0..HEIGHT as i32)
            .flat_map(|y| (0..WIDTH as i32).map(move |x| (x, y)))
            .filter(|&(x, y)| land_mask[Self::idx(x, y)])
            .collect();

        let mut centers: Vec<(i32, i32, u8)> = Vec::new();
        if !land_tiles.is_empty() {
            for &(btype, count) in biome_distribution {
                for _ in 0..count {
                    let &(x, y) = &land_tiles[rng.gen_range(0..land_tiles.len())];
                    centers.push((x, y, btype));
                }
            }
        }
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if !land_mask[Self::idx(x, y)] { continue; }
                let nearest = centers.iter()
                    .min_by_key(|(cx, cy, _)| (x - cx).abs() + (y - cy).abs())
                    .unwrap();
                self.biome[Self::idx(x, y)] = nearest.2;
            }
        }

        // ── 2. Inland water pools — placed on land only ───────────────────
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
                    .filter(|&(x, y)| Self::in_bounds(x, y) && land_mask[Self::idx(x, y)])
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

        // ── 3. Rivers — connect some pool pairs ──────────────────────────
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

        // ── 4. Rocks ─────────────────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass { continue; }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).rock_chance();
                if rng.gen::<f32>() < chance { self.set(x, y, Tile::Rock); }
            }
        }

        // ── 5. Initial food ───────────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass { continue; }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).initial_food_chance();
                if rng.gen::<f32>() < chance { self.set(x, y, Tile::Food); }
            }
        }

        // ── 6. Volcanic fire seeds ────────────────────────────────────────
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

        // ── 7. Temperature from biome ─────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                self.temperature[Self::idx(x, y)] =
                    Biome::from_u8(self.biome[Self::idx(x, y)]).base_temp();
            }
        }

        self.pool_centers = pool_centers;

        // ── 8. Initial fertility from biome ───────────────────────────────
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
