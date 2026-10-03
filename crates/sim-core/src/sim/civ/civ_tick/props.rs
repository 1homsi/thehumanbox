use super::*;

pub(in crate::sim::civ) fn footprint_cells(
    kind: BuildingKind,
    x: i32,
    y: i32,
) -> impl Iterator<Item = (i32, i32)> {
    let (w, h) = kind.footprint();
    (y..y + i32::from(h)).flat_map(move |ty| (x..x + i32::from(w)).map(move |tx| (tx, ty)))
}

pub(in crate::sim::civ) fn prop_site_is_clear(
    grid: &crate::world::grid::WorldGrid,
    occupied: &HashSet<(i32, i32)>,
    kind: BuildingKind,
    x: i32,
    y: i32,
) -> bool {
    use crate::world::{
        grid::{HEIGHT, WIDTH},
        tiles::Tile,
    };
    footprint_cells(kind, x, y).all(|(tx, ty)| {
        tx >= 0
            && ty >= 0
            && tx < WIDTH as i32
            && ty < HEIGHT as i32
            && !occupied.contains(&(tx, ty))
            && matches!(
                grid.get(tx, ty),
                Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Snow | Tile::Sand
            )
    })
}

// Repair legacy decorative overlap without moving or deleting anyone's home,
// construction project, or ruin. A tile set also reserves props added this tick.
pub(super) fn reconcile_prop_sites(sim: &mut Simulation) -> HashSet<(i32, i32)> {
    let mut occupied: HashSet<_> = sim
        .buildings
        .iter()
        .filter(|b| !b.decorative)
        .flat_map(|b| footprint_cells(b.kind, b.x, b.y))
        .collect();
    let before = sim.buildings.len();
    sim.buildings.retain(|b| {
        if !b.decorative {
            return true;
        }
        if !prop_site_is_clear(&sim.grid, &occupied, b.kind, b.x, b.y) {
            return false;
        }
        occupied.extend(footprint_cells(b.kind, b.x, b.y));
        true
    });
    if sim.buildings.len() != before {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    occupied
}

pub(super) fn tick_scatter_props(sim: &mut Simulation) {
    use BuildingKind::*;
    let mut occupied = reconcile_prop_sites(sim);
    // Sorted: this loop mutates the shared `next_building_id` counter and
    // the shared `occupied` set, so iteration order decided prop kind,
    // site, and building id.
    let mut alive_lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    alive_lineages.sort();
    alive_lineages.dedup();
    let mut new_buildings: Vec<Building> = Vec::new();
    for lid in alive_lineages {
        let pop = lineage_pop(sim, &lid);
        if pop < 3 {
            continue;
        }
        const MAX_DECORATIVE_PER_LINEAGE: usize = 48;
        if sim
            .buildings
            .iter()
            .filter(|building| building.decorative && building.owner_lineage.as_deref() == Some(lid.as_str()))
            .count()
            >= MAX_DECORATIVE_PER_LINEAGE
        {
            continue;
        }
        let era = lineage_era(sim, &lid);
        let (cx, cy) = lineage_center(sim, &lid);
        if cx == 0 && cy == 0 {
            continue;
        }

        // Pick a deterministic-ish prop kind based on era+id, biased toward
        // small decorative items so a settlement looks lived-in.
        let palette: &[BuildingKind] = if era >= Era::Modern {
            &[
                Lamppost,
                StreetLight,
                Bench,
                Signpost,
                TelephonePole,
                BillBoard,
                BusStop,
                Crosswalk,
                Cart,
                Well,
                FlagPole,
                Kiosk,
                FoodTruck,
                Fence,
                Gate,
                NeonSign,
                Drone,
                ChargingStation,
                SolarPanel,
            ]
        } else if era >= Era::Industrial {
            &[
                Lamppost,
                StreetLight,
                Bench,
                Signpost,
                TelephonePole,
                BillBoard,
                BusStop,
                Cart,
                Well,
                FlagPole,
                Kiosk,
                MarketStall,
                FoodCart,
                Fence,
                Gate,
                Crosswalk,
            ]
        } else if era >= Era::Medieval {
            &[
                Lamppost,
                Bench,
                Signpost,
                Cart,
                Well,
                FlagPole,
                Kiosk,
                MarketStall,
                FoodCart,
                Fence,
                Gate,
                Pavilion,
                Gazebo,
                Bandstand,
                Tent,
                Watchtower,
                Shrine,
                Monument,
                Obelisk,
                GraveStone,
            ]
        } else if era >= Era::Bronze {
            &[
                Bench,
                Signpost,
                Cart,
                Well,
                MarketStall,
                FoodCart,
                Fence,
                Gate,
                Tent,
                Watchtower,
                Shrine,
                Monument,
                Obelisk,
                GraveStone,
                Pond,
                Garden,
            ]
        } else {
            &[Tent, Cart, Well, Signpost, Shrine, GraveStone]
        };

        let seed = sim.next_building_id as usize;
        let kind = palette[seed % palette.len()];

        // Scatter within a 16-tile radius around the lineage center using
        // a small deterministic offset table for spread.
        let offsets = [
            (-7, -3),
            (5, -6),
            (-4, 6),
            (8, 2),
            (-9, 1),
            (3, 7),
            (6, -5),
            (-2, -8),
            (1, 5),
            (-6, -1),
            (4, -2),
            (-8, 4),
            (2, -7),
            (7, 6),
            (-3, 8),
            (9, -3),
            (-5, 5),
            (0, 9),
        ];
        let Some((site_x, site_y)) = (0..offsets.len()).find_map(|offset| {
            let (dx, dy) = offsets[(seed + offset) % offsets.len()];
            let (x, y) = (cx + dx, cy + dy);
            prop_site_is_clear(&sim.grid, &occupied, kind, x, y).then_some((x, y))
        }) else {
            continue;
        };
        // Scenery wells still look like wells: one per neighbourhood.
        if kind == Well
            && crate::sim::actions::construction::build_well::well_within_reach(sim, site_x, site_y)
        {
            continue;
        }
        occupied.extend(footprint_cells(kind, site_x, site_y));

        let id = sim.next_building_id;
        sim.next_building_id += 1;
        let mut prop = Building::new(id, kind, site_x, site_y, Some(lid.clone()), sim.tick_count);
        prop.condition = 1.0;
        prop.decorative = true;
        new_buildings.push(prop);
    }
    if !new_buildings.is_empty() {
        sim.buildings.extend(new_buildings);
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    cap_buildings(sim);
}
