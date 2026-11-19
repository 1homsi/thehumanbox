use super::{clamp_cmd_coord, cmd_tile, protected, Simulation, Tile, MAX_BRUSH_RADIUS};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;

pub(crate) const SEA_LEVEL: f32 = 0.3;
pub(crate) const PEAK_LEVEL: f32 = 0.685;
const MAX_STEP: f32 = 0.5;
const SHORE_BAND: f32 = 0.025;
const SOIL_BLESSING: f32 = 0.3;
const MAX_MIRACLE_REACH: f32 = 16.0;
const SPRING_REACH: i32 = 4;
const HUNT_HERD: [(&str, u32); 3] = [("deer", 3), ("rabbit", 3), ("boar", 2)];

fn miracle_reach(radius: f32, default: f32) -> f32 {
    if radius > 0.0 {
        radius.min(MAX_MIRACLE_REACH)
    } else {
        default
    }
}

fn sea_depth(elevation: f32) -> f32 {
    ((SEA_LEVEL - elevation) / SEA_LEVEL * 0.9).clamp(0.08, 1.0)
}

impl Simulation {
    pub(super) fn cmd_shape_land(&mut self, x: i32, y: i32, radius: i32, by: f32) -> bool {
        if !by.is_finite() || by == 0.0 {
            return false;
        }
        let by = by.clamp(-MAX_STEP, MAX_STEP);
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, MAX_BRUSH_RADIUS);
        let span = r as f32 + 1.0;
        let mut shaped = 0u32;
        let mut drowned = false;
        for dy in -r..=r {
            for dx in -r..=r {
                let d2 = dx * dx + dy * dy;
                let (nx, ny) = (x + dx, y + dy);
                if d2 > r * r || !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let tile = self.grid.get(nx, ny);
                if tile == Tile::Void || protected(tile) {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                let falloff = 1.0 - (d2 as f32).sqrt() / span;
                let before = self.grid.elevation[i];
                let after = (before + by * falloff).clamp(0.0, 1.0);
                if after == before {
                    continue;
                }
                self.grid.elevation[i] = after;
                shaped += 1;
                let ground = if after < SEA_LEVEL {
                    self.grid.depth[i] = sea_depth(after);
                    if matches!(tile, Tile::Water | Tile::Ice) {
                        tile
                    } else {
                        drowned = true;
                        Tile::Water
                    }
                } else {
                    self.grid.depth[i] = 0.0;
                    match tile {
                        Tile::Water | Tile::Ice | Tile::Flooded if after < SEA_LEVEL + SHORE_BAND => {
                            Tile::Sand
                        }
                        Tile::Water | Tile::Ice | Tile::Flooded => Tile::Grass,
                        Tile::Rock if by < 0.0 && after <= PEAK_LEVEL => Tile::Grass,
                        Tile::Mineral | Tile::Lava | Tile::Rock => tile,
                        _ if after > PEAK_LEVEL => Tile::Rock,
                        _ => tile,
                    }
                };
                if ground != tile {
                    self.grid.set(nx, ny, ground);
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                }
            }
        }
        if shaped == 0 {
            return false;
        }
        if drowned {
            self.grid.wash_roads(x, y, r);
        }
        true
    }

    pub(super) fn cmd_bless_soil(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = miracle_reach(radius, 6.0);
        let r = reach.ceil() as i32;
        let (cx, cy) = (cmd_tile(x), cmd_tile(y));
        let mut blessed = 0u32;
        for dy in -r..=r {
            for dx in -r..=r {
                let (nx, ny) = (cx + dx, cy + dy);
                if (dx * dx + dy * dy) as f32 > reach * reach || !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let tile = self.grid.get(nx, ny);
                if !matches!(
                    tile,
                    Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Scorched
                ) {
                    continue;
                }
                if matches!(tile, Tile::Ash | Tile::Scorched) {
                    self.grid.set(nx, ny, Tile::Grass);
                }
                self.grid.enrich_soil(nx, ny, SOIL_BLESSING);
                blessed += 1;
            }
        }
        if blessed == 0 {
            return false;
        }
        push_event(
            &mut self.events,
            self.tick_count,
            "life",
            "the soil",
            &format!("the soil near ({x:.0}, {y:.0}) is blessed and grows rich"),
        );
        true
    }

    pub(super) fn cmd_spring(&mut self, x: i32, y: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        let dry = |tile: Tile| {
            matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Scorched
            )
        };
        if !dry(self.grid.get(x, y)) {
            return false;
        }
        for (dx, dy) in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if WorldGrid::in_bounds(nx, ny) && dry(self.grid.get(nx, ny)) {
                let i = WorldGrid::idx(nx, ny);
                self.grid.set(nx, ny, Tile::Water);
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                self.grid.depth[i] = 0.08;
            }
        }
        for dy in -SPRING_REACH..=SPRING_REACH {
            for dx in -SPRING_REACH..=SPRING_REACH {
                if dx * dx + dy * dy <= SPRING_REACH * SPRING_REACH {
                    self.grid.enrich_soil(x + dx, y + dy, 0.15);
                }
            }
        }
        self.grid.pool_centers.push((x, y));
        push_event(
            &mut self.events,
            self.tick_count,
            "life",
            "the land",
            &format!("a fresh spring wells up near ({x}, {y})"),
        );
        true
    }

    pub(super) fn cmd_bountiful_hunt(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = miracle_reach(radius, 8.0);
        let mut released = false;
        for (kind, count) in HUNT_HERD {
            released |= self.cmd_spawn_animal(x, y, Some(kind.to_string()), count, reach);
        }
        if !released {
            return false;
        }
        push_event(
            &mut self.events,
            self.tick_count,
            "life",
            "the wild",
            &format!("game gathers near ({x:.0}, {y:.0}) for a bountiful hunt"),
        );
        true
    }
}
