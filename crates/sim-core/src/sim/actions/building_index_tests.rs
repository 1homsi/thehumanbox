//! The building index must answer exactly what a scan of every building does,
//! through every kind of change the list sees in a running world.

use super::eligibility::{local_place_snapshot, local_place_snapshot_reference};
use crate::sim::buildings::{Building, BuildingKind};
use crate::sim::simulation::Simulation;

fn check_everyone(sim: &Simulation, label: &str) -> usize {
    let mut sheltered = 0;
    for org in sim.organisms.iter().filter(|o| o.alive) {
        for radius in [2, 3] {
            let fast = org.has_shelter_within(&sim.grid, &sim.buildings, radius);
            let reference = org.has_shelter_within_reference(&sim.grid, &sim.buildings, radius);
            assert_eq!(fast, reference, "{label}: shelter within {radius} of {}", org.id);
            sheltered += usize::from(fast);
        }
        for radius in [14, 16, 18] {
            assert_eq!(
                org.find_shelter_tile(&sim.grid, &sim.buildings, radius),
                org.find_shelter_tile_reference(&sim.grid, &sim.buildings, radius),
                "{label}: nearest shelter within {radius} of {}",
                org.id
            );
        }
        assert_eq!(
            org.has_shelter_project_within(&sim.buildings, 3),
            sim.buildings.iter().any(|b| {
                let (sx, sy) = b.closest_footprint_tile(org.x as i32, org.y as i32);
                b.is_shelter_project_for(&org.lineage_id)
                    && (sx - org.x as i32).abs() <= 3
                    && (sy - org.y as i32).abs() <= 3
            }),
            "{label}: shelter project near {}",
            org.id
        );
        let (ix, iy) = (org.x as i32, org.y as i32);
        let fast = local_place_snapshot(sim, &org.lineage_id, ix, iy);
        let reference = local_place_snapshot_reference(sim, &org.lineage_id, ix, iy);
        assert_eq!(
            fast.workspaces, reference.workspaces,
            "{label}: workspaces at {}",
            org.id
        );
        assert_eq!(
            fast.building_hut, reference.building_hut,
            "{label}: hut at {}",
            org.id
        );
    }
    sheltered
}

#[test]
fn the_index_follows_a_running_world() {
    let mut sim = Simulation::new(42);
    sim.tick_n(2_000);
    let mut sheltered = 0;
    // Buildings are founded, finished, damaged, ruined and cleared away as the
    // world runs; check after each stretch.
    for stretch in 0..12 {
        sim.tick_n(150);
        sheltered += check_everyone(&sim, &format!("stretch {stretch}"));
    }
    assert!(sim.buildings.len() > 100, "{} buildings", sim.buildings.len());
    assert!(sheltered > 500, "{sheltered}");
}

#[test]
fn the_index_follows_direct_edits() {
    let mut sim = Simulation::new(7);
    sim.tick_n(1_500);
    check_everyone(&sim, "start");
    let (x, y) = {
        let org = sim.organisms.iter().find(|o| o.alive).unwrap();
        (org.x as i32, org.y as i32)
    };
    // A new house next to a person, added through the list.
    let mut house = Building::new(9_000, BuildingKind::House, x + 1, y, None, 0);
    house.condition = 1.0;
    sim.buildings.push(house);
    check_everyone(&sim, "after push");
    // Changed in place.
    let last = sim.buildings.len() - 1;
    sim.buildings[last].condition = 0.3;
    check_everyone(&sim, "after edit");
    sim.buildings[last].condition = 1.0;
    check_everyone(&sim, "after finishing");
    // Removed again.
    sim.buildings.retain(|b| b.id != 9_000);
    check_everyone(&sim, "after retain");
    sim.buildings.clear();
    check_everyone(&sim, "after clear");
}
