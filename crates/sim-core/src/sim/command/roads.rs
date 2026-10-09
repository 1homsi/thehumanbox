use super::*;
use crate::world::grid::{ROAD_BRIDGE, ROAD_NONE, ROAD_TRACK};

/// Ground a road can be laid on. Water, rock, fire and built things stay as they are.
fn can_road(tile: Tile) -> bool {
    matches!(
        tile,
        Tile::Grass | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Food
    )
}

impl Simulation {
    /// Lay a road (`kind` "road"), a bridge over water (`kind` "bridge"), or clear the roads (`kind`
    /// "erase") over every cell inside the radius. A road goes on open ground only, a bridge on river and
    /// lake water (not the ocean's edge), and an erase clears either, wherever it is.
    pub(super) fn cmd_road(&mut self, x: i32, y: i32, radius: i32, kind: String) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 24);
        let want_for = |sim: &Simulation, nx: i32, ny: i32| -> Option<u8> {
            match kind.as_str() {
                "erase" => Some(ROAD_NONE),
                "road" if can_road(sim.grid.get(nx, ny)) => Some(ROAD_TRACK),
                "bridge" if sim.grid.get(nx, ny) == Tile::Water && !WorldGrid::is_edge_border(nx, ny) => {
                    Some(ROAD_BRIDGE)
                }
                _ => None,
            }
        };
        if !matches!(kind.as_str(), "road" | "bridge" | "erase") {
            return false;
        }
        let mut changed = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let Some(want) = want_for(self, nx, ny) else {
                    continue;
                };
                let i = WorldGrid::idx(nx, ny);
                if self.grid.road[i] != want {
                    self.grid.road[i] = want;
                    changed += 1;
                }
            }
        }
        changed > 0
    }
}
