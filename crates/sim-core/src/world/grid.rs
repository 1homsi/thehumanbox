mod worldgen;

use super::tiles::{Biome, Tile};
use rand::{Rng, RngExt};
use serde::Serialize;

pub const WIDTH: usize = 600;
pub const HEIGHT: usize = 300;
/// How far enriched soil settles back toward its biome's fertility each
/// time the world layers decay (every 500 ticks).
pub const SOIL_SETTLE: f32 = 0.002;

pub const VP_W: usize = WIDTH;
pub const VP_H: usize = HEIGHT;

/// No road on the cell.
pub const ROAD_NONE: u8 = 0;
/// A trodden road: dirt in the early ages, cobbles once the tribes reach the later ones.
pub const ROAD_TRACK: u8 = 1;
/// A bridge over water: walkable across a river or lake, the only way over deep water.
pub const ROAD_BRIDGE: u8 = 2;

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
    /// Roads laid by the player or built by the tribes, one of the `ROAD_*` kinds per cell. A road is
    /// a surface on the ground: the tile underneath (grass, sand, food) stays as it is.
    pub road: Vec<u8>,
    /// Indices of tiles with non-zero trail values across any of the
    /// three trail layers. Lets `decay_trails*` skip the empty 99% of
    /// the grid that was wasting 540k multiplies per pass. Tracked as
    /// a HashSet so leave_trail can `insert` without worrying about
    /// duplicates; decay passes compact entries that decay back to
    /// zero so the set self-prunes.
    pub trail_dirty: rustc_hash::FxHashSet<u32>,
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
            road: vec![ROAD_NONE; size],
            trail_dirty: rustc_hash::FxHashSet::default(),
        };
        g.generate(seed);
        g.enforce_ocean_border();
        g
    }

    pub fn enforce_ocean_border(&mut self) {
        const HARD_X: i32 = (WIDTH as f32 * 0.025) as i32;
        const HARD_Y: i32 = (HEIGHT as f32 * 0.025) as i32;
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                if x < HARD_X || x >= WIDTH as i32 - HARD_X || y < HARD_Y || y >= HEIGHT as i32 - HARD_Y {
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
        const HARD_X: i32 = (WIDTH as f32 * 0.025) as i32;
        const HARD_Y: i32 = (HEIGHT as f32 * 0.025) as i32;
        const TRANS_X: i32 = (WIDTH as f32 * 0.10) as i32;
        const TRANS_Y: i32 = (HEIGHT as f32 * 0.10) as i32;
        let w = WIDTH as i32;
        let h = HEIGHT as i32;
        let band_x = (TRANS_X - HARD_X).max(1) as f32;
        let band_y = (TRANS_Y - HARD_Y).max(1) as f32;

        for y in HARD_Y..(h - HARD_Y) {
            for x in HARD_X..(w - HARD_X) {
                let i = Self::idx(x, y);
                if self.tiles[i] == Tile::Water as i8 {
                    continue;
                }
                let dx_in = (x - HARD_X).min(w - 1 - HARD_X - x);
                let dy_in = (y - HARD_Y).min(h - 1 - HARD_Y - y);
                let in_x = dx_in < (TRANS_X - HARD_X);
                let in_y = dy_in < (TRANS_Y - HARD_Y);
                if !in_x && !in_y {
                    continue;
                }
                let prog_x = if in_x {
                    (dx_in as f32 / band_x).clamp(0.0, 1.0)
                } else {
                    1.0
                };
                let prog_y = if in_y {
                    (dy_in as f32 / band_y).clamp(0.0, 1.0)
                } else {
                    1.0
                };
                let prog = prog_x.min(prog_y);

                let nx = x as f32 / w as f32;
                let ny = y as f32 / h as f32;
                let noise_a = Self::fbm(nx * 6.0, ny * 6.0, 0x000C_0A57_1234_5678);
                let noise_b = Self::fbm(nx * 14.0, ny * 14.0, 0x000C_0A57_8765_4321);
                let noise = noise_a * 0.65 + noise_b * 0.35;

                let waterness = (1.0 - prog).powf(1.6) + noise * 0.45 - 0.10;
                if waterness > 0.55 {
                    self.water_out(i);
                }
            }
        }
    }

    pub fn is_edge_border(x: i32, y: i32) -> bool {
        const HARD_X: i32 = (WIDTH as f32 * 0.025) as i32;
        const HARD_Y: i32 = (HEIGHT as f32 * 0.025) as i32;
        x < HARD_X || x >= WIDTH as i32 - HARD_X || y < HARD_Y || y >= HEIGHT as i32 - HARD_Y
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

    /// The road kind on a cell (`ROAD_NONE` outside the map).
    pub fn road_at(&self, x: i32, y: i32) -> u8 {
        if Self::in_bounds(x, y) {
            self.road[Self::idx(x, y)]
        } else {
            ROAD_NONE
        }
    }

    /// Water a walker wades or swims through: water with no bridge over it. `tile` is the cell's tile,
    /// which the caller already has (this is checked for every step a walker considers).
    #[inline]
    pub fn is_wet(&self, tile: Tile, x: i32, y: i32) -> bool {
        tile == Tile::Water && self.road_at(x, y) != ROAD_BRIDGE
    }

    /// Roads a flood or a wave has washed away inside the radius: a road on ground that is no longer open
    /// goes, and a bridge goes once the water under it is gone. Roads on land that stays land stay.
    pub fn wash_roads(&mut self, x: i32, y: i32, radius: i32) {
        let r = radius.clamp(0, 40);
        for dy in -r..=r {
            for dx in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if !Self::in_bounds(nx, ny) {
                    continue;
                }
                let i = Self::idx(nx, ny);
                let tile = Tile::from_i8(self.tiles[i]);
                let keep = match self.road[i] {
                    ROAD_TRACK => tile.road_ground(),
                    ROAD_BRIDGE => matches!(tile, Tile::Water | Tile::Flooded),
                    _ => true,
                };
                if !keep {
                    self.road[i] = ROAD_NONE;
                }
            }
        }
    }

    /// Water a walker wades or swims through: water with no bridge over it.
    pub fn wet_at(&self, x: i32, y: i32) -> bool {
        self.is_wet(self.get(x, y), x, y)
    }

    /// The share (0 to 1) of the straight line from `a` to `b`, sampled once per tile, that runs on road.
    pub fn road_share(&self, a: [i32; 2], b: [i32; 2]) -> f32 {
        let steps = (b[0] - a[0]).abs().max((b[1] - a[1]).abs()).max(1);
        let mut on_road = 0;
        for s in 0..=steps {
            let t = s as f32 / steps as f32;
            let x = (a[0] as f32 + (b[0] - a[0]) as f32 * t).round() as i32;
            let y = (a[1] as f32 + (b[1] - a[1]) as f32 * t).round() as i32;
            if self.road_at(x, y) != ROAD_NONE {
                on_road += 1;
            }
        }
        on_road as f32 / (steps + 1) as f32
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
            TrailKind::Food => self.food_trail[i] = (self.food_trail[i] + strength).clamp(0.0, 3.0),
            // Clamp both ends: `raid_stockpile` leaves a *negative* trail
            // on a tile, and a negative value was never decayed (decay
            // only scales `> 0.0`) yet was pruned from `trail_dirty`,
            // freezing the residue forever and permanently suppressing
            // plant growth there.
            TrailKind::Water => self.water_trail[i] = (self.water_trail[i] + strength).clamp(0.0, 3.0),
            TrailKind::Path => self.path_trail[i] = (self.path_trail[i] + strength).clamp(0.0, 5.0),
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
            &mut self.food_trail,
            &mut self.water_trail,
            &mut self.path_trail,
            0.988,
            0.988,
            0.997,
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
            &mut self.food_trail,
            &mut self.water_trail,
            &mut self.path_trail,
            F3,
            F3,
            P3,
        );
    }

    /// Walks `trail_dirty`, decays each tile's three trail layers by
    /// the given factors, and removes the index from the dirty set
    /// once all three layers are within `TRAIL_EPS` of zero.
    fn decay_dirty(
        dirty: &mut rustc_hash::FxHashSet<u32>,
        food: &mut [f32],
        water: &mut [f32],
        path: &mut [f32],
        ff: f32,
        fw: f32,
        fp: f32,
    ) {
        dirty.retain(|&i| {
            let idx = i as usize;
            let mut f = food[idx];
            let mut w = water[idx];
            let mut p = path[idx];
            if f > 0.0 {
                f *= ff;
                if f < Self::TRAIL_EPS {
                    f = 0.0;
                }
                food[idx] = f;
            }
            if w > 0.0 {
                w *= fw;
                if w < Self::TRAIL_EPS {
                    w = 0.0;
                }
                water[idx] = w;
            }
            if p > 0.0 {
                p *= fp;
                if p < Self::TRAIL_EPS {
                    p = 0.0;
                }
                path[idx] = p;
            }
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

    /// Leave rich soil on a tile: floodwater silt and weathered ash push
    /// fertility past the biome's usual level, and it settles back over a
    /// few years (see `decay_world_layers`).
    pub fn enrich_soil(&mut self, x: i32, y: i32, amount: f32) {
        if Self::in_bounds(x, y) {
            let i = Self::idx(x, y);
            let cap = Biome::from_u8(self.biome[i]).base_fertility();
            self.fertility[i] = (self.fertility[i].max(cap) + amount).min(1.0);
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
            } else if *v > cap {
                // Silt and ash wear out: rich soil settles back to the
                // biome's own level over a few years of farming.
                *v = (*v - SOIL_SETTLE).max(cap);
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

    /// River meander: pick a water tile that has water-only neighbours
    /// on at least one axis (i.e. sits in a linear stretch of river/lake
    /// shore) and erode one bank tile to water while silting the
    /// opposite bank to grass. Cheap (handful of tries per call), but
    /// gives the world a "the river shifted" feel over long sessions -
    /// the world-evolution spec calls this out specifically.
    pub fn tick_river_meander(&mut self, rng: &mut impl Rng) {
        for _ in 0..40 {
            let x = rng.random_range(2..WIDTH as i32 - 2);
            let y = rng.random_range(2..HEIGHT as i32 - 2);
            if self.get(x, y) != Tile::Water {
                continue;
            }
            // Detect a linear water stretch on the N/S or E/W axis.
            let (axis_dx, axis_dy) = if self.get(x - 1, y) == Tile::Water && self.get(x + 1, y) == Tile::Water
            {
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
            if !(a_land && b_land) {
                continue;
            }
            // Coin flip which side erodes.
            let (erode, silt) = if rng.random::<bool>() {
                (bank_a, bank_b)
            } else {
                (bank_b, bank_a)
            };
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
            if grew >= 12 {
                break;
            }
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if self.get(x, y) != Tile::Grass {
                continue;
            }
            let i = Self::idx(x, y);
            if self.fertility[i] < 0.55 {
                continue;
            }
            let mut forest_nb = 0u8;
            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                if Self::in_bounds(x + dx, y + dy) && self.biome_at(x + dx, y + dy) == Biome::Forest {
                    forest_nb += 1;
                    if forest_nb >= 2 {
                        break;
                    }
                }
            }
            if forest_nb < 2 {
                continue;
            }
            self.biome[i] = Biome::Forest as u8;
            grew += 1;
        }
    }

    /// Forest die-back: under active drought, forest tiles with low
    /// fertility revert to grassland. Pairs with `tick_forest_spread`
    /// to close the "forests spread or die" loop. Caller passes the
    /// drought flag so we only burn the budget when relevant.
    pub fn tick_forest_dieback(&mut self, drought_active: bool, rng: &mut impl Rng) {
        if !drought_active {
            return;
        }
        let mut died = 0usize;
        for _ in 0..120 {
            if died >= 8 {
                break;
            }
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if self.biome_at(x, y) != Biome::Forest {
                continue;
            }
            let i = Self::idx(x, y);
            if self.fertility[i] >= 0.30 {
                continue;
            }
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
        let flood_count = rng.random_range(30..=80usize);
        let emerge_count = rng.random_range(20..=50usize);

        let mut flooded = 0usize;
        for _ in 0..800 {
            if flooded >= flood_count {
                break;
            }
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
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
            let x = rng.random_range(1..WIDTH as i32 - 1);
            let y = rng.random_range(1..HEIGHT as i32 - 1);
            if self.get(x, y) != Tile::Water {
                continue;
            }
            let coastal = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
                .iter()
                .any(|&(nx, ny)| {
                    Self::in_bounds(nx, ny) && !matches!(self.get(nx, ny), Tile::Water | Tile::Void)
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
        let horizontal = rng.random_bool(0.5);
        let length: i32 = 30;
        let half = length / 2;

        let (cx, cy) = (
            rng.random_range(half + 2..WIDTH as i32 - half - 2),
            rng.random_range(half + 2..HEIGHT as i32 - half - 2),
        );
        // Small jitter so the fault isn't perfectly axis-aligned.
        let drift: i32 = rng.random_range(-2..=2);

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
                if !Self::in_bounds(tx, ty) {
                    continue;
                }
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
                if flipped >= 30 {
                    return;
                }
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

        let window = Window { ox, oy, vw, vh };
        let mut fire: Vec<[u16; 3]> = Vec::new();
        push_over_threshold(&mut fire, &self.fire_intensity, window, 0.001, 1000.0);
        let mut structure: Vec<[u16; 3]> = Vec::new();
        push_over_threshold(&mut structure, &self.structure, window, 0.001, 100.0);

        let trails: Option<Vec<[u16; 5]>> = if include_static {
            let mut v: Vec<[u16; 5]> = Vec::new();
            for y in oy..oy + vh {
                let base = y * WIDTH + ox;
                let food = &self.food_trail[base..base + vw];
                let water = &self.water_trail[base..base + vw];
                let path = &self.path_trail[base..base + vw];
                let mut start = 0;
                while start < vw {
                    let end = (start + SCAN_BLOCK).min(vw);
                    let top = top_bits(&food[start..end])
                        .max(top_bits(&water[start..end]))
                        .max(top_bits(&path[start..end]));
                    if top > TRAIL_BITS {
                        for col_off in start..end {
                            let (f, w, p) = (food[col_off], water[col_off], path[col_off]);
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
                    start = end;
                }
            }
            Some(v)
        } else {
            None
        };

        let fertility_dense: Option<Vec<u8>> = if include_static {
            let mut v: Vec<u8> = Vec::with_capacity(vw * vh);
            for y in oy..oy + vh {
                let row = &self.fertility[y * WIDTH + ox..y * WIDTH + ox + vw];
                for &f in row.iter() {
                    v.push((f * 100.0).clamp(0.0, 255.0) as u8);
                }
            }
            Some(v)
        } else {
            None
        };
        let fertility: Option<Vec<[u16; 3]>> = None;

        let hazard: Option<Vec<[u16; 3]>> = if include_static {
            let mut v: Vec<[u16; 3]> = Vec::new();
            push_over_threshold(&mut v, &self.hazard, window, 0.02, 100.0);
            Some(v)
        } else {
            None
        };

        let roads: Option<Vec<[u16; 3]>> = if include_static {
            let mut v: Vec<[u16; 3]> = Vec::new();
            push_roads(&mut v, &self.road, window);
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
            fertility_dense,
            hazard,
            roads,
        }
    }

    /// The scalar per-tile scans this replaced, kept as the test reference.
    #[cfg(test)]
    fn to_json_viewport_reference(
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
                    fire.push([(y - oy) as u16, col_off as u16, (v * 1000.0).min(65535.0) as u16]);
                }
            }
        }

        let mut structure: Vec<[u16; 3]> = Vec::new();
        for y in oy..oy + vh {
            let row = &self.structure[y * WIDTH + ox..y * WIDTH + ox + vw];
            for (col_off, &v) in row.iter().enumerate() {
                if v > 0.001 {
                    structure.push([(y - oy) as u16, col_off as u16, (v * 100.0).min(65535.0) as u16]);
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

        let fertility_dense: Option<Vec<u8>> = if include_static {
            let mut v: Vec<u8> = Vec::with_capacity(vw * vh);
            for y in oy..oy + vh {
                let row = &self.fertility[y * WIDTH + ox..y * WIDTH + ox + vw];
                for &f in row.iter() {
                    v.push((f * 100.0).clamp(0.0, 255.0) as u8);
                }
            }
            Some(v)
        } else {
            None
        };
        let fertility: Option<Vec<[u16; 3]>> = None;

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

        let roads: Option<Vec<[u16; 3]>> = if include_static {
            let mut v: Vec<[u16; 3]> = Vec::new();
            for y in oy..oy + vh {
                let row = &self.road[y * WIDTH + ox..y * WIDTH + ox + vw];
                for (col_off, &kind) in row.iter().enumerate() {
                    if kind != ROAD_NONE {
                        v.push([(y - oy) as u16, col_off as u16, u16::from(kind)]);
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
            fertility_dense,
            hazard,
            roads,
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

/// Tiles are tested for "anything here?" this many at a time: almost every
/// block of a frame's fire, structure, trail and hazard layers is empty.
const SCAN_BLOCK: usize = 64;

#[derive(Clone, Copy)]
struct Window {
    ox: usize,
    oy: usize,
    vw: usize,
    vh: usize,
}

/// The largest bit pattern in a block, read as `i32`. For a positive finite
/// threshold `t`, `v > t` implies `top_bits(..) > t.to_bits() as i32` for the
/// block holding `v` (positive floats order like their bit patterns, and
/// negatives have the sign bit set and compare below), so a block whose top is
/// not above the threshold has no tile over it. The converse fails only for
/// NaN, which the exact per-tile test that follows rejects. An integer max over
/// a block vectorises; a float compare-and-or does not.
#[inline]
fn top_bits(block: &[f32]) -> i32 {
    block.iter().fold(i32::MIN, |top, &v| top.max(v.to_bits() as i32))
}

/// `0.10_f32` as a bit pattern, the trail layers' threshold.
const TRAIL_BITS: i32 = 0.10_f32.to_bits() as i32;

/// Append `[row, col, kind]` for every road cell of the viewport window, in row-major order.
fn push_roads(out: &mut Vec<[u16; 3]>, road: &[u8], w: Window) {
    for y in w.oy..w.oy + w.vh {
        let row = &road[y * WIDTH + w.ox..y * WIDTH + w.ox + w.vw];
        for (col, &kind) in row.iter().enumerate() {
            if kind != ROAD_NONE {
                out.push([(y - w.oy) as u16, col as u16, u16::from(kind)]);
            }
        }
    }
}

/// Append `[row, col, scaled value]` for every tile of the viewport window
/// whose layer value exceeds `threshold`, in row-major order.
fn push_over_threshold(out: &mut Vec<[u16; 3]>, layer: &[f32], w: Window, threshold: f32, scale: f32) {
    debug_assert!(threshold.is_finite() && threshold > 0.0);
    let threshold_bits = threshold.to_bits() as i32;
    for y in w.oy..w.oy + w.vh {
        let row = &layer[y * WIDTH + w.ox..y * WIDTH + w.ox + w.vw];
        for (block_index, block) in row.chunks(SCAN_BLOCK).enumerate() {
            if top_bits(block) <= threshold_bits {
                continue;
            }
            for (i, &v) in block.iter().enumerate() {
                if v > threshold {
                    out.push([
                        (y - w.oy) as u16,
                        (block_index * SCAN_BLOCK + i) as u16,
                        (v * scale).min(65535.0) as u16,
                    ]);
                }
            }
        }
    }
}

#[derive(Clone, Copy)]
pub enum TrailKind {
    Food,
    Water,
    Path,
}

/// The grid section of a frame.
///
/// Fields are declared in alphabetical order on purpose: a frame's JSON
/// object is a sorted map (`serde_json::Value`), and `FramePayload` writes
/// this struct straight to the wire without going through `Value`, so the
/// declaration order is the key order that comes out. A test compares the two
/// paths byte for byte.
#[derive(Serialize)]
pub struct GridJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biomes: Option<Vec<Vec<u8>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_map: Option<Vec<Vec<u8>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fertility: Option<Vec<[u16; 3]>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fertility_dense: Option<Vec<u8>>,
    pub fire: Vec<[u16; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hazard: Option<Vec<[u16; 3]>>,
    pub height: usize,
    pub origin_x: i32,
    pub origin_y: i32,
    /// Road cells as `[row, col, kind]` (see `ROAD_*`), absent on frames without static layers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roads: Option<Vec<[u16; 3]>>,
    pub structure: Vec<[u16; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tiles: Option<Vec<Vec<i8>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trails: Option<Vec<[u16; 5]>>,
    pub width: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    /// The block-skipping layer scans must emit exactly what the per-tile
    /// scans did: same entries, same order, for sparse and dense layers,
    /// values at and around each threshold, NaN, huge values that hit the
    /// `u16` clamp, and windows whose width is not a multiple of the block.
    #[test]
    fn viewport_scans_match_the_per_tile_reference() {
        let mut grid = WorldGrid::new(5);
        let mut state = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = move || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        let specials = [
            0.0f32,
            0.001,
            0.0010001,
            0.0009999,
            0.02,
            0.0200001,
            0.1,
            0.1000001,
            0.5,
            1.0,
            70_000.0,
            f32::NAN,
            f32::INFINITY,
            -3.0,
        ];
        for layer in 0..6 {
            let len = WIDTH * HEIGHT;
            for i in 0..len {
                let r = next();
                // Mostly empty, with isolated and clustered non-empty tiles.
                let v = match r % 97 {
                    0 => specials[(r >> 8) as usize % specials.len()],
                    1..=3 => (r >> 16) as f32 / u32::MAX as f32,
                    _ => 0.0,
                };
                match layer {
                    0 => grid.fire_intensity[i] = v,
                    1 => grid.structure[i] = v,
                    2 => grid.food_trail[i] = v,
                    3 => grid.water_trail[i] = v,
                    4 => grid.path_trail[i] = v,
                    _ => grid.hazard[i] = v,
                }
            }
        }
        // A dense band across several rows.
        for i in 40 * WIDTH..46 * WIDTH {
            grid.fire_intensity[i] = 0.7;
            grid.structure[i] = 2.0;
            grid.hazard[i] = 0.3;
            grid.path_trail[i] = 0.4;
        }
        let windows = [
            (WIDTH as i32 / 2, HEIGHT as i32 / 2, WIDTH, HEIGHT),
            (100, 60, 200, 100),
            (5, 5, 37, 23),
            (WIDTH as i32 - 3, HEIGHT as i32 - 3, 101, 50),
            (300, 150, 15, 7),
            (300, 150, 16, 16),
            (300, 150, 17, 1),
        ];
        for (cx, cy, vw, vh) in windows {
            for (tiles, stat, terrain) in [(true, true, true), (false, false, false), (false, true, false)] {
                let new = grid.to_json_viewport(cx, cy, vw, vh, tiles, stat, terrain);
                let old = grid.to_json_viewport_reference(cx, cy, vw, vh, tiles, stat, terrain);
                assert_eq!(
                    serde_json::to_string(&new).unwrap(),
                    serde_json::to_string(&old).unwrap(),
                    "window ({cx},{cy}) {vw}x{vh} tiles={tiles} static={stat} terrain={terrain}"
                );
            }
        }
    }

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
                | Tile::Mineral
                | Tile::Lava => {
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
