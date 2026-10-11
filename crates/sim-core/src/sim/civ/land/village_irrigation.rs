//! Irrigation by the tribe. When a growing field of a tribe has no water within reach, the tribe digs a
//! channel from the nearest open shore to that field. The channel is a `ROAD_CANAL` run over open ground,
//! and every field within two cells of it is watered (see `village_fields::irrigated`): it yields more and
//! lives through a dry spell.

use crate::sim::civ::land::village_fields::{irrigated, Tribe};
use crate::sim::civ::land::village_roads::plan_road_avoiding;
use crate::sim::civ::land::village_stores::occupied_tiles;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{WorldGrid, ROAD_CANAL, ROAD_NONE};
use crate::world::tiles::Tile;

/// The tribes consider digging on this calendar step (the village passes run every tick).
pub(crate) const DIG_STEP: u64 = 600;
/// Shores this close to a dry field (Chebyshev tiles) are candidates for its channel.
const SHORE_REACH: i32 = 12;
/// A channel longer than this is not worth digging.
const MAX_CHANNEL: usize = 16;
/// How many shores are tried, nearest first, before giving up for this pass.
const SHORES_TRIED: usize = 6;

const CARDINAL: [(i32, i32); 4] = [(0, 1), (1, 0), (0, -1), (-1, 0)];

/// Open ground a channel can be cut through: grass with no road, no building and no field on it.
fn open(sim: &Simulation, x: i32, y: i32) -> bool {
    sim.grid.get(x, y) == Tile::Grass && sim.grid.road_at(x, y) == ROAD_NONE
}

/// Open ground with water on one of its four sides: where a channel starts.
fn on_shore(sim: &Simulation, x: i32, y: i32) -> bool {
    CARDINAL
        .iter()
        .any(|&(dx, dy)| sim.grid.get(x + dx, y + dy) == Tile::Water)
}

/// The cells a channel along `path` is cut through: the path itself, plus a corner cell wherever the path
/// steps diagonally, so the channel is unbroken from one cell to the next. None when the path leaves the
/// grass, or a corner cannot be cut.
fn channel_cells(
    sim: &Simulation,
    blocked: &dyn Fn(i32, i32) -> bool,
    path: &[[i32; 2]],
) -> Option<Vec<[i32; 2]>> {
    let cut = |x: i32, y: i32| open(sim, x, y) && !blocked(x, y);
    let mut cells: Vec<[i32; 2]> = Vec::new();
    let mut prev: Option<[i32; 2]> = None;
    for &[x, y] in path {
        if !cut(x, y) {
            return None;
        }
        if let Some([px, py]) = prev {
            if px != x && py != y {
                let corner = if cut(x, py) {
                    [x, py]
                } else if cut(px, y) {
                    [px, y]
                } else {
                    return None;
                };
                cells.push(corner);
            }
        }
        cells.push([x, y]);
        prev = Some([x, y]);
    }
    (!cells.is_empty()).then_some(cells)
}

/// One pass for one tribe: if its nearest growing field that water does not reach has an open shore within
/// reach, the tribe cuts a channel from that shore to the field. Chronicled when it is dug.
pub(crate) fn dig_for_fields(sim: &mut Simulation, tribe: &Tribe) {
    let now = sim.tick_count;
    if !now.is_multiple_of(DIG_STEP) {
        return;
    }
    // The first dry field of the tribe, by id, so the same field is served every time.
    let mut dry: Vec<(u32, i32, i32)> = sim
        .farms
        .iter()
        .filter(|f| f.owner_lineage == tribe.lineage && !f.harvested && !f.withered)
        .filter(|f| !irrigated(sim, f.x, f.y))
        .map(|f| (f.id, f.x, f.y))
        .collect();
    dry.sort_unstable();
    let Some(&(_, fx, fy)) = dry.first() else {
        return;
    };

    let blocked_tiles = occupied_tiles(sim);
    let mut shores: Vec<(i32, i32)> = Vec::new();
    for dy in -SHORE_REACH..=SHORE_REACH {
        for dx in -SHORE_REACH..=SHORE_REACH {
            let (x, y) = (fx + dx, fy + dy);
            if open(sim, x, y) && !blocked_tiles.contains(&(x, y)) && on_shore(sim, x, y) {
                shores.push((x, y));
            }
        }
    }
    shores.sort_by_key(|&(x, y)| ((x - fx).abs().max((y - fy).abs()), x, y));

    for &(tx, ty) in shores.iter().take(SHORES_TRIED) {
        // A channel is cut through open ground only: it keeps off roads and buildings.
        let blocked = |x: i32, y: i32| blocked_tiles.contains(&(x, y)) || sim.grid.road_at(x, y) != ROAD_NONE;
        let Some(path) = plan_road_avoiding(&sim.grid, [fx, fy], [tx, ty], &blocked, &|_, _| false, None)
        else {
            continue;
        };
        if path.len() > MAX_CHANNEL {
            continue;
        }
        let Some(cells) = channel_cells(sim, &blocked, &path) else {
            continue;
        };
        let dug = cells.len();
        for [x, y] in cells {
            sim.grid.road[WorldGrid::idx(x, y)] = ROAD_CANAL;
        }
        let name = sim
            .lineage_names
            .get(&tribe.lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut sim.events,
            now,
            "life",
            &name,
            &format!("dug a {dug}-cell irrigation channel to its fields"),
        );
        return;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tribe(lineage: &str) -> Tribe {
        Tribe {
            lineage: lineage.to_string(),
            members: Vec::new(),
            dwellings: vec![(50, 50)],
        }
    }

    /// Open grass on a wide patch (the natural map has water nearby, so all of it is cleared), with a lake
    /// whose west shore is at `shore_x`.
    fn lakeside(shore_x: i32) -> Simulation {
        let mut sim = Simulation::new(9);
        sim.tick_count = DIG_STEP * 10;
        for y in 10..90 {
            for x in 10..90 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for y in 30..70 {
            for x in shore_x + 1..shore_x + 4 {
                sim.grid.set(x, y, Tile::Water);
            }
        }
        sim
    }

    fn field(sim: &mut Simulation, id: u32, x: i32, y: i32) {
        sim.farms.push(crate::sim::agriculture::Farm {
            id,
            x,
            y,
            owner_lineage: "clan".to_string(),
            crop: crate::sim::agriculture::CropKind::Wheat,
            planted_tick: sim.tick_count - 100,
            ready_tick: sim.tick_count + 1_000,
            harvested: false,
            prepared: false,
            season_timed: false,
            withered: false,
        });
    }

    #[test]
    fn a_dry_field_gets_a_channel_from_the_nearest_shore() {
        let mut sim = lakeside(44);
        field(&mut sim, 1, 36, 50);
        assert!(!irrigated(&sim, 36, 50), "the field starts dry");
        dig_for_fields(&mut sim, &tribe("clan"));
        assert!(irrigated(&sim, 36, 50), "the channel did not reach the field");
        let canal: Vec<(i32, i32)> = (10..90)
            .flat_map(|y| (10..90).map(move |x| (x, y)))
            .filter(|&(x, y)| sim.grid.road_at(x, y) == ROAD_CANAL)
            .collect();
        assert!(!canal.is_empty());
        assert!(
            canal.iter().all(|&(x, y)| CARDINAL
                .iter()
                .any(|&(dx, dy)| sim.grid.road_at(x + dx, y + dy) == ROAD_CANAL)),
            "a channel cell is cut off from the rest: {canal:?}"
        );
        assert!(
            canal.iter().any(|&(x, _)| x == 44),
            "the channel does not start on the shore at x=44: {canal:?}"
        );
        assert!(sim.events.iter().any(|e| e.detail.contains("irrigation channel")));
    }

    #[test]
    fn nothing_is_dug_for_a_field_water_already_reaches_or_when_the_shore_is_far() {
        let mut watered = lakeside(44);
        field(&mut watered, 1, 43, 50);
        assert!(irrigated(&watered, 43, 50), "two cells from the lake is watered");
        dig_for_fields(&mut watered, &tribe("clan"));
        assert!(!(10..90).any(|x| (10..90).any(|y| watered.grid.road_at(x, y) == ROAD_CANAL)));

        let mut far = lakeside(60);
        field(&mut far, 1, 31, 31);
        dig_for_fields(&mut far, &tribe("clan"));
        assert!(!(10..90).any(|x| (10..90).any(|y| far.grid.road_at(x, y) == ROAD_CANAL)));
    }
}
