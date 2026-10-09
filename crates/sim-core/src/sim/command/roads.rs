use super::*;
use crate::world::grid::{ROAD_NONE, ROAD_TRACK};

/// Ground a road can be laid on. Water, rock, fire and built things stay as they are.
fn can_road(tile: Tile) -> bool {
    matches!(
        tile,
        Tile::Grass | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Food
    )
}

impl Simulation {
    /// Lay a road (`kind` "road") or clear one (`kind` "erase") over every cell inside the radius.
    /// Roads go on open ground only; an erase clears any road, wherever it is.
    pub(super) fn cmd_road(&mut self, x: i32, y: i32, radius: i32, kind: String) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 24);
        let erase = match kind.as_str() {
            "road" => false,
            "erase" => true,
            _ => return false,
        };
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
                let want = if erase {
                    ROAD_NONE
                } else if can_road(self.grid.get(nx, ny)) {
                    ROAD_TRACK
                } else {
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
