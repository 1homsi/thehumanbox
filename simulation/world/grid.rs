use super::tiles::{Biome, Tile};
use rand::Rng;
use serde::Serialize;

pub const WIDTH: usize = 600;
pub const HEIGHT: usize = 300;

pub const VP_W: usize = WIDTH;
pub const VP_H: usize = HEIGHT;

pub struct WorldGrid {
    pub tiles: Vec<i8>,
    pub fire_intensity: Vec<f32>,
    pub food_trail: Vec<f32>,
    pub water_trail: Vec<f32>,
    pub path_trail: Vec<f32>,
    pub biome: Vec<u8>,
    pub temperature: Vec<f32>,
    pub structure: Vec<f32>,
    pub pool_centers: Vec<(i32, i32)>,
    pub fertility: Vec<f32>,
    pub hazard: Vec<f32>,
    pub pressure: Vec<f32>,
    pub elevation: Vec<f32>,
    pub depth: Vec<f32>,
    /// Indices of tiles with non-zero trail values across any of the
    /// three trail layers. Lets `decay_trails*` skip the empty 99% of
    /// the grid that was wasting 540k multiplies per pass. Tracked as
    /// a HashSet so leave_trail can `insert` without worrying about
    /// duplicates; decay passes compact entries that decay back to
    /// zero so the set self-prunes.
    pub trail_dirty: std::collections::HashSet<u32>,
}

impl WorldGrid {
    pub fn new(seed: u64) -> Self {
        let size = WIDTH * HEIGHT;
        let mut g = WorldGrid {
            tiles: vec![Tile::Grass as i8; size],
            fire_intensity: vec![0.0; size],
            food_trail: vec![0.0; size],
            water_trail: vec![0.0; size],
            path_trail: vec![0.0; size],
            biome: vec![0u8; size],
            temperature: vec![22.0f32; size],
            structure: vec![0.0f32; size],
            pool_centers: Vec::new(),
            fertility: vec![0.5f32; size],
            hazard: vec![0.0f32; size],
            pressure: vec![0.0f32; size],
            elevation: vec![0.0f32; size],
            depth: vec![0.0f32; size],
            trail_dirty: std::collections::HashSet::new(),
        };
        g.generate(seed);
        g.enforce_ocean_border();
        g
    }

    pub fn enforce_ocean_border(&mut self) {
        const HARD_X: i32 = (WIDTH  as f32 * 0.025) as i32;
        const HARD_Y: i32 = (HEIGHT as f32 * 0.025) as i32;
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if x < HARD_X || x >= WIDTH as i32 - HARD_X
                   || y < HARD_Y || y >= HEIGHT as i32 - HARD_Y {
                    let i = Self::idx(x, y);
                    self.water_out(i);
                }
            }
        }
        self.soften_ocean_coast();
    }

    fn water_out(&mut self, i: usize) {
        self.tiles[i] = Tile::Water as i8;
        self.fire_intensity[i] = 0.0;
        self.structure[i] = 0.0;
        self.food_trail[i] = 0.0;
        self.water_trail[i] = 0.0;
        self.path_trail[i] = 0.0;
        self.hazard[i] = 0.0;
        self.fertility[i] = 0.0;
    }

    fn soften_ocean_coast(&mut self) {
        const HARD_X:  i32 = (WIDTH  as f32 * 0.025) as i32;
        const HARD_Y:  i32 = (HEIGHT as f32 * 0.025) as i32;
        const TRANS_X: i32 = (WIDTH  as f32 * 0.10) as i32;
        const TRANS_Y: i32 = (HEIGHT as f32 * 0.10) as i32;
        let w = WIDTH  as i32;
        let h = HEIGHT as i32;
        let band_x = (TRANS_X - HARD_X).max(1) as f32;
        let band_y = (TRANS_Y - HARD_Y).max(1) as f32;

        for y in HARD_Y..(h - HARD_Y) {
            for x in HARD_X..(w - HARD_X) {
                let i = Self::idx(x, y);
                if self.tiles[i] == Tile::Water as i8 {
                    continue
                }
                let dx_in = (x - HARD_X).min(w - 1 - HARD_X - x);
                let dy_in = (y - HARD_Y).min(h - 1 - HARD_Y - y);
                let in_x = dx_in < (TRANS_X - HARD_X);
                let in_y = dy_in < (TRANS_Y - HARD_Y);
                if !in_x && !in_y {
                    continue
                }
                let prog_x = if in_x { (dx_in as f32 / band_x).clamp(0.0, 1.0) } else { 1.0 };
                let prog_y = if in_y { (dy_in as f32 / band_y).clamp(0.0, 1.0) } else { 1.0 };
                let prog = prog_x.min(prog_y);

                let nx = x as f32 / w as f32;
                let ny = y as f32 / h as f32;
                let noise_a = Self::fbm(nx * 6.0, ny * 6.0, 0xC0A57_1234_5678);
                let noise_b = Self::fbm(nx * 14.0, ny * 14.0, 0xC0A57_8765_4321);
                let noise = noise_a * 0.65 + noise_b * 0.35;

                let waterness = (1.0 - prog).powf(1.6) + noise * 0.45 - 0.10;
                if waterness > 0.55 {
                    self.water_out(i);
                }
            }
        }
    }

    pub fn is_edge_border(x: i32, y: i32) -> bool {
        const HARD_X: i32 = (WIDTH  as f32 * 0.025) as i32;
        const HARD_Y: i32 = (HEIGHT as f32 * 0.025) as i32;
        x < HARD_X || x >= WIDTH as i32 - HARD_X
        || y < HARD_Y || y >= HEIGHT as i32 - HARD_Y
    }

    pub fn idx(x: i32, y: i32) -> usize {
        let x = x.clamp(0, WIDTH as i32 - 1) as usize;
        let y = y.clamp(0, HEIGHT as i32 - 1) as usize;
        y * WIDTH + x
    }

    pub fn in_bounds(x: i32, y: i32) -> bool {
        x >= 0 && x < WIDTH as i32 && y >= 0 && y < HEIGHT as i32
    }

    pub fn get(&self, x: i32, y: i32) -> Tile {
        if Self::in_bounds(x, y) {
            Tile::from_i8(self.tiles[Self::idx(x, y)])
        } else {
            Tile::Void
        }
    }

    pub fn set(&mut self, x: i32, y: i32, tile: Tile) {
        if Self::in_bounds(x, y) {
            self.tiles[Self::idx(x, y)] = tile as i8;
        }
    }

    pub fn fire_intensity(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) {
            self.fire_intensity[Self::idx(x, y)]
        } else {
            0.0
        }
    }

    pub fn fire_intensity_mut(&mut self, x: i32, y: i32) -> &mut f32 {
        let i = Self::idx(x, y);
        &mut self.fire_intensity[i]
    }

    pub fn biome_at(&self, x: i32, y: i32) -> Biome {
        if Self::in_bounds(x, y) {
            Biome::from_u8(self.biome[Self::idx(x, y)])
        } else {
            Biome::Grassland
        }
    }

    pub fn temp_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) {
            self.temperature[Self::idx(x, y)]
        } else {
            22.0
        }
    }

    pub fn biome_growth_mult(&self, x: i32, y: i32) -> f32 {
        self.biome_at(x, y).food_growth_mult()
    }

    pub fn structure_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) {
            self.structure[Self::idx(x, y)]
        } else {
            0.0
        }
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
        if !Self::in_bounds(x, y) {
            return;
        }
        let i = Self::idx(x, y);
        match kind {
            TrailKind::Food => self.food_trail[i] = (self.food_trail[i] + strength).min(3.0),
            TrailKind::Water => self.water_trail[i] = (self.water_trail[i] + strength).min(3.0),
            TrailKind::Path => self.path_trail[i] = (self.path_trail[i] + strength).min(5.0),
        }
        self.trail_dirty.insert(i as u32);
    }

    pub fn trail_at(&self, x: i32, y: i32, kind: TrailKind) -> f32 {
        if !Self::in_bounds(x, y) {
            return 0.0;
        }
        let i = Self::idx(x, y);
        match kind {
            TrailKind::Food => self.food_trail[i],
            TrailKind::Water => self.water_trail[i],
            TrailKind::Path => self.path_trail[i],
        }
    }

    pub fn detect_trail(&self, x: i32, y: i32, kind: TrailKind, radius: i32) -> f32 {
        let mut best = 0.0f32;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let v = self.trail_at(x + dx, y + dy, kind);
                if v > best {
                    best = v;
                }
            }
        }
        best
    }

    // Cells with a trail value below this clip to zero so they drop
    // out of `trail_dirty`. Below this the value is invisible to all
    // queries (perception thresholds are ≥ 0.05).
    const TRAIL_EPS: f32 = 1e-4;

    pub fn decay_trails(&mut self) {
        Self::decay_dirty(
            &mut self.trail_dirty,
            &mut self.food_trail, &mut self.water_trail, &mut self.path_trail,
            0.988, 0.988, 0.997,
        );
    }

    /// Aggregated decay: applies the equivalent of three single-step
    /// decay passes in one go. Called once per 3 physics ticks to
    /// amortise the dirty-set sweep.
    pub fn decay_trails_strong(&mut self) {
        // 0.988^3 ≈ 0.9645, 0.997^3 ≈ 0.9910
        const F3: f32 = 0.964_426; // 0.988^3
        const P3: f32 = 0.991_026; // 0.997^3
        Self::decay_dirty(
            &mut self.trail_dirty,
            &mut self.food_trail, &mut self.water_trail, &mut self.path_trail,
            F3, F3, P3,
        );
    }

    /// Walks `trail_dirty`, decays each tile's three trail layers by
    /// the given factors, and removes the index from the dirty set
    /// once all three layers are within `TRAIL_EPS` of zero.
    fn decay_dirty(
        dirty: &mut std::collections::HashSet<u32>,
        food: &mut [f32], water: &mut [f32], path: &mut [f32],
        ff: f32, fw: f32, fp: f32,
    ) {
        dirty.retain(|&i| {
            let idx = i as usize;
            let mut f = food[idx];
            let mut w = water[idx];
            let mut p = path[idx];
            if f > 0.0 { f *= ff; if f < Self::TRAIL_EPS { f = 0.0; } food[idx]  = f; }
            if w > 0.0 { w *= fw; if w < Self::TRAIL_EPS { w = 0.0; } water[idx] = w; }
            if p > 0.0 { p *= fp; if p < Self::TRAIL_EPS { p = 0.0; } path[idx]  = p; }
            // Keep the dirty entry as long as any layer is still active.
            f > 0.0 || w > 0.0 || p > 0.0
        });
    }

    pub fn reduce_fertility(&mut self, x: i32, y: i32, amount: f32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            self.fertility[i] = (self.fertility[i] - amount).max(0.0);
        }
    }

    pub fn restore_fertility(&mut self, x: i32, y: i32, amount: f32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            let biome_cap = Biome::from_u8(self.biome[i]).base_fertility().min(1.0);
            self.fertility[i] = (self.fertility[i] + amount).min(biome_cap);
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
        if Self::in_bounds(x, y) {
            self.fertility[Self::idx(x, y)]
        } else {
            0.0
        }
    }

    pub fn hazard_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) {
            self.hazard[Self::idx(x, y)]
        } else {
            0.0
        }
    }

    pub fn depth_at(&self, x: i32, y: i32) -> f32 {
        if Self::in_bounds(x, y) {
            self.depth[Self::idx(x, y)]
        } else {
            0.0
        }
    }

    pub fn decay_world_layers(&mut self) {
        // Fertility regrowth rates bumped ~5× from the original numbers
        // so heavily-used tiles can actually recover within a session
        // instead of needing tens of millions of ticks. The pressure
        // gradient still slows recovery on overused soil, just not
        // catastrophically.
        for (i, v) in self.fertility.iter_mut().enumerate() {
            let cap = Biome::from_u8(self.biome[i]).base_fertility();
            if *v < cap {
                let rate = if self.pressure[i] > 5.0 {
                    0.000040
                } else if self.pressure[i] > 2.5 {
                    0.000120
                } else {
                    0.000300
                };
                *v = (*v + rate).min(cap);
            }
        }
        for v in &mut self.hazard {
            *v *= 0.9997;
        }
        for v in &mut self.pressure {
            *v *= 0.9992;
        }
    }

    pub fn neighbors(x: i32, y: i32) -> impl Iterator<Item = (i32, i32)> {
        let candidates = [
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
            (x - 1, y - 1),
            (x + 1, y - 1),
            (x - 1, y + 1),
            (x + 1, y + 1),
        ];
        candidates
            .into_iter()
            .filter(|(nx, ny)| Self::in_bounds(*nx, *ny))
    }

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

    fn value_noise(px: f32, py: f32, seed: u64) -> f32 {
        let ix = px.floor() as u32;
        let iy = py.floor() as u32;
        let fx = px - px.floor();
        let fy = py - py.floor();
        let ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
        let uy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);
        let a = Self::corner_hash(ix, iy, seed);
        let b = Self::corner_hash(ix + 1, iy, seed);
        let c = Self::corner_hash(ix, iy + 1, seed);
        let d = Self::corner_hash(ix + 1, iy + 1, seed);
        let ab = a + ux * (b - a);
        let cd = c + ux * (d - c);
        ab + uy * (cd - ab)
    }

    fn fbm(nx: f32, ny: f32, seed: u64) -> f32 {
        let mut val = 0.0f32;
        let mut amp = 0.50f32;
        let mut freq = 3.0f32;
        for oct in 0u64..7 {
            let s = seed.wrapping_add(oct.wrapping_mul(0xa3b2c1d4e5f60718));
            val += amp * Self::value_noise(nx * freq, ny * freq, s);
            amp *= 0.50;
            freq *= 2.05;
        }
        val
    }

    fn generate(&mut self, seed: u64) {
        use rand::SeedableRng;
        use std::collections::VecDeque;
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
        let size = WIDTH * HEIGHT;

        let n_continents: usize = rng.gen_range(3usize..=5);
        let band_h = 0.76f32 / n_continents as f32;

        let x_slots: [(f32, f32); 5] = [
            (0.05, 0.38),
            (0.62, 0.95),
            (0.28, 0.72),
            (0.05, 0.52),
            (0.48, 0.95),
        ];
        let cont_centers: Vec<(f32, f32)> = (0..n_continents)
            .map(|k| {
                let y_lo = 0.12 + k as f32 * band_h;
                let y_hi = y_lo + band_h;
                let (x_lo, x_hi) = x_slots[k % 5];
                let cx = rng.gen_range(x_lo..x_hi);
                let cy = rng.gen_range(y_lo..y_hi);
                (cx, cy)
            })
            .collect();

        let cont_params: Vec<(f32, f32, f32, f32)> = cont_centers
            .iter()
            .map(|_| {
                let short = rng.gen_range(0.11f32..0.19);
                let long = short * rng.gen_range(1.8f32..3.2);
                let angle = rng.gen_range(0.0f32..std::f32::consts::TAU);
                let str = rng.gen_range(1.05f32..1.50);
                (short, long, angle, str)
            })
            .collect();

        let mut raw_elev = vec![0.0f32; size];
        for y in 0..HEIGHT {
            for x in 0..WIDTH {
                let nx = x as f32 / WIDTH as f32;
                let ny = y as f32 / HEIGHT as f32;

                let wx = Self::fbm(
                    nx * 1.7 + 13.7,
                    ny * 1.7 + 52.4,
                    seed ^ 0x2a3b_4c5d_6e7f_8a9b,
                ) * 0.20;
                let wy = Self::fbm(
                    nx * 1.7 + 77.3,
                    ny * 1.7 + 31.1,
                    seed ^ 0x1b2c_3d4e_5f6a_7b8c,
                ) * 0.20;
                let wnx = nx + wx;
                let wny = ny + wy;

                let noise = Self::fbm(nx, ny, seed) * 0.55;

                let cont_lift = (0..n_continents)
                    .map(|k| {
                        let (cx, cy) = cont_centers[k];
                        let (sa, la, ang, str) = cont_params[k];
                        let dx = wnx - cx;
                        let dy = wny - cy;
                        let cos = ang.cos();
                        let sin = ang.sin();
                        let rdx = (cos * dx + sin * dy) / la;
                        let rdy = (-sin * dx + cos * dy) / sa;
                        let d = (rdx * rdx + rdy * rdy).sqrt();
                        (1.0 - d.min(1.0)).powf(1.4) * str
                    })
                    .fold(0.0f32, f32::max);

                let lat = (ny - 0.5).abs() * 2.0;
                let polar_fade = if lat > 0.64 {
                    (1.0 - (lat - 0.64) / 0.36).max(0.03)
                } else {
                    1.0
                };

                const EDGE_KILL:     f32 = 0.04;
                const EDGE_FADE_END: f32 = 0.12;
                let dx_edge = nx.min(1.0 - nx);
                let dy_edge = ny.min(1.0 - ny);
                let d_edge  = dx_edge.min(dy_edge);
                let edge_fade = if d_edge < EDGE_KILL {
                    -0.5
                } else if d_edge < EDGE_FADE_END {
                    let t = (d_edge - EDGE_KILL) / (EDGE_FADE_END - EDGE_KILL);
                    t * t * (3.0 - 2.0 * t)
                } else {
                    1.0
                };

                raw_elev[Self::idx(x as i32, y as i32)] =
                    ((noise + cont_lift) * polar_fade) * edge_fade.max(0.0)
                    + edge_fade.min(0.0);
            }
        }

        let mut sorted_elev = raw_elev.clone();
        sorted_elev.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let sea_level = sorted_elev[(size as f32 * 0.61) as usize];
        let elev_min = sorted_elev[0];
        let elev_max = sorted_elev[size - 1];
        let elev_full = (elev_max - elev_min).max(1e-5);
        let elev_land_rng = (elev_max - sea_level).max(1e-5);

        let mut land_mask = vec![false; size];
        for i in 0..size {
            if raw_elev[i] >= sea_level {
                land_mask[i] = true;
            } else {
                self.tiles[i] = Tile::Water as i8;
            }
        }

        for _ in 0..2 {
            let prev_mask = land_mask.clone();
            for y in 1..(HEIGHT as i32 - 1) {
                for x in 1..(WIDTH as i32 - 1) {
                    let i = Self::idx(x, y);
                    let orth_land = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)]
                        .iter()
                        .filter(|&&(dx, dy)| prev_mask[Self::idx(x + dx, y + dy)])
                        .count();
                    let diag_land = [(-1i32, -1i32), (1, -1), (-1, 1), (1, 1)]
                        .iter()
                        .filter(|&&(dx, dy)| prev_mask[Self::idx(x + dx, y + dy)])
                        .count();

                    if !prev_mask[i] {
                        let east_west_bridge =
                            prev_mask[Self::idx(x - 1, y)] && prev_mask[Self::idx(x + 1, y)];
                        let north_south_bridge =
                            prev_mask[Self::idx(x, y - 1)] && prev_mask[Self::idx(x, y + 1)];
                        let almost_land = raw_elev[i] >= sea_level - elev_full * 0.035;
                        if almost_land
                            && (orth_land >= 3
                                || (orth_land >= 2 && diag_land >= 2)
                                || east_west_bridge
                                || north_south_bridge)
                        {
                            land_mask[i] = true;
                        }
                    } else {
                        let low_lying = raw_elev[i] <= sea_level + elev_land_rng * 0.10;
                        if low_lying && orth_land <= 1 && diag_land <= 1 {
                            land_mask[i] = false;
                            self.tiles[i] = Tile::Water as i8;
                        }
                    }
                }
            }
        }

        {
            let mut visited = vec![false; size];
            for sy in 0..HEIGHT as i32 {
                for sx in 0..WIDTH as i32 {
                    let si = Self::idx(sx, sy);
                    if !land_mask[si] || visited[si] {
                        continue;
                    }
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
                    if comp.len() < 320 {
                        for &i in &comp {
                            land_mask[i] = false;
                            self.tiles[i] = Tile::Water as i8;
                        }
                    }
                }
            }
        }

        for i in 0..size {
            self.elevation[i] = (raw_elev[i] - elev_min) / elev_full;
        }

        let mut coast_dist = vec![i32::MAX / 2; size];
        {
            let mut queue: VecDeque<(i32, i32)> = VecDeque::new();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    let i = Self::idx(x, y);
                    if !land_mask[i] {
                        coast_dist[i] = 0;
                        queue.push_back((x, y));
                    }
                }
            }
            while let Some((cx, cy)) = queue.pop_front() {
                let ci = Self::idx(cx, cy);
                let d = coast_dist[ci];
                for &(dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                    let (nx, ny_) = (cx + dx, cy + dy);
                    if Self::in_bounds(nx, ny_) {
                        let ni = Self::idx(nx, ny_);
                        if coast_dist[ni] > d + 1 {
                            coast_dist[ni] = d + 1;
                            queue.push_back((nx, ny_));
                        }
                    }
                }
            }
        }

        let mut temp_map = vec![0.0f32; size];
        let mut moist_map = vec![0.0f32; size];
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                let ny = y as f32 / HEIGHT as f32;
                let lat = (ny - 0.5).abs() * 2.0;

                let norm_elev = if land_mask[i] {
                    ((raw_elev[i] - sea_level) / elev_land_rng).clamp(0.0, 1.0)
                } else {
                    0.0
                };

                let base_temp = 34.0 - lat * 42.0;
                let elev_cool = norm_elev * 22.0;
                temp_map[i] = base_temp - elev_cool;

                let eq_moist = if lat < 0.15 {
                    1.0
                } else {
                    (1.0 - (lat - 0.15) / 0.85).clamp(0.0, 1.0).powf(0.6)
                };
                let coast_moist = {
                    let cd = coast_dist[i] as f32;
                    (1.0 - (cd / 90.0).min(1.0)).powf(1.25)
                };
                let hadley = {
                    let dist_from_belt = (lat - 0.38).abs();
                    if dist_from_belt < 0.12 {
                        (1.0 - dist_from_belt / 0.12) * 0.65
                    } else {
                        0.0
                    }
                };
                moist_map[i] = (eq_moist * 0.45 + coast_moist * 0.55 - hadley).clamp(0.0, 1.0);
            }
        }

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                if !land_mask[i] {
                    continue;
                }

                let norm_elev = ((raw_elev[i] - sea_level) / elev_land_rng).clamp(0.0, 1.0);
                let temp = temp_map[i];
                let moist = moist_map[i];

                let biome = if norm_elev > 0.84 {
                    Biome::Tundra
                } else if temp < -8.0 {
                    Biome::Tundra
                } else if temp < 4.0 {
                    if moist > 0.48 {
                        Biome::Forest
                    } else {
                        Biome::Tundra
                    }
                } else if temp < 16.0 {
                    if moist > 0.58 {
                        Biome::Forest
                    } else if moist > 0.22 {
                        Biome::Grassland
                    } else {
                        Biome::Desert
                    }
                } else if temp < 26.0 {
                    if moist > 0.56 {
                        Biome::Forest
                    } else if moist > 0.24 {
                        Biome::Grassland
                    } else if moist > 0.16 {
                        if rng.gen::<f32>() < 0.25 {
                            Biome::Wetland
                        } else {
                            Biome::Grassland
                        }
                    } else {
                        Biome::Desert
                    }
                } else {
                    if moist > 0.58 {
                        Biome::Forest
                    } else if moist > 0.38 {
                        if rng.gen::<f32>() < 0.40 {
                            Biome::Wetland
                        } else {
                            Biome::Forest
                        }
                    } else if moist > 0.18 {
                        Biome::Grassland
                    } else {
                        Biome::Desert
                    }
                };

                let biome = if rng.gen::<f32>() < 0.004 && norm_elev > 0.42 && norm_elev < 0.72 {
                    Biome::Volcanic
                } else {
                    biome
                };

                self.biome[i] = biome as u8;
            }
        }

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                if !land_mask[i] {
                    continue;
                }

                let norm_elev = ((raw_elev[i] - sea_level) / elev_land_rng).clamp(0.0, 1.0);
                let biome = Biome::from_u8(self.biome[i]);

                self.tiles[i] = if norm_elev > 0.94 {
                    Tile::Snow as i8
                } else if norm_elev > 0.84 {
                    Tile::Rock as i8
                } else if norm_elev < 0.03 {
                    Tile::Sand as i8
                } else {
                    match biome {
                        Biome::Desert => {
                            if rng.gen::<f32>() < 0.60 {
                                Tile::Sand as i8
                            } else {
                                Tile::Grass as i8
                            }
                        }
                        Biome::Tundra => {
                            if norm_elev > 0.85 || temp_map[i] < -16.0 {
                                Tile::Snow as i8
                            } else if rng.gen::<f32>() < 0.18 {
                                Tile::Snow as i8
                            } else {
                                Tile::Grass as i8
                            }
                        }
                        _ => Tile::Grass as i8,
                    }
                };
            }
        }

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass {
                    continue;
                }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).rock_chance() * 0.18;
                if rng.gen::<f32>() < chance {
                    self.set(x, y, Tile::Rock);
                }
            }
        }

        let zones_x = 8usize;
        let zones_y = 5usize;
        let zone_w = WIDTH / zones_x;
        let zone_h = HEIGHT / zones_y;
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
                        if !Self::in_bounds(x, y) {
                            return false;
                        }
                        let idx = Self::idx(x, y);
                        if !land_mask[idx] {
                            return false;
                        }
                        let b = Biome::from_u8(self.biome[idx]);
                        if matches!(b, Biome::Desert | Biome::Tundra) {
                            return false;
                        }
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

        let n = pool_centers.len();
        if n >= 2 {
            let mut connected = vec![false; n];
            connected[0] = true;
            for _ in 0..n {
                let mut best_dist = i32::MAX;
                let mut best_a = 0usize;
                let mut best_b = 0usize;
                for a in 0..n {
                    if !connected[a] {
                        continue;
                    }
                    for b in 0..n {
                        if connected[b] {
                            continue;
                        }
                        let dx = pool_centers[a].0 - pool_centers[b].0;
                        let dy = pool_centers[a].1 - pool_centers[b].1;
                        let d = dx * dx + dy * dy;
                        if d < best_dist {
                            best_dist = d;
                            best_a = a;
                            best_b = b;
                        }
                    }
                }
                if best_dist == i32::MAX {
                    break;
                }
                connected[best_b] = true;
                if rng.gen::<f32>() < 0.65 {
                    self.carve_river(
                        pool_centers[best_a],
                        pool_centers[best_b],
                        &mut rng,
                        &land_mask,
                    );
                }
            }
            for _ in 0..(n / 3) {
                let a = rng.gen_range(0..n);
                let mut dists: Vec<(i32, usize)> = (0..n)
                    .filter(|&b| b != a)
                    .map(|b| {
                        let dx = pool_centers[a].0 - pool_centers[b].0;
                        let dy = pool_centers[a].1 - pool_centers[b].1;
                        (dx * dx + dy * dy, b)
                    })
                    .collect();
                dists.sort_by_key(|&(d, _)| d);
                if dists.len() >= 2 && rng.gen::<f32>() < 0.45 {
                    let b = dists[1].1;
                    self.carve_river(pool_centers[a], pool_centers[b], &mut rng, &land_mask);
                }
            }
        }

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if self.get(x, y) != Tile::Grass {
                    continue;
                }
                let chance = Biome::from_u8(self.biome[Self::idx(x, y)]).initial_food_chance();
                if rng.gen::<f32>() < chance {
                    self.set(x, y, Tile::Food);
                }
            }
        }

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

        self.temperature = temp_map;

        for i in 0..size {
            self.fertility[i] = Biome::from_u8(self.biome[i]).base_fertility();
        }

        self.pool_centers = pool_centers;

        {
            let mut od = vec![i32::MAX / 2i32; size];
            let mut queue: VecDeque<(i32, i32)> = VecDeque::new();
            for y in 0..HEIGHT as i32 {
                for x in 0..WIDTH as i32 {
                    let i = Self::idx(x, y);
                    if self.tiles[i] != Tile::Water as i8 {
                        continue;
                    }
                    let on_shore =
                        [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)]
                            .iter()
                            .any(|&(dx, dy)| {
                                let (nx, ny_) = (x + dx, y + dy);
                                Self::in_bounds(nx, ny_)
                                    && self.tiles[Self::idx(nx, ny_)] != Tile::Water as i8
                            });
                    if on_shore {
                        od[i] = 0;
                        queue.push_back((x, y));
                    }
                }
            }
            while let Some((cx, cy)) = queue.pop_front() {
                let ci = Self::idx(cx, cy);
                let d = od[ci];
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
            const DEEP_CAP: f32 = 100.0;
            for i in 0..size {
                self.depth[i] = if self.tiles[i] == Tile::Water as i8 {
                    (od[i] as f32 / DEEP_CAP).min(1.0)
                } else {
                    0.0
                };
            }
        }
    }

    fn carve_river(
        &mut self,
        from: (i32, i32),
        to: (i32, i32),
        rng: &mut impl Rng,
        land_mask: &[bool],
    ) {
        let (mut x, mut y) = from;
        let max_steps = ((from.0 - to.0).abs() + (from.1 - to.1).abs()) * 6;
        let mut perp_bias: f32 = if rng.gen::<bool>() { 1.0 } else { -1.0 };
        let mut steps_since_flip = 0i32;
        let flip_interval = rng.gen_range(8i32..=20);
        for _ in 0..max_steps {
            if (x - to.0).abs() + (y - to.1).abs() <= 2 {
                break;
            }
            steps_since_flip += 1;
            if steps_since_flip >= flip_interval {
                perp_bias *= -1.0;
                steps_since_flip = 0;
            }
            let dx = (to.0 - x).signum();
            let dy = (to.1 - y).signum();
            let (px, py) = (-dy, dx);
            let (mx, my) = {
                let r = rng.gen::<f32>();
                if r < 0.50 {
                    if dx.abs() > dy.abs() {
                        (dx, 0)
                    } else if dy != 0 {
                        (0, dy)
                    } else {
                        (dx, 0)
                    }
                } else if r < 0.75 {
                    let pb = if perp_bias > 0.0 { 1i32 } else { -1i32 };
                    (px * pb, py * pb)
                } else {
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
                        if Self::in_bounds(nx, ny)
                            && land_mask[Self::idx(nx, ny)]
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

    /// River meander: pick a water tile that has water-only neighbours
    /// on at least one axis (i.e. sits in a linear stretch of river/lake
    /// shore) and erode one bank tile to water while silting the
    /// opposite bank to grass. Cheap (handful of tries per call), but
    /// gives the world a "the river shifted" feel over long sessions -
    /// the world-evolution spec calls this out specifically.
    pub fn tick_river_meander(&mut self, rng: &mut impl Rng) {
        for _ in 0..40 {
            let x = rng.gen_range(2..WIDTH  as i32 - 2);
            let y = rng.gen_range(2..HEIGHT as i32 - 2);
            if self.get(x, y) != Tile::Water { continue; }
            // Detect a linear water stretch on the N/S or E/W axis.
            let (axis_dx, axis_dy) =
                if self.get(x - 1, y) == Tile::Water && self.get(x + 1, y) == Tile::Water {
                    (0i32, 1i32)
                } else if self.get(x, y - 1) == Tile::Water && self.get(x, y + 1) == Tile::Water {
                    (1, 0)
                } else {
                    continue;
                };
            // Bank tiles are perpendicular to the river axis. Erode
            // one, silt the other.
            let bank_a = (x + axis_dx, y + axis_dy);
            let bank_b = (x - axis_dx, y - axis_dy);
            let a_land = !matches!(self.get(bank_a.0, bank_a.1), Tile::Water | Tile::Void);
            let b_land = !matches!(self.get(bank_b.0, bank_b.1), Tile::Water | Tile::Void);
            if !(a_land && b_land) { continue; }
            // Coin flip which side erodes.
            let (erode, silt) = if rng.gen::<bool>() { (bank_a, bank_b) } else { (bank_b, bank_a) };
            self.tiles[Self::idx(erode.0, erode.1)] = Tile::Water as i8;
            // Silt opposite shore - only if it's currently water (rare
            // mid-river drift case). Most of the time silt-side is
            // already land, so the call is a no-op.
            if self.get(silt.0, silt.1) == Tile::Water {
                self.tiles[Self::idx(silt.0, silt.1)] = Tile::Grass as i8;
            }
            return; // one meander per call keeps this cheap.
        }
    }

    /// Forest spread: a grass tile adjacent to ≥2 forest-biome
    /// neighbours and with fert ≥ 0.55 can flip its own biome to
    /// Forest. Closes the spec's "forests spread or die" loop - the
    /// existing biome drift only ever *shrinks* forests, never grows
    /// them. Capped to a small per-call budget so we don't fill the
    /// map.
    pub fn tick_forest_spread(&mut self, rng: &mut impl Rng) {
        let mut grew = 0usize;
        for _ in 0..120 {
            if grew >= 12 { break; }
            let x = rng.gen_range(1..WIDTH  as i32 - 1);
            let y = rng.gen_range(1..HEIGHT as i32 - 1);
            if self.get(x, y) != Tile::Grass { continue; }
            let i = Self::idx(x, y);
            if self.fertility[i] < 0.55 { continue; }
            let mut forest_nb = 0u8;
            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                if Self::in_bounds(x + dx, y + dy)
                    && self.biome_at(x + dx, y + dy) == Biome::Forest
                {
                    forest_nb += 1;
                    if forest_nb >= 2 { break; }
                }
            }
            if forest_nb < 2 { continue; }
            self.biome[i] = Biome::Forest as u8;
            grew += 1;
        }
    }

    /// Forest die-back: under active drought, forest tiles with low
    /// fertility revert to grassland. Pairs with `tick_forest_spread`
    /// to close the "forests spread or die" loop. Caller passes the
    /// drought flag so we only burn the budget when relevant.
    pub fn tick_forest_dieback(&mut self, drought_active: bool, rng: &mut impl Rng) {
        if !drought_active { return; }
        let mut died = 0usize;
        for _ in 0..120 {
            if died >= 8 { break; }
            let x = rng.gen_range(1..WIDTH  as i32 - 1);
            let y = rng.gen_range(1..HEIGHT as i32 - 1);
            if self.biome_at(x, y) != Biome::Forest { continue; }
            let i = Self::idx(x, y);
            if self.fertility[i] >= 0.30 { continue; }
            // Demote to grassland; the underlying tile stays grass.
            self.biome[i] = Biome::Grassland as u8;
            died += 1;
        }
    }

    pub fn tick_geology(&mut self, rng: &mut impl Rng) {
        // Per audit: previous counts (2-6 flood, 1-3 emerge) fired every
        // 18000 ticks; at 4 changes per ~30 min real that's invisible
        // against the 180k land grid. Bumped 10× so coastlines actually
        // drift on a session timescale.
        let flood_count  = rng.gen_range(30..=80usize);
        let emerge_count = rng.gen_range(20..=50usize);

        let mut flooded = 0usize;
        for _ in 0..800 {
            if flooded >= flood_count {
                break;
            }
            let x = rng.gen_range(1..WIDTH as i32 - 1);
            let y = rng.gen_range(1..HEIGHT as i32 - 1);
            if !matches!(
                self.get(x, y),
                Tile::Grass | Tile::Snow | Tile::Sand | Tile::Food | Tile::Ash
            ) {
                continue;
            }
            let coastal = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
                .iter()
                .any(|&(nx, ny)| Self::in_bounds(nx, ny) && self.get(nx, ny) == Tile::Water);
            if coastal {
                self.tiles[Self::idx(x, y)] = Tile::Water as i8;
                flooded += 1;
            }
        }

        let mut emerged = 0usize;
        for _ in 0..600 {
            if emerged >= emerge_count {
                break;
            }
            let x = rng.gen_range(1..WIDTH as i32 - 1);
            let y = rng.gen_range(1..HEIGHT as i32 - 1);
            if self.get(x, y) != Tile::Water {
                continue;
            }
            let coastal =
                [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
                    .iter()
                    .any(|&(nx, ny)| {
                        Self::in_bounds(nx, ny)
                            && !matches!(self.get(nx, ny), Tile::Water | Tile::Void)
                    });
            if coastal {
                let ny_n = y as f32 / HEIGHT as f32;
                let lat = (ny_n - 0.5).abs() * 2.0;
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

    /// Rare tectonic event: pick a random fault line (a roughly straight
    /// strip ~5 tiles wide across a chunk of the map) and uplift it.
    /// Grass/sand along the fault → rock (mountain push-up); water →
    /// grass (continental rise). Single pass, ~30 tiles affected, cheap
    /// enough to call from the world-events tick without budget worry.
    pub fn tick_earthquake(&mut self, rng: &mut impl Rng) {
        // Pick a fault: two endpoints on the map, walk the line between.
        let horizontal = rng.gen_bool(0.5);
        let length: i32 = 30;
        let half = length / 2;

        let (cx, cy) = (
            rng.gen_range(half + 2..WIDTH as i32 - half - 2),
            rng.gen_range(half + 2..HEIGHT as i32 - half - 2),
        );
        // Small jitter so the fault isn't perfectly axis-aligned.
        let drift: i32 = rng.gen_range(-2..=2);

        let mut flipped = 0usize;
        for step in -half..=half {
            let (x, y) = if horizontal {
                (cx + step, cy + drift * step / half.max(1))
            } else {
                (cx + drift * step / half.max(1), cy + step)
            };
            // ~5-tile-wide strip: walk perpendicular ±2.
            for off in -2..=2 {
                let (tx, ty) = if horizontal { (x, y + off) } else { (x + off, y) };
                if !Self::in_bounds(tx, ty) { continue; }
                let i = Self::idx(tx, ty);
                match self.get(tx, ty) {
                    Tile::Grass | Tile::Sand | Tile::Food | Tile::Ash => {
                        self.tiles[i] = Tile::Rock as i8;
                        self.biome[i] = Biome::Volcanic as u8;
                        flipped += 1;
                    }
                    Tile::Water => {
                        self.tiles[i] = Tile::Grass as i8;
                        self.biome[i] = Biome::Grassland as u8;
                        flipped += 1;
                    }
                    _ => {}
                }
                if flipped >= 30 { return; }
            }
        }
    }

    pub fn to_json_viewport(
        &self,
        cx: i32,
        cy: i32,
        vw: usize,
        vh: usize,
        include_tiles: bool,
        include_static: bool,
        include_terrain: bool,
    ) -> GridJson {
        let ox = (cx - vw as i32 / 2).clamp(0, (WIDTH as i32 - vw as i32).max(0)) as usize;
        let oy = (cy - vh as i32 / 2).clamp(0, (HEIGHT as i32 - vh as i32).max(0)) as usize;

        let slice_row = |vec: &[i8], y: usize| vec[y * WIDTH + ox..y * WIDTH + ox + vw].to_vec();
        let slice_u8 = |vec: &[u8], y: usize| vec[y * WIDTH + ox..y * WIDTH + ox + vw].to_vec();

        let tiles = if include_tiles {
            Some((oy..oy + vh).map(|y| slice_row(&self.tiles, y)).collect())
        } else {
            None
        };

        let mut fire: Vec<[u16; 3]> = Vec::new();
        for y in oy..oy + vh {
            let row = &self.fire_intensity[y * WIDTH + ox..y * WIDTH + ox + vw];
            for (col_off, &v) in row.iter().enumerate() {
                if v > 0.001 {
                    fire.push([
                        (y - oy) as u16,
                        col_off as u16,
                        (v * 1000.0).min(65535.0) as u16,
                    ]);
                }
            }
        }

        let mut structure: Vec<[u16; 3]> = Vec::new();
        for y in oy..oy + vh {
            let row = &self.structure[y * WIDTH + ox..y * WIDTH + ox + vw];
            for (col_off, &v) in row.iter().enumerate() {
                if v > 0.001 {
                    structure.push([
                        (y - oy) as u16,
                        col_off as u16,
                        (v * 100.0).min(65535.0) as u16,
                    ]);
                }
            }
        }

        let trails: Option<Vec<[u16; 5]>> = if include_static {
            let mut v: Vec<[u16; 5]> = Vec::new();
            for y in oy..oy + vh {
                for col_off in 0..vw {
                    let x = (ox + col_off) as i32;
                    let yy = y as i32;
                    let f = self.trail_at(x, yy, TrailKind::Food);
                    let w = self.trail_at(x, yy, TrailKind::Water);
                    let p = self.trail_at(x, yy, TrailKind::Path);
                    if f > 0.10 || w > 0.10 || p > 0.10 {
                        v.push([
                            (y - oy) as u16,
                            col_off as u16,
                            (f * 100.0).min(65535.0) as u16,
                            (w * 100.0).min(65535.0) as u16,
                            (p * 100.0).min(65535.0) as u16,
                        ]);
                    }
                }
            }
            Some(v)
        } else {
            None
        };

        let fertility: Option<Vec<[u16; 3]>> = if include_static {
            let mut v: Vec<[u16; 3]> = Vec::new();
            for y in oy..oy + vh {
                let row = &self.fertility[y * WIDTH + ox..y * WIDTH + ox + vw];
                for (col_off, &f) in row.iter().enumerate() {
                    if (f - 0.40).abs() > 0.15 {
                        v.push([(y - oy) as u16, col_off as u16, (f * 100.0).min(65535.0) as u16]);
                    }
                }
            }
            Some(v)
        } else {
            None
        };

        let hazard: Option<Vec<[u16; 3]>> = if include_static {
            let mut v: Vec<[u16; 3]> = Vec::new();
            for y in oy..oy + vh {
                let row = &self.hazard[y * WIDTH + ox..y * WIDTH + ox + vw];
                for (col_off, &h) in row.iter().enumerate() {
                    if h > 0.02 {
                        v.push([(y - oy) as u16, col_off as u16, (h * 100.0).min(65535.0) as u16]);
                    }
                }
            }
            Some(v)
        } else {
            None
        };

        let (biomes, depth_map) = if include_terrain {
            let b = (oy..oy + vh).map(|y| slice_u8(&self.biome, y)).collect();
            let d = (oy..oy + vh)
                .map(|y| {
                    let row_tiles = &self.tiles[y * WIDTH + ox..y * WIDTH + ox + vw];
                    let row_depth = &self.depth[y * WIDTH + ox..y * WIDTH + ox + vw];
                    row_tiles
                        .iter()
                        .zip(row_depth.iter())
                        .map(|(&t, &d)| {
                            if t == Tile::Water as i8 {
                                ((1.0 - d) * 200.0) as u8
                            } else {
                                255u8
                            }
                        })
                        .collect()
                })
                .collect();
            (Some(b), Some(d))
        } else {
            (None, None)
        };

        GridJson {
            width: vw,
            height: vh,
            origin_x: ox as i32,
            origin_y: oy as i32,
            tiles,
            fire,
            structure,
            biomes,
            depth_map,
            trails,
            fertility,
            hazard,
        }
    }

    pub fn to_json(&self) -> GridJson {
        self.to_json_viewport(
            WIDTH as i32 / 2,
            HEIGHT as i32 / 2,
            WIDTH,
            HEIGHT,
            true,
            true,
            true,
        )
    }
}

#[derive(Clone, Copy)]
pub enum TrailKind {
    Food,
    Water,
    Path,
}

#[derive(Serialize)]
pub struct GridJson {
    pub width: usize,
    pub height: usize,
    pub origin_x: i32,
    pub origin_y: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tiles: Option<Vec<Vec<i8>>>,
    pub fire: Vec<[u16; 3]>,
    pub structure: Vec<[u16; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biomes: Option<Vec<Vec<u8>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_map: Option<Vec<Vec<u8>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trails: Option<Vec<[u16; 5]>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fertility: Option<Vec<[u16; 3]>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hazard: Option<Vec<[u16; 3]>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    fn terrain_mix(seed: u64) -> (usize, usize, usize) {
        let grid = WorldGrid::new(seed);
        let mut land = 0usize;
        let mut livable = 0usize;
        let mut harsh = 0usize;

        for tile in grid.tiles.iter().map(|&t| Tile::from_i8(t)) {
            match tile {
                Tile::Water | Tile::Void => {}
                Tile::Grass | Tile::Food | Tile::Ash => {
                    land += 1;
                    livable += 1;
                }
                Tile::Rock
                | Tile::Snow
                | Tile::Sand
                | Tile::Fire
                | Tile::Scorched
                | Tile::Mineral => {
                    land += 1;
                    harsh += 1;
                }
                Tile::Campfire | Tile::Hut | Tile::Flooded => {
                    land += 1;
                }
            }
        }

        (land, livable, harsh)
    }

    fn land_shape(seed: u64) -> (usize, usize, usize) {
        let grid = WorldGrid::new(seed);
        let mut visited = vec![false; WIDTH * HEIGHT];
        let mut land = 0usize;
        let mut components = 0usize;
        let mut largest = 0usize;

        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let idx = WorldGrid::idx(x, y);
                let tile = grid.get(x, y);
                if matches!(tile, Tile::Water | Tile::Void) {
                    continue;
                }
                land += 1;
                if visited[idx] {
                    continue;
                }
                components += 1;
                visited[idx] = true;
                let mut queue = VecDeque::from([(x, y)]);
                let mut size = 0usize;
                while let Some((cx, cy)) = queue.pop_front() {
                    size += 1;
                    for (nx, ny) in WorldGrid::neighbors(cx, cy) {
                        let ni = WorldGrid::idx(nx, ny);
                        if visited[ni] || matches!(grid.get(nx, ny), Tile::Water | Tile::Void) {
                            continue;
                        }
                        visited[ni] = true;
                        queue.push_back((nx, ny));
                    }
                }
                largest = largest.max(size);
            }
        }

        (land, components, largest)
    }

    #[test]
    fn generated_world_keeps_most_land_habitable() {
        let seeds = [1u64, 7, 42, 99];
        let mut total_livable = 0usize;
        let mut total_harsh = 0usize;

        for seed in seeds {
            let (land, livable, harsh) = terrain_mix(seed);
            total_livable += livable;
            total_harsh += harsh;
            assert!(
                livable * 100 >= land * 45,
                "seed {seed} generated too little habitable land: livable={livable} land={land}"
            );
        }

        assert!(
            total_livable > total_harsh,
            "habitable terrain should outweigh harsh terrain across sampled seeds: livable={total_livable} harsh={total_harsh}"
        );
    }

    #[test]
    fn generated_world_keeps_large_continents_coherent() {
        let seeds = [1u64, 7, 42, 99];

        for seed in seeds {
            let (land, components, largest) = land_shape(seed);
            assert!(
                largest * 100 >= land * 30,
                "seed {seed} largest landmass too fragmented: largest={largest} land={land}"
            );
            assert!(
                components <= 48,
                "seed {seed} produced too many separate land components: {components}"
            );
        }
    }
}
