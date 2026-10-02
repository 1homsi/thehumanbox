//! World generation.
//!
//! A world is built in passes:
//! 1. Shape: each seed picks an archetype (scattered continents, one
//!    supercontinent, an archipelago, twin continents, or a ring around an
//!    inland sea) and lays out landmasses as warped, noisy blobs.
//! 2. Mountains: ridged ranges wind across each large landmass, with
//!    passes where the ridge dips so ranges never wall a continent in.
//! 3. Climate: temperature falls with latitude and altitude; moisture rides
//!    the prevailing wind, raining out on windward slopes and leaving dry
//!    rain shadows behind ranges.
//! 4. Water: rivers follow the terrain downhill to the sea, growing as they
//!    gather rain; basins fill into lakes, and small ponds cover anywhere
//!    still far from fresh water.
//! 5. Features: volcanic cones, mineral veins in the foothills, beaches on
//!    warm coasts.

use super::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::{Biome, Tile};
use rand::rngs::StdRng;
use rand::{RngExt, SeedableRng};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, VecDeque};

const SIZE: usize = WIDTH * HEIGHT;
const ORTHO: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
const EIGHT: [(i32, i32); 8] = [
    (-1, 0),
    (1, 0),
    (0, -1),
    (0, 1),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

/// Elevation (0..1 over land) where ground turns to bare, impassable rock.
const ROCK_LINE: f32 = 0.55;
/// Elevation where foothills begin: stony ground with mineral veins.
const FOOTHILLS: f32 = 0.40;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorldShape {
    Continents,
    Supercontinent,
    Archipelago,
    Twins,
    InlandSea,
}

impl WorldShape {
    fn pick(rng: &mut StdRng) -> Self {
        match rng.random_range(0..100) {
            0..=29 => WorldShape::Continents,
            30..=49 => WorldShape::Supercontinent,
            50..=67 => WorldShape::Archipelago,
            68..=85 => WorldShape::Twins,
            _ => WorldShape::InlandSea,
        }
    }

    /// Share of the map under water.
    fn sea_share(self) -> f32 {
        match self {
            WorldShape::Continents => 0.62,
            WorldShape::Supercontinent => 0.57,
            WorldShape::Archipelago => 0.68,
            WorldShape::Twins => 0.61,
            WorldShape::InlandSea => 0.58,
        }
    }
}

/// A landmass seed in aspect-correct map units (x spans 0..2, y 0..1).
/// A negative strength carves a sea out of the land around it.
struct Blob {
    cx: f32,
    cy: f32,
    short: f32,
    long: f32,
    angle: f32,
    strength: f32,
}

impl Blob {
    fn lift(&self, u: f32, v: f32) -> f32 {
        let (dx, dy) = (u - self.cx, v - self.cy);
        let (cos, sin) = (self.angle.cos(), self.angle.sin());
        let rx = (cos * dx + sin * dy) / self.long;
        let ry = (-sin * dx + cos * dy) / self.short;
        let d = (rx * rx + ry * ry).sqrt();
        (1.0 - d.min(1.0)).powf(0.9) * self.strength
    }
}

fn blobs_for(shape: WorldShape, rng: &mut StdRng) -> Vec<Blob> {
    let mut blobs: Vec<Blob> = Vec::new();
    let place = |rng: &mut StdRng, blobs: &mut Vec<Blob>, area: (f32, f32, f32, f32), min_gap: f32| {
        for _ in 0..40 {
            let cx = rng.random_range(area.0..area.1);
            let cy = rng.random_range(area.2..area.3);
            if blobs.iter().all(|b| (b.cx - cx).hypot(b.cy - cy) >= min_gap) {
                return Some((cx, cy));
            }
        }
        None
    };
    let tau = std::f32::consts::TAU;
    match shape {
        WorldShape::Continents => {
            for _ in 0..rng.random_range(3..=5) {
                if let Some((cx, cy)) = place(rng, &mut blobs, (0.3, 1.7, 0.25, 0.75), 0.42) {
                    let short = rng.random_range(0.16..0.24);
                    blobs.push(Blob {
                        cx,
                        cy,
                        short,
                        long: short * rng.random_range(1.5..2.4),
                        angle: rng.random_range(0.0..tau),
                        strength: rng.random_range(1.05..1.45),
                    });
                }
            }
        }
        WorldShape::Supercontinent | WorldShape::InlandSea => {
            let (cx, cy) = (rng.random_range(0.9..1.1), rng.random_range(0.46..0.54));
            blobs.push(Blob {
                cx,
                cy,
                short: rng.random_range(0.3..0.36),
                long: rng.random_range(0.66..0.8),
                angle: rng.random_range(-0.25..0.25),
                strength: 1.35,
            });
            // Lobes make the coastline ragged instead of an oval.
            for _ in 0..rng.random_range(2..=4) {
                let a = rng.random_range(0.0..tau);
                let r = rng.random_range(0.25..0.45);
                blobs.push(Blob {
                    cx: cx + a.cos() * r * 1.4,
                    cy: (cy + a.sin() * r * 0.7).clamp(0.2, 0.8),
                    short: rng.random_range(0.15..0.22),
                    long: rng.random_range(0.24..0.38),
                    angle: rng.random_range(0.0..tau),
                    strength: rng.random_range(1.0..1.3),
                });
            }
            if shape == WorldShape::InlandSea {
                blobs.push(Blob {
                    cx: cx + rng.random_range(-0.1..0.1),
                    cy,
                    short: rng.random_range(0.1..0.14),
                    long: rng.random_range(0.2..0.3),
                    angle: rng.random_range(-0.4..0.4),
                    strength: -1.6,
                });
            }
            for _ in 0..rng.random_range(2..=4) {
                if let Some((ix, iy)) = place(rng, &mut blobs, (0.15, 1.85, 0.15, 0.85), 0.3) {
                    let short = rng.random_range(0.04..0.07);
                    blobs.push(Blob {
                        cx: ix,
                        cy: iy,
                        short,
                        long: short * rng.random_range(1.2..2.0),
                        angle: rng.random_range(0.0..tau),
                        strength: 1.1,
                    });
                }
            }
        }
        WorldShape::Archipelago => {
            let short = rng.random_range(0.16..0.2);
            blobs.push(Blob {
                cx: rng.random_range(0.7..1.3),
                cy: rng.random_range(0.4..0.6),
                short,
                long: short * rng.random_range(1.6..2.2),
                angle: rng.random_range(0.0..tau),
                strength: 1.3,
            });
            for _ in 0..rng.random_range(9..=13) {
                if let Some((cx, cy)) = place(rng, &mut blobs, (0.15, 1.85, 0.15, 0.85), 0.2) {
                    let short = rng.random_range(0.06..0.11);
                    blobs.push(Blob {
                        cx,
                        cy,
                        short,
                        long: short * rng.random_range(1.1..2.2),
                        angle: rng.random_range(0.0..tau),
                        strength: rng.random_range(1.05..1.3),
                    });
                }
            }
        }
        WorldShape::Twins => {
            for side in [0.55f32, 1.45] {
                let short = rng.random_range(0.24..0.28);
                blobs.push(Blob {
                    cx: side + rng.random_range(-0.06..0.06),
                    cy: rng.random_range(0.46..0.54),
                    short,
                    long: short * rng.random_range(1.3..1.6),
                    angle: std::f32::consts::FRAC_PI_2 + rng.random_range(-0.5..0.5),
                    strength: 1.35,
                });
            }
            for _ in 0..rng.random_range(2..=4) {
                if let Some((cx, cy)) = place(rng, &mut blobs, (0.85, 1.15, 0.2, 0.8), 0.12) {
                    blobs.push(Blob {
                        cx,
                        cy,
                        short: rng.random_range(0.03..0.05),
                        long: rng.random_range(0.05..0.08),
                        angle: rng.random_range(0.0..tau),
                        strength: 1.1,
                    });
                }
            }
        }
    }
    blobs
}

/// Distance from (px, py) to segment a-b, and how far along it (0..1).
fn segment_distance(px: f32, py: f32, a: (f32, f32), b: (f32, f32)) -> (f32, f32) {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len2 = (dx * dx + dy * dy).max(1e-6);
    let t = (((px - a.0) * dx + (py - a.1) * dy) / len2).clamp(0.0, 1.0);
    let (cx, cy) = (a.0 + t * dx, a.1 + t * dy);
    ((px - cx).hypot(py - cy), t)
}

/// Land tiles grouped into connected landmasses.
fn landmasses(land: &[bool]) -> Vec<Vec<usize>> {
    let mut seen = vec![false; SIZE];
    let mut out = Vec::new();
    for start in 0..SIZE {
        if !land[start] || seen[start] {
            continue;
        }
        seen[start] = true;
        let mut comp = Vec::new();
        let mut queue = VecDeque::from([start]);
        while let Some(i) = queue.pop_front() {
            comp.push(i);
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            for (dx, dy) in ORTHO {
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) {
                    let ni = WorldGrid::idx(nx, ny);
                    if land[ni] && !seen[ni] {
                        seen[ni] = true;
                        queue.push_back(ni);
                    }
                }
            }
        }
        out.push(comp);
    }
    out
}

/// Breadth-first distance (in tiles) from every tile to the nearest tile
/// where `source` holds.
fn distance_from(source: impl Fn(usize) -> bool) -> Vec<i32> {
    let mut dist = vec![i32::MAX / 2; SIZE];
    let mut queue = VecDeque::new();
    for (i, d) in dist.iter_mut().enumerate() {
        if source(i) {
            *d = 0;
            queue.push_back(i);
        }
    }
    while let Some(i) = queue.pop_front() {
        let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
        for (dx, dy) in ORTHO {
            let (nx, ny) = (x + dx, y + dy);
            if WorldGrid::in_bounds(nx, ny) {
                let ni = WorldGrid::idx(nx, ny);
                if dist[ni] > dist[i] + 1 {
                    dist[ni] = dist[i] + 1;
                    queue.push_back(ni);
                }
            }
        }
    }
    dist
}

/// Box blur, for turning streaky per-row passes into smooth fields.
fn blur(field: &[f32], radius: i32) -> Vec<f32> {
    let mut tmp = vec![0.0f32; SIZE];
    let mut out = vec![0.0f32; SIZE];
    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            let (mut sum, mut n) = (0.0, 0.0);
            for dx in -radius..=radius {
                let nx = (x + dx).clamp(0, WIDTH as i32 - 1);
                sum += field[WorldGrid::idx(nx, y)];
                n += 1.0;
            }
            tmp[WorldGrid::idx(x, y)] = sum / n;
        }
    }
    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            let (mut sum, mut n) = (0.0, 0.0);
            for dy in -radius..=radius {
                let ny = (y + dy).clamp(0, HEIGHT as i32 - 1);
                sum += tmp[WorldGrid::idx(x, ny)];
                n += 1.0;
            }
            out[WorldGrid::idx(x, y)] = sum / n;
        }
    }
    out
}

impl WorldGrid {
    pub(super) fn generate(&mut self, seed: u64) {
        let mut rng = StdRng::seed_from_u64(seed);
        let shape = WorldShape::pick(&mut rng);
        let aspect = WIDTH as f32 / HEIGHT as f32;

        // ── 1. Shape ────────────────────────────────────────────────────
        let blobs = blobs_for(shape, &mut rng);
        let mut raw = vec![0.0f32; SIZE];
        for y in 0..HEIGHT {
            for x in 0..WIDTH {
                let (nx, ny) = (x as f32 / WIDTH as f32, y as f32 / HEIGHT as f32);
                let (u, v) = (nx * aspect, ny);
                let wu = u + Self::fbm(u * 0.85 + 13.7, v * 0.85 + 52.4, seed ^ 0x2a3b_4c5d_6e7f_8a9b) * 0.22;
                let wv = v + Self::fbm(u * 0.85 + 77.3, v * 0.85 + 31.1, seed ^ 0x1b2c_3d4e_5f6a_7b8c) * 0.22;
                let noise = Self::fbm(u * 0.6, v * 0.6, seed) * 0.5;
                let mut lift = 0.0f32;
                let mut carve = 0.0f32;
                for b in &blobs {
                    let l = b.lift(wu, wv);
                    if l >= 0.0 {
                        lift = lift.max(l);
                    } else {
                        carve = carve.min(l);
                    }
                }
                // Land sinks gradually toward the frame along a ragged line,
                // so coasts curve away from the edge instead of being cut by it.
                let ragged = Self::fbm(u * 1.3 + 61.0, v * 1.3 + 17.0, seed ^ 0xed9e) * 0.05;
                let d_edge = (nx.min(1.0 - nx) * aspect).min(ny.min(1.0 - ny)) + ragged;
                let edge = ((d_edge - 0.04) / 0.2).clamp(0.0, 1.0);
                let edge = edge * edge * (3.0 - 2.0 * edge);
                // Noise roughens continents but cannot raise land far from one.
                // Fine noise frays the coastline into coves and headlands.
                let fray = Self::fbm(u * 3.2 + 9.0, v * 3.2 + 4.0, seed ^ 0xc0a5) * 0.12;
                let roughness = (noise + fray) * (0.35 + lift.min(1.0) * 0.65);
                raw[y * WIDTH + x] = (roughness + lift + carve) - (1.0 - edge) * 1.6;
            }
        }

        let mut sorted = raw.clone();
        sorted.sort_by(f32::total_cmp);
        // The share of sea is a target, but open ocean never rises into
        // land just to meet it: the floor keeps coasts on the continents.
        let sea = sorted[(SIZE as f32 * shape.sea_share()) as usize].max(0.1);
        let (lo, hi) = (sorted[0], sorted[SIZE - 1]);
        let mut land: Vec<bool> = raw.iter().map(|&r| r >= sea).collect();

        // Smooth the coastline, then drop islets too small to live on.
        for _ in 0..2 {
            let prev = land.clone();
            for y in 1..HEIGHT as i32 - 1 {
                for x in 1..WIDTH as i32 - 1 {
                    let i = Self::idx(x, y);
                    let n = EIGHT
                        .iter()
                        .filter(|&&(dx, dy)| prev[Self::idx(x + dx, y + dy)])
                        .count();
                    if !prev[i] && n >= 6 {
                        land[i] = true;
                    } else if prev[i] && n <= 2 {
                        land[i] = false;
                    }
                }
            }
        }
        let min_island = if shape == WorldShape::Archipelago {
            220
        } else {
            320
        };
        let mut masses = landmasses(&land);
        masses.retain(|comp| {
            if comp.len() < min_island {
                for &i in comp {
                    land[i] = false;
                }
                false
            } else {
                true
            }
        });

        let coast = distance_from(|i| !land[i]);
        // Lowland height, 0 at the shore rising gently inland.
        let mut elev: Vec<f32> = (0..SIZE)
            .map(|i| {
                if !land[i] {
                    return 0.0;
                }
                let base = ((raw[i] - sea) / (hi - sea).max(1e-5)).clamp(0.0, 1.0);
                let inland = (coast[i] as f32 / 40.0).min(1.0);
                (base.powf(0.85) * 0.45 + inland * 0.08).min(0.5)
            })
            .collect();

        // ── 2. Mountains ────────────────────────────────────────────────
        let mut mountain = vec![0.0f32; SIZE];
        for comp in &masses {
            let ranges = match comp.len() {
                0..=1_199 => usize::from(rng.random::<f32>() < 0.4),
                1_200..=7_999 => 1 + usize::from(rng.random::<f32>() < 0.6),
                8_000..=19_999 => 2 + rng.random_range(0..=2),
                _ => 4 + rng.random_range(0..=2),
            };
            let interior: Vec<usize> = comp.iter().copied().filter(|&i| coast[i] >= 6).collect();
            if interior.is_empty() {
                continue;
            }
            for _ in 0..ranges {
                let start = interior[rng.random_range(0..interior.len())];
                let (mut px, mut py) = ((start % WIDTH) as f32, (start / WIDTH) as f32);
                let mut angle = rng.random_range(0.0..std::f32::consts::TAU);
                let length = rng.random_range(50.0..((comp.len() as f32).sqrt() * 1.3).clamp(70.0, 260.0));
                let segments = rng.random_range(6..=10);
                let step = length / segments as f32;
                let mut points: Vec<(f32, f32, f32, f32)> =
                    vec![(px, py, rng.random_range(0.75..1.0), rng.random_range(9.0..15.0))];
                for _ in 0..segments {
                    angle += rng.random_range(-0.4..0.4);
                    let (nx, ny) = (px + angle.cos() * step, py + angle.sin() * step);
                    let (ix, iy) = (nx as i32, ny as i32);
                    if !Self::in_bounds(ix, iy) || coast[Self::idx(ix, iy)] < 4 {
                        // Turn back inland rather than ending at the coast.
                        angle += std::f32::consts::PI * 0.6;
                        continue;
                    }
                    // Some vertices dip into passes people can cross.
                    let height = if rng.random::<f32>() < 0.2 {
                        0.22
                    } else {
                        rng.random_range(0.7..1.05)
                    };
                    points.push((nx, ny, height, rng.random_range(8.0..16.0)));
                    (px, py) = (nx, ny);
                }
                for pair in points.windows(2) {
                    let (a, b) = (pair[0], pair[1]);
                    let reach = a.3.max(b.3) as i32 + 1;
                    let (x0, x1) = (a.0.min(b.0) as i32 - reach, a.0.max(b.0) as i32 + reach);
                    let (y0, y1) = (a.1.min(b.1) as i32 - reach, a.1.max(b.1) as i32 + reach);
                    for y in y0.max(0)..=y1.min(HEIGHT as i32 - 1) {
                        for x in x0.max(0)..=x1.min(WIDTH as i32 - 1) {
                            let i = Self::idx(x, y);
                            if !land[i] {
                                continue;
                            }
                            let (d, t) = segment_distance(x as f32, y as f32, (a.0, a.1), (b.0, b.1));
                            let width = a.3 + (b.3 - a.3) * t;
                            if d >= width {
                                continue;
                            }
                            let height = a.2 + (b.2 - a.2) * t;
                            // Ridged noise breaks the range into crags and spurs.
                            let (u, v) = (x as f32 / HEIGHT as f32, y as f32 / HEIGHT as f32);
                            let ridge =
                                1.0 - Self::fbm(u * 4.0 + 5.1, v * 4.0 + 9.7, seed ^ 0x51ed).abs() * 2.0;
                            let profile = (1.0 - d / width).powf(1.2);
                            let m = profile * height * (0.75 + ridge.clamp(0.0, 1.0) * 0.4);
                            mountain[i] = mountain[i].max(m);
                        }
                    }
                }
            }
        }
        for i in 0..SIZE {
            if land[i] {
                elev[i] = (elev[i] + mountain[i] * 0.72).min(1.0);
            }
        }

        // ── 5a. Volcanoes (before climate so their cones cool and dry) ──
        let volcanoes = match shape {
            WorldShape::Archipelago => rng.random_range(2..=3),
            _ => rng.random_range(0..=2),
        };
        let mut craters: Vec<(i32, i32, i32)> = Vec::new();
        let sites: Vec<usize> = (0..SIZE)
            .filter(|&i| land[i] && coast[i] >= 5 && coast[i] <= 40 && mountain[i] < 0.1)
            .collect();
        for _ in 0..volcanoes {
            if sites.is_empty() {
                break;
            }
            let at = sites[rng.random_range(0..sites.len())];
            let (cx, cy) = ((at % WIDTH) as i32, (at / WIDTH) as i32);
            if craters
                .iter()
                .any(|&(x, y, _)| (x - cx).abs() + (y - cy).abs() < 40)
            {
                continue;
            }
            let r = rng.random_range(5..=8);
            for dy in -r * 2..=r * 2 {
                for dx in -r * 2..=r * 2 {
                    let (x, y) = (cx + dx, cy + dy);
                    if !Self::in_bounds(x, y) {
                        continue;
                    }
                    let i = Self::idx(x, y);
                    let d = ((dx * dx + dy * dy) as f32).sqrt();
                    if land[i] && d < r as f32 {
                        elev[i] = elev[i].max(0.35 + (1.0 - d / r as f32) * 0.4);
                    }
                }
            }
            craters.push((cx, cy, r));
        }

        // ── 3. Climate ──────────────────────────────────────────────────
        let mut temp = vec![0.0f32; SIZE];
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                let (u, v) = (x as f32 / HEIGHT as f32, y as f32 / HEIGHT as f32);
                let wobble = Self::fbm(u * 0.8 + 3.3, v * 0.8 + 8.8, seed ^ 0x7e3) * 0.16;
                let lat = ((v - 0.5).abs() * 2.0 + wobble).clamp(0.0, 1.0);
                // Lowlands keep their latitude's warmth; height cools fast.
                temp[i] = 33.0 - lat * 44.0 - (elev[i] - 0.25).max(0.0) * 40.0;
            }
        }

        // Moisture rides the prevailing wind: trade winds blow west in the
        // tropics and near the poles, westerlies blow east in between.
        let mut carried_moist = vec![0.0f32; SIZE];
        for y in 0..HEIGHT as i32 {
            let lat = ((y as f32 / HEIGHT as f32) - 0.5).abs() * 2.0;
            let eastward = (0.3..0.68).contains(&lat);
            let mut carried = 1.0f32;
            let mut prev = 0.0f32;
            for k in 0..WIDTH as i32 {
                let x = if eastward { k } else { WIDTH as i32 - 1 - k };
                let i = Self::idx(x, y);
                if !land[i] {
                    carried = (carried + 0.06).min(1.0);
                    carried_moist[i] = carried;
                    prev = 0.0;
                    continue;
                }
                let rise = (elev[i] - prev).max(0.0);
                let rain = (rise * 1.8).min(carried);
                carried = (carried - 0.003 - rain).max(0.06);
                carried_moist[i] = (carried + rain * 2.0).min(1.0);
                prev = elev[i];
            }
        }
        let carried_moist = blur(&carried_moist, 4);
        let mut moist = vec![0.0f32; SIZE];
        for i in 0..SIZE {
            let (x, y) = ((i % WIDTH) as f32, (i / WIDTH) as f32);
            let (u, v) = (x / HEIGHT as f32, y / HEIGHT as f32);
            let near_sea = (1.0 - (coast[i] as f32 / 70.0).min(1.0)).powf(1.3);
            let noise = Self::fbm(u * 1.4 + 21.0, v * 1.4 + 4.0, seed ^ 0x3c9);
            let lat = (v - 0.5).abs() * 2.0;
            // Subtropical high pressure dries the band around 30 degrees.
            let subtropic = (1.0 - ((lat - 0.4).abs() / 0.14).min(1.0)) * 0.12;
            moist[i] =
                (carried_moist[i] * 0.6 + near_sea * 0.22 + noise * 0.35 + 0.15 - subtropic).clamp(0.0, 1.0);
        }

        // ── 4. Water ────────────────────────────────────────────────────
        // Priority flood from the sea: every land tile learns which
        // neighbour drains it, with basins filled flat so water can leave.
        let mut filled = elev.clone();
        let mut receiver = vec![usize::MAX; SIZE];
        let mut order: Vec<usize> = Vec::with_capacity(SIZE);
        let mut done = vec![false; SIZE];
        let mut heap: BinaryHeap<Reverse<(u32, usize)>> = BinaryHeap::new();
        let key = |h: f32| (h.max(0.0) * 1_000_000.0) as u32;
        for i in 0..SIZE {
            if land[i] {
                continue;
            }
            done[i] = true;
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            let shore = ORTHO.iter().any(|&(dx, dy)| {
                let (nx, ny) = (x + dx, y + dy);
                Self::in_bounds(nx, ny) && land[Self::idx(nx, ny)]
            });
            if shore {
                heap.push(Reverse((0, i)));
            }
        }
        while let Some(Reverse((_, i))) = heap.pop() {
            if land[i] {
                order.push(i);
            }
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            for (dx, dy) in EIGHT {
                let (nx, ny) = (x + dx, y + dy);
                if !Self::in_bounds(nx, ny) {
                    continue;
                }
                let ni = Self::idx(nx, ny);
                if done[ni] {
                    continue;
                }
                done[ni] = true;
                filled[ni] = elev[ni].max(filled[i] + 1e-5);
                receiver[ni] = i;
                heap.push(Reverse((key(filled[ni]), ni)));
            }
        }
        let mut flow = vec![0.0f32; SIZE];
        for &i in order.iter().rev() {
            flow[i] += 0.3 + moist[i];
            if receiver[i] != usize::MAX {
                let r = receiver[i];
                flow[r] += flow[i];
            }
        }
        let land_tiles = land.iter().filter(|&&l| l).count() as f32;
        let river_at = (land_tiles * 0.0026).max(50.0);

        let mut is_river = vec![false; SIZE];
        for i in 0..SIZE {
            if !land[i] || flow[i] < river_at {
                continue;
            }
            // Only big rivers cut through rock; small ones start below it.
            if elev[i] > ROCK_LINE && flow[i] < river_at * 3.0 {
                continue;
            }
            is_river[i] = true;
            if flow[i] > river_at * 7.0 {
                let r = receiver[i];
                if r != usize::MAX && land[r] {
                    // Widen big rivers sideways across their flow.
                    let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
                    let (rx, ry) = ((r % WIDTH) as i32, (r / WIDTH) as i32);
                    let (sx, sy) = (-(ry - y), rx - x);
                    let (wx, wy) = (x + sx, y + sy);
                    if Self::in_bounds(wx, wy) && land[Self::idx(wx, wy)] {
                        is_river[Self::idx(wx, wy)] = true;
                    }
                }
            }
        }
        // Basins deep enough to hold water become lakes.
        let mut is_lake: Vec<bool> = (0..SIZE).map(|i| land[i] && filled[i] - elev[i] > 0.02).collect();
        for comp in landmasses(&is_lake) {
            if comp.len() < 10 {
                for i in comp {
                    is_lake[i] = false;
                }
            }
        }

        // ── Tiles and biomes ────────────────────────────────────────────
        for i in 0..SIZE {
            self.tiles[i] = Tile::Water as i8;
            self.biome[i] = Biome::Grassland as u8;
        }
        let near_river = distance_from(|i| is_river[i] || is_lake[i]);
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                if !land[i] {
                    continue;
                }
                let (u, v) = (x as f32 / HEIGHT as f32, y as f32 / HEIGHT as f32);
                let e = elev[i];
                let t = temp[i];
                let m = (moist[i] + if near_river[i] <= 3 { 0.15 } else { 0.0 }).min(1.0);
                let biome = if e > ROCK_LINE || t < -3.0 {
                    Biome::Tundra
                } else if t < 7.0 {
                    if m > 0.45 {
                        Biome::Taiga
                    } else {
                        Biome::Tundra
                    }
                } else if t < 21.0 {
                    if m > 0.56 {
                        Biome::Forest
                    } else if m > 0.24 {
                        Biome::Grassland
                    } else {
                        Biome::Desert
                    }
                } else if m > 0.53 {
                    Biome::Jungle
                } else if m > 0.47 && e < 0.12 {
                    Biome::Wetland
                } else if m > 0.37 {
                    Biome::Grassland
                } else if m > 0.21 {
                    Biome::Savanna
                } else if e > 0.2 {
                    // Dry uplands erode into red badlands.
                    Biome::Badlands
                } else {
                    Biome::Desert
                };
                self.biome[i] = biome as u8;

                let detail = Self::fbm(u * 6.0 + 1.7, v * 6.0 + 2.9, seed ^ 0x9d1);
                let vein = Self::fbm(u * 9.0 + 40.0, v * 9.0 + 11.0, seed ^ 0x6a5);
                let tile = if is_lake[i] || is_river[i] {
                    Tile::Water
                } else if e > ROCK_LINE {
                    // Summits stay impassable rock; the map draws their snow
                    // from height, so nobody settles on a peak.
                    Tile::Rock
                } else if e > FOOTHILLS {
                    // Outcrops and veins come from noise, so they form
                    // connected clusters off the range instead of speckle.
                    let outcrop = Self::fbm(u * 7.0 + 70.0, v * 7.0 + 3.0, seed ^ 0x0c7);
                    if vein > 0.36 {
                        Tile::Mineral
                    } else if outcrop > 0.42 - (e - FOOTHILLS) * 1.6 {
                        Tile::Rock
                    } else if t < 2.0 {
                        Tile::Snow
                    } else {
                        Tile::Grass
                    }
                } else if coast[i] <= 1 + usize::from(detail > 0.1) as i32 && e < 0.12 && t > 6.0 {
                    Tile::Sand
                } else {
                    match biome {
                        Biome::Desert if detail > -0.15 => Tile::Sand,
                        Biome::Badlands => Tile::Sand,
                        Biome::Tundra if t < -6.0 || detail > 0.2 => Tile::Snow,
                        _ => Tile::Grass,
                    }
                };
                self.tiles[i] = tile as i8;
            }
        }
        // Fold tiny rock clusters back into grass: they read as noise on
        // the map. Ranges and volcano cones are far larger.
        let rock_mask: Vec<bool> = self.tiles.iter().map(|&t| t == Tile::Rock as i8).collect();
        for comp in landmasses(&rock_mask) {
            if comp.len() < 8 {
                for i in comp {
                    self.tiles[i] = Tile::Grass as i8;
                }
            }
        }

        // River mouths spread into marshy deltas.
        for i in 0..SIZE {
            if !is_river[i] || flow[i] < river_at * 4.0 || coast[i] > 3 {
                continue;
            }
            let (cx, cy) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            for dy in -3..=3 {
                for dx in -3..=3 {
                    let (x, y) = (cx + dx, cy + dy);
                    if Self::in_bounds(x, y) && land[Self::idx(x, y)] && elev[Self::idx(x, y)] < 0.15 {
                        self.biome[Self::idx(x, y)] = Biome::Wetland as u8;
                    }
                }
            }
        }

        // ── 5b. Volcanic cones ──────────────────────────────────────────
        for &(cx, cy, r) in &craters {
            for dy in -r * 2..=r * 2 {
                for dx in -r * 2..=r * 2 {
                    let (x, y) = (cx + dx, cy + dy);
                    if !Self::in_bounds(x, y) || !land[Self::idx(x, y)] {
                        continue;
                    }
                    let i = Self::idx(x, y);
                    let d = ((dx * dx + dy * dy) as f32).sqrt();
                    let rf = r as f32;
                    if d <= 1.5 {
                        self.tiles[i] = Tile::Fire as i8;
                        self.fire_intensity[i] = 1.0;
                    } else if d < rf * 0.6 {
                        self.tiles[i] = Tile::Rock as i8;
                    } else if d < rf * 1.2 {
                        // A clean ash apron around the cone.
                        self.tiles[i] = Tile::Ash as i8;
                    } else if d < rf * 1.6 && Self::corner_hash(x as u32, y as u32, seed ^ 0x7a1) > 0.75 {
                        self.tiles[i] = Tile::Mineral as i8;
                    }
                    if d < rf * 1.9 {
                        self.biome[i] = Biome::Volcanic as u8;
                    }
                }
            }
        }

        // Ponds anywhere still far from fresh water, so every region can drink.
        let mut ponds: Vec<(i32, i32)> = Vec::new();
        {
            let water_dist = distance_from(|i| self.tiles[i] == Tile::Water as i8 && land[i]);
            let zones = (10usize, 5usize);
            let (zw, zh) = (WIDTH / zones.0, HEIGHT / zones.1);
            for zy in 0..zones.1 {
                for zx in 0..zones.0 {
                    let candidates: Vec<usize> = (zy * zh + 3..(zy + 1) * zh - 3)
                        .flat_map(|y| (zx * zw + 3..(zx + 1) * zw - 3).map(move |x| y * WIDTH + x))
                        .filter(|&i| {
                            land[i]
                                && water_dist[i] > 30
                                && elev[i] < FOOTHILLS
                                && self.tiles[i] == Tile::Grass as i8
                        })
                        .collect();
                    if candidates.is_empty() {
                        continue;
                    }
                    let at = candidates[rng.random_range(0..candidates.len())];
                    let (cx, cy) = ((at % WIDTH) as i32, (at / WIDTH) as i32);
                    let r = rng.random_range(2..=3);
                    for dy in -r..=r {
                        for dx in -r..=r {
                            let (x, y) = (cx + dx, cy + dy);
                            // Ragged edges so ponds don't read as stamped diamonds.
                            let ragged = Self::corner_hash(x as u32, y as u32, seed ^ 0x90d) > 0.2;
                            let inside = dx * dx + dy * dy <= r * r
                                && !(ragged && dx * dx + dy * dy >= (r - 1) * (r - 1));
                            if inside && Self::in_bounds(x, y) && land[Self::idx(x, y)] {
                                self.tiles[Self::idx(x, y)] = Tile::Water as i8;
                            }
                        }
                    }
                    ponds.push((cx, cy));
                }
            }
        }

        // Scattered stones and the first wild food.
        const WILD_FOOD_DENSITY: f32 = 0.35;
        let near_water = distance_from(|i| self.tiles[i] == Tile::Water as i8 && land[i]);
        for i in 0..SIZE {
            if self.tiles[i] != Tile::Grass as i8 {
                continue;
            }
            // Lone rock tiles read as noise on the map; open ground keeps its
            // stones as drawn decoration instead.
            let biome = Biome::from_u8(self.biome[i]);
            let river_bonus = if near_water[i] <= 3 { 2.0 } else { 1.0 };
            // A third of the old carpet of food: enough to found a tribe,
            // not enough to feed a nation without work (or a god).
            if rng.random::<f32>() < biome.initial_food_chance() * river_bonus * WILD_FOOD_DENSITY {
                self.tiles[i] = Tile::Food as i8;
            }
        }

        // ── Layers the simulation reads ─────────────────────────────────
        self.temperature = temp;
        for i in 0..SIZE {
            let base = Biome::from_u8(self.biome[i]).base_fertility();
            let river = if land[i] && near_water[i] <= 4 { 0.15 } else { 0.0 };
            self.fertility[i] = (base + river).min(1.0);
            self.elevation[i] = if land[i] {
                0.3 + elev[i] * 0.7
            } else {
                ((raw[i] - lo) / (sea - lo).max(1e-5)).clamp(0.0, 1.0) * 0.3
            };
        }
        let mut pools: Vec<(i32, i32)> = landmasses(&is_lake)
            .iter()
            .map(|comp| {
                let (sx, sy) = comp
                    .iter()
                    .fold((0usize, 0usize), |(sx, sy), &i| (sx + i % WIDTH, sy + i / WIDTH));
                ((sx / comp.len()) as i32, (sy / comp.len()) as i32)
            })
            .collect();
        pools.extend(ponds);
        pools.extend(
            (0..SIZE)
                .filter(|&i| is_river[i])
                .step_by(40)
                .map(|i| ((i % WIDTH) as i32, (i / WIDTH) as i32)),
        );
        self.pool_centers = pools;

        // Sea depth: distance from shore blended with how far the seabed
        // sits below sea level, so shelves and trenches read smoothly.
        let shore = distance_from(|i| self.tiles[i] != Tile::Water as i8);
        // Blur the grid distance so shelves read as rounded, not diamonds.
        let shore = blur(&shore.iter().map(|&d| d.min(60) as f32).collect::<Vec<_>>(), 4);
        for i in 0..SIZE {
            self.depth[i] = if self.tiles[i] == Tile::Water as i8 {
                if land[i] {
                    // Rivers, lakes and ponds stay shallow.
                    0.08
                } else {
                    let below = ((sea - raw[i]) / (sea - lo).max(1e-5)).clamp(0.0, 1.0);
                    ((shore[i] / 45.0).min(1.0) * 0.55 + below * 0.6).min(1.0)
                }
            } else {
                0.0
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worlds_have_mountains_rivers_and_lakes() {
        for seed in [1u64, 7, 42, 99, 2026] {
            let grid = WorldGrid::new(seed);
            let count = |t: Tile| grid.tiles.iter().filter(|&&v| v == t as i8).count();
            let land = grid.tiles.iter().filter(|&&v| v != Tile::Water as i8).count();
            let rock = count(Tile::Rock);
            let peaks = (0..SIZE).filter(|&i| grid.elevation[i] > 0.8).count();
            assert!(
                rock * 100 > land,
                "seed {seed}: only {rock} rock tiles on {land} land"
            );
            assert!(peaks > 200, "seed {seed}: only {peaks} high peaks");
            assert!(count(Tile::Mineral) > 50, "seed {seed}: no mineral veins");
            assert!(
                rock * 100 < land * 18,
                "seed {seed}: mountains cover too much land ({rock} of {land})"
            );
        }
    }

    #[test]
    fn every_shape_appears_across_seeds() {
        let mut seen = rustc_hash::FxHashSet::default();
        for seed in 0..60u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            seen.insert(format!("{:?}", WorldShape::pick(&mut rng)));
        }
        assert_eq!(seen.len(), 5, "{seen:?}");
    }
}

#[cfg(test)]
mod determinism {
    use super::*;

    #[test]
    fn the_same_seed_builds_the_same_world() {
        let (a, b) = (WorldGrid::new(42), WorldGrid::new(42));
        assert!(a.tiles == b.tiles && a.biome == b.biome);
        assert_eq!(a.pool_centers, b.pool_centers);
    }
}
