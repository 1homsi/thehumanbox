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
    // Terrain shape (generated once, used for depth rendering)
    pub elevation:  Vec<f32>,  // normalised [0,1]; 0 = deepest ocean, 1 = highest peak
    pub depth:      Vec<f32>,  // water tiles: normalised depth [0,1] (0=coast, 1=deepest); land=0
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
            elevation:      vec![0.0f32; size],
            depth:          vec![0.0f32; size],
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

    pub fn fertility_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) { self.fertility[Self::idx(x, y)] } else { 0.0 }
    }

    pub fn hazard_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) { self.hazard[Self::idx(x, y)] } else { 0.0 }
    }

    // Called every 500 ticks — fertility recovers toward biome cap, hazard & pressure decay slowly
    pub fn decay_world_layers(&mut self) {
        for (i, v) in self.fertility.iter_mut().enumerate() {
            let cap = Biome::from_u8(self.biome[i]).base_fertility();
            if *v < cap {
                // High-pressure tiles recover more slowly — soil compaction under heavy use
                let rate = if self.pressure[i] > 5.0 {
                    0.000008  // heavily trampled: 7.5× slower recovery
                } else if self.pressure[i] > 2.5 {
                    0.000025  // moderate use: 2.4× slower
                } else {
                    0.00006   // undisturbed: normal recovery
                };
                *v = (*v + rate).min(cap);
            }
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

    // ── Terrain noise primitives ───────────────────────────────────────────────

    /// Hash two grid-cell integers + seed → pseudo-random f32 in [-1, 1]
    fn corner_hash(ix: u32, iy: u32, seed: u64) -> f32 {
        let mut h: u64 = seed;
        h ^= (ix as u64).wrapping_mul(0x9e3779b97f4a7c15);
        h = h.wrapping_add((iy as u64).wrapping_mul(0x6c62272e07bb0142));
        h ^= h >> 31;
        h = h.wrapping_mul(0xbf58476d1ce4e5b9);
        h ^= h >> 27;
        h = h.wrapping_mul(0x94d049bb133111eb);
        h ^= h >> 32;
        (h as f32 / u64::MAX as f32) * 2.0 - 1.0
    }

    /// Smooth 2-D value noise — bilinear interpolation of hashed corners, quintic ease
    fn value_noise(px: f32, py: f32, seed: u64) -> f32 {
        let ix = px.floor() as u32;
        let iy = py.floor() as u32;
        let fx = px - px.floor();
        let fy = py - py.floor();
        // Quintic smooth-step: 6t^5 - 15t^4 + 10t^3
        let ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
        let uy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);
        let a = Self::corner_hash(ix,     iy,     seed);
        let b = Self::corner_hash(ix + 1, iy,     seed);
        let c = Self::corner_hash(ix,     iy + 1, seed);
        let d = Self::corner_hash(ix + 1, iy + 1, seed);
        let ab = a + ux * (b - a);
        let cd = c + ux * (d - c);
        ab + uy * (cd - ab)
    }

    /// Fractional Brownian Motion — 7 octaves, lacunarity 2.05, gain 0.50
    fn fbm(nx: f32, ny: f32, seed: u64) -> f32 {
        let mut val  = 0.0f32;
        let mut amp  = 0.50f32;
        let mut freq = 3.0f32;
        for oct in 0u64..7 {
            let s = seed.wrapping_add(oct.wrapping_mul(0xa3b2c1d4e5f60718));
            val  += amp * Self::value_noise(nx * freq, ny * freq, s);
            amp  *= 0.50;
            freq *= 2.05;
        }
        val  // typically [-0.70, 0.70]
    }

    // ── World generation ───────────────────────────────────────────────────────

    fn generate(&mut self, seed: u64) {
        use rand::SeedableRng;
        use std::collections::VecDeque;
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
        let size = WIDTH * HEIGHT;

        // ── 0. Continent centres — guaranteed vertical spread ────────────────
        // Divide the world into N vertical bands (top→bottom) and place one
        // continent nucleus per band.  This prevents all land merging into a
        // single horizontal equatorial strip.
        let n_continents: usize = rng.gen_range(3usize..=5);
        let band_h = 0.76f32 / n_continents as f32;  // usable range 0.12–0.88

        // Horizontal x-slots: guarantee full E/W coverage regardless of how many
        // continents are generated.  Pattern: left → right → center → left-mid →
        // right-mid so the first 3 continents always cover all three thirds of
        // the world.  This eliminates the "empty right side" problem.
        let x_slots: [(f32, f32); 5] = [
            (0.05, 0.38),   // left third
            (0.62, 0.95),   // right third
            (0.28, 0.72),   // center
            (0.05, 0.52),   // left-centre
            (0.48, 0.95),   // right-centre
        ];
        let cont_centers: Vec<(f32, f32)> = (0..n_continents).map(|k| {
            let y_lo = 0.12 + k as f32 * band_h;
            let y_hi = y_lo + band_h;
            let (x_lo, x_hi) = x_slots[k % 5];
            let cx = rng.gen_range(x_lo..x_hi);
            let cy = rng.gen_range(y_lo..y_hi);
            (cx, cy)
        }).collect();

        // Per-continent shape: rotated elongated ellipse + domain-warp strength
        // long_axis runs along `angle`, short_axis perpendicular.
        let cont_params: Vec<(f32, f32, f32, f32)> = cont_centers.iter().map(|_| {
            let short = rng.gen_range(0.11f32..0.19);
            let long  = short * rng.gen_range(1.8f32..3.2);
            let angle = rng.gen_range(0.0f32..std::f32::consts::TAU);
            let str   = rng.gen_range(1.05f32..1.50);
            (short, long, angle, str)
        }).collect();

        // ── 1. FBM elevation + rotated-ellipse attractors + domain warp ─────
        // Domain warp: apply a low-freq FBM offset before computing attractor
        // distance so continent coastlines are organic rather than round blobs.
        let mut raw_elev = vec![0.0f32; size];
        for y in 0..HEIGHT {
            for x in 0..WIDTH {
                let nx = x as f32 / WIDTH  as f32;
                let ny = y as f32 / HEIGHT as f32;

                // Low-frequency domain warp (two independent FBM layers)
                let wx = Self::fbm(nx * 1.7 + 13.7, ny * 1.7 + 52.4,
                                   seed ^ 0x2a3b_4c5d_6e7f_8a9b) * 0.20;
                let wy = Self::fbm(nx * 1.7 + 77.3, ny * 1.7 + 31.1,
                                   seed ^ 0x1b2c_3d4e_5f6a_7b8c) * 0.20;
                let wnx = nx + wx;
                let wny = ny + wy;

                // FBM terrain detail
                let noise = Self::fbm(nx, ny, seed) * 0.55;

                // Continental lift: rotated-ellipse attractor at each warped point
                let cont_lift = (0..n_continents).map(|k| {
                    let (cx, cy)            = cont_centers[k];
                    let (sa, la, ang, str)  = cont_params[k];
                    let dx  = wnx - cx;
                    let dy  = wny - cy;
                    let cos = ang.cos();
                    let sin = ang.sin();
                    // Rotate into continent's local frame
                    let rdx = (cos * dx + sin * dy) / la;
                    let rdy = (-sin * dx + cos * dy) / sa;
                    let d   = (rdx * rdx + rdy * rdy).sqrt();
                    (1.0 - d.min(1.0)).powf(1.4) * str
                }).fold(0.0f32, f32::max);

                // Strong polar fade: almost no land above lat 0.72
                let lat = (ny - 0.5).abs() * 2.0;
                let polar_fade = if lat > 0.72 {
                    (1.0 - (lat - 0.72) / 0.28).max(0.05)
                } else { 1.0 };

                raw_elev[Self::idx(x as i32, y as i32)] =
                    (noise + cont_lift) * polar_fade;
            }
        }

        // ── 2. Sea level — target ~33 % land ────────────────────────────────
        let mut sorted_elev = raw_elev.clone();
        sorted_elev.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let sea_level    = sorted_elev[(size as f32 * 0.67) as usize];
        let elev_min     = sorted_elev[0];
        let elev_max     = sorted_elev[size - 1];
        let elev_full    = (elev_max - elev_min).max(1e-5);
        let elev_land_rng = (elev_max - sea_level).max(1e-5);

        // ── 3. Initial land mask ─────────────────────────────────────────────
        let mut land_mask = vec![false; size];
        for i in 0..size {
            if raw_elev[i] >= sea_level {
                land_mask[i] = true;
            } else {
                self.tiles[i] = Tile::Water as i8;
            }
        }

        // ── 4. Remove tiny islands (< 200 tiles) ────────────────────────────
        {
            let mut visited = vec![false; size];
            for sy in 0..HEIGHT as i32 {
                for sx in 0..WIDTH as i32 {
                    let si = Self::idx(sx, sy);
                    if !land_mask[si] || visited[si] { continue; }
                    let mut comp: Vec<usize> = Vec::new();
                    let mut queue: VecDeque<(i32, i32)> = VecDeque::new();
                    queue.push_back((sx, sy));
                    visited[si] = true;
                    while let Some((cx, cy)) = queue.pop_front() {
                        comp.push(Self::idx(cx, cy));
                        for &(dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                            let (nx, ny_) = (cx + dx, cy + dy);
                            if Self::in_bounds(nx, ny_) {
                                let ni = Self::idx(nx, ny_);
                                if land_mask[ni] && !visited[ni] {
                                    visited[ni] = true;
                                    queue.push_back((nx, ny_));
                                }
                            }
                        }
                    }
                    if comp.len() < 200 {
                        for &i in &comp {
                            land_mask[i] = false;
                            self.tiles[i] = Tile::Water as i8;
                        }
                    }
                }
            }
        }

        // ── 5. Normalised elevation map ──────────────────────────────────────
        for i in 0..size {
            self.elevation[i] = (raw_elev[i] - elev_min) / elev_full;
        }
        // Depth is filled after coastal-distance BFS (step 6) so it's smooth.

        // ── 6. Coastal distance BFS — for moisture model ─────────────────────
        // Seeded from all ocean water tiles (land_mask = false), grows into land.
        // Used in step 7 for moisture calculation.
        // (Depth BFS runs at the end of generate() so it catches pools + rivers.)
        let mut coast_dist = vec![i32::MAX / 2; size];
        {
            let mut queue: VecDeque<(i32, i32)> = VecDeque::new();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    let i = Self::idx(x, y);
                    if !land_mask[i] { coast_dist[i] = 0; queue.push_back((x, y)); }
                }
            }
            while let Some((cx, cy)) = queue.pop_front() {
                let ci = Self::idx(cx, cy);
                let d  = coast_dist[ci];
                for &(dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                    let (nx, ny_) = (cx + dx, cy + dy);
                    if Self::in_bounds(nx, ny_) {
                        let ni = Self::idx(nx, ny_);
                        if coast_dist[ni] > d + 1 { coast_dist[ni] = d + 1; queue.push_back((nx, ny_)); }
                    }
                }
            }
        }

        // ── 7. Climate: temperature & moisture ───────────────────────────────
        let mut temp_map  = vec![0.0f32; size];
        let mut moist_map = vec![0.0f32; size];
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i  = Self::idx(x, y);
                let ny = y as f32 / HEIGHT as f32;
                let lat = (ny - 0.5).abs() * 2.0;  // 0 = equator, 1 = pole

                // Elevation above sea level, normalised [0,1]
                let norm_elev = if land_mask[i] {
                    ((raw_elev[i] - sea_level) / elev_land_rng).clamp(0.0, 1.0)
                } else { 0.0 };

                // Temperature: 35 °C at equator, –15 °C at poles, –30 °C at peaks
                let base_temp  = 35.0 - lat * 50.0;
                let elev_cool  = norm_elev * 30.0;
                temp_map[i]    = base_temp - elev_cool;

                // Moisture: coastal + equatorial minus Hadley-cell dry belt
                let eq_moist = if lat < 0.15 {
                    1.0
                } else {
                    (1.0 - (lat - 0.15) / 0.85).clamp(0.0, 1.0).powf(0.6)
                };
                let coast_moist = {
                    let cd = coast_dist[i] as f32;
                    (1.0 - (cd / 90.0).min(1.0)).powf(1.25)
                };
                // Subtropical dry belt centred at lat ≈ 0.38
                let hadley = {
                    let dist_from_belt = (lat - 0.38).abs();
                    if dist_from_belt < 0.12 { (1.0 - dist_from_belt / 0.12) * 0.65 } else { 0.0 }
                };
                moist_map[i] = (eq_moist * 0.45 + coast_moist * 0.55 - hadley).clamp(0.0, 1.0);
            }
        }

        // ── 8. Biome assignment (temperature × moisture matrix) ──────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                if !land_mask[i] { continue; }

                let norm_elev = ((raw_elev[i] - sea_level) / elev_land_rng).clamp(0.0, 1.0);
                let temp  = temp_map[i];
                let moist = moist_map[i];

                let biome = if norm_elev > 0.72 {
                    Biome::Tundra    // High mountain — always cold
                } else if temp < -2.0 {
                    Biome::Tundra
                } else if temp < 7.0 {
                    if moist > 0.45 { Biome::Forest } else { Biome::Tundra }
                } else if temp < 16.0 {
                    if moist > 0.55      { Biome::Forest    }
                    else if moist > 0.30 { Biome::Grassland }
                    else                 { Biome::Desert    }
                } else if temp < 26.0 {
                    if moist > 0.52      { Biome::Forest    }
                    else if moist > 0.30 { Biome::Grassland }
                    else if moist > 0.12 {
                        if rng.gen::<f32>() < 0.25 { Biome::Wetland } else { Biome::Grassland }
                    }
                    else { Biome::Desert }
                } else {
                    // Tropical
                    if moist > 0.55 { Biome::Forest }
                    else if moist > 0.35 {
                        if rng.gen::<f32>() < 0.40 { Biome::Wetland } else { Biome::Forest }
                    }
                    else if moist > 0.15 { Biome::Grassland }
                    else { Biome::Desert }
                };

                // Sparse volcanic pockets at mid-high elevation
                let biome = if rng.gen::<f32>() < 0.004 && norm_elev > 0.42 && norm_elev < 0.72 {
                    Biome::Volcanic
                } else { biome };

                self.biome[i] = biome as u8;
            }
        }

        // ── 9. Tile assignment (elevation bands + biome) ─────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                if !land_mask[i] { continue; }

                let norm_elev = ((raw_elev[i] - sea_level) / elev_land_rng).clamp(0.0, 1.0);
                let biome     = Biome::from_u8(self.biome[i]);

                self.tiles[i] = if norm_elev > 0.78 {
                    Tile::Snow as i8   // Mountain peak
                } else if norm_elev > 0.54 {
                    Tile::Rock as i8   // Mountain rock
                } else if norm_elev < 0.05 {
                    Tile::Sand as i8   // Beach / coastal strip
                } else {
                    match biome {
                        Biome::Desert => {
                            if rng.gen::<f32>() < 0.80 { Tile::Sand as i8 } else { Tile::Grass as i8 }
                        }
                        Biome::Tundra => Tile::Snow as i8,
                        _ => Tile::Grass as i8,
                    }
                };
            }
        }

        // ── 10. Scattered biome rocks (ground texture, reduced) ──────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass { continue; }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).rock_chance() * 0.45;
                if rng.gen::<f32>() < chance { self.set(x, y, Tile::Rock); }
            }
        }

        // ── 11. Inland water pools (skip mountains + deserts + tundra) ───────
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
                        if !Self::in_bounds(x, y) { return false; }
                        let idx = Self::idx(x, y);
                        if !land_mask[idx] { return false; }
                        let b = Biome::from_u8(self.biome[idx]);
                        if matches!(b, Biome::Desert | Biome::Tundra) { return false; }
                        // Skip mountains
                        let ne = ((raw_elev[idx] - sea_level) / elev_land_rng).clamp(0.0, 1.0);
                        ne < 0.50
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

        // ── 12. Rivers (MST pool-to-pool with S-curve meander) ───────────────
        let n = pool_centers.len();
        if n >= 2 {
            let mut connected = vec![false; n];
            connected[0] = true;
            for _ in 0..n {
                let mut best_dist = i32::MAX;
                let mut best_a = 0usize;
                let mut best_b = 0usize;
                for a in 0..n {
                    if !connected[a] { continue; }
                    for b in 0..n {
                        if connected[b] { continue; }
                        let dx = pool_centers[a].0 - pool_centers[b].0;
                        let dy = pool_centers[a].1 - pool_centers[b].1;
                        let d  = dx * dx + dy * dy;
                        if d < best_dist { best_dist = d; best_a = a; best_b = b; }
                    }
                }
                if best_dist == i32::MAX { break; }
                connected[best_b] = true;
                if rng.gen::<f32>() < 0.65 {
                    self.carve_river(pool_centers[best_a], pool_centers[best_b], &mut rng, &land_mask);
                }
            }
            // Extra tributary cross-connections
            for _ in 0..(n / 3) {
                let a = rng.gen_range(0..n);
                let mut dists: Vec<(i32, usize)> = (0..n).filter(|&b| b != a).map(|b| {
                    let dx = pool_centers[a].0 - pool_centers[b].0;
                    let dy = pool_centers[a].1 - pool_centers[b].1;
                    (dx * dx + dy * dy, b)
                }).collect();
                dists.sort_by_key(|&(d, _)| d);
                if dists.len() >= 2 && rng.gen::<f32>() < 0.45 {
                    let b = dists[1].1;
                    self.carve_river(pool_centers[a], pool_centers[b], &mut rng, &land_mask);
                }
            }
        }

        // ── 13. Food placement ────────────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass { continue; }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).initial_food_chance();
                if rng.gen::<f32>() < chance { self.set(x, y, Tile::Food); }
            }
        }

        // ── 14. Volcanic fire seeds ───────────────────────────────────────────
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                if Biome::from_u8(self.biome[i]) == Biome::Volcanic
                    && self.get(x, y) == Tile::Grass
                    && rng.gen::<f32>() < 0.04
                {
                    self.set(x, y, Tile::Fire);
                    self.fire_intensity[i] = 1.0;
                }
            }
        }

        // ── 15. Temperature map ───────────────────────────────────────────────
        self.temperature = temp_map;

        // ── 16. Initial fertility ─────────────────────────────────────────────
        for i in 0..size {
            self.fertility[i] = Biome::from_u8(self.biome[i]).base_fertility();
        }

        self.pool_centers = pool_centers;

        // ── 17. Depth map — BFS after all water placed ────────────────────────
        // Must run AFTER pools and rivers so inland water is correctly shallow.
        // Seed from every non-water tile adjacent to water, flood outward into
        // water tiles.  Distance = 0 at shoreline → grows into open ocean.
        // Inland lakes and rivers end up at distance 1–5 → very shallow (light blue).
        // Open ocean centre ends up at distance >100 → deep (dark navy).
        {
            let mut od = vec![i32::MAX / 2i32; size];
            let mut queue: VecDeque<(i32, i32)> = VecDeque::new();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    let i = Self::idx(x, y);
                    if self.tiles[i] != Tile::Water as i8 { continue; }
                    // Is this water tile adjacent to any non-water tile?
                    let on_shore = [(-1i32,0i32),(1,0),(0,-1),(0,1)].iter().any(|&(dx,dy)| {
                        let (nx, ny_) = (x+dx, y+dy);
                        Self::in_bounds(nx, ny_)
                            && self.tiles[Self::idx(nx, ny_)] != Tile::Water as i8
                    });
                    if on_shore { od[i] = 0; queue.push_back((x, y)); }
                }
            }
            while let Some((cx, cy)) = queue.pop_front() {
                let ci = Self::idx(cx, cy);
                let d  = od[ci];
                for &(dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                    let (nx, ny_) = (cx + dx, cy + dy);
                    if Self::in_bounds(nx, ny_) {
                        let ni = Self::idx(nx, ny_);
                        if self.tiles[ni] == Tile::Water as i8 && od[ni] > d + 1 {
                            od[ni] = d + 1;
                            queue.push_back((nx, ny_));
                        }
                    }
                }
            }
            // Normalise: 0 tiles from shore = depth 0 (shallow), 100+ = depth 1 (deep)
            const DEEP_CAP: f32 = 100.0;
            for i in 0..size {
                self.depth[i] = if self.tiles[i] == Tile::Water as i8 {
                    (od[i] as f32 / DEEP_CAP).min(1.0)
                } else { 0.0 };
            }
        }
    }

    fn carve_river(&mut self, from: (i32, i32), to: (i32, i32), rng: &mut impl Rng, land_mask: &[bool]) {
        let (mut x, mut y) = from;
        let max_steps = ((from.0 - to.0).abs() + (from.1 - to.1).abs()) * 6;
        // Running perpendicular bias — flips sign every ~8–20 steps to create S-curves
        let mut perp_bias: f32 = if rng.gen::<bool>() { 1.0 } else { -1.0 };
        let mut steps_since_flip = 0i32;
        let flip_interval = rng.gen_range(8i32..=20);
        for _ in 0..max_steps {
            if (x - to.0).abs() + (y - to.1).abs() <= 2 { break; }
            steps_since_flip += 1;
            if steps_since_flip >= flip_interval {
                perp_bias *= -1.0;
                steps_since_flip = 0;
            }
            let dx = (to.0 - x).signum();
            let dy = (to.1 - y).signum();
            // Perpendicular direction (rotated 90°)
            let (px, py) = (-dy, dx);
            let (mx, my) = {
                let r = rng.gen::<f32>();
                if r < 0.50 {
                    // Towards target
                    if dx.abs() > dy.abs() { (dx, 0) } else if dy != 0 { (0, dy) } else { (dx, 0) }
                } else if r < 0.75 {
                    // Perpendicular meander (creates curves)
                    let pb = if perp_bias > 0.0 { 1i32 } else { -1i32 };
                    (px * pb, py * pb)
                } else {
                    // Slight random wander
                    let rx = rng.gen_range(-1i32..=1);
                    let ry = rng.gen_range(-1i32..=1);
                    (rx, ry)
                }
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
    /// Build a GridJson for the WS broadcast.
    ///
    /// `include_tiles`   — include the dense tiles array (every TILES_INTERVAL ticks)
    /// `include_static`  — include biomes + depth_map (every STATIC_INTERVAL ticks)
    pub fn to_json_viewport(
        &self, cx: i32, cy: i32, vw: usize, vh: usize,
        include_tiles: bool, include_static: bool,
    ) -> GridJson {
        let ox = (cx - vw as i32 / 2).clamp(0, (WIDTH as i32 - vw as i32).max(0)) as usize;
        let oy = (cy - vh as i32 / 2).clamp(0, (HEIGHT as i32 - vh as i32).max(0)) as usize;

        let slice_row = |vec: &[i8], y: usize| vec[y * WIDTH + ox .. y * WIDTH + ox + vw].to_vec();
        let slice_u8  = |vec: &[u8],  y: usize| vec[y * WIDTH + ox .. y * WIDTH + ox + vw].to_vec();

        // Dense tile map — included every TILES_INTERVAL ticks
        let tiles = if include_tiles {
            Some((oy..oy+vh).map(|y| slice_row(&self.tiles, y)).collect())
        } else {
            None
        };

        // Sparse fire — [[row, col, intensity×1000], ...] only for non-zero cells
        let mut fire: Vec<[u16; 3]> = Vec::new();
        for y in oy..oy+vh {
            let row = &self.fire_intensity[y * WIDTH + ox .. y * WIDTH + ox + vw];
            for (col_off, &v) in row.iter().enumerate() {
                if v > 0.001 {
                    fire.push([(y - oy) as u16, col_off as u16, (v * 1000.0).min(65535.0) as u16]);
                }
            }
        }

        // Sparse structure — [[row, col, level×100], ...] only for non-zero cells
        let mut structure: Vec<[u16; 3]> = Vec::new();
        for y in oy..oy+vh {
            let row = &self.structure[y * WIDTH + ox .. y * WIDTH + ox + vw];
            for (col_off, &v) in row.iter().enumerate() {
                if v > 0.001 {
                    structure.push([(y - oy) as u16, col_off as u16, (v * 100.0).min(65535.0) as u16]);
                }
            }
        }

        // Static maps — biomes + depth, only sent every STATIC_INTERVAL ticks
        let (biomes, depth_map) = if include_static {
            let b = (oy..oy+vh).map(|y| slice_u8(&self.biome, y)).collect();
            let d = (oy..oy+vh).map(|y| {
                let row_tiles = &self.tiles[y * WIDTH + ox .. y * WIDTH + ox + vw];
                let row_depth = &self.depth[y * WIDTH + ox .. y * WIDTH + ox + vw];
                row_tiles.iter().zip(row_depth.iter()).map(|(&t, &d)| {
                    if t == Tile::Water as i8 { ((1.0 - d) * 200.0) as u8 } else { 255u8 }
                }).collect()
            }).collect();
            (Some(b), Some(d))
        } else {
            (None, None)
        };

        GridJson { width: vw, height: vh, origin_x: ox as i32, origin_y: oy as i32,
                   tiles, fire, structure, biomes, depth_map }
    }

    // Full-grid serialization (used by headless binary)
    pub fn to_json(&self) -> GridJson {
        self.to_json_viewport(WIDTH as i32 / 2, HEIGHT as i32 / 2, WIDTH, HEIGHT, true, true)
    }
}

#[derive(Clone, Copy)]
pub enum TrailKind { Food, Water, Path }

/// Per-tick grid payload.
///
/// Payload budget breakdown (600×300 world):
/// - tiles: 180 K values, dense — ~360 KB JSON, sent every 5 ticks
/// - fire:  sparse list of (row,col,v×1000) — 0 bytes when no fire, <5 KB with fire
/// - structure: sparse list of (row,col,v×100) — 0 bytes when no buildings
/// - biomes / depth_map: ~360 KB each, only sent every 30 ticks (when Some)
/// - fertility/hazard/pressure removed from broadcast (optional overlay endpoints)
#[derive(Serialize)]
pub struct GridJson {
    pub width:     usize,
    pub height:    usize,
    pub origin_x:  i32,
    pub origin_y:  i32,
    /// Dense tile array — only present every TILES_INTERVAL ticks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tiles:     Option<Vec<Vec<i8>>>,
    /// Sparse fire: [[row, col, intensity×1000], ...]  — 0 bytes when no fire
    pub fire:      Vec<[u16; 3]>,
    /// Sparse structure: [[row, col, level×100], ...]  — 0 bytes when empty
    pub structure: Vec<[u16; 3]>,
    /// Dense biome layer — only present every STATIC_INTERVAL ticks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biomes:    Option<Vec<Vec<u8>>>,
    /// Ocean depth — only present every STATIC_INTERVAL ticks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_map: Option<Vec<Vec<u8>>>,
}
